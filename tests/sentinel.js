import { Kestrel } from '../lib/index.js';

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

setTimeout(async () => {
  console.log('Starting Sentinel test 2000ms...');
  console.log('Configuration:', config);

  try {
    const kestrel = await Kestrel.initialize(config);

    // Generate a batch of 3 unique IDs.
    const ids = await kestrel.getIds(3);
    console.log('Generated IDs:', ids);
    console.log('Test Success');

    process.exit(0);
  } catch (error) {
    console.error('Error connecting to Sentinel:', error);
    process.exit(1);
  }
}, 2000); // wait 2 seconds

