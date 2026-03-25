/**
 * Conversation routes for RAG Assistant
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const errorHandler = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const conversationService = require('../services/conversationService');
const n8nService = require('../services/n8nService');
const { cache } = require('../config/redis');

const router = express.Router();

// Async handler wrapper for error handling
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Validation middleware
 */
const validateQuery = [
  body('query')
    .isString()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Query must be between 1 and 1000 characters'),
  
  body('department')
    .optional()
    .isString()
    .trim()
    .isIn(['finance', 'care', 'sales', 'hr', 'general'])
    .withMessage('Invalid department'),
  
  body('sessionId')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Invalid session ID')
];

const validateConversationId = [
  param('conversationId')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Invalid conversation ID')
];

/**
 * POST /api/conversations/query
 * Submit a new query to the RAG assistant
 */
router.post('/query', validateQuery, asyncHandler(async (req, res) => {
  const { query, department, sessionId } = req.body;
  // Use sessionId as userId if no auth, or generate a default user ID
  const userId = sessionId || `anonymous_${Date.now()}`;
  const userDepartment = department || 'general';
  let conversation = null;

  logger.info('New conversation query', {
    userId,
    department: userDepartment,
    sessionId,
    queryLength: query.length
  });

  try {
    // Check for recent duplicate queries
    const cacheKey = `recent_query:${userId}:${Buffer.from(query).toString('base64')}`;
    const recentQuery = await cache.get(cacheKey);
    
    if (recentQuery) {
      logger.info('Returning cached response for duplicate query');
      return res.json(recentQuery);
    }

    // Create conversation record
    conversation = await conversationService.createConversation({
      userId,
      query,
      department: userDepartment,
      sessionId
    });

    // Call n8n workflow to process the query
    const response = await n8nService.processQuery({
      query,
      department: userDepartment,
      userId,
      sessionId: sessionId || conversation.id,
      conversationId: conversation.id
    });

    // Update conversation with response
    await conversationService.updateConversation(conversation.id, {
      answer: response.answer,
      sources: response.sources,
      metadata: response.metadata,
      status: 'completed'
    });

    // Cache the response for 5 minutes to prevent duplicates
    await cache.set(cacheKey, response, 300);

    logger.info('Query processed successfully', {
      conversationId: conversation.id,
      sourceCount: response.sources?.length || 0,
      responseLength: response.answer?.length || 0
    });

    res.json({
      conversationId: conversation.id,
      ...response
    });

  } catch (error) {
    logger.error('Error processing query:', error);
    
    // Update conversation with error status
    if (conversation?.id) {
      await conversationService.updateConversation(conversation.id, {
        status: 'failed',
        error: error.message
      });
    }

    throw error;
  }
}));

/**
 * GET /api/conversations/:conversationId
 * Get a specific conversation by ID
 */
router.get('/:conversationId', validateConversationId, asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  const conversation = await conversationService.getConversation(conversationId);
  
  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }

  res.json(conversation);
}));

/**
 * GET /api/conversations
 * Get user's conversation history
 */
router.get('/', [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative'),
  
  query('department')
    .optional()
    .isString()
    .trim()
    .isIn(['finance', 'care', 'sales', 'hr', 'general'])
    .withMessage('Invalid department'),
  
  query('sessionId')
    .optional()
    .isString()
    .trim()
], asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, department, sessionId } = req.query;

  // If sessionId is provided, get conversations for that session, otherwise get all
  const conversations = await conversationService.getConversationHistory({
    userId: sessionId || null,
    limit: parseInt(limit),
    offset: parseInt(offset),
    department,
    sessionId
  });

  res.json(conversations);
}));

/**
 * POST /api/conversations/:conversationId/feedback
 * Submit feedback for a conversation
 */
router.post('/:conversationId/feedback', [
  ...validateConversationId,
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  
  body('feedback')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Feedback must be less than 1000 characters')
], asyncHandler(async (req, res) => {
  const { conversationId } = req.params;
  const { rating, feedback } = req.body;

  // Verify conversation exists
  const conversation = await conversationService.getConversation(conversationId);
  
  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }

  // Submit feedback
  await conversationService.submitFeedback(conversationId, {
    rating,
    feedback
  });

  logger.info('Feedback submitted', {
    conversationId,
    userId,
    rating,
    hasFeedback: !!feedback
  });

  res.json({
    message: 'Feedback submitted successfully',
    conversationId
  });
}));

/**
 * DELETE /api/conversations/:conversationId
 * Delete a conversation (soft delete)
 */
router.delete('/:conversationId', validateConversationId, asyncHandler(async (req, res) => {
  const { conversationId } = req.params;

  // Verify conversation exists
  const conversation = await conversationService.getConversation(conversationId);
  
  if (!conversation) {
    const error = new Error('Conversation not found');
    error.statusCode = 404;
    throw error;
  }

  await conversationService.deleteConversation(conversationId);

  logger.info('Conversation deleted', {
    conversationId
  });

  res.json({
    message: 'Conversation deleted successfully',
    conversationId
  });
}));

/**
 * GET /api/conversations/sessions/:sessionId
 * Get all conversations in a session
 */
router.get('/sessions/:sessionId', [
  param('sessionId')
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Invalid session ID'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be non-negative')
], asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const { limit = 50, offset = 0 } = req.query;

  const conversations = await conversationService.getSessionConversations(sessionId, sessionId, {
    limit: parseInt(limit),
    offset: parseInt(offset)
  });

  res.json({
    sessionId,
    conversations,
    total: conversations.length
  });
}));

/**
 * POST /api/conversations/log
 * Log conversation from n8n workflow (internal endpoint)
 */
router.post('/log', [
  body('query').isString().notEmpty(),
  body('answer').isString().notEmpty(),
  body('sources').optional().isArray(),
  body('metadata').optional().isObject()
], asyncHandler(async (req, res) => {
  const { query, answer, sources, metadata } = req.body;

  // This endpoint is called by n8n workflow
  // In production, you might want to authenticate this with API key
  
  logger.info('Conversation logged from n8n', {
    queryLength: query.length,
    answerLength: answer.length,
    sourceCount: sources?.length || 0,
    metadata
  });

  // Store analytics data
  await conversationService.logConversationAnalytics({
    query,
    answer,
    sources,
    metadata,
    timestamp: new Date()
  });

  res.json({ message: 'Conversation logged successfully' });
}));

/**
 * GET /api/conversations/analytics/summary
 * Get conversation analytics summary
 */
router.get('/analytics/summary', [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date'),
  
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date'),
  
  query('department')
    .optional()
    .isString()
    .trim()
], asyncHandler(async (req, res) => {
  const { startDate, endDate, department } = req.query;

  // Get analytics for all conversations since no user authentication
  const analytics = await conversationService.getAnalyticsSummary(null, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    department
  });

  res.json(analytics);
}));

module.exports = router;
