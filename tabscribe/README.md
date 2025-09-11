# TabScribe

TabScribe is a Chrome Extension that captures web snippets and turns them into structured drafts using Chrome Built-in AI (Gemini Nano). Offline by default, optional hybrid mode.

## Quick Start

1. Go to chrome://extensions
2. Enable Developer Mode
3. Load unpacked -> select `tabscribe/extension`
4. Pin the extension. Use Alt+S or right-click selection -> "Save to TabScribe". Open the side panel.

## Folders

- `extension/` MV3 extension code
- `docs/` Architecture, Privacy, Demo script, Judge guide
- `webapp/` (optional) simple demo site using same libs

## MVP Features

- Capture selection via context menu and Alt+S
- Side panel library of cards (title, favicon, snippet)
- AI actions: summarize, rewrite, proofread, translate (stubs; swap to Chrome AI APIs)
- Draft writer and exports (scaffold)

## License

MIT
