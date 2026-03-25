/**
 * Global error handling middleware
 */

const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Error handler middleware
 */
function errorHandler(err, req, res, next) {
  // Log the error
  logger.logError(err, {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  // Default error response
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details = null;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = err.errors || err.message;
  } else if (err.name === 'UnauthorizedError' || err.message === 'Unauthorized') {
    statusCode = 401;
    message = 'Unauthorized';
  } else if (err.name === 'ForbiddenError' || err.message === 'Forbidden') {
    statusCode = 403;
    message = 'Forbidden';
  } else if (err.name === 'NotFoundError' || err.message === 'Not Found') {
    statusCode = 404;
    message = 'Not Found';
  } else if (err.name === 'ConflictError' || err.message === 'Conflict') {
    statusCode = 409;
    message = 'Conflict';
  } else if (err.name === 'TooManyRequestsError') {
    statusCode = 429;
    message = 'Too Many Requests';
  } else if (err.statusCode) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err.status) {
    statusCode = err.status;
    message = err.message;
  }

  // Handle Sequelize errors
  if (err.name === 'SequelizeValidationError') {
    statusCode = 400;
    message = 'Database Validation Error';
    details = err.errors.map(error => ({
      field: error.path,
      message: error.message
    }));
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    statusCode = 409;
    message = 'Resource already exists';
    details = err.errors.map(error => ({
      field: error.path,
      message: 'Must be unique'
    }));
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    statusCode = 400;
    message = 'Invalid reference';
  } else if (err.name === 'SequelizeDatabaseError') {
    statusCode = 500;
    message = 'Database Error';
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Handle Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    statusCode = 413;
    message = 'File too large';
  } else if (err.code === 'LIMIT_FILE_COUNT') {
    statusCode = 400;
    message = 'Too many files';
  } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    statusCode = 400;
    message = 'Unexpected file field';
  }

  // Handle axios errors (external API calls)
  if (err.response) {
    statusCode = err.response.status;
    message = err.response.data?.message || err.message;
    details = err.response.data?.details;
  }

  // Prepare error response
  const errorResponse = {
    error: true,
    message,
    statusCode,
    timestamp: new Date().toISOString()
  };

  // Add details in development or if explicitly provided
  if (details || config.isDevelopment()) {
    if (details) {
      errorResponse.details = details;
    }
    
    if (config.isDevelopment()) {
      errorResponse.stack = err.stack;
      errorResponse.name = err.name;
    }
  }

  // Add request ID if available
  if (req.requestId) {
    errorResponse.requestId = req.requestId;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
}

/**
 * Async error wrapper for route handlers
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Create custom error classes
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not Found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Too Many Requests') {
    super(message, 429);
    this.name = 'TooManyRequestsError';
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  TooManyRequestsError
};
