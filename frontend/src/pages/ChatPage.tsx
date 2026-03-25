import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Avatar,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from '@mui/material';
import {
  Send as SendIcon,
  Person as PersonIcon,
  SmartToy as BotIcon,
  MoreVert as MoreVertIcon,
  ThumbUp as ThumbUpIcon,
  ThumbDown as ThumbDownIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useMutation, useQueryClient } from 'react-query';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

import { conversationService } from '../services/conversationService';

import { Message, Department } from '../types';
import MessageSources from '../components/MessageSources';

const DEPARTMENTS: Department[] = ['finance', 'care', 'sales', 'hr', 'general'];

interface ChatMessage extends Message {
  isLoading?: boolean;
  error?: string;
}

const ChatPage: React.FC = () => {
  const user = { department: 'general' as Department };
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState<Department>(
    (user?.department as Department) || 'general'
  );
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);



  // Send message mutation
  const sendMessageMutation = useMutation(conversationService.query, {
    onSuccess: (response, variables) => {
      // Remove loading message and add bot response
      setMessages(prev => prev.map(msg => 
        msg.id === variables.tempId 
          ? {
              ...msg,
              isLoading: false,
              answer: (response as any).answer,
              sources: (response as any).sources,
              metadata: (response as any).metadata,
              id: (response as any).conversationId || msg.id
            }
          : msg
      ));
      
      queryClient.invalidateQueries(['conversations']);
      toast.success('Response received');
    },
    onError: (error: any, variables) => {
      // Update message with error
      setMessages(prev => prev.map(msg => 
        msg.id === variables.tempId 
          ? { ...msg, isLoading: false, error: error.message }
          : msg
      ));
      
      toast.error('Failed to get response');
    }
  });

  // Submit feedback mutation
  const submitFeedbackMutation = useMutation(
    ({ conversationId, feedback }: { conversationId: string; rating: number; feedback?: string }) =>
      conversationService.sendFeedback(conversationId, feedback === 'positive' ? 'positive' : 'negative'),
    {
      onSuccess: () => {
        toast.success('Feedback submitted');
      },
      onError: () => {
        toast.error('Failed to submit feedback');
      }
    }
  );

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: `temp_${Date.now()}`,
      content: inputValue.trim(),
      role: 'user',
      timestamp: new Date(),
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    try {
      await sendMessageMutation.mutateAsync({
        query: userMessage.content,
        department: selectedDepartment,
        sessionId,
        tempId: userMessage.id
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  const handleMenuClick = (event: React.MouseEvent<HTMLElement>, messageId: string) => {
    setMenuAnchorEl(event.currentTarget);
    setSelectedMessageId(messageId);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setSelectedMessageId(null);
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
    handleMenuClose();
  };

  const handleFeedback = (messageId: string, rating: number) => {
    if (messageId.startsWith('temp_')) return;
    
    submitFeedbackMutation.mutate({
      conversationId: messageId,
      rating
    });
    handleMenuClose();
  };

  const formatMessage = (content: string) => {
    return (
      <ReactMarkdown
        components={{
          code({ node, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return match ? (
              <SyntaxHighlighter
                style={oneDark as any}
                language={match[1]}
                PreTag="div"
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {content}
      </ReactMarkdown>
    );
  };



  return (
    <Container maxWidth="lg" sx={{ height: '100vh', display: 'flex', flexDirection: 'column', py: 2 }}>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h5" component="h1">
            RAG Assistant Chat
          </Typography>
          
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Department</InputLabel>
            <Select
              value={selectedDepartment}
              label="Department"
              onChange={(e) => setSelectedDepartment(e.target.value as Department)}
            >
              {DEPARTMENTS.map((dept) => (
                <MenuItem key={dept} value={dept}>
                  {dept.charAt(0).toUpperCase() + dept.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Ask questions about company policies, procedures, and documentation
        </Typography>
      </Paper>

      {/* Messages */}
      <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
          {messages.length === 0 ? (
            <Box textAlign="center" py={4}>
              <BotIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary">
                Welcome! How can I help you today?
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Try asking about company policies, procedures, or any work-related questions.
              </Typography>
            </Box>
          ) : (
            messages.map((message) => (
              <Box key={message.id} sx={{ mb: 3 }}>
                {/* User Message */}
                <Box display="flex" alignItems="flex-start" mb={2}>
                  <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                    <PersonIcon />
                  </Avatar>
                  <Box flex={1}>
                    <Box display="flex" alignItems="center" mb={1}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        You
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                        {message.timestamp.toLocaleTimeString()}
                      </Typography>
                    </Box>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50' }}>
                      <Typography>{message.content}</Typography>
                    </Paper>
                  </Box>
                </Box>

                {/* Bot Response */}
                {(message.answer || message.isLoading || message.error) && (
                  <Box display="flex" alignItems="flex-start">
                    <Avatar sx={{ bgcolor: 'secondary.main', mr: 2 }}>
                      <BotIcon />
                    </Avatar>
                    <Box flex={1}>
                      <Box display="flex" alignItems="center" mb={1}>
                        <Typography variant="subtitle2" fontWeight={600}>
                          RAG Assistant
                        </Typography>
                        {!message.isLoading && !message.error && (
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuClick(e, message.id)}
                            sx={{ ml: 'auto' }}
                          >
                            <MoreVertIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                      
                      {message.isLoading ? (
                        <Box display="flex" alignItems="center" py={2}>
                          <CircularProgress size={20} sx={{ mr: 2 }} />
                          <Typography color="text.secondary">
                            Thinking...
                          </Typography>
                        </Box>
                      ) : message.error ? (
                        <Alert severity="error" sx={{ mb: 2 }}>
                          {message.error}
                        </Alert>
                      ) : (
                        <>
                          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                            {formatMessage(message.answer || '')}
                          </Paper>
                          
                          {message.sources && message.sources.length > 0 && (
                            <MessageSources sources={message.sources} />
                          )}
                          
                          {message.metadata && (
                            <Box display="flex" gap={1} mt={1}>
                              <Chip 
                                size="small" 
                                label={`Model: ${message.metadata.model || 'Claude Sonnet'}`}
                                variant="outlined"
                              />
                              <Chip 
                                size="small" 
                                label={`Sources: ${message.sources?.length || 0}`}
                                variant="outlined"
                              />
                            </Box>
                          )}
                        </>
                      )}
                    </Box>
                  </Box>
                )}
                
                {message !== messages[messages.length - 1] && (
                  <Divider sx={{ mt: 3 }} />
                )}
              </Box>
            ))
          )}
          <div ref={messagesEndRef} />
        </Box>

        {/* Input */}
        <Divider />
        <Box sx={{ p: 2 }}>
          <Box display="flex" gap={1}>
            <TextField
              fullWidth
              multiline
              maxRows={4}
              placeholder="Ask a question..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={sendMessageMutation.isLoading}
            />
            <Button
              variant="contained"
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || sendMessageMutation.isLoading}
              sx={{ minWidth: 'auto', px: 2 }}
            >
              {sendMessageMutation.isLoading ? (
                <CircularProgress size={20} />
              ) : (
                <SendIcon />
              )}
            </Button>
          </Box>
        </Box>
      </Paper>

      {/* Message Menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          const message = messages.find(m => m.id === selectedMessageId);
          if (message?.answer) {
            handleCopyMessage(message.answer);
          }
        }}>
          <CopyIcon fontSize="small" sx={{ mr: 1 }} />
          Copy Response
        </MenuItem>
        <MenuItem onClick={() => selectedMessageId && handleFeedback(selectedMessageId, 5)}>
          <ThumbUpIcon fontSize="small" sx={{ mr: 1 }} />
          Helpful
        </MenuItem>
        <MenuItem onClick={() => selectedMessageId && handleFeedback(selectedMessageId, 1)}>
          <ThumbDownIcon fontSize="small" sx={{ mr: 1 }} />
          Not Helpful
        </MenuItem>
      </Menu>
    </Container>
  );
};

export default ChatPage;
