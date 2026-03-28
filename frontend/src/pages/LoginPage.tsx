import React, { useState } from 'react';
import {
  Box,
  Container,
  Paper,
  Typography,
  TextField,
  Button,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
} from '@mui/material';
import { SmartToy as BotIcon } from '@mui/icons-material';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { authService, LoginRequest, RegisterRequest } from '../services/authService';
import { useAuthStore } from '../stores/authStore';
import { Department } from '../types';

const DEPARTMENTS: Department[] = ['finance', 'care', 'sales', 'hr', 'general'];

type Mode = 'login' | 'register';

const LoginPage: React.FC = () => {
  const [mode, setMode] = useState<Mode>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  // Login form
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
  } = useForm<LoginRequest>();

  // Register form
  const {
    register: registerSignup,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
    watch,
  } = useForm<RegisterRequest>({ defaultValues: { department: 'general' } });

  const onLogin = async (data: LoginRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authService.login(data);
      login(res.token, res.user);
      toast.success(`Welcome back, ${res.user.first_name}!`);
      navigate('/chat');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Login failed. Please check your credentials.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onRegister = async (data: RegisterRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await authService.register(data);
      login(res.token, res.user);
      toast.success(`Account created! Welcome, ${res.user.first_name}!`);
      navigate('/chat');
    } catch (err: any) {
      const msg = err.response?.data?.detail || 'Registration failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ height: '100vh', display: 'flex', alignItems: 'center' }}>
      <Paper sx={{ p: 4, width: '100%' }}>
        {/* Logo / Title */}
        <Box textAlign="center" mb={3}>
          <BotIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight={700}>
            RAG Assistant
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enterprise Knowledge Management
          </Typography>
        </Box>

        {/* Mode toggle */}
        <Box display="flex" mb={3} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          <Button
            fullWidth
            variant={mode === 'login' ? 'contained' : 'text'}
            onClick={() => { setMode('login'); setError(null); }}
            sx={{ borderRadius: 0 }}
          >
            Sign In
          </Button>
          <Button
            fullWidth
            variant={mode === 'register' ? 'contained' : 'text'}
            onClick={() => { setMode('register'); setError(null); }}
            sx={{ borderRadius: 0 }}
          >
            Create Account
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* ── Login form ── */}
        {mode === 'login' && (
          <Box component="form" onSubmit={handleLoginSubmit(onLogin)} noValidate>
            <TextField
              fullWidth
              label="Email"
              type="email"
              margin="normal"
              autoComplete="email"
              autoFocus
              error={!!loginErrors.email}
              helperText={loginErrors.email?.message}
              {...registerLogin('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email address' },
              })}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              margin="normal"
              autoComplete="current-password"
              error={!!loginErrors.password}
              helperText={loginErrors.password?.message}
              {...registerLogin('password', { required: 'Password is required' })}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>

            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center">
              Default: admin@company.com / admin123
            </Typography>
          </Box>
        )}

        {/* ── Register form ── */}
        {mode === 'register' && (
          <Box component="form" onSubmit={handleRegisterSubmit(onRegister)} noValidate>
            <Box display="flex" gap={1}>
              <TextField
                fullWidth
                label="First Name"
                margin="normal"
                autoFocus
                error={!!registerErrors.first_name}
                helperText={registerErrors.first_name?.message}
                {...registerSignup('first_name', { required: 'First name is required' })}
              />
              <TextField
                fullWidth
                label="Last Name"
                margin="normal"
                error={!!registerErrors.last_name}
                helperText={registerErrors.last_name?.message}
                {...registerSignup('last_name', { required: 'Last name is required' })}
              />
            </Box>
            <TextField
              fullWidth
              label="Email"
              type="email"
              margin="normal"
              autoComplete="email"
              error={!!registerErrors.email}
              helperText={registerErrors.email?.message}
              {...registerSignup('email', {
                required: 'Email is required',
                pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email address' },
              })}
            />
            <TextField
              fullWidth
              label="Password"
              type="password"
              margin="normal"
              autoComplete="new-password"
              error={!!registerErrors.password}
              helperText={registerErrors.password?.message}
              {...registerSignup('password', {
                required: 'Password is required',
                minLength: { value: 8, message: 'Password must be at least 8 characters' },
              })}
            />
            <FormControl fullWidth margin="normal">
              <InputLabel>Department</InputLabel>
              <Select
                label="Department"
                value={watch('department')}
                {...registerSignup('department', { required: true })}
              >
                {DEPARTMENTS.map((dept) => (
                  <MenuItem key={dept} value={dept}>
                    {dept.charAt(0).toUpperCase() + dept.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Create Account'}
            </Button>
          </Box>
        )}
      </Paper>
    </Container>
  );
};

export default LoginPage;
