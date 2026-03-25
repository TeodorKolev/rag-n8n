const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map();
  }

  initialize(io) {
    this.io = io;
    this.setupEventHandlers();
    logger.info('Socket service initialized');
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`User connected: ${socket.id}`);
      
      // Store user connection
      this.connectedUsers.set(socket.id, {
        id: socket.id,
        connectedAt: new Date(),
        userId: null,
        department: null
      });

      // Handle user authentication
      socket.on('authenticate', (data) => {
        try {
          const { userId, department } = data;
          const userData = this.connectedUsers.get(socket.id);
          
          if (userData) {
            userData.userId = userId;
            userData.department = department;
            this.connectedUsers.set(socket.id, userData);
            
            // Join department room
            socket.join(`department:${department}`);
            
            logger.info(`User ${userId} authenticated and joined department ${department}`);
            socket.emit('authenticated', { success: true });
          }
        } catch (error) {
          logger.error('Authentication error:', error);
          socket.emit('authenticated', { success: false, error: 'Authentication failed' });
        }
      });

      // Handle chat messages
      socket.on('chat_message', (data) => {
        try {
          const { message, department } = data;
          const userData = this.connectedUsers.get(socket.id);
          
          if (!userData || !userData.userId) {
            socket.emit('error', { message: 'User not authenticated' });
            return;
          }

          // Broadcast message to department room
          this.io.to(`department:${department}`).emit('chat_message', {
            id: Date.now().toString(),
            userId: userData.userId,
            message,
            department,
            timestamp: new Date().toISOString()
          });

          logger.info(`Chat message from user ${userData.userId} in department ${department}`);
        } catch (error) {
          logger.error('Chat message error:', error);
          socket.emit('error', { message: 'Failed to send message' });
        }
      });

      // Handle typing indicators
      socket.on('typing_start', (data) => {
        const { department } = data;
        socket.to(`department:${department}`).emit('user_typing', {
          userId: this.connectedUsers.get(socket.id)?.userId,
          department
        });
      });

      socket.on('typing_stop', (data) => {
        const { department } = data;
        socket.to(`department:${department}`).emit('user_stopped_typing', {
          userId: this.connectedUsers.get(socket.id)?.userId,
          department
        });
      });

      // Handle document processing updates
      socket.on('join_document_processing', (data) => {
        const { documentId } = data;
        socket.join(`document:${documentId}`);
        logger.info(`User joined document processing room: ${documentId}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        const userData = this.connectedUsers.get(socket.id);
        if (userData) {
          logger.info(`User disconnected: ${userData.userId || socket.id}`);
          this.connectedUsers.delete(socket.id);
        }
      });
    });
  }

  // Send notification to specific user
  sendToUser(userId, event, data) {
    try {
      const socketId = this.findSocketByUserId(userId);
      if (socketId) {
        this.io.to(socketId).emit(event, data);
        logger.info(`Notification sent to user ${userId}: ${event}`);
      } else {
        logger.warn(`User ${userId} not connected, notification not sent`);
      }
    } catch (error) {
      logger.error('Error sending notification to user:', error);
    }
  }

  // Send notification to department
  sendToDepartment(department, event, data) {
    try {
      this.io.to(`department:${department}`).emit(event, data);
      logger.info(`Notification sent to department ${department}: ${event}`);
    } catch (error) {
      logger.error('Error sending notification to department:', error);
    }
  }

  // Send notification to all connected users
  broadcastToAll(event, data) {
    try {
      this.io.emit(event, data);
      logger.info(`Broadcast sent to all users: ${event}`);
    } catch (error) {
      logger.error('Error broadcasting to all users:', error);
    }
  }

  // Send document processing update
  sendDocumentUpdate(documentId, update) {
    try {
      this.io.to(`document:${documentId}`).emit('document_update', update);
      logger.info(`Document update sent for ${documentId}`);
    } catch (error) {
      logger.error('Error sending document update:', error);
    }
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get users by department
  getUsersByDepartment(department) {
    const users = [];
    for (const [socketId, userData] of this.connectedUsers) {
      if (userData.department === department) {
        users.push({
          socketId,
          userId: userData.userId,
          connectedAt: userData.connectedAt
        });
      }
    }
    return users;
  }

  // Find socket ID by user ID
  findSocketByUserId(userId) {
    for (const [socketId, userData] of this.connectedUsers) {
      if (userData.userId === userId) {
        return socketId;
      }
    }
    return null;
  }

  // Disconnect user
  disconnectUser(userId) {
    try {
      const socketId = this.findSocketByUserId(userId);
      if (socketId) {
        this.io.sockets.sockets.get(socketId)?.disconnect();
        this.connectedUsers.delete(socketId);
        logger.info(`User ${userId} forcefully disconnected`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Error disconnecting user:', error);
      return false;
    }
  }
}

module.exports = new SocketService();

