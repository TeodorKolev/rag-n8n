import { Department } from '../types';
import { api } from './api';

export type DocumentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface UploadedDocument {
  document_id: string;
  filename: string;
  title: string;
  department: string;
  status: DocumentStatus;
  chunk_count?: number;
  error_message?: string;
  created_at?: string;
}

export const documentService = {
  async upload(
    file: File,
    title: string,
    department: Department,
  ): Promise<UploadedDocument> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('department', department);
    formData.append('source', 'upload');

    const response = await api.post('/api/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async list(department?: string): Promise<UploadedDocument[]> {
    const params = department ? `?department=${department}` : '';
    const response = await api.get(`/api/documents${params}`);
    return response.data.documents ?? [];
  },

  async getStatus(documentId: string): Promise<UploadedDocument> {
    const response = await api.get(`/api/documents/${documentId}/status`);
    return response.data;
  },
};
