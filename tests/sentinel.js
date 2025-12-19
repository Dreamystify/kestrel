const { Kestrel } = require('../lib/index.js');

const config = {
  sentinels: [
    { host: 'redis-sentinel', port: 26379 },
  ],
  name: 'mymaster',
  username: 'default',
  password: 'kestrel',
  sentinelUsername: 'default',
  sentinelPassword: 'kestrel',
  connectTimeout: 10000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

setTimeout(() => {
  console.log('Starting Sentinel test 2000ms...');
  console.log('Configuration:', config);

  (async () => {
    const startedAt = Date.now();
    const timeoutMs = 15000;
    let attempt = 0;

    while (Date.now() - startedAt < timeoutMs) {
      attempt += 1;
      try {
        const kestrel = await Kestrel.initialize(config);

        // Generate a batch of 3 unique IDs.
        const ids = await kestrel.getIds(3);
        console.log('Generated IDs:', ids);
        console.log('Test Success');

        await kestrel.close();
        process.exit(0);
      } catch (error) {
        console.error(`Sentinel attempt ${attempt} failed:`, error?.message ?? error);
        await sleep(Math.min(250 * attempt, 2000));
      }
    }

    console.error(`Sentinel test timed out after ${timeoutMs}ms`);
    process.exit(1);
  })();
}, 2000); // wait 2 seconds

