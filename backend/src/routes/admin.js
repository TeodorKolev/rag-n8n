const express = require('express');
const router = express.Router();
const config = require('../config/config');

// Get system statistics
router.get('/stats', async (req, res) => {
  try {
    // Mock system statistics (in production, this would come from database and system monitoring)
    const stats = {
      users: {
        total: 156,
        active: 89,
        newThisMonth: 12
      },
      documents: {
        total: 234,
        processed: 198,
        pending: 36,
        totalSize: '2.3 GB'
      },
      conversations: {
        total: 1247,
        thisMonth: 156,
        averageResponseTime: '2.3s'
      },
      system: {
        uptime: '15 days',
        memoryUsage: '67%',
        cpuUsage: '23%',
        diskUsage: '45%'
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching system stats:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch system statistics'
    });
  }
});

// Get user management data
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, role, department } = req.query;

    // Mock user data (in production, this would come from a database)
    const users = [
      {
        id: '1',
        email: 'admin@company.com',
        role: 'admin',
        department: 'general',
        status: 'active',
        lastLogin: '2024-01-15T10:30:00Z',
        createdAt: '2024-01-01T00:00:00Z'
      },
      {
        id: '2',
        email: 'hr@company.com',
        role: 'user',
        department: 'hr',
        status: 'active',
        lastLogin: '2024-01-14T15:45:00Z',
        createdAt: '2024-01-02T00:00:00Z'
      },
      {
        id: '3',
        email: 'finance@company.com',
        role: 'user',
        department: 'finance',
        status: 'active',
        lastLogin: '2024-01-13T09:15:00Z',
        createdAt: '2024-01-03T00:00:00Z'
      }
    ];

    // Apply filters
    let filteredUsers = users;
    if (role) {
      filteredUsers = filteredUsers.filter(user => user.role === role);
    }
    if (department) {
      filteredUsers = filteredUsers.filter(user => user.department === department);
    }

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedUsers = filteredUsers.slice(startIndex, endIndex);

    res.json({
      users: paginatedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: filteredUsers.length,
        pages: Math.ceil(filteredUsers.length / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch users'
    });
  }
});

// Update user role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['admin', 'user', 'moderator'].includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        message: 'Role must be admin, user, or moderator'
      });
    }

    // Mock user update (in production, this would update the database)
    res.json({
      message: 'User role updated successfully',
      userId: id,
      newRole: role
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to update user role'
    });
  }
});

// Get system logs
router.get('/logs', async (req, res) => {
  try {
    const { level, startDate, endDate, limit = 100 } = req.query;

    // Mock system logs (in production, this would come from log files or database)
    const logs = [
      {
        id: '1',
        timestamp: '2024-01-15T10:30:00Z',
        level: 'info',
        message: 'User admin@company.com logged in successfully',
        userId: '1',
        ip: '192.168.1.100'
      },
      {
        id: '2',
        timestamp: '2024-01-15T10:25:00Z',
        level: 'warn',
        message: 'Rate limit exceeded for IP 192.168.1.101',
        userId: null,
        ip: '192.168.1.101'
      },
      {
        id: '3',
        timestamp: '2024-01-15T10:20:00Z',
        level: 'error',
        message: 'Failed to process document upload',
        userId: '2',
        ip: '192.168.1.102'
      }
    ];

    // Apply filters
    let filteredLogs = logs;
    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }
    if (startDate || endDate) {
      filteredLogs = filteredLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        const start = startDate ? new Date(startDate) : null;
        const end = endDate ? new Date(endDate) : null;
        
        if (start && end) {
          return logDate >= start && logDate <= end;
        } else if (start) {
          return logDate >= start;
        } else if (end) {
          return logDate <= end;
        }
        return true;
      });
    }

    // Limit results
    const limitedLogs = filteredLogs.slice(0, parseInt(limit));

    res.json({
      logs: limitedLogs,
      total: limitedLogs.length,
      filters: { level, startDate, endDate }
    });
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch system logs'
    });
  }
});

// Get system health
router.get('/health', async (req, res) => {
  try {
    // Mock system health check (in production, this would check actual system status)
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: 'healthy',
        redis: 'healthy',
        pinecone: 'healthy',
        openai: 'healthy'
      },
      metrics: {
        responseTime: '45ms',
        errorRate: '0.1%',
        uptime: '99.8%'
      }
    };

    res.json(health);
  } catch (error) {
    console.error('Error checking system health:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to check system health'
    });
  }
});

// Trigger system maintenance
router.post('/maintenance', async (req, res) => {
  try {
    const { action } = req.body;

    if (!action || !['backup', 'cleanup', 'restart'].includes(action)) {
      return res.status(400).json({
        error: 'Invalid action',
        message: 'Action must be backup, cleanup, or restart'
      });
    }

    // Mock maintenance action (in production, this would perform actual maintenance)
    res.json({
      message: `Maintenance action '${action}' initiated successfully`,
      action,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error triggering maintenance:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to trigger maintenance action'
    });
  }
});

module.exports = router;

