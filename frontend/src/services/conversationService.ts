import { ChatMessage, Department } from '../types';
import { api } from './api';

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
    const response = await api.post('/api/conversations/query', request);
    return response.data;
  },

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const response = await api.get(`/api/conversations?sessionId=${sessionId}`);
      return response.data;
    } catch {
      return [];
    }
  },

  async sendFeedback(messageId: string, feedback: 'positive' | 'negative'): Promise<void> {
    await api.post(`/api/conversations/${messageId}/feedback`, { feedback });
  },
};
