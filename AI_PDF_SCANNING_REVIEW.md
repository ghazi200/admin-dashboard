# AI & PDF Scanning System Review

## Overview
The system uses RAG (Retrieval-Augmented Generation) to answer policy questions by:
1. **Uploading** PDFs or text documents
2. **Extracting** text from PDFs
3. **Chunking** text into searchable pieces
4. **Embedding** chunks using OpenAI embeddings
5. **Retrieving** relevant chunks when questions are asked
6. **Answering** questions based on retrieved chunks

---

## Key Files & Components

### 1. PDF Extraction (`src/services/pdfExtract.service.js`)
- **Library**: `pdf-parse`
- **Function**: `extractTextFromPdf(filePath)`
- **Process**: Reads PDF file → Extracts all text → Returns plain text
- **Status**: ✅ Simple and working

### 2. Policy Upload (`src/controllers/aiPolicy.controller.js`)
- **Endpoint**: `POST /api/ai/policy/upload`
- **Features**:
  - Accepts PDF files OR raw text
  - Auto-extracts text from PDFs (if `POLICY_AUTO_EXTRACT=true`)
  - Auto-chunks text (if `POLICY_AUTO_CHUNK=true`)
  - Auto-embeds chunks (if `POLICY_AUTO_EMBED=true`)
- **File Storage**: `uploads/policies/` directory (created automatically)
- **Max File Size**: 20MB

### 3. Text Chunking (`src/services/policyChunking.service.js`)
- **Function**: `chunkText(text, chunkSize, overlap)`
- **Default Settings**:
  - Chunk size: 900 characters
  - Overlap: 150 characters
- **Configurable**: Via `POLICY_CHUNK_SIZE` and `POLICY_CHUNK_OVERLAP` env vars
- **Process**: Splits text into overlapping chunks for better context retention

### 4. Embeddings (`src/services/embeddings.service.js`)
- **Provider**: OpenAI
- **Model**: `text-embedding-3-small` (default, configurable via `EMBEDDING_MODEL`)
- **Function**: `embedOne(text)` → Returns vector array
- **Requires**: `OPENAI_API_KEY` environment variable
- **Fallback**: If no API key, returns `null` and system uses keyword search instead

### 5. RAG Retrieval (`src/services/policyRag.service.js`)
- **Primary Method**: Vector similarity search (pgvector)
  - Uses `<->` distance operator
  - Requires `embedding` column in `policy_chunks` table
- **Fallback Method**: Keyword search (ILIKE)
  - Used when embeddings unavailable
  - Searches chunk content for query terms
- **Visibility Filtering**: Respects document visibility (guard/supervisor/admin/all)
- **Function**: `retrievePolicyChunks({ tenantId, siteId, role, query, limit })`

### 6. Answer Generation (`src/services/policyRag.service.js`)
- **Function**: `buildSafeAnswer(question, chunks)`
- **Process**:
  1. Takes top 3 chunks
  2. Creates citations with document info
  3. Builds answer from chunk excerpts
  4. Adds disclaimer about edge cases
- **Output**: `{ answer, citations }`

### 7. Ask Policy Endpoint (`src/controllers/aiPolicy.controller.js`)
- **Endpoint**: `POST /api/ai/policy/ask`
- **Required**: `tenantId`, `userId`, `question`
- **Optional**: `siteId`, `shiftId`
- **Process**:
  1. Retrieves relevant policy chunks
  2. If no chunks found → Returns "escalate to supervisor" message
  3. If chunks found → Builds answer with citations
  4. Saves Q&A to `ai_policy_qa` table
  5. Emits socket events for notifications

---

## Database Tables

### `policy_documents`
- Stores uploaded documents (PDFs or text)
- Fields: `id`, `tenant_id`, `site_id`, `title`, `category`, `visibility`, `file_path`, `raw_text`, `is_active`

### `policy_chunks`
- Stores text chunks from documents
- Fields: `id`, `document_id`, `chunk_index`, `content`, `embedding` (pgvector), `embedding_json` (JSON backup)

### `ai_policy_qa`
- Stores Q&A history
- Fields: `id`, `tenant_id`, `site_id`, `question`, `answer`, `sources_json`, `escalate_recommended`, `confidence`

---

## Environment Variables

```bash
# OpenAI (required for embeddings)
OPENAI_API_KEY=your_key_here
EMBEDDING_MODEL=text-embedding-3-small  # optional

# Auto-processing flags (default: true)
POLICY_AUTO_EXTRACT=true   # Extract text from PDFs automatically
POLICY_AUTO_CHUNK=true     # Chunk text automatically
POLICY_AUTO_EMBED=true     # Create embeddings automatically

# Chunking settings
POLICY_CHUNK_SIZE=900      # Characters per chunk
POLICY_CHUNK_OVERLAP=150   # Overlap between chunks
```

---

## Upload Flow

1. **Admin uploads PDF** via `/api/ai/policy/upload`
   - File saved to `uploads/policies/`
   - Document record created in `policy_documents`

2. **Text Extraction** (if `POLICY_AUTO_EXTRACT=true`)
   - PDF → Text via `pdf-parse`
   - Text saved to `raw_text` column

3. **Chunking** (if `POLICY_AUTO_CHUNK=true`)
   - Text split into 900-char chunks with 150-char overlap
   - Chunks saved to `policy_chunks` table

4. **Embedding** (if `POLICY_AUTO_EMBED=true` and `OPENAI_API_KEY` exists)
   - Each chunk → OpenAI embedding
   - Vector saved to `embedding` column (pgvector)
   - JSON backup in `embedding_json` column

---

## Query Flow

1. **Guard asks question** via `/api/ai/policy/ask`
   - Question: "what is the lunch policy"

2. **Query Embedding** (if OpenAI key available)
   - Question → Embedding vector
   - Vector search in `policy_chunks` using pgvector

3. **Fallback: Keyword Search** (if no embeddings)
   - ILIKE search in chunk content
   - Matches "lunch", "policy", etc.

4. **Retrieval**
   - Top 6 chunks retrieved
   - Filtered by visibility (guard/supervisor/admin/all)
   - Filtered by tenant/site

5. **Answer Generation**
   - Top 3 chunks used for answer
   - Citations included
   - Answer formatted with sources

6. **Response**
   - Answer returned to guard
   - Q&A saved to `ai_policy_qa` table
   - Socket notification sent to admins

---

## Testing the Lunch Policy

### Step 1: Upload Policy (Admin Dashboard)
1. Go to http://localhost:3001/policy
2. Select tenant
3. Title: "Lunch Policy Test"
4. Category: "breaks"
5. Visibility: "guard"
6. Upload PDF or paste text:
   ```
   Lunch Policy: All employees are entitled to a 30 minute paid break for lunch. 
   This break is mandatory and must be taken during the assigned shift period. 
   The lunch break is paid time and does not extend your work hours.
   ```
7. Click Upload
8. Wait for processing (check document table)
9. Ensure document is **Active** (toggle if needed)
10. If needed, click **Reindex** to reprocess

### Step 2: Test Query (Guard UI)
1. Go to http://localhost:3000/ask-policy
2. Login as guard (e.g., `bob@abe.com` / `password123`)
3. Ask: **"what is the lunch policy"**
4. Expected: Answer mentioning "30 minute paid break"

---

## Important Notes

### ✅ Working Features
- PDF text extraction (pdf-parse)
- Text chunking with overlap
- Vector embeddings (if OpenAI key set)
- Keyword fallback (if no OpenAI key)
- Visibility-based filtering
- Tenant/site scoping

### ⚠️ Requirements
- **OpenAI API Key**: Required for vector search (better accuracy)
- **PostgreSQL with pgvector**: Required for vector similarity search
- **File upload directory**: Auto-created at `uploads/policies/`

### 🔧 Troubleshooting
- **No answer**: Check document is `is_active=true`
- **No chunks**: Click "Reindex" to reprocess
- **No embeddings**: Check `OPENAI_API_KEY` in `.env`
- **Keyword search only**: Works without OpenAI key (less accurate)

---

## File Structure

```
abe-guard-ai/backend/
├── src/
│   ├── controllers/
│   │   └── aiPolicy.controller.js      # Upload & ask endpoints
│   ├── services/
│   │   ├── pdfExtract.service.js      # PDF → Text
│   │   ├── policyChunking.service.js   # Text → Chunks
│   │   ├── embeddings.service.js       # Text → Vectors
│   │   └── policyRag.service.js        # RAG retrieval & answer
│   ├── config/
│   │   └── policyUpload.js             # Multer file upload config
│   ├── models/
│   │   ├── PolicyDocument.js           # Document model
│   │   ├── PolicyChunk.js              # Chunk model
│   │   └── AIPolicyQA.js               # Q&A history model
│   └── routes/
│       └── aiPolicy.routes.js          # API routes
└── uploads/
    └── policies/                        # Uploaded PDFs stored here
```

---

## Summary

The system is **fully functional** for:
- ✅ PDF upload and text extraction
- ✅ Text chunking and embedding
- ✅ Vector similarity search (with OpenAI)
- ✅ Keyword fallback search (without OpenAI)
- ✅ Answer generation with citations
- ✅ Q&A history tracking

**Ready for testing** the lunch policy scenario!
