# Index Conflict Fix

## Issue

When Sequelize tries to sync models, it attempts to create unique indexes that already exist in the database, causing error:

```
code: '42P07'
Error: relation "conversation_participants_conversation_id_participant_type_participant_id" already exists
```

## Root Cause

The migration script (`createMessagingTables.js`) creates tables with UNIQUE constraints:
- `conversation_participants`: `UNIQUE(conversation_id, participant_type, participant_id)`
- `message_reads`: `UNIQUE(message_id, reader_type, reader_id)`

These UNIQUE constraints automatically create indexes in PostgreSQL.

The Sequelize models also defined unique indexes, causing Sequelize to try to create them again when syncing.

## Fix Applied

Removed unique index definitions from:
1. ✅ `ConversationParticipant` model
2. ✅ `MessageRead` model

The unique constraints are already enforced by the database schema, so we don't need to define them in the Sequelize models.

## Result

- ✅ No more duplicate index errors
- ✅ Unique constraints still enforced by database
- ✅ Models can sync without errors

## Note

The indexes created by the migration script are sufficient. The models don't need to redefine them.
