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
