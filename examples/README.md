# Kestrel ID Decoding Examples

This directory contains examples demonstrating how to decode Kestrel IDs in
various programming languages and scenarios.

**Note:** These examples use hardcoded sample IDs for demonstration purposes. In
production, you would:

1. Generate IDs using `Kestrel.getId()` or `Kestrel.getIds()`
2. Store them in your database, Redis, or other data stores
3. Retrieve them later and decode them using these examples

The examples focus on step 3 - decoding IDs that have already been generated and
stored.

## Examples

### JavaScript (ESM) (`decode-typescript.mjs`)

Demonstrates decoding Kestrel IDs in Node.js (ES modules):

- Decoding IDs from Redis return values (as strings)
- Decoding IDs from data warehouse rows
- Batch decoding for ETL pipelines
- Decoding from various input types (bigint, string, number)
- Transforming IDs for analytics

**Usage:**

```bash
# From project root
npm install

# Build first (the example imports from ../lib/index.mjs)
npm run build

# Run the example
node examples/decode-typescript.mjs

# Production usage:
# - Install the package: npm install @dreamystify/kestrel
# - Update the import to: import { Kestrel } from '@dreamystify/kestrel';
```

### Python (`decode-python.py`)

Demonstrates decoding Kestrel IDs in Python for data warehousing and ETL:

- Decoding IDs from Redis/database strings
- Decoding IDs from CSV/data warehouse exports
- Batch processing for ETL pipelines
- Transforming IDs for analytics
- Integration with pandas for data analysis

**Usage:**

```bash
# Run the example (from project root)
python3 examples/decode-python.py

# Or if you're in the examples directory
cd examples
python3 decode-python.py

# With pandas (optional)
pip install pandas
python3 examples/decode-python.py
```

### SQL (PostgreSQL) (`decode-sql.sql`)

Demonstrates decoding Kestrel IDs directly in SQL for analytics/ETL use cases:

- Decode a single ID literal
- Batch decode an array of IDs
- Decode IDs stored in a table column (e.g., TEXT or BIGINT)

**Usage:**

```bash
# From project root (Postgres):
psql "$DATABASE_URL" -f examples/decode-sql.sql
```

### SQL (MySQL/TiDB) (`decode-mysql.sql`)

Demonstrates decoding Kestrel IDs in MySQL-compatible SQL (including TiDB):

- Same bit shifts/masks as Postgres
- Uses `FROM_UNIXTIME()` for `created_at`
- Assumes IDs are stored as `BIGINT`
- Provided as runnable `SELECT` patterns (MySQL does not support table-returning functions)

**Usage:**

```bash
mysql -h "$MYSQL_HOST" -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" < examples/decode-mysql.sql
```

## Use Cases

### Data Warehousing

When loading Kestrel IDs into a data warehouse, you can decode them to extract:

- **Creation timestamp**: When the ID was generated
- **Shard ID**: Which Redis shard/cluster node generated it
- **Sequence**: The sequence number within that timestamp

This allows you to:

- Filter records by creation date
- Analyze distribution across shards
- Detect anomalies or patterns

### ETL Pipelines

In ETL (Extract, Transform, Load) processes:

1. **Extract**: Read Kestrel IDs from source systems (databases, APIs, files)
2. **Transform**: Decode IDs to extract metadata
3. **Load**: Store decoded data in destination systems

### Analytics & Reporting

Decode IDs to create analytics-friendly datasets:

- Group by date/hour for time-series analysis
- Aggregate by shard ID for load distribution analysis
- Use sequence numbers to detect gaps or patterns

## ID Format

Kestrel IDs are 64-bit integers with the following structure:

```text
ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCCCCCCCCCCDDDDDDDDDDDD
```

Where:

- **A**: Reserved signed bit
- **B**: Timestamp in milliseconds since custom epoch (41 bits)
- **C**: Logical shard ID (10 bits, range: 0-1023)
- **D**: Sequence number (12 bits, range: 0-4095)

## Constants

Both implementations use these constants:

- `CUSTOM_EPOCH`: `1451566800` (Unix timestamp in seconds)
- `LOGICAL_SHARD_ID_BITS`: `10`
- `SEQUENCE_BITS`: `12`
- `TIMESTAMP_SHIFT`: `22` (SEQUENCE_BITS + LOGICAL_SHARD_ID_BITS)
- `LOGICAL_SHARD_ID_SHIFT`: `12` (SEQUENCE_BITS)

## Input Types

Both implementations accept IDs as:

- **Integer/BigInt**: Native numeric type
- **String**: String representation of the number
- **Number**: JavaScript/TypeScript number (if within safe integer range)

This makes it easy to decode IDs from various sources:

- Redis return values (often strings)
- Database columns (various types)
- CSV files (strings)
- JSON APIs (strings or numbers)
- Data warehouse exports (various formats)
