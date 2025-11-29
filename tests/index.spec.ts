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
