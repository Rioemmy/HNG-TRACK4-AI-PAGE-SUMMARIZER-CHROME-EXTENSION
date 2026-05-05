# Page Summarizer

A Chrome extension that instantly summarizes any webpage using the Groq AI API, powered by the LLaMA 3.3 70B model. Click the extension, hit **Summarize Page**, and get a structured breakdown — summary, key insights, and estimated reading time — in seconds.


# Table of Contents

- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [AI Integration](#ai-integration)
- [Setup Instructions](#setup-instructions)
- [Installation & Usage](#installation--usage)
- [Security Decisions](#security-decisions)
- [Trade-offs](#trade-offs)


# Project Structure

page-summarizer/
├── manifest.json        Extension configuration (Manifest V3)
├── popup.html           Extension UI
├── popup.css            Styles
├── popup.js             UI logic & tab communication
├── content.js           Injected into pages to extract content
├── background.js        Service worker — handles Groq API calls & caching
└── images/
    ├── icon.svg
    ├── doc-icon.svg
    ├── magic-icon.svg
    ├── clear-icon.svg
 

# Architecture

The extension follows Chrome's standard **three-layer Manifest V3 architecture**. Each layer has a single, well-defined responsibility and they communicate exclusively via Chrome's messaging API.

┌─────────────────────────────────────────────────────────┐
│                        popup.js                         │
│              (UI layer — orchestrates the flow)         │
└──────────────────────┬──────────────────────────────────┘
                       │  chrome.tabs.sendMessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│                      content.js                         │
│         (injected into the page on demand)              │
│    Finds the main content element, strips clutter,      │
│    and returns { title, content } to popup.js           │
└──────────────────────┬──────────────────────────────────┘
                       │  chrome.runtime.sendMessage
                       ▼
┌─────────────────────────────────────────────────────────┐
│                    background.js                        │
│              (service worker — runs in background)      │
│    Checks cache → calls Groq API → caches result        │
└─────────────────────────────────────────────────────────┘


How a summarize request flows end-to-end

1. The user clicks **Summarize Page** in the popup.
2. `popup.js` injects `content.js` into the active tab via `chrome.scripting.executeScript`.
3. `popup.js` sends a `getContent` message to `content.js`.
4. `content.js` finds the best content container (`<main>`, `<article>`, or `<body>`), strips navigation/footer clutter, and returns the page title and up to 5,000 characters of text.
5. `popup.js` forwards that data to `background.js` via `chrome.runtime.sendMessage`.
6. `background.js` checks `chrome.storage.local` for a cached summary keyed by URL.
7. On a cache miss it calls the Groq API, stores the result, and returns it.
8. `popup.js` formats the plain-text response into HTML and renders it in the summary panel.

# AI Integration/Provider

[Groq](https://groq.com) — chosen for its extremely low-latency inference on open-weight models.

# Model

**LLaMA 3.3 70B Versatile** (`llama-3.3-70b-versatile`) — a large open-weight model that produces reliable, well-structured outputs and follows formatting instructions consistently.

# Prompt design

The prompt instructs the model to return output in a fixed, parseable format:

SUMMARY:
- bullet points

KEY INSIGHTS:
- bullet points

READING TIME: X min read


This structured format means the extension can reliably convert the plain-text response to HTML using regex replacements, without needing JSON parsing or a more complex output schema.

# Token budget

`max_tokens` is capped at 1,000. Summaries are concise by design (3–5 bullets + 2–3 insights + reading time), so this ceiling is never hit in practice but prevents unexpectedly large or costly responses.

# Content truncation

Page content is truncated to 5,000 characters before being sent to the API. This keeps the prompt within a predictable token range and avoids hitting context limits or incurring unnecessary cost on very long pages.

---

# Setup Instructions

 Prerequisites

- Google Chrome (or any Chromium-based browser)
- A free [Groq API key](https://console.groq.com)

1. Clone or download the project

```bash
git clone https://github.com/your-username/page-summarizer.git
cd page-summarizer
```

Or download and unzip the repository manually.

2. Add your Groq API key
Open background.js and replace the placeholder on line 3:


# Installation & Usage

Load the extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `page-summarizer` folder (the one containing `manifest.json`)
5. The extension icon will appear in your Chrome toolbar


# Using the extension

1. Navigate to any news article, blog post, or documentation page
2. Click the **Page Summarizer** icon in the toolbar
3. The popup shows the current page title
4. Click **Summarize Page** — a loading spinner appears while the AI processes the page
5. The structured summary renders below the buttons
6. Click **Clear** to reset the panel and summarize a different page

# Re-loading after code changes

After editing any file, go back to `chrome://extensions` and click the **refresh icon** on the Page Summarizer card to reload the extension.


# Security Decisions

API key stored in source code

The Groq API key lives in `background.js` as a plain constant. This is a known limitation of client-side Chrome extensions — there is no server-side environment to store secrets in. The mitigations in place are:

- The key is only used inside the **background service worker**, which runs in an isolated context and is never exposed to page scripts or the DOM.
- The `host_permissions` in `manifest.json` restrict outbound API calls to `https://api.groq.com/*` only — the extension cannot make credentialed requests to any other domain.
- Groq API keys can be **scoped and revoked** from the Groq console at any time.

Important: do not commit your real API key to a public repository. Add `background.js` to `.gitignore` or use a build step to inject the key at build time if you plan to share the code publicly.

# Content isolation

`content.js` is injected on demand (not declared as a persistent content script), which means it only runs when the user explicitly clicks **Summarize Page**. It does not run on every page load, minimising the extension's footprint and attack surface.

# Permissions are minimal

The extension requests only three permissions:

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the URL and inject scripts into the current tab only |
| `scripting` | Execute `content.js` on demand via `chrome.scripting.executeScript` |
| `storage` | Cache summaries in `chrome.storage.local` |

No broad `tabs`, `history`, `cookies`, or `<all_urls>` permissions are requested.


# Trade-offs

# API key in client code

Trade-off: Simple to set up, but the key is visible to anyone who inspects the extension files.
Alternative: Route requests through your own backend server that holds the key. This adds infrastructure complexity but is the correct approach for a production or distributed extension.

# Content truncated to 5,000 characters

Trade-off: Works well for most articles, but may miss important content on very long pages (research papers, long-form essays).
**Alternative:** Increase the limit, implement chunking with multiple API calls, or use a model with a larger context window. All three increase cost or complexity.

# `chrome.storage.local` for caching

Trade-off: Summaries persist across sessions and are instant on revisit. However, the cache never expires — a page that changes significantly will still return the old summary until the user clears extension storage manually.
Alternative: Store a timestamp alongside each summary and invalidate entries older than a set TTL (e.g. 24 hours).

# On-demand script injection

Trade-off: Injecting `content.js` on click avoids running code on every page, but introduces a small retry loop to handle the race condition where the script hasn't fully initialised before the first message is sent.
Alternative: Declare `content.js` as a persistent content script in `manifest.json`. This eliminates the race condition but means the script runs on every page the user visits, increasing resource use.

# Regex-based response parsing

Trade-off: Simple and fast, with no extra dependencies. Relies on the model consistently following the prompt format.
