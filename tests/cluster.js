const { Kestrel } = require('../lib/index.js');

const config = {
  clusterNodes: [
    { host: 'redis-cluster-node1', port: 6379 },
    { host: 'redis-cluster-node2', port: 6379 },
    { host: 'redis-cluster-node3', port: 6379 },
  ],
  username: 'default',
  password: 'kestrel',
  database: 0,
};

setTimeout(() => {
  console.log('Starting Cluster test 10000ms...');
  console.log('Configuration:', config);

  (async () => {
    try {
      console.log('Initializing Kestrel...');
      const kestrel = await Kestrel.initialize(config);

      // Generate a batch of 3 unique IDs.
      const ids = await kestrel.getIds(3);
      console.log('Generated IDs:', ids);
      console.log('Test Success');

      // Close connection to release resources
      await kestrel.close();

      process.exit(0);
    } catch (error) {
      console.error('Error connecting to Cluster:', error);
      process.exit(1);
    }
  })();
}, 10000); // wait 10 seconds

