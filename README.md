# 🧠 TabScribe — Research OS for the Web  
> **Capture. Summarize. Write. All inside your browser — powered by Chrome’s built-in AI (Gemini Nano).**  
> [**→ Install on Chrome**](https://chromewebstore.google.com/detail/tabscribe-%E2%80%94-research-os-f/adajfbbemhhjpgmiedkgbaceiiahgafd)

---

## 🚀 Overview

**TabScribe** is a privacy-first Chrome extension that turns your web snippets into structured research drafts — instantly.  
It uses **Chrome’s built-in AI (Gemini Nano)** for summarization, rewriting, proofreading, translation, and content generation — all **offline-first** and fully local.

It’s like having an intelligent note-taker, editor, and citation manager — right inside your browser.

---

## 🧩 Core Features

### ✍️ Capture Anything
- Right-click → “Save to TabScribe” or press **Alt + S**
- Auto-extracts **title, URL, favicon, and metadata (DOI)**
- Preserves **HTML evidence snapshots** for traceability  

### 🧠 AI-Powered Processing
- **Summarizer** – concise, academic-style summaries  
- **Rewriter** – tone presets (Concise | Academic | Friendly | Executive)  
- **Proofreader** – grammar and style correction  
- **Translator** – multilingual with auto-detection  
- **Writer** – generates full research drafts from snippets  

### 📂 Organized Research
- Create and manage **multiple projects**  
- Full-text **search & filter** across all notes  
- **Trash / restore** system  
- Works **offline-by-default** — data stays on your device  

### 🎓 Literature & Citations (Hybrid Mode)
- **Literature Lens:** visualize citation and reference networks  
- **Automatic DOI & metadata fetching** (OpenAlex / Crossref)  
- **Citation Styles:** APA | MLA | Harvard | BibTeX  
- **Export:** Markdown & DOCX with embedded references  

### 🎧 Multimodal Input
- **Image Analysis:** drag & drop any image for AI explanation  
- **Audio Notes:** record, transcribe, and attach to snippets  

---

## 🏗️ Architecture

The project is organized into core extension components and documentation:

- **`extension/`** - Browser extension source code
  - `ai/` - AI features (summarize, rewrite, proofread, translate, write)
  - `lib/` - Core utilities (IndexedDB, settings, export, citations)
  - `sidebar.html` - Main side-panel interface
  - `content_script.js` - Page interaction layer
  - `service_worker.js` - Background processes
  - `options.html` - Settings configuration
- **`docs/`** - Project documentation
  - Architecture, demo scripts, judging criteria, and privacy policy

---

### ⚙️ Tech Stack
- **Manifest V3 Chrome Extension**
- **Gemini Nano APIs** (Summarizer / Writer / Rewriter / Translator)
- **IndexedDB + Chrome Storage** for offline data  
- **Hybrid Mode:** Gemini API for advanced literature analysis  
- **D3.js** visualization for literature networks  

---

## 🔒 Privacy & Security
- ✅ 100 % **Offline-first**  
- ✅ **No accounts or cloud sync**  
- ✅ **Transparent hybrid mode** indicator when external APIs are used  
- ✅ All data stored locally via IndexedDB  

---

## 🧭 Demo Highlights
1. Select text → Right-click → *Save to TabScribe*  
2. Instantly **summarize / rewrite / proofread / translate**  
3. Add **images or voice notes**  
4. Generate **AI-structured drafts with citations**  
5. **Export** to Markdown or DOCX  

---

## 🧪 Current Version
**v0.9.0 Beta**  
✔ Core features functional  
✔ Multimodal AI active  
✔ Export system stable  

🧩 Requires **Chrome 138+** with built-in AI features enabled  

---

## 💡 Why TabScribe?

Because research today happens across countless tabs.  
TabScribe brings **AI assistance, structure, and citations** directly where ideas begin — inside your browser.

---

## 🛠️ Roadmap
- 🔄 Collaboration & cloud sync (opt-in)  
- 🗂️ Smart tag system  
- 🧩 Plugin SDK for custom AI actions  
- 📑 Advanced citation graph exploration  

---

## 📄 License
MIT License © 2025 Uday Parmar  

---

## 🌐 Links
- **Chrome Web Store:** [Install TabScribe](https://chromewebstore.google.com/detail/tabscribe-%E2%80%94-research-os-f/adajfbbemhhjpgmiedkgbaceiiahgafd)  
- **Author:** [Uday Parmar](https://github.com/Accidental-MVP)  
- **Keywords:** `chrome-extension` • `ai-research` • `gemini-nano` • `offline-first` • `summarization`  

