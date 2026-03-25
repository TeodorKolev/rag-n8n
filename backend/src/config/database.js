/**
 * Database configuration and connection setup
 */

const { Sequelize } = require('sequelize');
const config = require('./config');
const logger = require('../utils/logger');

// Create Sequelize instance
const sequelize = new Sequelize(config.DATABASE_URL, {
  dialect: 'postgres',
  logging: config.isDevelopment() ? 
    (msg) => logger.debug(msg) : false,
  
  pool: {
    max: 20,
    min: 5,
    acquire: 30000,
    idle: 10000
  },
  
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true
  },
  
  dialectOptions: config.isProduction() ? {
    ssl: {
      require: true,
      rejectUnauthorized: true
    }
  } : {}
});

/**
 * Connect to the database
 */
async function connectDatabase() {
  try {
    await sequelize.authenticate();
    logger.info('Database connection established successfully');
    
    // Sync models in development
    if (config.isDevelopment()) {
      await sequelize.sync({ alter: true });
      logger.info('Database models synchronized');
    }
    
  } catch (error) {
    logger.error('Unable to connect to the database:', error);
    throw error;
  }
}

/**
 * Close database connection
 */
async function closeDatabase() {
  try {
    await sequelize.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  connectDatabase,
  closeDatabase
};
