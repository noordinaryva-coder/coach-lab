// api/transcribe.js
//
// Voice-input proxy for Coach Lab. Mirrors the existing api/claude.js pattern:
// the browser never sees the OpenAI key, this function holds it server-side
// via the OPENAI_API_KEY environment variable (add it in Vercel the same way
// ANTHROPIC_API_KEY and APP_PASSWORD are set up).
//
// The client records audio with MediaRecorder and POSTs the raw blob here
// with a Content-Type header (e.g. "audio/webm"). This function reads the
// raw body, wraps it in multipart/form-data, and forwards it to OpenAI's
// transcription endpoint.

// Domain vocabulary hint — biases the model toward Coach Lab's terminology
// so it doesn't mis-hear jargon that's rare in general speech data.
// Extend this list as new terms come up in practice sessions.
const DOMAIN_VOCAB_PROMPT =
  "Contact centre coaching conversation using terms: COACH, DISC, KSB, " +
  "Star Status, Super Star, Steady Star, Rising Star, Falling Star, AHT, " +
  "ACW, CSAT, FCR, QAQ, Giraffe, Jackal, Connect-then-Correct, SMART action " +
  "plan, Coach Plan, KPM, KPI, Hold Accountable, DMAIC, GROW.";

// Reads the raw request body into a single Buffer. Plain Vercel Node
// functions (unlike Next.js API routes) don't auto-parse the body, so we
// collect the incoming stream ourselves.
async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "OPENAI_API_KEY is not configured" });
    return;
  }

  try {
    const audioBuffer = await readRawBody(req);

    if (!audioBuffer || audioBuffer.length === 0) {
      res.status(400).json({ error: "No audio received" });
      return;
    }

    // Content-Type from the client tells us the container format
    // (e.g. "audio/webm", "audio/webm;codecs=opus"). Default to webm
    // since that's what MediaRecorder produces in Chrome/Edge by default.
    const contentType = req.headers["content-type"] || "audio/webm";
    const extension = contentType.includes("mp4")
      ? "mp4"
      : contentType.includes("wav")
      ? "wav"
      : "webm";

    // Build a multipart/form-data request to OpenAI using the Web-standard
    // FormData/Blob globals available in Vercel's Node runtime.
    const formData = new FormData();
    formData.append(
      "file",
      new Blob([audioBuffer], { type: contentType }),
      `recording.${extension}`
    );
    // "gpt-transcribe" is OpenAI's current recommended transcription model —
    // lower word-error-rate and cheaper than the older whisper-1. Swap to
    // "whisper-1" here if you ever need to fall back.
    formData.append("model", "gpt-transcribe");
    formData.append("language", "en");
    formData.append("prompt", DOMAIN_VOCAB_PROMPT);

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      }
    );

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("OpenAI transcription error:", errorText);
      res.status(502).json({ error: "Transcription failed" });
      return;
    }

    const data = await openaiResponse.json();

    res.status(200).json({ text: data.text || "" });
  } catch (err) {
    console.error("transcribe.js error:", err);
    res.status(500).json({ error: "Server error during transcription" });
  }
};
