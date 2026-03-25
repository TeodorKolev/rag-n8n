/**
 * Configuration settings for the backend API
 */

require('dotenv').config();

const config = {
  // Server configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 8000,
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  
  // Database configuration
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/rag_assistant',
  
  // Redis configuration
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // API Keys
  PINECONE_API_KEY: process.env.PINECONE_API_KEY || 'dummy-key',
  PINECONE_ENVIRONMENT: process.env.PINECONE_ENVIRONMENT || 'us-east1-gcp',
  PINECONE_INDEX_NAME: process.env.PINECONE_INDEX_NAME || 'rag-assistant',
  
  CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || 'dummy-key',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'dummy-key',
  
  // Authentication
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  
  // File upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE, 10) || 100 * 1024 * 1024, // 100MB
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'uploads',
  
  // External services
  N8N_HOST: process.env.N8N_HOST || 'localhost',
  N8N_PORT: parseInt(process.env.N8N_PORT, 10) || 5678,
  N8N_PROTOCOL: process.env.N8N_PROTOCOL || 'http',
  
  PYTHON_SERVICE_URL: process.env.PYTHON_SERVICE_URL || 'http://localhost:8001',
  
  // Monitoring
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ENABLE_METRICS: process.env.ENABLE_METRICS === 'true',
  
  // Document processing
  MAX_CHUNK_SIZE: parseInt(process.env.MAX_CHUNK_SIZE, 10) || 1000,
  CHUNK_OVERLAP: parseInt(process.env.CHUNK_OVERLAP, 10) || 200,
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
  
  // Search configuration
  DEFAULT_SEARCH_RESULTS: parseInt(process.env.DEFAULT_SEARCH_RESULTS, 10) || 5,
  MAX_SEARCH_RESULTS: parseInt(process.env.MAX_SEARCH_RESULTS, 10) || 20,
  
  // Cache configuration
  CACHE_TTL: parseInt(process.env.CACHE_TTL, 10) || 3600, // 1 hour in seconds
  
  // WebSocket configuration
  WS_HEARTBEAT_INTERVAL: parseInt(process.env.WS_HEARTBEAT_INTERVAL, 10) || 30000, // 30 seconds
  
  // Development settings
  isDevelopment: () => config.NODE_ENV === 'development',
  isProduction: () => config.NODE_ENV === 'production',
  isTest: () => config.NODE_ENV === 'test',
};

// Validate required environment variables
const requiredVars = [
  'PINECONE_API_KEY',
  'PINECONE_ENVIRONMENT',
  'CLAUDE_API_KEY',
  'OPENAI_API_KEY',
  'JWT_SECRET'
];

const missingVars = requiredVars.filter(varName => !config[varName]);

if (missingVars.length > 0 && !config.isTest()) {
  console.warn('Missing required environment variables:');
  missingVars.forEach(varName => {
    console.warn(`  - ${varName}`);
  });
  console.warn('Please check your .env file or environment configuration.');
  console.warn('Some features may not work properly without these variables.');
  // Don't exit - just warn and continue
}

module.exports = config;
