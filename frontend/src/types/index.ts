export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  answer?: string;
  sources?: Source[];
  metadata?: any;
}

export interface ChatMessage extends Message {
  isLoading?: boolean;
  error?: string;
  tempId?: string;
}

export interface Source {
  title: string;
  source: string;
  department: string;
  score: number;
  content?: string;
}

export type Department = 'finance' | 'care' | 'sales' | 'hr' | 'general';

export interface User {
  id: string;
  email: string;
  role: string;
  department: Department;
  first_name: string;
  last_name: string;
}

