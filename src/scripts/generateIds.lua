local lock_key = KEYS[1]
local sequence_key = KEYS[2]
local logical_shard_id_key = KEYS[3]

local max_sequence = tonumber(ARGV[1])
local min_logical_shard_id = tonumber(ARGV[2])
local max_logical_shard_id = tonumber(ARGV[3])
local num_ids = tonumber(ARGV[4])

if redis.call('EXISTS', lock_key) == 1 then
    redis.log(redis.LOG_NOTICE, 'Kestrel: Cannot generate ID, waiting for lock to expire.')
    return redis.error_reply('Kestrel: Cannot generate ID, waiting for lock to expire.')
end

-- Generate the IDs
local end_sequence = redis.call('INCRBY', sequence_key, num_ids)
local start_sequence = end_sequence - num_ids + 1
local logical_shard_id = tonumber(redis.call('GET', logical_shard_id_key)) or -1

-- Validate logical_shard_id is within the acceptable range
if logical_shard_id < min_logical_shard_id or logical_shard_id > max_logical_shard_id then
    redis.log(redis.LOG_NOTICE, 'Kestrel: Logical shard ID ' .. logical_shard_id .. ' is out of range [' .. min_logical_shard_id .. ', ' .. max_logical_shard_id .. ']')
    return redis.error_reply('Kestrel: Logical shard ID out of range')
end

if end_sequence >= max_sequence then
    redis.log(redis.LOG_NOTICE, 'Kestrel: Rolling sequence back to the start, locking for 500ms.')
    redis.call('SET', sequence_key, '-1')
    redis.call('PSETEX', lock_key, 500, 'lock')
    end_sequence = max_sequence
end

--[[
The TIME command MUST be called after anything that mutates state, or the Redis server will error the script out.
This is to ensure the script is "pure" in the sense that randomness or time based input will not change the
outcome of the writes.
See the "Scripts as pure functions" section at http://redis.io/commands/eval for more information.
--]]
local time = redis.call('TIME')

return {
    start_sequence,
    end_sequence, -- Doesn't need conversion, the result of INCR or the variable set is always a number.
    logical_shard_id,
    tonumber(time[1]),
    tonumber(time[2])
}