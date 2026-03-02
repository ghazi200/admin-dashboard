# Guard Messages (for guard-ui)

Use these so the **guard-ui** Messages page shows new messages from admins and updates correctly.

## Files

- **guardMessaging.service.js** – API client for `/api/guard/messages` (list conversations, get messages, send, **delete**, mark read). Uses `localStorage.getItem('guardToken')` and `REACT_APP_API_URL` or `http://localhost:5000`.
- **GuardMessages.jsx** – Full Messages UI with **polling every 3 seconds** and **Delete on every message** (own = deletes for everyone; admin message = hides only for this guard). Copy both files into guard-ui to get delete buttons.

## If your guard-ui already has a Messages page

1. **Poll for new messages** when a conversation is selected:
   - Call GET `/api/guard/messages/conversations/:id/messages` every 3–5 seconds (e.g. `setInterval` in a `useEffect` that depends on `selectedConversationId`).
   - Clear the interval in the effect cleanup (`return () => clearInterval(...)`).

2. **Merge server messages with optimistic messages** when you set state from the poll:
   - Keep any messages whose `id` starts with `temp-` (your optimistic “sending” messages).
   - Merge them with the server list, then sort by `created_at` or `createdAt` so order is correct.
   - Example pattern is in `GuardMessages.jsx` in `fetchMessagesForConversation` → `setMessages((prev) => { ... merged.sort(...) })`.

3. **Response shape**: backend returns `{ messages: [...], pagination }`. Each message has `id`, `content`, `sender_type` (`"guard"` or `"admin"`), `created_at` (ISO string). Use `sender_type === "guard"` to show “You” for the current guard.

4. **Auth**: every request must send `Authorization: Bearer <guardToken>`. Same JWT as guard login (backend port 5000, same `JWT_SECRET`).

## Using this implementation in guard-ui

1. Copy `guardMessaging.service.js` and `GuardMessages.jsx` into your guard-ui app (e.g. `src/services/guardMessaging.service.js` and `src/pages/Messages.jsx` or `src/components/Messages.jsx`).
2. In guard-ui, set:
   - `REACT_APP_API_URL=http://localhost:5000` (or your backend URL) so the service hits the right host.
   - On login, store the guard JWT: `localStorage.setItem('guardToken', token)`.
3. Proxy `/api` to your backend in development if needed (e.g. in `setupProxy.js`: `/api` → `http://localhost:5000`).
4. Render `<GuardMessages />` on your Messages route.

After that, opening a conversation and leaving it open will poll every 3s and new messages will appear. **Delete**: each message has a "Delete" button; copy the latest `GuardMessages.jsx` and `guardMessaging.service.js` (with `deleteMessage`) so guard-ui shows delete buttons. Own messages are soft-deleted for everyone; deleting an admin message only hides it on the guard’s side.
