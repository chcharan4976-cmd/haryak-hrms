HARYAK CHAT LAYOUT V6

Includes V5 plus independent conversation-list scrolling.

Behavior:
- Overall page stays fixed.
- Left chat header/search/conversation label stay fixed.
- ONLY the conversation rows scroll when the conversation count grows.
- Right chat header stays fixed.
- ONLY message history scrolls when messages grow.
- Composer stays fixed at bottom.
- Scroll chaining is contained so scrolling the conversation list does not move the page.
- Stable scrollbar gutter prevents width/layout jumping when a scrollbar appears.
- Admin extra title strip remains removed.
- Existing receipts, premium edit/delete/rename, floating 3-dot menu and notifications remain.

Replace included src files over the project src folder.
Then run:
npm run build
