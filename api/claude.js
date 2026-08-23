// api/claude.js — Vercel serverless function.
// The browser never sees the API key. It calls /api/claude; this adds the key.
//
// Set in Vercel → Settings → Environment Variables:
//   ANTHROPIC_API_KEY   your key
//   APP_PASSWORD        the shared password for the site

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_CALLS = 120;            // ~10 full case studies per IP per hour
const hits = new Map();           // resets on cold start; fine for a demo

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.start > WINDOW_MS) {
    hits.set(ip, { start: now, n: 1 });
    return false;
  }
  rec.n += 1;
  return rec.n > MAX_CALLS;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // The page is gated by middleware, but this route is reachable on its own,
  // so it checks the same cookie. Without this, anyone with the URL spends your credits.
  const cookie = req.headers.cookie || "";
  if (!cookie.includes("cl_auth=" + process.env.APP_PASSWORD)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const ip = (req.headers["x-forwarded-for"] || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }

  const { model, max_tokens, system, messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "messages required" });
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || "claude-sonnet-5",
        max_tokens: Math.min(Number(max_tokens) || 1000, 3000),
        system,
        messages,
      }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Upstream request failed" });
  }
}
