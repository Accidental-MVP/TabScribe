# Architecture

- MV3 Extension with side panel UI (`sidebar.html` / `sidebar.js`).
- Background service worker handles context menu and Alt+S, executes scripts to read selection, persists to IndexedDB via `lib/db.js`.
- AI wrappers in `ai/` to call Chrome Built-in AI (Gemini Nano). Stubs included for offline demo.
- Export and citation helpers in `lib/`.
- Optional `webapp/` can reuse libs for a standalone demo.
