HARYAK CHAT LAYOUT V7

Includes everything from V6 plus the latest fixes:

1. Chat URLs are now real clickable links.
   - http:// and https:// are detected automatically.
   - Links open in a new browser tab.
   - rel="noopener noreferrer" is used.
   - Long URLs wrap safely and do not break the message bubble.
   - Normal text remains normal text.

2. Floating Haryak AI Assistant is hidden ONLY on:
   - Admin /messages
   - Employee /portal/messages

   This prevents the AI button from covering the chat composer,
   scrollbar, message actions, or latest messages.

3. AI Assistant remains available on all other Admin/Employee pages.

4. V6 behavior is retained:
   - fixed page
   - independently scrolling conversations
   - independently scrolling message history
   - fixed composer
   - premium edit/delete/rename
   - floating 3-dot menu
   - genuine sent/delivered/read receipts
   - chat notification listener

Apply:
Replace the included src files over the project src folder.

Then run:
npm run build
