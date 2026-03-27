const axios = require('axios');
const logger = require('../utils/logger');
const config = require('../config/config');

class N8nService {
  constructor() {
    this.baseUrl = `${config.N8N_PROTOCOL}://${config.N8N_HOST}:${config.N8N_PORT}`;
    this.auth = {
      username: process.env.N8N_BASIC_AUTH_USER || 'admin',
      password: process.env.N8N_BASIC_AUTH_PASSWORD || 'password'
    };
  }

  // Process a query through n8n workflow
  async processQuery({ query, department, userId, sessionId, conversationId }) {
    try {
      logger.info('Processing query through n8n', {
        query: query.substring(0, 100),
        department,
        userId,
        conversationId
      });

      // Call actual n8n webhook
      const response = await this.callN8nWebhook({
        query,
        department,
        userId,
        sessionId,
        conversationId
      });

      logger.info('Query processed successfully through n8n', {
        conversationId,
        responseLength: response.answer?.length || 0
      });

      return response;
    } catch (error) {
      logger.error('Error processing query through n8n:', error);
      throw error;
    }
  }

  // Call actual n8n webhook
  async callN8nWebhook({ query, department, userId, sessionId, conversationId }) {
    const webhookUrl = `${this.baseUrl}/webhook/query`;
    
    try {
      logger.info('Calling n8n webhook', { webhookUrl });

      const response = await axios.post(webhookUrl, {
        query,
        department,
        userId,
        sessionId
      }, {
        timeout: 120000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.info('n8n webhook response received', {
        status: response.status,
        dataKeys: Object.keys(response.data || {})
      });

      return response.data;
    } catch (error) {
      logger.error('Error calling n8n webhook:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: webhookUrl
      });
      throw new Error(`Failed to process query through n8n: ${error.message}`);
    }
  }

  // Generate mock response based on query
  generateMockResponse(query, department) {
    const lowerQuery = query.toLowerCase();
    
    // Mock responses based on common query patterns
    if (lowerQuery.includes('policy') || lowerQuery.includes('procedure')) {
      return {
        answer: `Based on our company policies and procedures, here's what you need to know about ${query}:\n\n` +
                `1. **Policy Overview**: The company has established guidelines for this area.\n` +
                `2. **Key Requirements**: Employees must follow these procedures to ensure compliance.\n` +
                `3. **Contact Information**: For specific questions, please reach out to your department manager.\n\n` +
                `This information is current as of our latest policy update.`,
        sources: [
          {
            title: 'Company Policy Manual',
            source: 'company-policy.pdf',
            department: 'general',
            score: 0.95
          },
          {
            title: 'Employee Handbook',
            source: 'employee-handbook.pdf',
            department: 'hr',
            score: 0.87
          }
        ]
      };
    } else if (lowerQuery.includes('expense') || lowerQuery.includes('reimbursement')) {
      return {
        answer: `Regarding ${query}, here are the current expense and reimbursement policies:\n\n` +
                `1. **Expense Limits**: Daily meal expenses are limited to $25 for business travel.\n` +
                `2. **Submission Process**: Submit receipts within 30 days of purchase.\n` +
                `3. **Approval Required**: All expenses over $100 require manager approval.\n\n` +
                `Please refer to the Finance Department for specific questions.`,
        sources: [
          {
            title: 'Expense Policy',
            source: 'expense-policy.pdf',
            department: 'finance',
            score: 0.92
          }
        ]
      };
    } else if (lowerQuery.includes('hr') || lowerQuery.includes('human resource')) {
      return {
        answer: `For ${query}, here's the information from our HR department:\n\n` +
                `1. **HR Procedures**: All HR-related matters follow established protocols.\n` +
                `2. **Documentation**: Proper documentation is required for all HR processes.\n` +
                `3. **Confidentiality**: HR matters are handled with strict confidentiality.\n\n` +
                `Contact the HR department directly for specific assistance.`,
        sources: [
          {
            title: 'HR Procedures Manual',
            source: 'hr-procedures.docx',
            department: 'hr',
            score: 0.89
          }
        ]
      };
    } else {
      // Generic response for other queries
      return {
        answer: `I found some relevant information about "${query}":\n\n` +
                `Based on our company documentation, here are the key points:\n\n` +
                `1. **General Information**: This topic is covered in our standard procedures.\n` +
                `2. **Department Specific**: Different departments may have specific guidelines.\n` +
                `3. **Updates**: Information is regularly updated to reflect current practices.\n\n` +
                `For the most current and specific information, please consult with your department manager.`,
        sources: [
          {
            title: 'Company Policy Manual',
            source: 'company-policy.pdf',
            department: 'general',
            score: 0.78
          }
        ]
      };
    }
  }

  // Trigger n8n workflow via webhook
  async triggerWorkflow(workflowId, data) {
    try {
      const webhookUrl = `${this.baseUrl}/webhook/${workflowId}`;
      
      const response = await axios.post(webhookUrl, data, {
        auth: this.auth,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      logger.info('n8n workflow triggered successfully', {
        workflowId,
        status: response.status
      });

      return response.data;
    } catch (error) {
      logger.error('Error triggering n8n workflow:', error);
      throw error;
    }
  }

  // Get workflow execution status
  async getWorkflowStatus(executionId) {
    try {
      const statusUrl = `${this.baseUrl}/api/v1/executions/${executionId}`;
      
      const response = await axios.get(statusUrl, {
        auth: this.auth,
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error('Error getting workflow status:', error);
      throw error;
    }
  }

  // Get available workflows
  async getWorkflows() {
    try {
      const workflowsUrl = `${this.baseUrl}/api/v1/workflows`;
      
      const response = await axios.get(workflowsUrl, {
        auth: this.auth,
        timeout: 10000
      });

      return response.data;
    } catch (error) {
      logger.error('Error getting workflows:', error);
      throw error;
    }
  }

  // Test n8n connection
  async testConnection() {
    try {
      const healthUrl = `${this.baseUrl}/healthz`;
      
      const response = await axios.get(healthUrl, {
        timeout: 5000
      });

      return {
        status: 'connected',
        responseTime: response.headers['x-response-time'] || 'unknown',
        version: response.headers['x-n8n-version'] || 'unknown'
      };
    } catch (error) {
      logger.error('n8n connection test failed:', error);
      return {
        status: 'disconnected',
        error: error.message
      };
    }
  }

  // Get workflow metrics
  async getWorkflowMetrics(workflowId = null) {
    try {
      // Mock metrics (in production, this would come from n8n API)
      const metrics = {
        totalExecutions: 1247,
        successfulExecutions: 1189,
        failedExecutions: 58,
        averageExecutionTime: '2.3s',
        lastExecution: new Date().toISOString(),
        workflows: [
          {
            id: 'rag-assistant-workflow',
            name: 'RAG Assistant Workflow',
            executions: 456,
            successRate: 98.5
          },
          {
            id: 'document-processing-workflow',
            name: 'Document Processing Workflow',
            executions: 234,
            successRate: 95.2
          }
        ]
      };

      if (workflowId) {
        const workflow = metrics.workflows.find(w => w.id === workflowId);
        return workflow || null;
      }

      return metrics;
    } catch (error) {
      logger.error('Error getting workflow metrics:', error);
      throw error;
    }
  }
}

module.exports = new N8nService();

