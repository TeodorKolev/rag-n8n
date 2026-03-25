/**
 * Health check routes
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { getRedisClient } = require('../config/redis');
const { sequelize } = require('../config/database');
const axios = require('axios');
const config = require('../config/config');

/**
 * Basic health check
 */
router.get('/', asyncHandler(async (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'rag-assistant-backend',
    version: '1.0.0'
  });
}));

/**
 * Detailed health check with dependencies
 */
router.get('/detailed', asyncHandler(async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'rag-assistant-backend',
    version: '1.0.0',
    checks: {}
  };

  let overallStatus = 'healthy';

  // Check database
  try {
    await sequelize.authenticate();
    health.checks.database = {
      status: 'healthy',
      message: 'Connected'
    };
  } catch (error) {
    health.checks.database = {
      status: 'unhealthy',
      message: error.message
    };
    overallStatus = 'unhealthy';
  }

  // Check Redis
  try {
    const redis = getRedisClient();
    await redis.ping();
    health.checks.redis = {
      status: 'healthy',
      message: 'Connected'
    };
  } catch (error) {
    health.checks.redis = {
      status: 'unhealthy',
      message: error.message
    };
    overallStatus = 'unhealthy';
  }

  // Check Python service
  try {
    const response = await axios.get(`${config.PYTHON_SERVICE_URL}/health`, {
      timeout: 5000
    });
    health.checks.pythonService = {
      status: 'healthy',
      message: 'Connected',
      data: response.data
    };
  } catch (error) {
    health.checks.pythonService = {
      status: 'unhealthy',
      message: error.message
    };
    overallStatus = 'degraded';
  }

  // Check n8n
  try {
    const response = await axios.get(`${config.N8N_PROTOCOL}://${config.N8N_HOST}:${config.N8N_PORT}/healthz`, {
      timeout: 5000
    });
    health.checks.n8n = {
      status: 'healthy',
      message: 'Connected'
    };
  } catch (error) {
    health.checks.n8n = {
      status: 'unhealthy',
      message: error.message
    };
    overallStatus = 'degraded';
  }

  // Check external APIs (optional)
  const apiChecks = [];

  if (config.CLAUDE_API_KEY) {
    apiChecks.push(checkClaudeAPI());
  }

  if (config.OPENAI_API_KEY) {
    apiChecks.push(checkOpenAIAPI());
  }

  if (config.PINECONE_API_KEY) {
    apiChecks.push(checkPineconeAPI());
  }

  const apiResults = await Promise.allSettled(apiChecks);
  
  // Process API check results
  if (config.CLAUDE_API_KEY) {
    const claudeResult = apiResults.find(r => r.value?.service === 'claude');
    health.checks.claudeAPI = claudeResult?.status === 'fulfilled' ? claudeResult.value : {
      status: 'unhealthy',
      message: claudeResult?.reason?.message || 'Check failed'
    };
  }

  if (config.OPENAI_API_KEY) {
    const openaiResult = apiResults.find(r => r.value?.service === 'openai');
    health.checks.openaiAPI = openaiResult?.status === 'fulfilled' ? openaiResult.value : {
      status: 'unhealthy',
      message: openaiResult?.reason?.message || 'Check failed'
    };
  }

  if (config.PINECONE_API_KEY) {
    const pineconeResult = apiResults.find(r => r.value?.service === 'pinecone');
    health.checks.pineconeAPI = pineconeResult?.status === 'fulfilled' ? pineconeResult.value : {
      status: 'unhealthy',
      message: pineconeResult?.reason?.message || 'Check failed'
    };
  }

  health.status = overallStatus;

  const statusCode = overallStatus === 'healthy' ? 200 : 
                    overallStatus === 'degraded' ? 200 : 503;

  res.status(statusCode).json(health);
}));

/**
 * Readiness probe (for Kubernetes)
 */
router.get('/ready', asyncHandler(async (req, res) => {
  try {
    // Check critical dependencies
    await sequelize.authenticate();
    const redis = getRedisClient();
    await redis.ping();

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * Liveness probe (for Kubernetes)
 */
router.get('/live', asyncHandler(async (req, res) => {
  res.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
}));

/**
 * System metrics
 */
router.get('/metrics', asyncHandler(async (req, res) => {
  const metrics = {
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    environment: config.NODE_ENV,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch
  };

  // Add database connection info
  try {
    const dbResult = await sequelize.query('SELECT version() as version, now() as current_time');
    metrics.database = {
      connected: true,
      version: dbResult[0][0].version,
      currentTime: dbResult[0][0].current_time
    };
  } catch (error) {
    metrics.database = {
      connected: false,
      error: error.message
    };
  }

  // Add Redis info
  try {
    const redis = getRedisClient();
    const info = await redis.info();
    metrics.redis = {
      connected: true,
      version: info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown'
    };
  } catch (error) {
    metrics.redis = {
      connected: false,
      error: error.message
    };
  }

  res.json(metrics);
}));

// Helper functions for API checks
async function checkClaudeAPI() {
  try {
    const response = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-3-haiku-20240307',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Hi' }]
    }, {
      headers: {
        'Authorization': `Bearer ${config.CLAUDE_API_KEY}`,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      timeout: 10000
    });

    return {
      service: 'claude',
      status: 'healthy',
      message: 'API accessible',
      responseTime: response.headers['x-response-time']
    };
  } catch (error) {
    return {
      service: 'claude',
      status: error.response?.status === 401 ? 'healthy' : 'unhealthy',
      message: error.response?.status === 401 ? 'API key valid' : error.message
    };
  }
}

async function checkOpenAIAPI() {
  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      service: 'openai',
      status: 'healthy',
      message: 'API accessible',
      modelCount: response.data.data?.length || 0
    };
  } catch (error) {
    return {
      service: 'openai',
      status: error.response?.status === 401 ? 'healthy' : 'unhealthy',
      message: error.response?.status === 401 ? 'API key valid' : error.message
    };
  }
}

async function checkPineconeAPI() {
  try {
    const response = await axios.get('https://api.pinecone.io/indexes', {
      headers: {
        'Api-Key': config.PINECONE_API_KEY,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return {
      service: 'pinecone',
      status: 'healthy',
      message: 'API accessible',
      indexCount: response.data.indexes?.length || 0
    };
  } catch (error) {
    return {
      service: 'pinecone',
      status: error.response?.status === 401 ? 'healthy' : 'unhealthy',
      message: error.response?.status === 401 ? 'API key valid' : error.message
    };
  }
}

module.exports = router;
