/**
 * Redis configuration and connection setup
 */

const Redis = require('ioredis');
const logger = require('../utils/logger');
const config = require('./config');

let redisClient = null;

// Create Redis client
const createRedisClient = () => {
  try {
    const redisUrl = config.REDIS_URL;
    
    if (!redisUrl) {
      logger.warn('Redis URL not configured, using default localhost connection');
      return new Redis({
        host: 'localhost',
        port: 6379,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });
    }

    const client = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    // Handle connection events
    client.on('connect', () => {
      logger.info('Redis client connected');
    });

    client.on('ready', () => {
      logger.info('Redis client ready');
    });

    client.on('error', (error) => {
      logger.error('Redis client error:', error);
    });

    client.on('close', () => {
      logger.warn('Redis client connection closed');
    });

    client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    return client;
  } catch (error) {
    logger.error('Error creating Redis client:', error);
    throw error;
  }
};

// Get Redis client instance
const getRedisClient = () => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

// Test Redis connection
const testConnection = async () => {
  try {
    const client = getRedisClient();
    await client.ping();
    logger.info('Redis connection test successful');
    return true;
  } catch (error) {
    logger.error('Redis connection test failed:', error);
    return false;
  }
};

// Close Redis connection
const closeConnection = async () => {
  try {
    if (redisClient) {
      await redisClient.quit();
      redisClient = null;
      logger.info('Redis connection closed');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
  }
};

// Cache wrapper with Redis
const cache = {
  // Set cache value
  async set(key, value, ttl = 3600) {
    try {
      const client = getRedisClient();
      const serializedValue = JSON.stringify(value);
      await client.setex(key, ttl, serializedValue);
      logger.debug('Cache set', { key, ttl });
      return true;
    } catch (error) {
      logger.error('Error setting cache:', error);
      return false;
    }
  },

  // Get cache value
  async get(key) {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      if (value) {
        const parsedValue = JSON.parse(value);
        logger.debug('Cache hit', { key });
        return parsedValue;
      }
      logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      logger.error('Error getting cache:', error);
      return null;
    }
  },

  // Delete cache value
  async del(key) {
    try {
      const client = getRedisClient();
      await client.del(key);
      logger.debug('Cache deleted', { key });
      return true;
    } catch (error) {
      logger.error('Error deleting cache:', error);
      return false;
    }
  },

  // Check if key exists
  async exists(key) {
    try {
      const client = getRedisClient();
      const exists = await client.exists(key);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking cache key existence:', error);
      return false;
    }
  },

  // Set multiple cache values
  async mset(keyValuePairs, ttl = 3600) {
    try {
      const client = getRedisClient();
      const pipeline = client.pipeline();
      
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serializedValue = JSON.stringify(value);
        pipeline.setex(key, ttl, serializedValue);
      }
      
      await pipeline.exec();
      logger.debug('Cache mset', { keys: Object.keys(keyValuePairs), ttl });
      return true;
    } catch (error) {
      logger.error('Error setting multiple cache values:', error);
      return false;
    }
  },

  // Get multiple cache values
  async mget(keys) {
    try {
      const client = getRedisClient();
      const values = await client.mget(keys);
      const result = {};
      
      keys.forEach((key, index) => {
        if (values[index]) {
          try {
            result[key] = JSON.parse(values[index]);
          } catch (parseError) {
            logger.warn('Error parsing cached value for key:', key, parseError);
            result[key] = values[index];
          }
        } else {
          result[key] = null;
        }
      });
      
      logger.debug('Cache mget', { keys, found: Object.values(result).filter(v => v !== null).length });
      return result;
    } catch (error) {
      logger.error('Error getting multiple cache values:', error);
      return keys.reduce((acc, key) => ({ ...acc, [key]: null }), {});
    }
  },

  // Increment counter
  async incr(key, ttl = 3600) {
    try {
      const client = getRedisClient();
      const value = await client.incr(key);
      
      // Set TTL if this is a new key
      if (value === 1) {
        await client.expire(key, ttl);
      }
      
      logger.debug('Cache increment', { key, value });
      return value;
    } catch (error) {
      logger.error('Error incrementing cache counter:', error);
      return null;
    }
  },

  // Get cache statistics
  async getStats() {
    try {
      const client = getRedisClient();
      const info = await client.info();
      
      // Parse Redis INFO command output
      const stats = {};
      info.split('\r\n').forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          stats[key] = value;
        }
      });
      
      return {
        connected_clients: parseInt(stats.connected_clients) || 0,
        used_memory_human: stats.used_memory_human || '0B',
        total_commands_processed: parseInt(stats.total_commands_processed) || 0,
        keyspace_hits: parseInt(stats.keyspace_hits) || 0,
        keyspace_misses: parseInt(stats.keyspace_misses) || 0,
        hit_rate: stats.keyspace_hits && stats.keyspace_misses ? 
          (parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses)) * 100).toFixed(2) + '%' : '0%'
      };
    } catch (error) {
      logger.error('Error getting cache statistics:', error);
      return null;
    }
  }
};

module.exports = {
  getRedisClient,
  testConnection,
  closeConnection,
  cache
};
