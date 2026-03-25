/**
 * Logging configuration using Winston
 */

const winston = require('winston');
const config = require('../config/config');

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss'
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += '\n' + JSON.stringify(meta, null, 2);
    }
    
    return log;
  })
);

// Create logger
const logger = winston.createLogger({
  level: config.LOG_LEVEL,
  format: logFormat,
  defaultMeta: {
    service: 'rag-assistant-backend',
    environment: config.NODE_ENV
  },
  transports: []
});

// Add console transport
if (config.isDevelopment()) {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }));
} else {
  logger.add(new winston.transports.Console({
    format: logFormat
  }));
}

// Add file transports in production
if (config.isProduction()) {
  // Error log file
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
  
  // Combined log file
  logger.add(new winston.transports.File({
    filename: 'logs/combined.log',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }));
}

// Create logs directory if it doesn't exist
if (config.isProduction()) {
  const fs = require('fs');
  const path = require('path');
  
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
}

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip || req.connection.remoteAddress
  };
  
  if (req.user) {
    logData.userId = req.user.id;
  }
  
  if (res.statusCode >= 400) {
    logger.error('HTTP Request Error', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

// Add error logging helper
logger.logError = (error, context = {}) => {
  logger.error('Application Error', {
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name
    },
    context
  });
};

// Add performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
  logger.info('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata
  });
};

// Add security logging helper
logger.logSecurity = (event, details = {}) => {
  logger.warn('Security Event', {
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

module.exports = logger;
