# 💬 In-App Messaging Feature - Technical Explanation

## Overview

The In-App Messaging feature would enable real-time communication between guards and supervisors/admins directly within the application, eliminating the need for external phone calls or SMS. This document explains how it would work **without implementing it yet**.

---

## 🎯 Core Features

### 1. **Direct Messages (1-on-1)**
- Guards can message supervisors/admins directly
- Supervisors/admins can message guards directly
- Private conversations between two users
- Thread-based message history

### 2. **Group Chats**
- **Site-based groups**: All guards assigned to a specific location
- **Shift-based groups**: All guards working the same shift
- **Custom groups**: Admins can create groups for specific purposes (e.g., "Night Shift Team", "Site A Security")
- Group membership managed automatically based on assignments

### 3. **File Sharing**
- **Photos**: Upload images (e.g., incident photos, site conditions)
- **Documents**: PDFs, reports, certificates
- **File size limits**: ~10MB per file (configurable)
- **Storage**: Files stored in cloud storage (S3, DigitalOcean Spaces, etc.)

### 4. **Read Receipts**
- Shows when message was delivered
- Shows when message was read
- Timestamp of read status
- Visual indicators (✓ sent, ✓✓ delivered, ✓✓✓ read)

---

## 🏗️ Architecture Overview

### Current Infrastructure (Already Exists)

Your system already has:
- ✅ **Socket.IO** infrastructure for real-time communication
- ✅ **Separate socket servers** for guards (port 4000) and admins (port 5000)
- ✅ **JWT authentication** for both guards and admins
- ✅ **Database models** for notifications (can be extended)
- ✅ **Multi-tenant architecture** (tenant isolation)

### What Would Need to Be Added

1. **New Database Tables** for messages
2. **New API Endpoints** for message CRUD operations
3. **Socket.IO Event Handlers** for real-time delivery
4. **File Upload Service** for attachments
5. **Frontend Components** for chat UI
6. **Message Queue** (optional, for offline delivery)

---

## 📊 Database Schema

### 1. **`conversations` Table**
Stores conversation metadata (direct messages and groups)

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    type VARCHAR(20) NOT NULL,  -- 'direct' or 'group'
    name VARCHAR(255),           -- NULL for direct, name for groups
    created_by UUID,              -- admin_id or guard_id
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    -- For group chats
    shift_id UUID REFERENCES shifts(id),  -- If shift-based
    location VARCHAR(255),               -- If location-based
    
    CONSTRAINT check_type CHECK (type IN ('direct', 'group'))
);

CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_conversations_type ON conversations(type);
```

### 2. **`conversation_participants` Table**
Links users to conversations (many-to-many)

```sql
CREATE TABLE conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    participant_type VARCHAR(20) NOT NULL,  -- 'guard' or 'admin'
    participant_id UUID NOT NULL,           -- guard_id or admin_id
    joined_at TIMESTAMP DEFAULT NOW(),
    last_read_at TIMESTAMP,                  -- For read receipts
    muted BOOLEAN DEFAULT FALSE,
    
    UNIQUE(conversation_id, participant_type, participant_id)
);

CREATE INDEX idx_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX idx_participants_user ON conversation_participants(participant_type, participant_id);
```

### 3. **`messages` Table**
Stores individual messages

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL,  -- 'guard' or 'admin'
    sender_id UUID NOT NULL,           -- guard_id or admin_id
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',  -- 'text', 'image', 'file', 'system'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,              -- Soft delete
    
    -- For file attachments
    attachment_url TEXT,               -- URL to file in storage
    attachment_name VARCHAR(255),     -- Original filename
    attachment_size INTEGER,           -- File size in bytes
    attachment_type VARCHAR(50),      -- MIME type
    
    CONSTRAINT check_sender_type CHECK (sender_type IN ('guard', 'admin')),
    CONSTRAINT check_message_type CHECK (message_type IN ('text', 'image', 'file', 'system'))
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_type, sender_id);
```

### 4. **`message_reads` Table**
Tracks read receipts (who read which messages)

```sql
CREATE TABLE message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    reader_type VARCHAR(20) NOT NULL,  -- 'guard' or 'admin'
    reader_id UUID NOT NULL,           -- guard_id or admin_id
    read_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(message_id, reader_type, reader_id)
);

CREATE INDEX idx_reads_message ON message_reads(message_id);
CREATE INDEX idx_reads_reader ON message_reads(reader_type, reader_id);
```

---

## 🔄 Real-Time Delivery Flow

### How Messages Are Delivered in Real-Time

```
┌─────────────┐                    ┌──────────────┐                    ┌─────────────┐
│   Guard A   │                    │   Backend   │                    │ Supervisor  │
│  (Frontend) │                    │  (Socket.IO)│                    │  (Frontend) │
└──────┬──────┘                    └──────┬───────┘                    └──────┬──────┘
       │                                   │                                   │
       │ 1. Send Message                   │                                   │
       │ POST /api/guard/messages          │                                   │
       ├──────────────────────────────────>│                                   │
       │                                   │                                   │
       │                                   │ 2. Save to Database               │
       │                                   │ INSERT INTO messages              │
       │                                   │                                   │
       │                                   │ 3. Find Participants              │
       │                                   │ SELECT from conversation_participants│
       │                                   │                                   │
       │                                   │ 4. Emit Socket Event              │
       │                                   │ socket.to(participant_room)       │
       │                                   │   .emit('message:new', {...})     │
       │                                   │                                   │
       │                                   │                                   │ 5. Receive Event
       │                                   │                                   │<───────────────────
       │                                   │                                   │
       │ 6. Receive Confirmation           │                                   │
       │<──────────────────────────────────│                                   │
       │                                   │                                   │
```

### Socket.IO Room Strategy

**For Direct Messages:**
- Room name: `conversation:{conversation_id}`
- Both participants join this room
- When message sent, emit to this room

**For Group Chats:**
- Room name: `conversation:{conversation_id}`
- All group members join this room
- When message sent, emit to this room

**User Presence:**
- Room name: `user:{guard_id}` or `user:{admin_id}`
- Used to track online/offline status
- Used for typing indicators

### Socket Events

**Client → Server:**
- `message:send` - Send a new message
- `message:read` - Mark message as read
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `conversation:join` - Join a conversation room
- `conversation:leave` - Leave a conversation room

**Server → Client:**
- `message:new` - New message received
- `message:read` - Message was read by someone
- `typing:indicator` - Someone is typing
- `conversation:updated` - Conversation metadata changed
- `conversation:new` - New conversation created

---

## 📡 API Endpoints

### Guard Endpoints (`/api/guard/messages`)

```
GET    /api/guard/messages/conversations
       - List all conversations for current guard
       - Returns: [{ id, type, name, lastMessage, unreadCount, participants }]

GET    /api/guard/messages/conversations/:conversationId
       - Get conversation details
       - Returns: { id, type, name, participants, messages: [...] }

GET    /api/guard/messages/conversations/:conversationId/messages
       - Get messages in conversation (paginated)
       - Query params: ?page=1&limit=50
       - Returns: { messages: [...], pagination: {...} }

POST   /api/guard/messages/conversations/:conversationId/messages
       - Send a new message
       - Body: { content, messageType, attachmentUrl? }
       - Returns: { message: {...} }

POST   /api/guard/messages/conversations/:conversationId/read
       - Mark conversation as read
       - Body: { lastMessageId }
       - Returns: { success: true }

POST   /api/guard/messages/conversations
       - Create new direct message conversation
       - Body: { recipientType: 'admin', recipientId: '...' }
       - Returns: { conversation: {...} }

POST   /api/guard/messages/upload
       - Upload file attachment
       - Multipart form data
       - Returns: { url, name, size, type }
```

### Admin Endpoints (`/api/admin/messages`)

```
GET    /api/admin/messages/conversations
       - List all conversations for current admin
       - Query params: ?type=direct|group&search=...

GET    /api/admin/messages/conversations/:conversationId
       - Get conversation details

GET    /api/admin/messages/conversations/:conversationId/messages
       - Get messages in conversation

POST   /api/admin/messages/conversations/:conversationId/messages
       - Send a new message

POST   /api/admin/messages/conversations/:conversationId/read
       - Mark conversation as read

POST   /api/admin/messages/conversations/group
       - Create new group chat
       - Body: { name, participantIds: [...], shiftId?, location? }
       - Returns: { conversation: {...} }

POST   /api/admin/messages/conversations/:conversationId/participants
       - Add participants to group
       - Body: { participantIds: [...] }

DELETE /api/admin/messages/conversations/:conversationId/participants/:participantId
       - Remove participant from group
```

---

## 🎨 Frontend UI Components

### Guard UI (Mobile-First)

**1. Messages List View**
```
┌─────────────────────────────┐
│  Messages          [Search] │
├─────────────────────────────┤
│ 👤 Supervisor John          │
│    "Shift starts at 9am"    │
│    2m ago          [2]      │
├─────────────────────────────┤
│ 👥 Site A - Night Shift     │
│    "Coverage confirmed"      │
│    5m ago          [1]      │
├─────────────────────────────┤
│ 👤 Admin Sarah              │
│    "Please confirm..."       │
│    1h ago                    │
└─────────────────────────────┘
```

**2. Chat View**
```
┌─────────────────────────────┐
│ ← Supervisor John            │
├─────────────────────────────┤
│                             │
│  [Guard] Shift starts at 9am│
│  9:00 AM        ✓✓✓         │
│                             │
│  [Supervisor] Confirmed     │
│  9:05 AM        ✓✓✓         │
│                             │
│  [Guard] [📷 Photo]         │
│  9:10 AM        ✓✓          │
│                             │
├─────────────────────────────┤
│ [📎] [📷] [Type message...] │
│                    [Send →] │
└─────────────────────────────┘
```

**3. Group Chat View**
```
┌─────────────────────────────┐
│ ← Site A - Night Shift (5)  │
├─────────────────────────────┤
│                             │
│  [Admin] Shift starts 11pm  │
│  8:00 PM        ✓✓✓         │
│                             │
│  [Guard 1] On my way        │
│  8:05 PM        ✓✓✓         │
│                             │
│  [Guard 2] Running late     │
│  8:10 PM        ✓✓          │
│                             │
├─────────────────────────────┤
│ [📎] [📷] [Type message...] │
│                    [Send →] │
└─────────────────────────────┘
```

### Admin UI (Desktop)

**1. Messages Sidebar**
```
┌──────────────┬──────────────────┐
│ Conversations│  Chat Window      │
├──────────────┤                   │
│ 🔍 Search    │                   │
├──────────────┤                   │
│ 👤 Guard Bob │                   │
│    "..."     │                   │
│    [3]       │                   │
├──────────────┤                   │
│ 👥 Site A    │                   │
│    "..."     │                   │
│    [1]       │                   │
├──────────────┤                   │
│ 👤 Guard Sue │                   │
│    "..."     │                   │
└──────────────┴───────────────────┘
```

---

## 📁 File Upload & Storage

### Upload Flow

1. **Frontend** uploads file to `/api/guard/messages/upload` or `/api/admin/messages/upload`
2. **Backend** receives file, validates (size, type)
3. **Backend** uploads to cloud storage (S3, DigitalOcean Spaces, etc.)
4. **Backend** returns file URL
5. **Frontend** includes URL in message when sending

### Storage Options

**Option 1: Cloud Storage (Recommended)**
- AWS S3: ~$0.023/GB/month
- DigitalOcean Spaces: ~$5/month for 250GB
- Files stored with UUID names
- Public or signed URLs

**Option 2: Local Storage**
- Store in `uploads/messages/` directory
- Serve via Express static middleware
- **Not recommended** for production (scalability issues)

### File Types Allowed

- **Images**: JPG, PNG, GIF, WebP (max 10MB)
- **Documents**: PDF, DOC, DOCX (max 10MB)
- **Other**: Configurable via environment variables

---

## 🔐 Security & Privacy

### Authentication & Authorization

1. **JWT Tokens**: All endpoints require valid JWT
2. **Tenant Isolation**: Messages filtered by `tenant_id`
3. **Participant Verification**: Users can only access conversations they're part of
4. **Role-Based Access**: 
   - Guards can only message admins/supervisors
   - Admins can message anyone
   - Guards cannot create group chats (admin-only)

### Data Privacy

1. **Message Encryption**: Consider encrypting sensitive messages at rest
2. **File Access**: Signed URLs with expiration for file attachments
3. **Message Retention**: Configurable retention policy (e.g., delete after 90 days)
4. **Audit Logging**: Log all message operations for compliance

### Rate Limiting

- **Message Sending**: Max 10 messages/minute per user
- **File Uploads**: Max 5 uploads/minute per user
- **API Calls**: Standard rate limiting on all endpoints

---

## 🔔 Integration with Existing Systems

### Notifications

When a new message arrives:
1. **Create Notification**: Add entry to `notifications` table
2. **Emit Socket Event**: Send `notification:new` event
3. **Push Notification**: (If PWA enabled) Send browser push notification

### Shift Management

- **Auto-create group chats** when shift is created
- **Add/remove participants** when shift assignments change
- **Archive conversations** when shift ends (optional)

### Guard Management

- **Auto-create direct message** when guard is first assigned
- **Show guard's message history** in guard profile
- **Message count** in guard analytics

---

## 📊 Performance Considerations

### Database Optimization

1. **Indexes**: 
   - `conversations(tenant_id, type)`
   - `messages(conversation_id, created_at DESC)`
   - `conversation_participants(conversation_id, participant_type, participant_id)`

2. **Pagination**: Always paginate message lists (50 messages per page)

3. **Archiving**: Move old messages to archive table after 90 days

### Real-Time Optimization

1. **Room Management**: Only join rooms for active conversations
2. **Message Batching**: Batch multiple read receipts
3. **Connection Pooling**: Reuse Socket.IO connections

### Caching Strategy

1. **Conversation List**: Cache for 30 seconds
2. **Last Message**: Cache in Redis (optional)
3. **Online Status**: Cache in memory or Redis

---

## 🚀 Implementation Phases

### Phase 1: Core Messaging (MVP)
- ✅ Direct messages only
- ✅ Text messages
- ✅ Real-time delivery
- ✅ Basic read receipts

### Phase 2: Group Chats
- ✅ Group chat creation
- ✅ Add/remove participants
- ✅ Group message delivery

### Phase 3: File Sharing
- ✅ Image uploads
- ✅ Document uploads
- ✅ File preview

### Phase 4: Advanced Features
- ✅ Typing indicators
- ✅ Message reactions (👍, ❤️, etc.)
- ✅ Message search
- ✅ Message forwarding
- ✅ Message editing/deletion

---

## 💡 User Experience Flow

### Guard Sending Message to Supervisor

1. **Guard opens Messages tab** in mobile app
2. **Taps on supervisor's name** (or creates new conversation)
3. **Types message** in input field
4. **Taps Send** button
5. **Message appears immediately** in chat (optimistic UI)
6. **Backend confirms** delivery via socket event
7. **Supervisor receives** message in real-time (if online)
8. **Supervisor reads** message
9. **Guard sees read receipt** (✓✓✓)

### Supervisor Creating Group Chat

1. **Supervisor opens Messages** in admin dashboard
2. **Clicks "New Group"** button
3. **Selects shift or location** (or creates custom group)
4. **Adds participants** (guards assigned to shift)
5. **Names the group** (e.g., "Site A - Night Shift")
6. **Sends welcome message**
7. **All participants receive** notification and can join chat

---

## 🧪 Testing Considerations

### Unit Tests
- Message creation logic
- Participant management
- Read receipt tracking
- File upload validation

### Integration Tests
- API endpoint responses
- Socket.IO event delivery
- Database queries
- File storage operations

### E2E Tests
- Complete message flow (send → receive → read)
- Group chat creation and messaging
- File upload and sharing
- Multi-user scenarios

---

## 📈 Scalability Considerations

### For 100 Guards & 50 Locations

**Estimated Usage:**
- ~500-1000 messages/day
- ~50-100 conversations active
- ~10-50 file uploads/day
- ~5-10 group chats active

**Infrastructure Needs:**
- **Database**: Current setup sufficient (PostgreSQL)
- **Storage**: ~1-5 GB/month for files (very affordable)
- **Socket.IO**: Current setup sufficient (handles 100+ connections easily)
- **API Load**: Minimal impact (messages are lightweight)

**Cost Impact:**
- **Storage**: ~$0.10-0.50/month (if using cloud storage)
- **Database**: No additional cost (same database)
- **Bandwidth**: ~1-5 GB/month = $0-0.50/month
- **Total Additional Cost**: ~$0.10-1.00/month (negligible)

---

## 🎯 Success Metrics

### Engagement Metrics
- Messages sent per day
- Active conversations per week
- Response time (average)
- File uploads per day

### Business Metrics
- Reduction in phone calls
- Faster issue resolution
- Improved guard satisfaction
- Better communication compliance

---

## ⚠️ Potential Challenges

### 1. **Offline Support**
- **Challenge**: Messages sent while offline
- **Solution**: Queue messages, send when online (PWA background sync)

### 2. **Large Group Chats**
- **Challenge**: 50+ participants in one group
- **Solution**: Limit group size, use channels/topics

### 3. **File Storage Costs**
- **Challenge**: Large files accumulate
- **Solution**: Auto-delete old files, compress images

### 4. **Message Search**
- **Challenge**: Searching through thousands of messages
- **Solution**: Full-text search index, pagination

---

## 🔗 Related Features

This messaging feature would integrate with:
- **Notifications** (existing) - Alert users of new messages
- **Shift Management** (existing) - Auto-create group chats
- **Guard Profiles** (existing) - Show message history
- **PWA** (planned) - Push notifications for messages
- **Announcements** (planned) - Can be sent via group chats

---

## 📝 Summary

The In-App Messaging feature would:

1. **Use existing Socket.IO infrastructure** for real-time delivery
2. **Add 4 new database tables** for conversations, messages, participants, and read receipts
3. **Create new API endpoints** for message CRUD operations
4. **Build frontend chat UI** components for both guard and admin interfaces
5. **Integrate with file storage** for attachments
6. **Leverage existing authentication** and tenant isolation
7. **Add minimal cost** (~$0.10-1.00/month for 100 guards)

The feature would significantly improve communication efficiency and reduce reliance on external communication channels (phone calls, SMS).

---

**Note**: This is an explanation document only. No code has been implemented yet. Implementation would follow this architecture and design.
