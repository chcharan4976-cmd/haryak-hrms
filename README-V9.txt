HARYAK CHAT DESKTOP NOTIFICATIONS V9

This package builds on V8.

New behavior:
- Premium one-time "Enable Haryak Chat alerts" permission card.
- Uses the browser/OS native Notification API.
- New message desktop notification includes sender, conversation and preview.
- Clicking the desktop notification focuses the HRMS window and opens the exact conversation.
- Unique 3-note Haryak signature chime generated with Web Audio (no audio file/package required).
- No notification/sound for the current user's own messages.
- Duplicate native notifications are prevented.
- When HRMS is visible, premium in-app banner remains.
- When HRMS is minimized/backgrounded, native desktop notification is used.
- If /messages or /portal/messages is visible, chat-window owns foreground refresh.
- If that chat tab is minimized/backgrounded, notification listener takes over polling.
- V8 in-flight request protection remains.

IMPORTANT BROWSER RULE:
The user must click "Enable notifications" once because browsers require explicit permission.
Native desktop notifications require localhost or HTTPS.

This version works while the browser is open. Notifications after the browser is fully closed
require a service worker + Web Push backend, which is a separate production feature.

Apply:
Replace included src files over the project.
Then run:
npm run build
