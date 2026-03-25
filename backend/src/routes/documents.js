const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config/config');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, config.UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.MAX_FILE_SIZE
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.txt', '.md'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, TXT, and MD files are allowed.'));
    }
  }
});

// Get all documents
router.get('/', async (req, res) => {
  try {
    // Mock document data (in production, this would come from a database)
    const documents = [
      {
        id: '1',
        title: 'Company Policy Manual',
        filename: 'company-policy.pdf',
        department: 'general',
        uploadedAt: new Date('2024-01-01'),
        size: 1024000,
        status: 'processed'
      },
      {
        id: '2',
        title: 'HR Procedures',
        filename: 'hr-procedures.docx',
        department: 'hr',
        uploadedAt: new Date('2024-01-02'),
        size: 512000,
        status: 'processed'
      }
    ];

    res.json({
      documents,
      total: documents.length
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch documents'
    });
  }
});

// Upload document
router.post('/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please select a file to upload'
      });
    }

    const { title, department } = req.body;
    
    if (!title || !department) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Title and department are required'
      });
    }

    // Mock document creation (in production, this would save to database)
    const document = {
      id: Date.now().toString(),
      title,
      filename: req.file.filename,
      originalName: req.file.originalname,
      department,
      uploadedAt: new Date(),
      size: req.file.size,
      status: 'uploaded'
    };

    res.status(201).json({
      message: 'Document uploaded successfully',
      document
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({
        error: 'Invalid file type',
        message: error.message
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to upload document'
    });
  }
});

// Get document by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Mock document data (in production, this would come from a database)
    const document = {
      id,
      title: 'Sample Document',
      filename: 'sample.pdf',
      department: 'general',
      uploadedAt: new Date(),
      size: 1024000,
      status: 'processed',
      content: 'This is a sample document content...'
    };

    if (!document) {
      return res.status(404).json({
        error: 'Document not found',
        message: 'The requested document was not found'
      });
    }

    res.json({ document });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch document'
    });
  }
});

// Delete document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Mock document deletion (in production, this would delete from database and file system)
    res.json({
      message: 'Document deleted successfully',
      id
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to delete document'
    });
  }
});

module.exports = router;

