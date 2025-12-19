#!/usr/bin/env python3
"""
Python Example: Decoding Kestrel IDs

This example demonstrates how to decode Kestrel IDs in Python for use in:
- Data warehousing pipelines
- ETL processes
- Analytics and reporting
- Integration with Python-based data processing tools

The ID format is: ABBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBCCCCCCCCCCDDDDDDDDDDDD
Where:
  - A: Reserved signed bit
  - B: Timestamp in milliseconds since custom epoch (41 bits)
  - C: Logical shard ID (10 bits)
  - D: Sequence (12 bits)
"""

from datetime import datetime
from typing import Dict, List, Union


# Constants matching the TypeScript implementation
CUSTOM_EPOCH = 1451566800  # Unix timestamp in seconds
LOGICAL_SHARD_ID_BITS = 10
SEQUENCE_BITS = 12
TIMESTAMP_SHIFT = SEQUENCE_BITS + LOGICAL_SHARD_ID_BITS
LOGICAL_SHARD_ID_SHIFT = SEQUENCE_BITS

def decode_id(id_value: Union[int, str]) -> Dict:
    """
    Decode a Kestrel ID into its component parts.
    
    Args:
        id_value: The ID to decode (can be int, str, or bigint string)
    
    Returns:
        Dictionary containing:
            - timestamp: milliseconds since custom epoch
            - timestamp_ms: milliseconds since Unix epoch (1970-01-01)
            - logical_shard_id: the logical shard ID (0-1023)
            - sequence: the sequence number (0-4095)
            - created_at: datetime object representing when the ID was created
    """
    # Convert to int (handles both int and string inputs)
    id_bigint = int(id_value)
    
    # Extract sequence (12 bits) - rightmost bits
    sequence_mask = (1 << SEQUENCE_BITS) - 1  # 0xFFF = 4095
    sequence = id_bigint & sequence_mask
    
    # Extract logical shard ID (10 bits) - bits 12-21
    logical_shard_id_mask = (1 << LOGICAL_SHARD_ID_BITS) - 1  # 0x3FF = 1023
    logical_shard_id = (id_bigint >> LOGICAL_SHARD_ID_SHIFT) & logical_shard_id_mask
    
    # Extract timestamp (41 bits) - bits 22-62
    # This is the timestamp in milliseconds since custom epoch
    timestamp_since_epoch = id_bigint >> TIMESTAMP_SHIFT
    
    # Convert timestamp from milliseconds since custom epoch to milliseconds since Unix epoch
    # CUSTOM_EPOCH is in seconds, so we multiply by 1000 to convert to milliseconds
    timestamp_ms = timestamp_since_epoch + (CUSTOM_EPOCH * 1000)
    
    # Create datetime object
    created_at = datetime.fromtimestamp(timestamp_ms / 1000.0)
    
    return {
        'timestamp': timestamp_since_epoch,
        'timestamp_ms': timestamp_ms,
        'logical_shard_id': logical_shard_id,
        'sequence': sequence,
        'created_at': created_at,
    }

def decode_ids(ids: List[Union[int, str]]) -> List[Dict]:
    """
    Decode multiple Kestrel IDs.
    
    Args:
        ids: List of IDs to decode
    
    Returns:
        List of decoded ID dictionaries
    """
    return [decode_id(id_value) for id_value in ids]

# Example 1: Decode IDs from Redis/database (as strings)
def example_decode_from_redis():
    """Example: Decoding IDs retrieved from Redis as strings"""
    print("=== Decoding IDs from Redis (as strings) ===")
    
    # Simulate IDs retrieved from Redis as strings
    ids_from_redis = [
        '1450115233196123456',
        '1450115233196123457',
        '1450115233196123458',
    ]
    
    decoded = decode_ids(ids_from_redis)
    
    for i, d in enumerate(decoded):
        print(f"ID {i + 1}:")
        print(f"  Created: {d['created_at'].isoformat()}")
        print(f"  Timestamp (Unix ms): {d['timestamp_ms']}")
        print(f"  Shard ID: {d['logical_shard_id']}")
        print(f"  Sequence: {d['sequence']}")
        print()

# Example 2: Decode IDs from a data warehouse/ETL pipeline
def example_decode_from_data_warehouse():
    """Example: Decoding IDs from CSV/data warehouse exports"""
    print("=== Decoding ID from Data Warehouse Row ===")
    
    # Simulate a row from a CSV file or data warehouse export
    csv_row = {
        'id': '1450115233196123456',
        'user_id': 'user123',
        'order_id': 'order456',
    }
    
    decoded = decode_id(csv_row['id'])
    
    print(f"Order ID: {csv_row['order_id']}")
    print(f"Kestrel ID: {csv_row['id']}")
    print(f"  Created: {decoded['created_at'].isoformat()}")
    print(f"  Shard: {decoded['logical_shard_id']}, Sequence: {decoded['sequence']}")
    print()

# Example 3: Batch decode for ETL processing
def example_batch_decode_for_etl():
    """Example: Batch processing for ETL pipelines"""
    print("=== Batch Decoding for ETL Pipeline ===")
    
    # Simulate batch processing from a data source
    batch_ids = [
        '1450115233196123456',
        '1450115233196123457',
        '1450115233196123458',
        '1450115233196123459',
        '1450115233196123460',
    ]
    
    decoded = decode_ids(batch_ids)
    
    # Group by timestamp (same millisecond)
    grouped_by_timestamp = {}
    for d in decoded:
        key = str(d['timestamp_ms'])
        if key not in grouped_by_timestamp:
            grouped_by_timestamp[key] = []
        grouped_by_timestamp[key].append(d)
    
    print(f"Total IDs: {len(batch_ids)}")
    print(f"Unique timestamps: {len(grouped_by_timestamp)}")
    for timestamp, ids in grouped_by_timestamp.items():
        dt = datetime.fromtimestamp(int(timestamp) / 1000.0)
        print(f"  {dt.isoformat()}: {len(ids)} IDs")
    print()

# Example 4: Data transformation for analytics
def example_transform_for_analytics():
    """Example: Transforming IDs for analytics/reporting"""
    print("=== Transforming IDs for Analytics ===")
    
    ids = [
        '1450115233196123456',
        '1450115233196123457',
        '1450115233196123458',
    ]
    
    decoded = decode_ids(ids)
    
    # Transform to analytics-friendly format
    analytics_data = []
    for i, d in enumerate(decoded):
        analytics_data.append({
            'kestrel_id': ids[i],
            'created_at': d['created_at'].isoformat(),
            'timestamp': d['timestamp_ms'],
            'shard_id': d['logical_shard_id'],
            'sequence': d['sequence'],
            # Add derived fields
            'date': d['created_at'].date().isoformat(),
            'hour': d['created_at'].hour,
            'shard_group': d['logical_shard_id'] // 100,  # Group shards
        })
    
    print("Analytics-ready data:")
    import json
    print(json.dumps(analytics_data, indent=2, default=str))
    print()

# Example 5: Using with pandas for data analysis
def example_pandas_integration():
    """Example: Using with pandas DataFrame for data analysis"""
    try:
        import pandas as pd
        
        print("=== Pandas Integration Example ===")
        
        # Create a DataFrame with Kestrel IDs
        df = pd.DataFrame({
            'kestrel_id': [
                '1450115233196123456',
                '1450115233196123457',
                '1450115233196123458',
            ],
            'user_id': ['user1', 'user2', 'user3'],
        })
        
        # Decode IDs and add columns
        decoded_data = decode_ids(df['kestrel_id'].tolist())
        
        df['created_at'] = [d['created_at'] for d in decoded_data]
        df['shard_id'] = [d['logical_shard_id'] for d in decoded_data]
        df['sequence'] = [d['sequence'] for d in decoded_data]
        df['date'] = df['created_at'].dt.date
        
        print(df)
        print()
        
        # Group by date for analytics
        daily_counts = df.groupby('date').size()
        print("Daily ID counts:")
        print(daily_counts)
        print()
        
    except ImportError:
        print("=== Pandas Integration Example ===")
        print("pandas not installed. Install with: pip install pandas")
        print()

if __name__ == '__main__':
    example_decode_from_redis()
    example_decode_from_data_warehouse()
    example_batch_decode_for_etl()
    example_transform_for_analytics()
    example_pandas_integration()
