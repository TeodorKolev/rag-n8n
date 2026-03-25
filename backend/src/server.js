/**
 * Main server file for RAG Assistant Backend API
 */

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// Import configuration and utilities
const config = require('./config/config');
const logger = require('./utils/logger');
const { connectDatabase } = require('./config/database');
const { testConnection: connectRedis } = require('./config/redis');
const { errorHandler } = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');

// Import routes
const authRoutes = require('./routes/auth');
const conversationRoutes = require('./routes/conversations');
const documentRoutes = require('./routes/documents');
const searchRoutes = require('./routes/search');
const adminRoutes = require('./routes/admin');
const healthRoutes = require('./routes/health');

// Import services
const socketService = require('./services/socketService');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: config.FRONTEND_URL,
    methods: ['GET', 'POST']
  }
});

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', limiter);

// Health check endpoint (no rate limiting)
app.use('/health', healthRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);

// WebSocket handling
socketService.initialize(io);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource was not found on this server.'
  });
});

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown:', err);
      process.exit(1);
    }
    
    logger.info('Server closed successfully');
    process.exit(0);
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
}

// Initialize connections and start server
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');
    
    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected successfully');
    
    // Start the server
    const PORT = config.PORT || 8000;
    server.listen(PORT, () => {
      logger.info(`RAG Assistant Backend API server running on port ${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      logger.info(`Frontend URL: ${config.FRONTEND_URL}`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = { app, server };
