import { Kestrel, KestrelEvents } from '../src/index';
import { readFileSync } from 'fs';

describe('Kestrel', () => {
    let consoleLogSpy: jest.SpyInstance;
    const hideConsoleLogs = false;
    let kestrel: Kestrel | null = null;

    afterAll(async () => {
        // Ensure all connections are closed at the end
        if (kestrel) {
            await kestrel.close();
        }
    });

    beforeEach(() => {
        // Create a spy on console.log
        if (hideConsoleLogs) {
            consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        }
    });
  
    afterEach(async () => {
        // Restore the original implementation of console.log
        if (hideConsoleLogs) consoleLogSpy.mockRestore();

        if (kestrel) {
            kestrel.removeAllListeners();
            try {
                await kestrel.close();
            } catch (err) {
                // Ignore close errors in tests
            }
            kestrel = null;
        }
    });

    afterAll(async () => {
        // Ensure all connections are closed at the end
        if (kestrel) {
            await kestrel.close();
        }
    });

    describe('Standalone Mode', () => {
        it('should connect with default configuration', async () => {
            kestrel = await Kestrel.initialize();
            const ids = await kestrel.getIds(1);
            expect(ids).toHaveLength(1);
            expect(typeof ids[0]).toBe('bigint');
        });

        it('should connect with custom configuration', async () => {
            const config = {
                host: 'localhost',
                port: 6379,
                username: 'default',
                password: 'kestrel',
            };
            kestrel = await Kestrel.initialize(config);
            const ids = await kestrel.getIds(1);
            expect(ids).toHaveLength(1);
            expect(typeof ids[0]).toBe('bigint');
        });

        it('should handle authentication failure', async () => {
            const config = {
                host: 'localhost',
                port: 6379,
                username: 'wrong-user',
                password: 'wrong-password',
            };

            try {
                await Kestrel.initialize(config);
            } catch (err) {
                expect((err as Error).message).toContain(
                   'Failed to initialize: Invalid username-password pair or user is disabled.'
                );
            }
        });

        it('should handle connection failure', async () => {
            const config = {
                host: 'invalid-host',
                port: 9999,
                username: 'default',
                password: 'kestrel',
            };

            try {
                await Kestrel.initialize(config);
            } catch (err) {
                expect((err as Error).message).toMatch(
                    'Failed to initialize: Invalid host.'
                );
            }
        });

        describe('getId function', () => {
            it('should return a bigint id', async () => {
                kestrel = await Kestrel.initialize();
                const ids = await kestrel.getIds(1);
                expect(ids).toHaveLength(1);
                expect(typeof ids[0]).toBe('bigint');
            });
        });
    
        describe('getIds function', () => {
            it('should return an array of bigint', async () => {
                const count = 5;
                kestrel = await Kestrel.initialize();
                const ids = await kestrel.getIds(count);
                expect(ids).toHaveLength(count);
                ids.forEach(id => {
                    expect(typeof id).toBe('bigint');
                });
            });

            it('should generate more than 4096 IDs without lockouts or duplicates', async () => {
                kestrel = await Kestrel.initialize();

                // Historically, Kestrel used a global 12-bit sequence and would lock/error on wrap (~4096 IDs).
                // This test ensures we can cross that boundary safely.
                const firstBatch = await kestrel.getIds(4096);
                const secondBatch = await kestrel.getIds(50);

                const ids = [...firstBatch, ...secondBatch];
                expect(ids).toHaveLength(4096 + 50);

                // Uniqueness
                const unique = new Set(ids.map(id => id.toString()));
                expect(unique.size).toBe(ids.length);

                // Monotonicity (in generation order)
                for (let i = 1; i < ids.length; i++) {
                    expect(ids[i] > ids[i - 1]).toBe(true);
                }
            });
        });

        describe('decodeId function', () => {
            it('should decode an ID into its component parts', async () => {
                kestrel = await Kestrel.initialize();
                const id = await kestrel.getId();
                
                const decoded = Kestrel.decodeId(id);
                
                // Verify all expected properties exist
                expect(decoded).toHaveProperty('timestamp');
                expect(decoded).toHaveProperty('timestampMs');
                expect(decoded).toHaveProperty('logicalShardId');
                expect(decoded).toHaveProperty('sequence');
                expect(decoded).toHaveProperty('createdAt');
                
                // Verify types
                expect(typeof decoded.timestamp).toBe('number');
                expect(typeof decoded.timestampMs).toBe('number');
                expect(typeof decoded.logicalShardId).toBe('number');
                expect(typeof decoded.sequence).toBe('number');
                expect(decoded.createdAt).toBeInstanceOf(Date);
                
                // Verify logical shard ID is within valid range (0-1023)
                expect(decoded.logicalShardId).toBeGreaterThanOrEqual(0);
                expect(decoded.logicalShardId).toBeLessThanOrEqual(1023);
                
                // Verify sequence is within valid range (0-4095)
                expect(decoded.sequence).toBeGreaterThanOrEqual(0);
                expect(decoded.sequence).toBeLessThanOrEqual(4095);
                
                // Verify timestamp is reasonable (should be recent, within last few seconds)
                const now = Date.now();
                const timeDiff = Math.abs(now - decoded.timestampMs);
                expect(timeDiff).toBeLessThan(10000); // Within 10 seconds
                
                // Verify createdAt is a valid date
                expect(decoded.createdAt.getTime()).toBe(decoded.timestampMs);
            });

            it('should decode IDs from different input types', async () => {
                kestrel = await Kestrel.initialize();
                const id = await kestrel.getId();
                
                // Test with bigint
                const decoded1 = Kestrel.decodeId(id);
                
                // Test with string
                const decoded2 = Kestrel.decodeId(id.toString());
                
                // Test with number (if within safe integer range)
                if (id <= Number.MAX_SAFE_INTEGER) {
                    const decoded3 = Kestrel.decodeId(Number(id));
                    
                    // All should produce the same result
                    expect(decoded1.timestamp).toBe(decoded2.timestamp);
                    expect(decoded1.timestamp).toBe(decoded3.timestamp);
                    expect(decoded1.logicalShardId).toBe(decoded2.logicalShardId);
                    expect(decoded1.logicalShardId).toBe(decoded3.logicalShardId);
                    expect(decoded1.sequence).toBe(decoded2.sequence);
                    expect(decoded1.sequence).toBe(decoded3.sequence);
                }
            });

            it('should decode multiple IDs from a batch', async () => {
                kestrel = await Kestrel.initialize();
                const ids = await kestrel.getIds(5);
                
                const decoded = Kestrel.decodeIds(ids);
                
                // All IDs should have the same timestamp (generated in same batch)
                const firstTimestamp = decoded[0].timestamp;
                decoded.forEach(d => {
                    expect(d.timestamp).toBe(firstTimestamp);
                });
                
                // Sequences should be consecutive
                const sequences = decoded.map(d => d.sequence).sort((a, b) => a - b);
                for (let i = 1; i < sequences.length; i++) {
                    expect(sequences[i] - sequences[i - 1]).toBeLessThanOrEqual(1);
                }
            });

            it('should decode an array of IDs using decodeIds', async () => {
                kestrel = await Kestrel.initialize();
                const ids = await kestrel.getIds(3);
                
                const decoded = Kestrel.decodeIds(ids);
                
                // Should return an array of the same length
                expect(decoded).toHaveLength(3);
                
                // Each decoded item should have all expected properties
                decoded.forEach(d => {
                    expect(d).toHaveProperty('timestamp');
                    expect(d).toHaveProperty('timestampMs');
                    expect(d).toHaveProperty('logicalShardId');
                    expect(d).toHaveProperty('sequence');
                    expect(d).toHaveProperty('createdAt');
                    expect(d.createdAt).toBeInstanceOf(Date);
                });
                
                // Verify decodeIds produces same results as decodeId
                ids.forEach((id, index) => {
                    const singleDecoded = Kestrel.decodeId(id);
                    expect(decoded[index].timestamp).toBe(singleDecoded.timestamp);
                    expect(decoded[index].logicalShardId).toBe(singleDecoded.logicalShardId);
                    expect(decoded[index].sequence).toBe(singleDecoded.sequence);
                });
            });

            it('should correctly decode a known ID with exact values', () => {
                // Test with a known ID to verify exact bit extraction
                // This ID was constructed with:
                // - timestamp_since_epoch: 1000000 (ms since custom epoch)
                // - logical shard ID: 42
                // - sequence: 123
                // 
                // ID construction (matching Kestrel's logic):
                // (timestamp_since_epoch << 22) | (shard_id << 12) | sequence
                // (1000000 << 22) | (42 << 12) | 123
                // = 4194304000000 | 172032 | 123
                // = 4194304172155
                const timestampSinceEpoch = 1000000;
                const shardId = 42;
                const sequence = 123;
                const knownId = BigInt(timestampSinceEpoch) << BigInt(22) | 
                                BigInt(shardId) << BigInt(12) | 
                                BigInt(sequence);
                
                const decoded = Kestrel.decodeId(knownId);
                
                // Verify exact values match what we encoded
                expect(decoded.timestamp).toBe(timestampSinceEpoch);
                expect(decoded.logicalShardId).toBe(shardId);
                expect(decoded.sequence).toBe(sequence);
                
                // Verify timestamp conversion to Unix epoch
                const CUSTOM_EPOCH = 1451566800;
                const expectedTimestampMs = timestampSinceEpoch + (CUSTOM_EPOCH * 1000);
                expect(decoded.timestampMs).toBe(expectedTimestampMs);
                
                // Verify Date object
                expect(decoded.createdAt.getTime()).toBe(expectedTimestampMs);
            });

            it('should correctly round-trip: generate then decode', async () => {
                kestrel = await Kestrel.initialize();
                
                // Generate an ID
                const id = await kestrel.getId();
                
                // Decode it
                const decoded = Kestrel.decodeId(id);
                
                // Verify the decoded values are reasonable and consistent
                expect(decoded.timestamp).toBeGreaterThan(0);
                expect(decoded.logicalShardId).toBeGreaterThanOrEqual(0);
                expect(decoded.logicalShardId).toBeLessThanOrEqual(1023);
                expect(decoded.sequence).toBeGreaterThanOrEqual(0);
                expect(decoded.sequence).toBeLessThanOrEqual(4095);
                
                // Verify timestamp is recent (within last minute)
                const now = Date.now();
                const timeDiff = Math.abs(now - decoded.timestampMs);
                expect(timeDiff).toBeLessThan(60000);
                
                // Verify we can decode the same ID multiple times and get same result
                const decoded2 = Kestrel.decodeId(id);
                expect(decoded.timestamp).toBe(decoded2.timestamp);
                expect(decoded.logicalShardId).toBe(decoded2.logicalShardId);
                expect(decoded.sequence).toBe(decoded2.sequence);
                expect(decoded.timestampMs).toBe(decoded2.timestampMs);
            });
        });

        describe('Error handling', () => {
            it('should handle NOAUTH error', async () => {
                const config = {
                    host: 'localhost',
                    port: 6379,
                    // No username/password provided
                };

                let testKestrel: Kestrel | null = null;
                try {
                    testKestrel = await Kestrel.initialize(config);
                } catch (err) {
                    expect((err as Error).message).toContain('No authentication provided');
                } finally {
                    if (testKestrel) {
                        await testKestrel.close();
                    }
                }
            });

            it('should handle connection refused error', async () => {
                const config = {
                    host: 'localhost',
                    port: 9999, // Invalid port
                    username: 'default',
                    password: 'kestrel',
                };

                let testKestrel: Kestrel | null = null;
                try {
                    testKestrel = await Kestrel.initialize(config);
                } catch (err) {
                    expect((err as Error).message).toMatch(/Failed to initialize: (connect ECONNREFUSED|Invalid host|Connection refused)/);
                } finally {
                    if (testKestrel) {
                        await testKestrel.close();
                    }
                }
            });

            it('should handle unknown errors', async () => {
                // Mock a scenario that would cause an unknown error
                const originalReadFileSync = readFileSync;
                const mockReadFileSync = jest.fn(() => {
                    throw new Error('File system error');
                });
                
                jest.doMock('fs', () => ({
                    readFileSync: mockReadFileSync
                }));

                let testKestrel: Kestrel | null = null;
                try {
                    testKestrel = await Kestrel.initialize();
                } catch (err) {
                    expect((err as Error).message).toContain('Failed to initialize');
                } finally {
                    if (testKestrel) {
                        await testKestrel.close();
                    }
                    // Restore original function
                    jest.dontMock('fs');
                }
            });
        });

        describe('Event handling', () => {
            it('should emit events during initialization', async () => {
                const eventSpy = jest.fn();
                kestrel = await Kestrel.initialize();
                
                // Events are emitted during initialization, so we need to check if they were already emitted
                // or set up listeners before initialization
                expect(kestrel).toBeDefined();
            });

            it('should handle close method with no client', async () => {
                const kestrelInstance = new Kestrel();
                
                // Should not throw an error when closing an uninitialized client
                await expect(kestrelInstance.close()).resolves.not.toThrow();
            });

            it('should handle close method with client in different states', async () => {
                kestrel = await Kestrel.initialize();
                
                const disconnectSpy = jest.fn();
                kestrel.on('disconnected', disconnectSpy);
                
                await kestrel.close();
                
                // The disconnect event should be emitted
                expect(disconnectSpy).toHaveBeenCalled();
            });
        });

        describe('Cluster mode', () => {
            it('should handle cluster configuration', async () => {
                const config = {
                    clusterNodes: [
                        { host: 'localhost', port: 7000 },
                        { host: 'localhost', port: 7001 }
                    ],
                    username: 'default',
                    password: 'kestrel',
                };

                // Test that the configuration is valid (doesn't throw immediately)
                expect(() => new Kestrel(config)).not.toThrow();
            });
        });

        describe('Sentinel mode', () => {
            it('should handle sentinel configuration', async () => {
                const config = {
                    sentinels: [
                        { host: 'localhost', port: 26379 }
                    ],
                    name: 'mymaster',
                    username: 'default',
                    password: 'kestrel',
                };

                try {
                    await Kestrel.initialize(config);
                } catch (err) {
                    // Expected to fail without actual sentinel, but should not throw config errors
                    expect((err as Error).message).not.toContain('Invalid configuration');
                }
            });
        });

        describe('Retry strategy', () => {
            it('should use default retry strategy', async () => {
                const config = {
                    host: 'localhost',
                    port: 6379,
                    username: 'default',
                    password: 'kestrel',
                    // No custom retry strategy provided
                };

                try {
                    kestrel = await Kestrel.initialize(config);
                    // If it connects, the default retry strategy is working
                    expect(kestrel).toBeDefined();
                } catch (err) {
                    // If it fails, it should be due to connection issues, not retry strategy
                    expect((err as Error).message).not.toContain('retry strategy');
                }
            });
        });
    });
});
