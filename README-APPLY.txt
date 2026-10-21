HARYAK ORGANIZATION CHAT — COMPLETE V4

- Employee Organization Chat title moved into the unused top navigation area.
- Duplicate Employee page title removed, increasing chat height.
- Admin chat gets a compact, correctly bounded header/workspace.
- 3-dot menu is rendered at document.body level and cannot be clipped.
- Menu stays inside viewport and closes on outside click, Escape, resize or scroll.
- Premium inline edit/delete/rename UI remains.
- Genuine DB-backed receipts:
  ✓ sent/stored
  ✓✓ recipient client acknowledged delivery
  colored ✓✓ recipient opened/read
- Existing notification listener and independent scrolling remain.

Copy src into the project root and replace existing files.
Then run: npm run build

No new Supabase SQL is required.
