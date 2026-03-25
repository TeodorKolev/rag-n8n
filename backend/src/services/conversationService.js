const logger = require('../utils/logger');

class ConversationService {
  constructor() {
    this.conversations = new Map();
  }

  // Create a new conversation
  async createConversation({ userId, query, department, sessionId }) {
    try {
      const conversation = {
        id: Date.now().toString(),
        userId,
        query,
        department,
        sessionId,
        status: 'processing',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.conversations.set(conversation.id, conversation);
      
      logger.info('Conversation created', {
        conversationId: conversation.id,
        userId,
        department
      });

      return conversation;
    } catch (error) {
      logger.error('Error creating conversation:', error);
      throw error;
    }
  }

  // Update conversation with response
  async updateConversation(conversationId, updates) {
    try {
      const conversation = this.conversations.get(conversationId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const updatedConversation = {
        ...conversation,
        ...updates,
        updatedAt: new Date()
      };

      this.conversations.set(conversationId, updatedConversation);
      
      logger.info('Conversation updated', {
        conversationId,
        updates: Object.keys(updates)
      });

      return updatedConversation;
    } catch (error) {
      logger.error('Error updating conversation:', error);
      throw error;
    }
  }

  // Get conversation by ID
  async getConversation(conversationId) {
    try {
      const conversation = this.conversations.get(conversationId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      return conversation;
    } catch (error) {
      logger.error('Error getting conversation:', error);
      throw error;
    }
  }

  // Get conversation history for a user
  async getConversationHistory({ userId, sessionId, limit = 50, offset = 0 }) {
    try {
      let conversations = Array.from(this.conversations.values())
        .filter(conv => conv.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      if (sessionId) {
        conversations = conversations.filter(conv => conv.sessionId === sessionId);
      }

      const paginatedConversations = conversations.slice(offset, offset + limit);

      logger.info('Conversation history retrieved', {
        userId,
        sessionId,
        total: conversations.length,
        returned: paginatedConversations.length
      });

      return {
        conversations: paginatedConversations,
        total: conversations.length,
        hasMore: offset + limit < conversations.length
      };
    } catch (error) {
      logger.error('Error getting conversation history:', error);
      throw error;
    }
  }

  // Submit feedback for a conversation
  async submitFeedback(conversationId, feedback) {
    try {
      const conversation = this.conversations.get(conversationId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const updatedConversation = {
        ...conversation,
        feedback,
        updatedAt: new Date()
      };

      this.conversations.set(conversationId, updatedConversation);
      
      logger.info('Feedback submitted', {
        conversationId,
        feedback
      });

      return updatedConversation;
    } catch (error) {
      logger.error('Error submitting feedback:', error);
      throw error;
    }
  }

  // Delete conversation
  async deleteConversation(conversationId) {
    try {
      const conversation = this.conversations.get(conversationId);
      
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      this.conversations.delete(conversationId);
      
      logger.info('Conversation deleted', {
        conversationId
      });

      return { success: true };
    } catch (error) {
      logger.error('Error deleting conversation:', error);
      throw error;
    }
  }

  // Get conversation statistics
  async getConversationStats(userId = null) {
    try {
      let conversations = Array.from(this.conversations.values());
      
      if (userId) {
        conversations = conversations.filter(conv => conv.userId === userId);
      }

      const stats = {
        total: conversations.length,
        completed: conversations.filter(conv => conv.status === 'completed').length,
        processing: conversations.filter(conv => conv.status === 'processing').length,
        failed: conversations.filter(conv => conv.status === 'failed').length,
        averageResponseTime: this.calculateAverageResponseTime(conversations),
        departmentBreakdown: this.getDepartmentBreakdown(conversations)
      };

      return stats;
    } catch (error) {
      logger.error('Error getting conversation stats:', error);
      throw error;
    }
  }

  // Calculate average response time
  calculateAverageResponseTime(conversations) {
    const completedConversations = conversations.filter(conv => 
      conv.status === 'completed' && conv.updatedAt && conv.createdAt
    );

    if (completedConversations.length === 0) {
      return 0;
    }

    const totalTime = completedConversations.reduce((sum, conv) => {
      const responseTime = new Date(conv.updatedAt) - new Date(conv.createdAt);
      return sum + responseTime;
    }, 0);

    return Math.round(totalTime / completedConversations.length);
  }

  // Get department breakdown
  getDepartmentBreakdown(conversations) {
    const breakdown = {};
    
    conversations.forEach(conv => {
      const dept = conv.department || 'unknown';
      breakdown[dept] = (breakdown[dept] || 0) + 1;
    });

    return breakdown;
  }

  // Clean up old conversations
  async cleanupOldConversations(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      let deletedCount = 0;
      
      for (const [id, conversation] of this.conversations.entries()) {
        if (new Date(conversation.createdAt) < cutoffDate) {
          this.conversations.delete(id);
          deletedCount++;
        }
      }

      logger.info('Old conversations cleaned up', {
        deletedCount,
        cutoffDate: cutoffDate.toISOString()
      });

      return { deletedCount };
    } catch (error) {
      logger.error('Error cleaning up old conversations:', error);
      throw error;
    }
  }

  // Get session conversations
  async getSessionConversations(userId, sessionId, options = {}) {
    try {
      const { limit = 50, offset = 0 } = options;
      
      let conversations = Array.from(this.conversations.values())
        .filter(conv => conv.userId === userId && conv.sessionId === sessionId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const paginatedConversations = conversations.slice(offset, offset + limit);

      logger.info('Session conversations retrieved', {
        userId,
        sessionId,
        total: conversations.length,
        returned: paginatedConversations.length
      });

      return paginatedConversations;
    } catch (error) {
      logger.error('Error getting session conversations:', error);
      throw error;
    }
  }

  // Log conversation analytics
  async logConversationAnalytics(data) {
    try {
      // In a real implementation, this would store analytics data
      // For now, we'll just log it
      logger.info('Conversation analytics logged', {
        queryLength: data.query?.length || 0,
        answerLength: data.answer?.length || 0,
        sourceCount: data.sources?.length || 0,
        timestamp: data.timestamp
      });

      return { success: true };
    } catch (error) {
      logger.error('Error logging conversation analytics:', error);
      throw error;
    }
  }

  // Get analytics summary
  async getAnalyticsSummary(userId, filters = {}) {
    try {
      const { startDate, endDate, department } = filters;
      
      let conversations = Array.from(this.conversations.values())
        .filter(conv => conv.userId === userId);

      // Apply date filters
      if (startDate) {
        conversations = conversations.filter(conv => new Date(conv.createdAt) >= startDate);
      }
      if (endDate) {
        conversations = conversations.filter(conv => new Date(conv.createdAt) <= endDate);
      }

      // Apply department filter
      if (department) {
        conversations = conversations.filter(conv => conv.department === department);
      }

      const total = conversations.length;
      const completed = conversations.filter(conv => conv.status === 'completed').length;
      const failed = conversations.filter(conv => conv.status === 'failed').length;

      const summary = {
        total,
        completed,
        failed,
        successRate: total > 0 ? ((completed / total) * 100).toFixed(2) : 0,
        departmentBreakdown: this.getDepartmentBreakdown(conversations),
        averageResponseTime: this.calculateAverageResponseTime(conversations),
        dateRange: {
          start: startDate || 'all',
          end: endDate || 'all'
        }
      };

      return summary;
    } catch (error) {
      logger.error('Error getting analytics summary:', error);
      throw error;
    }
  }
}

module.exports = new ConversationService();

