export type MessageRole = 'user' | 'ai' | 'system';

export interface Message {
  role: MessageRole;
  content: string;
  options?: string[];
  timestamp: Date;
}
