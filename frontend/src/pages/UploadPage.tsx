import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Chat as ChatIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  HourglassEmpty as PendingIcon,
  Sync as ProcessingIcon,
  InsertDriveFile as FileIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { documentService, UploadedDocument, DocumentStatus } from '../services/documentService';
import { useAuthStore } from '../stores/authStore';
import { Department } from '../types';

const DEPARTMENTS: Department[] = ['finance', 'care', 'sales', 'hr', 'general'];
const ALLOWED_TYPES = { 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'], 'text/plain': ['.txt'], 'text/markdown': ['.md'] };
const POLL_INTERVAL = 3000;

function StatusChip({ status }: { status: DocumentStatus }) {
  const config: Record<DocumentStatus, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error'; icon: React.ReactElement }> = {
    pending:    { label: 'Pending',    color: 'default',  icon: <PendingIcon fontSize="small" /> },
    processing: { label: 'Processing', color: 'info',     icon: <ProcessingIcon fontSize="small" /> },
    completed:  { label: 'Complete',   color: 'success',  icon: <CheckIcon fontSize="small" /> },
    failed:     { label: 'Failed',     color: 'error',    icon: <ErrorIcon fontSize="small" /> },
  };
  const { label, color, icon } = config[status] ?? config.pending;
  return <Chip size="small" label={label} color={color} icon={icon} />;
}

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [department, setDepartment] = useState<Department>((user?.department as Department) ?? 'general');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Load existing documents on mount
  useEffect(() => {
    documentService.list()
      .then(setDocuments)
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, []);

  // Poll status for any pending/processing documents
  useEffect(() => {
    const active = documents.filter(d => d.status === 'pending' || d.status === 'processing');
    if (active.length === 0) return;

    const timer = setInterval(async () => {
      const updates = await Promise.allSettled(active.map(d => documentService.getStatus(d.document_id)));
      setDocuments(prev => prev.map(doc => {
        const idx = active.findIndex(a => a.document_id === doc.document_id);
        if (idx === -1) return doc;
        const result = updates[idx];
        if (result.status === 'fulfilled') return { ...doc, ...result.value };
        return doc;
      }));
    }, POLL_INTERVAL);

    return () => clearInterval(timer);
  }, [documents]);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setTitle(accepted[0].name.replace(/\.[^.]+$/, ''));
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_TYPES,
    maxFiles: 1,
    maxSize: 100 * 1024 * 1024,
    onDropRejected: (rejections) => {
      setError(rejections[0]?.errors[0]?.message ?? 'File rejected');
    },
  });

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await documentService.upload(file, title || file.name, department);
      toast.success(`"${result.title}" uploaded — processing started`);
      setDocuments(prev => [result, ...prev]);
      setFile(null);
      setTitle('');
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? 'Upload failed';
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
        <Typography variant="h5" fontWeight={700}>Document Upload</Typography>
        <Button startIcon={<ChatIcon />} variant="outlined" onClick={() => navigate('/chat')}>
          Back to Chat
        </Button>
      </Box>

      <Box display="flex" gap={3} flexDirection={{ xs: 'column', md: 'row' }}>
        {/* Upload panel */}
        <Box flex="0 0 360px">
          <Paper sx={{ p: 3 }}>
            {/* Drop zone */}
            <Box
              {...getRootProps()}
              sx={{
                border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : file ? 'success.main' : 'divider',
                borderRadius: 2,
                p: 4,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragActive ? 'action.hover' : 'background.default',
                transition: 'all 0.2s',
                mb: 2,
                '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
              }}
            >
              <input {...getInputProps()} />
              {file ? (
                <>
                  <FileIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
                  <Typography fontWeight={600} noWrap>{file.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {(file.size / 1024).toFixed(1)} KB — click or drop to replace
                  </Typography>
                </>
              ) : (
                <>
                  <UploadIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                  <Typography fontWeight={500}>
                    {isDragActive ? 'Drop the file here' : 'Drag & drop or click to browse'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    PDF, DOCX, TXT, MD — max 100 MB
                  </Typography>
                </>
              )}
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <TextField
              fullWidth
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Document title"
              size="small"
              sx={{ mb: 2 }}
            />

            <FormControl fullWidth size="small" sx={{ mb: 3 }}>
              <InputLabel>Department</InputLabel>
              <Select
                label="Department"
                value={department}
                onChange={(e) => setDepartment(e.target.value as Department)}
              >
                {DEPARTMENTS.map(d => (
                  <MenuItem key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              fullWidth
              variant="contained"
              size="large"
              disabled={!file || uploading}
              onClick={handleUpload}
              startIcon={uploading ? <CircularProgress size={18} /> : <UploadIcon />}
            >
              {uploading ? 'Uploading…' : 'Upload Document'}
            </Button>
          </Paper>
        </Box>

        {/* Documents list */}
        <Box flex={1} minWidth={0}>
          <Paper>
            <Box px={2} py={1.5} borderBottom={1} borderColor="divider">
              <Typography variant="subtitle1" fontWeight={600}>
                Documents
              </Typography>
            </Box>

            {loadingDocs ? (
              <LinearProgress />
            ) : documents.length === 0 ? (
              <Box textAlign="center" py={6} color="text.secondary">
                <UploadIcon sx={{ fontSize: 40, mb: 1, opacity: 0.4 }} />
                <Typography>No documents yet</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Title</TableCell>
                      <TableCell>Department</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Chunks</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.document_id} hover>
                        <TableCell>
                          <Tooltip title={doc.filename}>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>
                              {doc.title || doc.filename}
                            </Typography>
                          </Tooltip>
                          {doc.status === 'processing' && (
                            <LinearProgress sx={{ mt: 0.5, height: 2 }} />
                          )}
                          {doc.error_message && (
                            <Typography variant="caption" color="error" display="block">
                              {doc.error_message}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={doc.department} variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <StatusChip status={doc.status} />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" color="text.secondary">
                            {doc.chunk_count ?? '—'}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      </Box>
    </Container>
  );
};

export default UploadPage;
