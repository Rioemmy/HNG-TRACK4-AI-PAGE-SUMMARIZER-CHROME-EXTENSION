// ── Element references ────────────────────────────────────────────────────────

const el = {
  summarizeBtn: document.getElementById('summarize-btn'),
  resetBtn:     document.getElementById('reset-btn'),
  loading:      document.getElementById('loading'),
  summary:      document.getElementById('summary-output'),
  pageTitle:    document.getElementById('page-title'),
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_RETRIES    = 3
const RETRY_DELAY_MS = 100

const ERROR_MESSAGES = {
  'Cannot access':     "This page can't be summarized. Try on a news article or blog post.",
  'Could not connect': 'Could not read page content. Try refreshing the page.',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the active tab in the current window. */
const getActiveTab = () =>
  chrome.tabs.query({ active: true, currentWindow: true })
    .then(([tab]) => tab)

/** Injects content.js into the given tab. */
const injectContentScript = (tabId) =>
  chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })

/**
 * Asks content.js for the page data, retrying up to MAX_RETRIES times
 * to handle the race condition where the script hasn't loaded yet.
 */
async function getPageContent(tabId) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await chrome.tabs.sendMessage(tabId, { action: 'getContent' })
    } catch {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  throw new Error('Could not connect to page. Try refreshing.')
}

/** Sends page data to background.js and returns the summary result. */
const requestSummary = ({ title, content, url }) =>
  chrome.runtime.sendMessage({ action: 'summarize', title, content, url })

/**
 * Strips any bullet/list prefix the model might use and returns clean text.
 * Handles: "- text", "• text", "* text", "1. text", "1) text", "**text**"
 */
function stripBulletPrefix(line) {
  return line
    .replace(/^\*\*(.+)\*\*$/, '$1')   // bold markdown **text**
    .replace(/^(\d+[\.\)])\s+/, '')    // numbered:  1. or 1)
    .replace(/^[-•*]\s+/, '')          // dashes, bullets, asterisks
    .trim()
}

/**
 * Returns true if a line looks like a list item in any format the model
 * commonly uses: "- ", "• ", "* ", "1. ", "1) ", or "**...**"
 */
function isBulletLine(line) {
  return /^[-•*]\s+/.test(line)
      || /^\d+[\.\)]\s+/.test(line)
      || /^\*\*.+\*\*$/.test(line)
}

/**
 * Parses the plain-text AI response into clean HTML.
 *
 * Handles three sections: SUMMARY, KEY INSIGHTS, READING TIME.
 * The model often puts the reading time value on the same line as the header
 * e.g. "READING TIME: 5 min read" — this handles both inline and next-line.
 */
function formatSummary(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  let html           = ''
  let currentSection = null

  for (const line of lines) {
    // ── Section headers ──────────────────────────────────────────────────────
    if (/^SUMMARY:/i.test(line)) {
      html += '<div class="section-title">Summary</div>'
      currentSection = 'bullets'
      continue
    }

    if (/^KEY INSIGHTS:/i.test(line)) {
      html += '<div class="section-title">Key Insights</div>'
      currentSection = 'bullets'
      continue
    }

    if (/^READING TIME:/i.test(line)) {
      html += '<div class="section-title">Reading Time</div>'
      // Value is often inline: "READING TIME: 5 min read"
      const inline = line.replace(/^READING TIME:/i, '').trim()
      if (inline) {
        html += `<span class="reading-time">${inline}</span>`
        currentSection = null  // done, nothing left to parse
      } else {
        currentSection = 'reading-time'  // value is on the next line
      }
      continue
    }

    // ── Bullet / list content ────────────────────────────────────────────────
    if (currentSection === 'bullets') {
      const content = isBulletLine(line) ? stripBulletPrefix(line) : line
      html += `
        <div class="summary-item">
          <span class="bullet">•</span>
          <span>${content}</span>
        </div>`
      continue
    }

    // ── Reading time (next-line value) ───────────────────────────────────────
    if (currentSection === 'reading-time') {
      const content = stripBulletPrefix(line)
      html += `<span class="reading-time">${content}</span>`
      currentSection = null
      continue
    }
  }

  return html
}

/** Returns a user-friendly error message for known error types. */
function getFriendlyError(message) {
  const match = Object.entries(ERROR_MESSAGES).find(([key]) => message.includes(key))
  return match ? match[1] : message
}

// ── UI state helpers ──────────────────────────────────────────────────────────

function setLoadingState(isLoading) {
  el.loading.classList.toggle('hidden', !isLoading)
  el.summarizeBtn.disabled = isLoading
}

function showSummary(html) {
  el.summary.classList.remove('error')
  el.summary.innerHTML = html
  el.summary.classList.remove('hidden')
}

function showError(message) {
  el.summary.classList.add('error')
  el.summary.innerText = getFriendlyError(message)
  el.summary.classList.remove('hidden')
}

function resetUI() {
  el.summary.innerHTML = ''
  el.summary.classList.add('hidden')
  el.summary.classList.remove('error')
  el.pageTitle.textContent = 'Ready To Summarize'
}

// ── Initialisation ────────────────────────────────────────────────────────────

// Ensure loading is hidden immediately on popup open
setLoadingState(false)

// Display the current page title as soon as the popup opens
getActiveTab().then((tab) => {
  el.pageTitle.textContent = tab.title || 'Unknown Page'
})

// ── Event listeners ───────────────────────────────────────────────────────────

el.summarizeBtn.addEventListener('click', async () => {
  setLoadingState(true)
  el.summary.classList.add('hidden')

  try {
    const tab = await getActiveTab()

    await injectContentScript(tab.id)

    const pageData = await getPageContent(tab.id)
    const result   = await requestSummary({ ...pageData, url: tab.url })

    if (!result.success) throw new Error(result.error)

    showSummary(formatSummary(result.summary))
  } catch (err) {
    showError(err.message)
  } finally {
    setLoadingState(false)
  }
})

el.resetBtn.addEventListener('click', resetUI)