HARYAK CHAT REQUEST-STORM FIX V8

Replace these two files exactly:

1. src/components/chat/chat-window.tsx
2. src/components/chat/chat-notification-listener.tsx

This package is based on the current chat-window source you uploaded.

Changes:
- Removed the old combined 4-second conversations + messages polling loop.
- Open thread refreshes every 5 seconds only when the browser tab is visible.
- Conversation metadata refreshes separately every 15 seconds.
- Added in-flight guards so a slow request cannot overlap with the next poll.
- Removed delivered/read PATCH calls from every message fetch.
- Delivered/read is acknowledged when the selected conversation is active/focused.
- Global notification polling is completely disabled on /messages and /portal/messages.
- Global notification listener polls every 10 seconds elsewhere.
- Global notification listener also has an in-flight guard.
- Existing clickable URLs, scrolling, edit/delete UI, premium three-dot menu,
  and ✓ / ✓✓ display are preserved.

Then run:
npm run build

Do not change the API or database for this step.
