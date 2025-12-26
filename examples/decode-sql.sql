/*
PostgreSQL Example: Decoding Kestrel IDs (Snowflake-style)

Kestrel ID format (64-bit integer):
ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCCCCCCCCCCDDDDDDDDDDDD

Where:
  - A: Reserved signed bit
  - B: Timestamp in milliseconds since custom epoch (41 bits)
  - C: Logical shard ID (10 bits)
  - D: Sequence (12 bits)

This file is designed to be copy/pasted into Postgres (psql, DBeaver, etc.)
and used in analytics / ETL / warehousing queries.
*/

-- Constants matching the library implementation:
-- - CUSTOM_EPOCH is a Unix timestamp in seconds
-- - timestampMs = (id >> 22) + (CUSTOM_EPOCH * 1000)
DO $$
BEGIN
  -- no-op block; present to make it easy to run this file in one go.
END $$;

CREATE OR REPLACE FUNCTION kestrel_decode_id(id_input BIGINT)
RETURNS TABLE (
  timestamp_since_epoch_ms BIGINT,
  timestamp_ms BIGINT,
  created_at TIMESTAMPTZ,
  logical_shard_id INTEGER,
  sequence INTEGER
)
LANGUAGE SQL
IMMUTABLE
STRICT
AS $$
  WITH constants AS (
    SELECT
      1451566800::BIGINT AS custom_epoch_seconds,
      10::INT AS logical_shard_id_bits,
      12::INT AS sequence_bits,
      22::INT AS timestamp_shift,
      12::INT AS logical_shard_id_shift
  ),
  decoded AS (
    SELECT
      -- Rightmost 12 bits
      (id_input & ((1::BIGINT << (SELECT sequence_bits FROM constants)) - 1)) AS sequence_bigint,

      -- Bits 12-21 (10 bits)
      (
        (id_input >> (SELECT logical_shard_id_shift FROM constants))
        & ((1::BIGINT << (SELECT logical_shard_id_bits FROM constants)) - 1)
      ) AS logical_shard_id_bigint,

      -- Bits 22-62 (timestamp ms since custom epoch)
      (id_input >> (SELECT timestamp_shift FROM constants)) AS timestamp_since_epoch_ms
  )
  SELECT
    d.timestamp_since_epoch_ms,
    (d.timestamp_since_epoch_ms + ((SELECT custom_epoch_seconds FROM constants) * 1000)) AS timestamp_ms,
    to_timestamp(
      (d.timestamp_since_epoch_ms + ((SELECT custom_epoch_seconds FROM constants) * 1000)) / 1000.0
    ) AS created_at,
    d.logical_shard_id_bigint::INT AS logical_shard_id,
    d.sequence_bigint::INT AS sequence
  FROM decoded d;
$$;

-- ---------------------------------------------------------------------------
-- Usage examples
-- ---------------------------------------------------------------------------

-- Example 1: Decode a single ID literal
SELECT *
FROM kestrel_decode_id(1450115233196123456);

-- Example 2: Decode a batch of IDs (e.g., from Redis/db exports)
WITH ids AS (
  SELECT unnest(ARRAY[
    1450115233196123456::BIGINT,
    1450115233196123457::BIGINT,
    1450115233196123458::BIGINT,
    1450115233196123459::BIGINT,
    1450115233196123460::BIGINT
  ]) AS id
)
SELECT
  i.id AS kestrel_id,
  d.created_at,
  d.timestamp_ms,
  d.logical_shard_id,
  d.sequence
FROM ids i
CROSS JOIN LATERAL kestrel_decode_id(i.id) d
ORDER BY d.timestamp_ms, d.logical_shard_id, d.sequence;

-- Example 3: Decode IDs stored as TEXT in a table
-- (adjust table/column names to your schema)
--
-- SELECT
--   t.id_text,
--   d.created_at,
--   d.logical_shard_id,
--   d.sequence
-- FROM your_table t
-- CROSS JOIN LATERAL kestrel_decode_id(t.id_text::BIGINT) d;


