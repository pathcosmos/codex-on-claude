const config = {
  useRedisCache: process.env.CACHE === 'redis',
  maxCacheSize: 10000,
  requestTimeout: 30000,
  retryAttempts: 3,
  circuitBreakerThreshold: 0.5,
  batchSize: 100,
  enableCompression: true,
  logLevel: 'info'
};

module.exports = config;

// Used throughout codebase in multiple services with different assumptions