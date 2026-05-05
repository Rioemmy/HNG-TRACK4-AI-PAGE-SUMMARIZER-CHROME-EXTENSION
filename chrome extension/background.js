// ── Constants ─────────────────────────────────────────────────────────────────

const GROQ_API_KEY = 'Your groq Api Key'
const GROQ_URL     = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL   = 'llama-3.3-70b-versatile'
const MAX_TOKENS   = 1000

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildPrompt(title, content) {
  return `Analyze this webpage and provide a structured summary.

Page Title: ${title}
Content: ${content}

You MUST respond using ONLY this exact format. Do not add any intro, explanation, markdown formatting, or extra text outside of it:

SUMMARY:
- [bullet point]
- [bullet point]
- [bullet point]

KEY INSIGHTS:
- [bullet point]
- [bullet point]

READING TIME: [X min read]

Rules:
- Every bullet MUST start with "- " (dash then space)
- Do NOT use numbers, asterisks, or bold markdown
- Do NOT add any text before SUMMARY: or after the reading time`
}

// ── Groq API ──────────────────────────────────────────────────────────────────

/** Calls the Groq API and returns the summary text. */
async function fetchSummaryFromGroq(title, content) {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model:      GROQ_MODEL,
      max_tokens: MAX_TOKENS,
      messages:   [{ role: 'user', content: buildPrompt(title, content) }],
    }),
  })

  if (!response.ok) throw new Error(`Groq API call failed: ${response.status}`)

  const data = await response.json()
  return data.choices[0].message.content
}

// ── Cache (chrome.storage) ────────────────────────────────────────────────────

function getCached(url) {
  return new Promise((resolve) => {
    chrome.storage.local.get(url, (result) => resolve(result[url] ?? null))
  })
}

function setCached(url, summary) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [url]: summary }, resolve)
  })
}

// ── Main summarize flow ───────────────────────────────────────────────────────

/** Returns a cached summary if available, otherwise fetches and caches a new one. */
async function summarizeWithGroq(title, content, url) {
  const cached = await getCached(url)
  if (cached) return cached

  const summary = await fetchSummaryFromGroq(title, content)
  await setCached(url, summary)
  return summary
}

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'summarize') {
    const { title, content, url } = message

    summarizeWithGroq(title, content, url)
      .then((summary) => sendResponse({ success: true, summary }))
      .catch((err)    => sendResponse({ success: false, error: err.message }))

    return true // keep the message channel open for the async response
  }
})