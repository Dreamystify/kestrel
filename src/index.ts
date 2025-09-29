import bigInteger from 'big-integer';
import crypto from 'crypto';
import Redis, { Cluster, Command, ReplyError } from "ioredis";
import { readFileSync } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';

// Extend the Redis and Cluster interfaces to include the generateIds method
declare module 'ioredis' {
    interface Redis {
        generateIds(...args: any[]): Promise<number[]>;
    }
    interface Cluster {
        generateIds(...args: any[]): Promise<number[]>;
    }
}

/**
 * Configuration options for the Kestrel library.
 */
export type KestrelConfig = Partial<{
    /**
     * List of Redis nodes used in **Redis Cluster** mode.
     * Each node must have a `host` and `port`.
     * 
     * @example
     * clusterNodes: [
     *   { host: "redis-node-1", port: 6379 },
     *   { host: "redis-node-2", port: 6379 }
     * ]
     */
    clusterNodes: { host: string; port: number }[];

    /**
     * List of Redis Sentinel nodes for **high availability mode**.
     * Used to determine which Redis primary to connect to.
     * 
     * @example
     * sentinels: [
     *   { host: "sentinel1", port: 26379 },
     *   { host: "sentinel2", port: 26379 }
     * ]
     */
    sentinels: { host: string; port: number }[];

    /**
     * Username for Sentinel authentication.
     * 
     * @default "default"
     */
    sentinelUsername: string;

    /**
     * Password for Sentinel authentication.
     * 
     * @default "kestrel "
     */
    sentinelPassword: string;

    /**
     * Name of the **Redis master instance** in Sentinel mode.
     * Required when using Sentinels.
     * 
     * @default "mymaster"
     */
    name: string;

    /**
     * Redis **host** for a single-node Redis setup.
     * Ignored if `clusterNodes` or `sentinels` are provided.
     * 
     * @default "localhost"
     */
    host: string;

    /**
     * Redis **port** for a single-node Redis setup.
     * Ignored if `clusterNodes` or `sentinels` are provided.
     * 
     * @default 6379
     */
    port: number;

    /**
     * Redis **username** for authentication.
     * Required if Redis authentication is enabled.
     * 
     * @default "default"
     */
    username: string;

    /**
     * Redis **password** for authentication.
     * Required if Redis authentication is enabled.
     * 
     * @default "kestrel "
     */
    password: string;

    /**
     * Redis **database index** to use (0-based).
     * 
     * @default 0
     */
    database: number;

    /**
     * Custom **retry strategy** for Redis Cluster.
     * Defines how long to wait before reconnecting after a failure.
     * 
     * @param times - The number of failed attempts.
     * @returns Number of milliseconds to wait before the next retry, or `null` to stop retrying.
     */
    retryStrategy: (times: number) => number | null;

    /**
     * Whether or not to reconnect on certain Redis errors.
     * This options by default is `null`, which means it should never reconnect on Redis errors.
     * You can pass a function that accepts an Redis error, and returns:
     * - `true` or `1` to trigger a reconnection.
     * - `false` or `0` to not reconnect.
     * - `2` to reconnect and resend the failed command (who triggered the error) after reconnection.
     */
    reconnectOnError: (err: Error) => boolean | 1 | 2;

    /**
     * Connection timeout in milliseconds.
     * 
     * @default 5000
     */
    connectTimeout: number;
}>;

export const KestrelEvents = {
    CLIENT_CREATED: 'clientCreated',
    CONNECTED: 'connected',
    SCRIPT_LOADED: 'scriptLoaded',
    NODE_ADDED: 'nodeAdded',
    NODE_REMOVED: 'nodeRemoved',
    CLUSTER_NODE_ADDED: '+node',
    CLUSTER_NODE_REMOVED: '-node',
    ERROR: 'error',

    // Redis Events
    CONNECT: 'connect',
    CONNECTING: 'connecting',
    RECONNECTING: 'reconnecting',
    DISCONNECTED: 'disconnected',
    WAIT: 'wait',
    READY: 'ready',
    CLOSE: 'close',
    END: 'end',
    RECONNECTED: 'reconnected',
    RECONNECTION_ATTEMPTS_REACHED: 'reconnectionAttemptsReached',
} as const;

/**
 * Redis error messages that should not trigger reconnection attempts.
 */
export const RedisNonRetryableErrors = {
    NOAUTH: "NOAUTH Authentication required",
    WRONGPASS: "WRONGPASS invalid username-password pair or user is disabled.",
    ENOTFOUND: "getaddrinfo ENOTFOUND invalid-host",
    ECONNREFUSED: "getaddrinfo ECONNREFUSED",
} as const;

type RedisEvents = {
    'connect': () => void;
    'connecting': () => void;
    'disconnected': () => void;
    'reconnecting': () => void;
    'reconnectionAttemptsReached': () => void;
    'wait': () => void;
    'ready': () => void;
    'close': () => void;
    'end': () => void;
    'error': (error: Error) => void;

   // "wait" | "reconnecting" | "connecting" | "connect" | "ready" | "close" | "end";
}

// shard name and id for single use
const KESTREL_SHARD_ID_KEY: string = process.env.KESTREL_SHARD_ID_KEY ?? `{kestrel}-shard-id`;
const KESTREL_SHARD_ID: string = process.env.KESTREL_SHARD_ID ?? '1';
const KESTREL_LOCK_KEY = '{kestrel}-generator-lock';
const KESTREL_SEQUENCE_KEY = '{kestrel}-generator-sequence';

// We specify an custom epoch that we will use to fit our timestamps within the bounds of the 41 bits we have
// available. This gives us a range of ~69 years within which we can generate IDs.
const CUSTOM_EPOCH: number = 1451566800;
const LOGICAL_SHARD_ID_BITS: number = 10;
const SEQUENCE_BITS: number = 12;
const TIMESTAMP_SHIFT: number = SEQUENCE_BITS + LOGICAL_SHARD_ID_BITS;
const LOGICAL_SHARD_ID_SHIFT: number = SEQUENCE_BITS;

// These three bitopped constants are also used as bit masks for the maximum value of the data they represent.
const MAX_SEQUENCE: number = ~(-1 << SEQUENCE_BITS);
const MAX_LOGICAL_SHARD_ID: number = ~(-1 << LOGICAL_SHARD_ID_BITS);
const MIN_LOGICAL_SHARD_ID: number = 1;
const MAX_BATCH_SIZE: number = MAX_SEQUENCE + 1;
const ONE_MILLI_IN_MICRO_SECS: number = 1000; // TimeUnit.MICROSECONDS.convert(1, TimeUnit.MILLISECONDS);

/**
 * Kestrel Class - Generates unique, sortable IDs using Redis.
 */
export class Kestrel extends EventEmitter {
    #client: Redis | Cluster;
    #config!: KestrelConfig;
    #generateIdsScript!: string;

    /**
     * Creates a new instance of the Kestrel library.
     * @param {KestrelConfig} [config] - Configuration for Redis connection.
     */
    constructor(config?: KestrelConfig) {
        super();

        const { 
            CLIENT_CREATED, 
            RECONNECTION_ATTEMPTS_REACHED,
        } = KestrelEvents;

        const defaultRetryStrategy = (times: number): number | null => {
            if (times > 10) {
                const error = new Error("Max Redis reconnection attempts reached");
                this.emit(RECONNECTION_ATTEMPTS_REACHED, { error });
                return null; // Stop retrying
            }
            return Math.min(times * 100, 2000); // Exponential backoff
        }

        const defaultReconnectOnError = (error: Error) => {
            const nonRetryableErrors: Record<string, boolean> = {
                [RedisNonRetryableErrors.NOAUTH]: false,
                [RedisNonRetryableErrors.WRONGPASS]: false,
                [RedisNonRetryableErrors.ENOTFOUND]: false,
                [RedisNonRetryableErrors.ECONNREFUSED]: false,
            };
            
            return nonRetryableErrors[error.message] ?? true;
        }

        this.#config = {
            clusterNodes: config?.clusterNodes ?? [],
            sentinels: config?.sentinels ?? [],
            name: config?.name ?? process.env.REDIS_SENTINEL_NAME ?? "mymaster",
            host: config?.host ?? process.env.REDIS_HOST ?? "localhost",
            port: config?.port ?? (Number(process.env.REDIS_PORT) || 6379),
            username: config?.username ?? process.env.REDIS_USERNAME ?? "default",
            password: config?.password ?? process.env.REDIS_PASSWORD ?? "kestrel",
            sentinelUsername: config?.sentinelUsername,
            sentinelPassword: config?.sentinelPassword,
            database: config?.database ?? (Number(process.env.REDIS_DB) || 0),
            retryStrategy: config?.retryStrategy ?? defaultRetryStrategy,
            reconnectOnError: config?.reconnectOnError ?? defaultReconnectOnError,
            connectTimeout: config?.connectTimeout ?? 5000,
        };

        // Load the Lua script for generating IDs.
        // Use a more compatible approach for ES modules
        const currentDir = process.cwd();
        const scriptPath = join(currentDir, 'lib', 'scripts', 'generateIds.lua');
        this.#generateIdsScript = readFileSync(scriptPath, 'utf-8');


        if (this.#config.clusterNodes?.length) {
            this.#client = new Cluster(this.#config.clusterNodes, {
                redisOptions: {
                    username: this.#config.username,
                    password: this.#config.password,
                    db: this.#config.database,
                    reconnectOnError: this.#config.reconnectOnError ?? defaultReconnectOnError,
                    connectTimeout: this.#config.connectTimeout,
                    enableReadyCheck: true,
                    // lazyConnect is ignored in cluster mode
                },
                scripts: {
                    generateIds: {
                      lua: this.#generateIdsScript,
                      numberOfKeys: 3,
                      readOnly: false,
                    },
                },
                clusterRetryStrategy: this.#config.retryStrategy ?? defaultRetryStrategy,
                enableReadyCheck: true,
                scaleReads: "master",
                maxRedirections: 16,
                retryDelayOnFailover: 100,
                retryDelayOnClusterDown: 100,
                retryDelayOnTryAgain: 100,
                retryDelayOnMoved: 1000,
                slotsRefreshTimeout: 1000,
                slotsRefreshInterval: 5000,
            });

            this.emit(CLIENT_CREATED, 'Redis Cluster Client Created');
        } else if (this.#config.sentinels?.length) {
            this.#client = new Redis({
                sentinels: this.#config.sentinels,
                name: this.#config.name,
                // For connecting to the master
                username: this.#config.username,
                password: this.#config.password,
                // For connecting to the sentinel
                sentinelUsername: this.#config.sentinelUsername,
                sentinelPassword: this.#config.sentinelPassword,
                db: this.#config.database,
                sentinelRetryStrategy: this.#config.retryStrategy ?? defaultRetryStrategy,
                reconnectOnError: this.#config.reconnectOnError ?? defaultReconnectOnError,
                connectTimeout: this.#config.connectTimeout,
                enableReadyCheck: true,
                lazyConnect: true,
            });

            this.#client.defineCommand('generateIds', {
                lua: this.#generateIdsScript,
                numberOfKeys: 3,
            });

            this.emit(CLIENT_CREATED, 'Redis Sentinel Client Created');
        } else {
            this.#client = new Redis({
                host: this.#config.host,
                port: this.#config.port,
                username: this.#config.username,
                password: this.#config.password,
                db: this.#config.database,
                retryStrategy: this.#config.retryStrategy ?? defaultRetryStrategy,
                reconnectOnError: this.#config.reconnectOnError ?? defaultReconnectOnError,
                connectTimeout: this.#config.connectTimeout,
                enableReadyCheck: true,
                lazyConnect: true,
            });

            this.#client.defineCommand('generateIds', {
                lua: this.#generateIdsScript,
                numberOfKeys: 3,
            });

            this.emit(CLIENT_CREATED, 'Redis Single Instance Client Created');
        }

        if (this.#client.listenerCount('error') === 0) {
            this.#client.on('error', (error) => {});
        }
    }

    /**
     * Creates a new instance of the Kestrel library.
     * @param {KestrelConfig} [config] - Configuration for Redis connection.
     * @returns {Promise<Kestrel>} - A promise that resolves to a new Kestrel instance.
     */
    static async initialize(config?: KestrelConfig): Promise<Kestrel> {
        try {
            const instance = new Kestrel(config);
            await instance.#init();
            return instance;
        } catch (err: unknown) {
            let errorMsg: string | undefined = 'Unknown Error';
        
            if (err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string') {
                const message = (err as { message: string }).message;
                if (message.includes('NOAUTH')) {
                    errorMsg = 'No authentication provided.';
                } else if (message.includes('WRONGPASS')) {
                    errorMsg = 'Invalid username-password pair or user is disabled.';
                } else if (
                    message.includes('getaddrinfo ENOTFOUND') ||
                    message.includes('getaddrinfo EAI_AGAIN invalid-host')
                ) {
                    errorMsg = 'Invalid host.';
                } else if (message.includes('getaddrinfo ECONNREFUSED')) {
                    errorMsg = 'Connection refused.';
                } else {
                    errorMsg = message;
                }
            } else {
                errorMsg = `Unknown error: ${err}`;
            }
        
            throw new Error(`Failed to initialize: ${errorMsg}`);
        }
    }

    /**
     * Initializes and attaches event listeners for Redis client events.
     *
     * This asynchronous method sets up listeners for various Redis client events such as
     * "connect", "connecting", "disconnected", "reconnecting", "reconnectionAttemptsReached",
     * "wait", "ready", "close", "end", and "error". For each event, it logs a corresponding
     * message to the console and emits a related event via the instance's EventEmitter interface.
     *
     * In the "error" event handler, if the error contains specific messages (e.g., "WRONGPASS"
     * or "ENOTFOUND") or includes a "code" property, it triggers the client's quit operation.
     *
     * After attaching all event listeners, the method checks the client's status. If the client
     * is not already in the "connecting" or "ready" state, it attempts to connect the client.
     * Any connection errors are caught, emitted as an "ERROR" event, and then rethrown.
     *
     * @async
     * @private
     * @returns {Promise<void>} A promise that resolves once the event listeners are attached and
     *                           the client is connected (if necessary).
     */
    async #initEvents(): Promise<void> {
        const {
            CONNECT,
            CONNECTING,
            RECONNECTING,
            RECONNECTION_ATTEMPTS_REACHED,
            DISCONNECTED,
            WAIT,
            READY,
            CLOSE,
            END,
            ERROR,
        } = KestrelEvents;

        const errorHandler = (error: Error) => {
            this.emit(ERROR, { error });
        };

        // Map Redis events to Kestrel events.
        const redisEvents: Partial<{ [K in keyof RedisEvents]: RedisEvents[K] }> = {
            connect: () => { this.emit(CONNECT, 'Redis connected'); },
            connecting: () => { this.emit(CONNECTING, 'Redis connecting'); },
            disconnected: () => { this.emit(DISCONNECTED, 'Redis disconnected'); },
            reconnecting: () => { this.emit(RECONNECTING, 'Redis reconnecting'); },
            reconnectionAttemptsReached: () => { this.emit(RECONNECTION_ATTEMPTS_REACHED, 'Redis reconnection attempts reached'); },
            wait: () => { this.emit(WAIT, 'Redis wait'); },
            ready: () => { this.emit(READY, 'Redis ready'); },
            close: () => { this.emit(CLOSE, 'Redis closed'); },
            end: () => { this.emit(END, 'Redis end'); },
        };

        // Attach the non-error events.
        for (const event in redisEvents) {
            const eventKey = event as keyof typeof redisEvents;
            this.#client?.on(eventKey, redisEvents[eventKey] as (...args: any[]) => void);
        }

        // Attach the error handler for lifecycle errors.
        this.#client?.on('error', errorHandler as (...args: any[]) => void);

        // Use a promise to handle the initial connection 
        // while temporarily suspending the error handler.
        return new Promise((resolve, reject) => {
            this.#client.off('error', errorHandler as (...args: any[]) => void);

            const onReady = () => {
                cleanup();
                this.#client.on('error', errorHandler as (...args: any[]) => void);
                resolve();
            };

            const onError = (error: Error) => {
                cleanup();
                this.#client.on('error', errorHandler as (...args: any[]) => void);
                this.#client.disconnect();
                reject(error);
            };

            const cleanup = () => {
                this.#client.off('ready', onReady);
                this.#client.off('error', onError);
            };

            this.#client.once('ready', onReady);
            this.#client.once('error', onError);

            // Check if the client is already connected or connecting, if so, skip connecting again.
            const states: string[] = [READY, CONNECTING, CONNECT, RECONNECTING];
            if (!states.includes(this.#client.status)) {
                this.#client.connect().catch(onError);
            }
        });
    }

    /**
     * Initializes the Redis connection and loads necessary Lua scripts.
     * Handles shard ID assignment in cluster mode.
     */
    async #init() {
        const {
            NODE_ADDED,
            NODE_REMOVED,
            CLUSTER_NODE_ADDED, 
            CLUSTER_NODE_REMOVED,
            SCRIPT_LOADED,
            CONNECTED,
            READY,
            ERROR,
        } = KestrelEvents;
        const DEBOUNCE_DELAY = 300;
        
        await this.#initEvents();

        const isCluster = this.#client instanceof Cluster;
        const isSentinel = !!this.#config.sentinels?.length;

        if (isCluster) {
            const cluster = this.#client as Cluster;

            if (cluster.status !== READY) {
                await new Promise(resolve => cluster.once('ready', resolve));
            }

            await cluster.set(KESTREL_SHARD_ID_KEY, KESTREL_SHARD_ID);

            const handleNodeAdded = this.#debounce(async (node: Redis) => {
                const { host, port } = node.options;
                this.emit(NODE_ADDED, `New node detected: ${host}:${port}`);

                const scriptSHA = await this.#loadScript(node);
                this.emit(SCRIPT_LOADED, `Loaded script on ${host}:${port} with SHA ${scriptSHA}`);
            }, DEBOUNCE_DELAY);

            const handleNodeRemoved = this.#debounce(async (node: Redis) => {
                const { host, port } = node.options;
                this.emit(NODE_REMOVED, `Node removed: ${host}:${port}`);
            }, DEBOUNCE_DELAY);
            
            this.#client.on(CLUSTER_NODE_ADDED, handleNodeAdded);
            this.#client.on(CLUSTER_NODE_REMOVED, handleNodeRemoved);

            this.emit(CONNECTED, 'Connected and initialized cluster.');
        } else if(isSentinel) {
            try {
                // Get replication info from the master
                const info: string = await this.#client.call('INFO', 'replication') as string;

                // Parse the response into key-value pairs using a concise method
                const infoMap = info
                    .split('\n')
                    .filter(line => line && line.includes(':'))
                    .reduce((acc, line) => {
                    const [key, value] = line.split(':');
                    acc[key.trim()] = value.trim();
                    return acc;
                    }, {} as Record<string, string>);
            
                // If this instance is the master, load the script and set the shard ID
                if (infoMap['role'] === 'master') {
                    const scriptSHA = await this.#loadScript(this.#client as Redis);
                    await this.#client.set(KESTREL_SHARD_ID_KEY, KESTREL_SHARD_ID);
                    this.emit(SCRIPT_LOADED, `Loaded script on new Redis master after failover with SHA ${scriptSHA}`);
                }
            } catch (err) {
                throw new Error(`Failed to fetch Redis master info: ${(err as Error).message}`);
            }
        } else {
            const scriptSHA = await this.#loadScript(this.#client as Redis);
            await this.#client.set(KESTREL_SHARD_ID_KEY, KESTREL_SHARD_ID);
            const { host, port } = this.#config;
            this.emit(SCRIPT_LOADED, `Loaded script on ${host}:${port} with SHA ${scriptSHA}`);
        }
    }

    /**
     * Creates a debounced version of a function that delays its execution.
     * @param {T} func - The function to debounce.
     * @param {number} wait - The delay in milliseconds.
     * @returns {(...args: Parameters<T>) => void} - The debounced function.
     */
    #debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
        let timeout: ReturnType<typeof setTimeout>;
        return (...args: Parameters<T>) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    /**
     * Loads the Lua script on a given Redis node.
     * @param {Redis} node - The Redis node to load the script on.
     * @returns {Promise<string>} - The SHA of the loaded script.
     */
    async #loadScript(node: Redis): Promise<string> {
        const scriptSHA = crypto.createHash('sha1').update(this.#generateIdsScript).digest('hex');
        const exists = await node.call('SCRIPT', 'EXISTS', scriptSHA) as number[];
        if (exists[0] === 0) {
            await node.call('SCRIPT', 'LOAD', this.#generateIdsScript);
        }
        return scriptSHA;
    }

    /**
     * Generates a batch of unique IDs.
     * @param {number} [count=1] - The number of IDs to generate.
     * @returns {Promise<bigint[]>} - An array of generated IDs.
     */
    async getIds(count: number = 1): Promise<bigint[]> {
        const batch = Math.min(Math.abs(count), MAX_BATCH_SIZE);
        const { ERROR } = KestrelEvents;

        try {
            // Get the numbers to create the IDs
            const reply: number[] = await (this.#client).generateIds(
                // First 3 arguments are KEYS:
                KESTREL_LOCK_KEY,
                KESTREL_SEQUENCE_KEY,
                KESTREL_SHARD_ID_KEY,
                // Then ARGV:
                MAX_SEQUENCE,
                MIN_LOGICAL_SHARD_ID,
                MAX_LOGICAL_SHARD_ID,
                batch
            );

            // format the results
            const START_SEQUENCE: number 	= Number(reply[0]);
            const END_SEQUENCE: number 		= Number(reply[1]);
            const LOGICAL_SHARD_ID: number 	= Number(reply[2]);
            const TIME_SECONDS: number 		= Number(reply[3]);
            const TIME_MICROSECONDS: number	= Number(reply[4]);

            // We get the timestamp from Redis in seconds, but we get microseconds too, so we can make a timestamp in
            // milliseconds (losing some precision in the meantime for the sake of keeping things in 41 bits) using both of
            // these values
            //let timestamp = Math.trunc((TIME_SECONDS * ONE_MILLI_IN_MICRO_SECS) + (TIME_MICROSECONDS / ONE_MILLI_IN_MICRO_SECS));
            const timestamp = Math.trunc((TIME_SECONDS * ONE_MILLI_IN_MICRO_SECS) + (TIME_MICROSECONDS / ONE_MILLI_IN_MICRO_SECS));

            // loop through the sequences to create the batch ids
            let ids: bigint[] = [];
            for (let i = START_SEQUENCE; i <= END_SEQUENCE; i++) {
                // Here's the fun bit-shifting. The purpose of this is to get a 64-bit ID of the following
                // format:
                //
                // ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCCCCCCCCCCDDDDDDDDDDDD
                //
                // Where:
                //   * A is the reserved signed bit.
                //   * B is the timestamp in milliseconds since custom epoch bits, 41 in total.
                //   * C is the logical shard ID, 10 bits in total.
                //   * D is the sequence, 12 bits in total.

                // compute the id
                let id = bigInteger((timestamp - CUSTOM_EPOCH))
                  .shiftLeft(TIMESTAMP_SHIFT)
                  .or(bigInteger(LOGICAL_SHARD_ID)
                  .shiftLeft(LOGICAL_SHARD_ID_SHIFT))
                  .or(i).toString();

                ids.push(BigInt(id).valueOf());
            }

            return ids;
        } catch (err: any) {
            const error = new Error(`${err instanceof Error ? err.message : 'Unknown Error'}`);
            this.emit(ERROR, { error });
            throw error;
        }
    }

    /**
     * Generates a single unique ID.
     * @returns {Promise<bigint>} - The generated ID.
     */
    async getId(): Promise<bigint> {
        const [id] = await this.getIds();
        return id;
    }

    /**
     * Closes the Redis connection gracefully.
     */
    async close(): Promise<void> {
        const { READY, CONNECT, ERROR, DISCONNECTED } = KestrelEvents;
        
        if (!this.#client) {
            this.emit(ERROR, { 
                error: new Error('Redis client is not initialized.') 
            });
            return;
        }

        const client = this.#client;
        this.#client = null as any;
        
        // Remove all event listeners from Redis client
        client.removeAllListeners();

        try {
            // Try graceful shutdown
            if (client.status === READY || client.status === CONNECT) {
                await client.quit();
            }
        } catch (error) {
            this.emit(ERROR, { error });
        } finally {
            // Always disconnect
            client.disconnect();
            
            this.emit(DISCONNECTED, 'Redis client disconnected.');
            
            // Remove all listeners from this EventEmitter instance after emitting
            this.removeAllListeners();
        }
    }
}