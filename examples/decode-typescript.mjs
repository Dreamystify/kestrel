/**
 * JavaScript (ESM) Example: Decoding Kestrel IDs
 *
 * This example demonstrates how to decode Kestrel IDs in various scenarios:
 * - Decoding IDs from Redis return values
 * - Decoding IDs from strings (e.g., from databases, APIs, CSV files)
 * - Batch decoding for data warehousing/ETL pipelines
 *
 * It imports from the built ESM output (../lib/index.mjs), so run `npm run build` first.
 */
import { Kestrel } from '../lib/index.mjs';

// Example 1: Decode IDs from Redis/database (as strings)
async function decodeFromRedis() {
  // Simulate IDs retrieved from Redis as strings
  const idsFromRedis = ['1450115233196123456', '1450115233196123457', '1450115233196123458'];

  console.log('=== Decoding IDs from Redis (as strings) ===');
  const decoded = Kestrel.decodeIds(idsFromRedis);

  decoded.forEach((d, index) => {
    console.log(`ID ${index + 1}:`);
    console.log(`  Created: ${d.createdAt.toISOString()}`);
    console.log(`  Timestamp (Unix ms): ${d.timestampMs}`);
    console.log(`  Shard ID: ${d.logicalShardId}`);
    console.log(`  Sequence: ${d.sequence}`);
    console.log('');
  });
}

// Example 2: Decode IDs from a data warehouse/ETL pipeline
async function decodeFromDataWarehouse() {
  const csvRow = {
    id: '1450115233196123456',
    userId: 'user123',
    orderId: 'order456',
  };

  console.log('=== Decoding ID from Data Warehouse Row ===');
  const decoded = Kestrel.decodeId(csvRow.id);

  console.log(`Order ID: ${csvRow.orderId}`);
  console.log(`Kestrel ID: ${csvRow.id}`);
  console.log(`  Created: ${decoded.createdAt.toISOString()}`);
  console.log(`  Shard: ${decoded.logicalShardId}, Sequence: ${decoded.sequence}`);
  console.log('');
}

// Example 3: Batch decode for ETL processing
async function batchDecodeForETL() {
  const batchIds = [
    '1450115233196123456',
    '1450115233196123457',
    '1450115233196123458',
    '1450115233196123459',
    '1450115233196123460',
  ];

  console.log('=== Batch Decoding for ETL Pipeline ===');
  const decoded = Kestrel.decodeIds(batchIds);

  const groupedByTimestamp = decoded.reduce((acc, d) => {
    const key = d.timestampMs.toString();
    (acc[key] ??= []).push(d);
    return acc;
  }, {});

  console.log(`Total IDs: ${batchIds.length}`);
  console.log(`Unique timestamps: ${Object.keys(groupedByTimestamp).length}`);
  Object.entries(groupedByTimestamp).forEach(([timestamp, ids]) => {
    console.log(`  ${new Date(Number(timestamp)).toISOString()}: ${ids.length} IDs`);
  });
  console.log('');
}

// Example 4: Decode from different input types
async function decodeFromVariousSources() {
  console.log('=== Decoding from Various Input Types ===');

  const sampleId = '1450115233196123456';

  const decoded1 = Kestrel.decodeId(sampleId);
  console.log('Decoded from string:', decoded1.createdAt.toISOString());

  const decoded2 = Kestrel.decodeId(BigInt(sampleId));
  console.log('Decoded from bigint:', decoded2.createdAt.toISOString());

  const idNumber = Number(sampleId);
  let decoded3;
  if (idNumber <= Number.MAX_SAFE_INTEGER) {
    decoded3 = Kestrel.decodeId(idNumber);
    console.log('Decoded from number:', decoded3.createdAt.toISOString());
  } else {
    console.log('ID too large for safe integer, skipping number decode');
  }

  const allMatch = decoded1.timestamp === decoded2.timestamp && (!decoded3 || decoded1.timestamp === decoded3.timestamp);
  console.log('All decode methods produce identical results:', allMatch);
  console.log('');
}

// Example 5: Data transformation for analytics
async function transformForAnalytics() {
  const ids = ['1450115233196123456', '1450115233196123457', '1450115233196123458'];

  console.log('=== Transforming IDs for Analytics ===');
  const decoded = Kestrel.decodeIds(ids);

  const analyticsData = decoded.map((d, index) => ({
    kestrelId: ids[index],
    createdAt: d.createdAt.toISOString(),
    timestamp: d.timestampMs,
    shardId: d.logicalShardId,
    sequence: d.sequence,
    date: d.createdAt.toISOString().split('T')[0],
    hour: d.createdAt.getHours(),
    shardGroup: Math.floor(d.logicalShardId / 100),
  }));

  console.log('Analytics-ready data:');
  console.log(JSON.stringify(analyticsData, null, 2));
  console.log('');
}

// Run all examples
(async () => {
  try {
    await decodeFromRedis();
    await decodeFromDataWarehouse();
    await batchDecodeForETL();
    await decodeFromVariousSources();
    await transformForAnalytics();
    console.log('✅ All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();


