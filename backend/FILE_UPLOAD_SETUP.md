# File Upload Service Setup

## Installation

Install multer package:
```bash
cd backend
npm install multer
```

## Features

✅ **File Upload Service** (`src/services/fileUpload.service.js`)
- Handles image and document uploads
- File size limits (10MB general, 5MB for images)
- Organized storage by date (year/month/day)
- Unique filename generation
- File type validation

✅ **Upload Routes** (`src/routes/messageUpload.routes.js`)
- `POST /api/messages/upload` - Upload file attachment
- `DELETE /api/messages/upload/:filename` - Delete file
- Supports both admin and guard authentication

✅ **Static File Serving**
- Files served from `/uploads` directory
- Accessible at `http://localhost:5000/uploads/...`

## File Storage

Files are stored in: `backend/uploads/messages/YYYY/MM/DD/`

Example:
```
backend/uploads/messages/2024/01/15/1705324800000-a1b2c3d4-test_image.jpg
```

## Supported File Types

### Images
- JPEG/JPG
- PNG
- GIF
- WebP

### Documents
- PDF
- DOC
- DOCX
- TXT

## Usage

### Upload a file
```bash
curl -X POST http://localhost:5000/api/messages/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "attachment=@/path/to/file.jpg"
```

### Response
```json
{
  "success": true,
  "file": {
    "url": "/uploads/messages/2024/01/15/1705324800000-a1b2c3d4-test_image.jpg",
    "name": "test_image.jpg",
    "size": 123456,
    "type": "image",
    "mimetype": "image/jpeg"
  }
}
```

### Use in message
When creating a message, include the file URL:
```json
{
  "content": "Check out this image!",
  "messageType": "image",
  "attachmentUrl": "/uploads/messages/2024/01/15/1705324800000-a1b2c3d4-test_image.jpg",
  "attachmentName": "test_image.jpg",
  "attachmentSize": 123456,
  "attachmentType": "image/jpeg"
}
```

## Configuration

File size limits (in `fileUpload.service.js`):
- `MAX_FILE_SIZE`: 10MB (general files)
- `MAX_IMAGE_SIZE`: 5MB (images only)

To change limits, modify:
```javascript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
```

## Security

- ✅ File type validation
- ✅ File size limits
- ✅ Path traversal protection
- ✅ Authentication required
- ✅ Unique filename generation

## Future Enhancements

- [ ] Cloud storage (S3, Google Cloud Storage)
- [ ] Image compression/optimization
- [ ] Virus scanning
- [ ] File expiration/cleanup
- [ ] Database tracking of file paths
