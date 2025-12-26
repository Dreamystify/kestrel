/*
MySQL / TiDB Example: Decoding Kestrel IDs (Snowflake-style)

Kestrel ID format (64-bit integer):
ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCCCCCCCCCCDDDDDDDDDDDD

Where:
  - A: Reserved signed bit
  - B: Timestamp in milliseconds since custom epoch (41 bits)
  - C: Logical shard ID (10 bits)
  - D: Sequence (12 bits)

Notes (MySQL/TiDB):
  - Bitwise operators (&, >>, <<) work on BIGINT.
  - There is no RETURNS TABLE function like Postgres; use a SELECT (or a VIEW).
  - FROM_UNIXTIME() returns a DATETIME in the session time zone.
  - This example assumes IDs are stored as BIGINT (not TEXT).
*/

-- Constants matching the library implementation
-- CUSTOM_EPOCH is Unix seconds; timestampMs = (id >> 22) + (CUSTOM_EPOCH * 1000)
SET @KESTREL_CUSTOM_EPOCH_SECONDS := 1451566800;
SET @KESTREL_TIMESTAMP_SHIFT := 22;
SET @KESTREL_LOGICAL_SHARD_ID_SHIFT := 12;
SET @KESTREL_LOGICAL_SHARD_ID_MASK := (1 << 10) - 1; -- 0x3FF
SET @KESTREL_SEQUENCE_MASK := (1 << 12) - 1;         -- 0xFFF

-- ---------------------------------------------------------------------------
-- Usage examples
-- ---------------------------------------------------------------------------

-- Example 1: Decode a single ID literal
SET @id := 1450115233196123456;

SELECT
  @id AS kestrel_id,
  (@id & @KESTREL_SEQUENCE_MASK) AS sequence,
  ((@id >> @KESTREL_LOGICAL_SHARD_ID_SHIFT) & @KESTREL_LOGICAL_SHARD_ID_MASK) AS logical_shard_id,
  (@id >> @KESTREL_TIMESTAMP_SHIFT) AS timestamp_since_epoch_ms,
  ((@id >> @KESTREL_TIMESTAMP_SHIFT) + (@KESTREL_CUSTOM_EPOCH_SECONDS * 1000)) AS timestamp_ms,
  FROM_UNIXTIME((((@id >> @KESTREL_TIMESTAMP_SHIFT) + (@KESTREL_CUSTOM_EPOCH_SECONDS * 1000)) / 1000)) AS created_at;

-- Example 2: Batch decode (union all pattern, commonly used in SQL consoles)
SELECT
  id AS kestrel_id,
  (id & @KESTREL_SEQUENCE_MASK) AS sequence,
  ((id >> @KESTREL_LOGICAL_SHARD_ID_SHIFT) & @KESTREL_LOGICAL_SHARD_ID_MASK) AS logical_shard_id,
  (id >> @KESTREL_TIMESTAMP_SHIFT) AS timestamp_since_epoch_ms,
  ((id >> @KESTREL_TIMESTAMP_SHIFT) + (@KESTREL_CUSTOM_EPOCH_SECONDS * 1000)) AS timestamp_ms,
  FROM_UNIXTIME((((id >> @KESTREL_TIMESTAMP_SHIFT) + (@KESTREL_CUSTOM_EPOCH_SECONDS * 1000)) / 1000)) AS created_at
FROM (
  SELECT 1450115233196123456 AS id
  UNION ALL SELECT 1450115233196123457
  UNION ALL SELECT 1450115233196123458
  UNION ALL SELECT 1450115233196123459
  UNION ALL SELECT 1450115233196123460
) ids
ORDER BY timestamp_ms, logical_shard_id, sequence;

-- Example 3: Query a table with LIMIT 10 and decoded parts as columns
-- (adjust table/column names to your schema)
--
-- SELECT
--   t.*,
--   (t.kestrel_id & @KESTREL_SEQUENCE_MASK) AS sequence,
--   ((t.kestrel_id >> @KESTREL_LOGICAL_SHARD_ID_SHIFT) & @KESTREL_LOGICAL_SHARD_ID_MASK) AS logical_shard_id,
--   (t.kestrel_id >> @KESTREL_TIMESTAMP_SHIFT) AS timestamp_since_epoch_ms,
--   ((t.kestrel_id >> @KESTREL_TIMESTAMP_SHIFT) + (@KESTREL_CUSTOM_EPOCH_SECONDS * 1000)) AS timestamp_ms,
--   FROM_UNIXTIME((((t.kestrel_id >> @KESTREL_TIMESTAMP_SHIFT) + (@KESTREL_CUSTOM_EPOCH_SECONDS * 1000)) / 1000)) AS created_at
-- FROM your_table t
-- ORDER BY t.kestrel_id
-- LIMIT 10;
