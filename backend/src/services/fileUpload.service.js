/**
 * File Upload Service for Message Attachments
 * 
 * Handles file uploads for messaging system:
 * - Images (jpg, png, gif, webp)
 * - Documents (pdf, doc, docx, txt)
 * - File size limits
 * - Storage management
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Upload directory
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/messages');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB for images

// Allowed file types
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create subdirectory by date for organization
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateDir = path.join(UPLOAD_DIR, `${year}/${month}/${day}`);
    
    if (!fs.existsSync(dateDir)) {
      fs.mkdirSync(dateDir, { recursive: true });
    }
    
    cb(null, dateDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${timestamp}-${uniqueSuffix}-${name}${ext}`;
    cb(null, filename);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: ${ALLOWED_TYPES.join(', ')}`), false);
  }
};

// Multer configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

/**
 * Get file type category (image or file)
 */
function getFileTypeCategory(mimetype) {
  if (ALLOWED_IMAGE_TYPES.includes(mimetype)) {
    return 'image';
  }
  return 'file';
}

/**
 * Get public URL for uploaded file
 */
function getFileUrl(filePath) {
  // Remove the absolute path and return relative path
  const relativePath = filePath.replace(path.resolve(__dirname, '../../'), '');
  // Return URL path (will be served by Express static middleware)
  return relativePath.replace(/\\/g, '/'); // Normalize path separators
}

/**
 * Delete file from filesystem
 */
function deleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
}

/**
 * Get file info
 */
function getFileInfo(file) {
  return {
    originalName: file.originalname,
    filename: file.filename,
    path: file.path,
    size: file.size,
    mimetype: file.mimetype,
    url: getFileUrl(file.path),
    type: getFileTypeCategory(file.mimetype),
  };
}

/**
 * Validate file size for images
 */
function validateImageSize(file) {
  if (getFileTypeCategory(file.mimetype) === 'image' && file.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image size exceeds limit of ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }
  return true;
}

module.exports = {
  upload,
  uploadSingle: upload.single('attachment'),
  uploadMultiple: upload.array('attachments', 5), // Max 5 files
  getFileUrl,
  deleteFile,
  getFileInfo,
  validateImageSize,
  getFileTypeCategory,
  MAX_FILE_SIZE,
  MAX_IMAGE_SIZE,
  ALLOWED_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOCUMENT_TYPES,
  UPLOAD_DIR,
};
