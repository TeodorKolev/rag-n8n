const express = require('express');
const router = express.Router();
const config = require('../config/config');

// Search documents
router.get('/', async (req, res) => {
  try {
    const { query, department, limit = config.DEFAULT_SEARCH_RESULTS } = req.query;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Search query is required'
      });
    }

    // Mock search results (in production, this would query Pinecone and return real results)
    const searchResults = [
      {
        id: '1',
        title: 'Company Policy Manual',
        content: 'This document contains the company policies and procedures...',
        department: 'general',
        source: 'company-policy.pdf',
        score: 0.95,
        metadata: {
          uploadedAt: '2024-01-01',
          size: 1024000
        }
      },
      {
        id: '2',
        title: 'HR Procedures',
        content: 'Human resources procedures and guidelines...',
        department: 'hr',
        source: 'hr-procedures.docx',
        score: 0.87,
        metadata: {
          uploadedAt: '2024-01-02',
          size: 512000
        }
      }
    ];

    // Filter by department if specified
    let filteredResults = searchResults;
    if (department && department !== 'all') {
      filteredResults = searchResults.filter(result => 
        result.department === department || result.department === 'general'
      );
    }

    // Limit results
    const limitedResults = filteredResults.slice(0, parseInt(limit));

    res.json({
      query,
      results: limitedResults,
      total: limitedResults.length,
      department: department || 'all'
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to perform search'
    });
  }
});

// Advanced search with filters
router.post('/advanced', async (req, res) => {
  try {
    const { 
      query, 
      department, 
      dateFrom, 
      dateTo, 
      fileType, 
      limit = config.DEFAULT_SEARCH_RESULTS 
    } = req.body;

    if (!query) {
      return res.status(400).json({
        error: 'Missing query parameter',
        message: 'Search query is required'
      });
    }

    // Mock advanced search results
    const searchResults = [
      {
        id: '1',
        title: 'Company Policy Manual',
        content: 'This document contains the company policies and procedures...',
        department: 'general',
        source: 'company-policy.pdf',
        score: 0.95,
        metadata: {
          uploadedAt: '2024-01-01',
          size: 1024000,
          fileType: 'pdf'
        }
      },
      {
        id: '2',
        title: 'HR Procedures',
        content: 'Human resources procedures and guidelines...',
        department: 'hr',
        source: 'hr-procedures.docx',
        score: 0.87,
        metadata: {
          uploadedAt: '2024-01-02',
          size: 512000,
          fileType: 'docx'
        }
      }
    ];

    // Apply filters
    let filteredResults = searchResults;

    // Department filter
    if (department && department !== 'all') {
      filteredResults = filteredResults.filter(result => 
        result.department === department || result.department === 'general'
      );
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filteredResults = filteredResults.filter(result => {
        const uploadDate = new Date(result.metadata.uploadedAt);
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;
        
        if (fromDate && toDate) {
          return uploadDate >= fromDate && uploadDate <= toDate;
        } else if (fromDate) {
          return uploadDate >= fromDate;
        } else if (toDate) {
          return uploadDate <= toDate;
        }
        return true;
      });
    }

    // File type filter
    if (fileType && fileType !== 'all') {
      filteredResults = filteredResults.filter(result => 
        result.metadata.fileType === fileType
      );
    }

    // Limit results
    const limitedResults = filteredResults.slice(0, parseInt(limit));

    res.json({
      query,
      filters: { department, dateFrom, dateTo, fileType },
      results: limitedResults,
      total: limitedResults.length,
      totalBeforeFiltering: searchResults.length
    });
  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to perform advanced search'
    });
  }
});

// Get search suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.length < 2) {
      return res.json({ suggestions: [] });
    }

    // Mock suggestions (in production, this would come from search analytics)
    const suggestions = [
      'company policy',
      'hr procedures',
      'employee handbook',
      'safety guidelines',
      'expense policy'
    ].filter(suggestion => 
      suggestion.toLowerCase().includes(query.toLowerCase())
    );

    res.json({ suggestions });
  } catch (error) {
    console.error('Search suggestions error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get search suggestions'
    });
  }
});

// Get search analytics
router.get('/analytics', async (req, res) => {
  try {
    const { period = '30d' } = req.query;

    // Mock analytics data (in production, this would come from database)
    const analytics = {
      totalSearches: 1250,
      uniqueUsers: 89,
      averageResults: 3.2,
      topQueries: [
        { query: 'company policy', count: 45 },
        { query: 'hr procedures', count: 32 },
        { query: 'expense policy', count: 28 },
        { query: 'safety guidelines', count: 25 },
        { query: 'employee handbook', count: 22 }
      ],
      departmentBreakdown: {
        general: 35,
        hr: 28,
        finance: 22,
        sales: 15
      },
      period
    };

    res.json(analytics);
  } catch (error) {
    console.error('Search analytics error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to get search analytics'
    });
  }
});

module.exports = router;

