// Guard against re-injection — Chrome injects this script on every
// "Summarize" click, so without this check all const declarations
// would throw "already declared" on the second run.
if (!window.__pageSummarizerInjected) {
  window.__pageSummarizerInjected = true

  // ── Constants ───────────────────────────────────────────────────────────────

  const CONTENT_CHAR_LIMIT = 5000
  const CONTENT_SELECTORS  = ['main', 'article', 'body']
  const CLUTTER_SELECTORS  = ['nav', 'footer', 'header', 'aside', 'script', 'style']

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Finds the most relevant content container on the page. */
  function findContentElement() {
    for (const selector of CONTENT_SELECTORS) {
      const el = document.querySelector(selector)
      if (el) return el
    }
  }

  /** Removes non-content elements (nav, footer, etc.) from the given element. */
  function removeClutter(element) {
    element
      .querySelectorAll(CLUTTER_SELECTORS.join(', '))
      .forEach((el) => el.remove())
  }

  /** Extracts the page title and trimmed text content. */
  function extractPageContent() {
    const contentEl = findContentElement()
    removeClutter(contentEl)
    return {
      title:   document.title,
      content: contentEl.innerText.slice(0, CONTENT_CHAR_LIMIT),
    }
  }

  // ── Message listener ─────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'getContent') {
      sendResponse(extractPageContent())
    }
    return true
  })
}