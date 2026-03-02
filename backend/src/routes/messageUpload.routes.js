/**
 * Message Attachment Upload Routes
 * 
 * Handles file uploads for message attachments
 * Base path: /api/messages/upload
 */

const express = require('express');
const router = express.Router();
const authAdmin = require('../middleware/authAdmin');
const authGuard = require('../middleware/authGuard');
const { uploadSingle, getFileInfo, validateImageSize, deleteFile } = require('../services/fileUpload.service');
const path = require('path');

/**
 * POST /api/messages/upload
 * Upload a file attachment for a message
 * 
 * Authentication: Admin or Guard
 */
const authenticateUser = (req, res, next) => {
  // Try admin auth first
  authAdmin(req, res, (adminErr) => {
    if (adminErr) {
      // If admin auth fails, try guard auth
      authGuard(req, res, (guardErr) => {
        if (guardErr) {
          return res.status(401).json({ message: 'Unauthorized' });
        }
        next();
      });
    } else {
      next();
    }
  });
};

router.post('/', authenticateUser, uploadSingle, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Validate image size if it's an image
    try {
      validateImageSize(req.file);
    } catch (error) {
      // Delete the uploaded file if validation fails
      deleteFile(req.file.path);
      return res.status(400).json({ message: error.message });
    }

    const fileInfo = getFileInfo(req.file);

    res.status(201).json({
      success: true,
      file: {
        url: `/uploads${fileInfo.url}`,
        name: fileInfo.originalName,
        size: fileInfo.size,
        type: fileInfo.type,
        mimetype: fileInfo.mimetype,
      },
    });
  } catch (error) {
    console.error('File upload error:', error);
    
    // Clean up file if it was uploaded
    if (req.file && req.file.path) {
      deleteFile(req.file.path);
    }
    
    res.status(500).json({ 
      message: 'File upload failed', 
      error: error.message 
    });
  }
});

/**
 * DELETE /api/messages/upload/:filename
 * Delete an uploaded file
 * 
 * Authentication: Admin or Guard
 */
router.delete('/:filename', authenticateUser, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    // Find the file (we'd need to store the full path, but for now just return success)
    // In production, you'd want to track file paths in the database
    res.json({ 
      success: true, 
      message: 'File deletion requested. Note: File paths should be tracked in database for proper deletion.' 
    });
  } catch (error) {
    console.error('File deletion error:', error);
    res.status(500).json({ message: 'File deletion failed', error: error.message });
  }
});

module.exports = router;
