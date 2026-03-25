/**
 * Authentication middleware
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const logger = require('../utils/logger');
const { UnauthorizedError } = require('./errorHandler');
const { cache } = require('../config/redis');

/**
 * JWT authentication middleware
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    // Check if token is blacklisted
    const isBlacklisted = await cache.exists(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Check if user still exists and is active (optional - depends on your user model)
    // const user = await User.findByPk(decoded.id);
    // if (!user || !user.isActive) {
    //   throw new UnauthorizedError('User not found or inactive');
    // }

    // Attach user info to request
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      department: decoded.department
    };

    // Attach token for potential blacklisting
    req.token = token;

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      next(new UnauthorizedError('Invalid token'));
    } else if (error.name === 'TokenExpiredError') {
      next(new UnauthorizedError('Token expired'));
    } else {
      next(error);
    }
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      // Check if token is blacklisted
      const isBlacklisted = await cache.exists(`blacklist:${token}`);
      if (!isBlacklisted) {
        const decoded = jwt.verify(token, config.JWT_SECRET);
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
          department: decoded.department
        };
        req.token = token;
      }
    }

    next();
  } catch (error) {
    // Log the error but don't fail the request
    logger.warn('Optional auth failed:', error.message);
    next();
  }
}

/**
 * Role-based authorization middleware
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new UnauthorizedError('Insufficient permissions'));
    }

    next();
  };
}

/**
 * Department-based authorization middleware
 */
function requireDepartment(...departments) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!departments.includes(req.user.department)) {
      return next(new UnauthorizedError('Department access required'));
    }

    next();
  };
}

/**
 * Admin authorization middleware
 */
function requireAdmin(req, res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  if (req.user.role !== 'admin') {
    return next(new UnauthorizedError('Admin access required'));
  }

  next();
}

/**
 * Self or admin authorization (user can access their own data or admin can access any)
 */
function requireSelfOrAdmin(req, res, next) {
  if (!req.user) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const targetUserId = req.params.userId || req.params.id;
  
  if (req.user.role === 'admin' || req.user.id === targetUserId) {
    return next();
  }

  next(new UnauthorizedError('Access denied'));
}

/**
 * Generate JWT token
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    department: user.department
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
    issuer: 'rag-assistant',
    audience: 'rag-assistant-users'
  });
}

/**
 * Generate refresh token
 */
function generateRefreshToken(user) {
  const payload = {
    id: user.id,
    type: 'refresh'
  };

  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: '30d',
    issuer: 'rag-assistant',
    audience: 'rag-assistant-users'
  });
}

/**
 * Blacklist token (for logout)
 */
async function blacklistToken(token) {
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) {
      const ttl = decoded.exp - Math.floor(Date.now() / 1000);
      if (ttl > 0) {
        await cache.set(`blacklist:${token}`, true, ttl);
      }
    }
  } catch (error) {
    logger.error('Error blacklisting token:', error);
  }
}

/**
 * Rate limiting by user
 */
function userRateLimit(maxRequests = 100, windowMs = 900000) {
  return async (req, res, next) => {
    if (!req.user) {
      return next();
    }

    try {
      const key = `rate_limit:user:${req.user.id}`;
      const current = await cache.incr(key, Math.floor(windowMs / 1000));

      if (current > maxRequests) {
        return next(new TooManyRequestsError('User rate limit exceeded'));
      }

      // Set headers
      res.set({
        'X-RateLimit-Limit': maxRequests,
        'X-RateLimit-Remaining': Math.max(0, maxRequests - current),
        'X-RateLimit-Reset': new Date(Date.now() + windowMs)
      });

      next();
    } catch (error) {
      logger.error('User rate limit error:', error);
      next();
    }
  };
}

/**
 * API key authentication (for service-to-service communication)
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return next(new UnauthorizedError('API key required'));
  }

  // In a real implementation, you'd validate against a database
  // For now, we'll use a simple environment variable
  const validApiKeys = (process.env.API_KEYS || '').split(',');
  
  if (!validApiKeys.includes(apiKey)) {
    logger.logSecurity('Invalid API key attempt', {
      apiKey: apiKey.substring(0, 8) + '...',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    return next(new UnauthorizedError('Invalid API key'));
  }

  // Set service user context
  req.user = {
    id: 'service',
    role: 'service',
    isService: true
  };

  next();
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireRole,
  requireDepartment,
  requireAdmin,
  requireSelfOrAdmin,
  generateToken,
  generateRefreshToken,
  blacklistToken,
  userRateLimit,
  authenticateApiKey
};
