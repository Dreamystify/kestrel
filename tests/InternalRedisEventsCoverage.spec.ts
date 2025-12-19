import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

/**
 * This spec exists to deterministically cover Redis lifecycle event handlers that are otherwise
 * environment-dependent (e.g., retries/disconnects may not happen in CI).
 */
describe('coverage: redis lifecycle event handlers', () => {
  it('emits disconnected/end/reconnectionAttemptsReached/error when underlying client emits them', async () => {
    let lastClient: FakeRedis | null = null;

    class FakeRedis extends EventEmitter {
      status = 'end';

      defineCommand() {
        // no-op
      }

      async connect(): Promise<void> {
        this.status = 'connecting';
        queueMicrotask(() => {
          this.status = 'ready';
          this.emit('ready');
        });
      }

      async quit(): Promise<void> {
        this.status = 'end';
      }

      disconnect(): void {
        this.status = 'end';
      }

      // Minimal subset used by Kestrel during initialization.
      async call(...args: unknown[]): Promise<unknown> {
        const [cmd, subcmd] = args as [string, string];
        if (cmd === 'SCRIPT' && subcmd === 'EXISTS') return [0];
        if (cmd === 'SCRIPT' && subcmd === 'LOAD') return 'sha';
        if (cmd === 'INFO') return 'role:master\n';
        return null;
      }

      async set(): Promise<'OK'> {
        return 'OK';
      }
    }

    class FakeCluster extends FakeRedis {}

    jest.resetModules();
    jest.doMock('ioredis', () => {
      return {
        __esModule: true,
        default: class Redis extends FakeRedis {
          constructor(..._args: unknown[]) {
            super();
            lastClient = this;
          }
        },
        Cluster: class Cluster extends FakeCluster {},
        Command: class Command {},
        ReplyError: class ReplyError extends Error {},
      };
    });

    const { Kestrel, KestrelEvents } = await import('../src/index');

    const kestrel = await Kestrel.initialize({
      host: 'localhost',
      port: 6379,
      username: 'default',
      password: 'kestrel',
    });

    expect(lastClient).not.toBeNull();

    const waitFor = (event: string) =>
      new Promise<void>((resolve) => {
        kestrel.once(event, () => resolve());
      });

    const disconnectedP = waitFor(KestrelEvents.DISCONNECTED);
    const endP = waitFor(KestrelEvents.END);
    const reconnectionAttemptsReachedP = waitFor(KestrelEvents.RECONNECTION_ATTEMPTS_REACHED);
    const errorP = waitFor(KestrelEvents.ERROR);

    lastClient!.emit('disconnected');
    lastClient!.emit('end');
    lastClient!.emit('reconnectionAttemptsReached');
    lastClient!.emit('error', new Error('boom'));

    await Promise.all([disconnectedP, endP, reconnectionAttemptsReachedP, errorP]);
    await kestrel.close();
  });
});


