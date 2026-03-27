import axios from 'axios';
import { ChatMessage, Department } from '../types';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8001';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface QueryRequest {
  query: string;
  department: Department;
  sessionId: string;
  tempId: string;
}

export interface QueryResponse {
  answer: string;
  sources: any[];
  metadata: any;
}

export const conversationService = {
  async query(request: QueryRequest): Promise<QueryResponse> {
    try {
      const response = await api.post('/api/conversations/query', request);
      return response.data;
    } catch (error) {
      console.error('Error querying conversation:', error);
      throw error;
    }
  },

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const response = await api.get(`/api/conversations?sessionId=${sessionId}`);
      return response.data;
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  },

  async sendFeedback(messageId: string, feedback: 'positive' | 'negative'): Promise<void> {
    try {
      await api.post(`/api/conversations/${messageId}/feedback`, { feedback });
    } catch (error) {
      console.error('Error sending feedback:', error);
      throw error;
    }
  },
};
