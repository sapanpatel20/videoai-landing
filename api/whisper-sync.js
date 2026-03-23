/**
 * api/whisper-sync.js
 * ─────────────────────────────────────────────
 * Takes the MP3 from Fish Audio, sends to OpenAI Whisper,
 * gets back word-level timestamps, groups into caption chunks,
 * returns caption timeline the frontend uses to sync captions to audio.
 *
 * POST body (multipart): audio file blob + wordsPerCaption (int)
 * Response: { captions: [ { text, start, end, progress }, ... ] }
 *
 * Vercel env var: OPENAI_API_KEY
 * Cost: $0.006 per minute of audio = ~$0.003 per 30s video
 */

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not set in Vercel env vars' });
  }

  try {
    // req.body is the raw audio buffer (sent as application/octet-stream)
    // wordsPerCaption comes as a query param
    const wordsPerCaption = parseInt(req.query.wpc) || 4;

    // Build multipart form for Whisper
    const audioBuffer = await streamToBuffer(req);
    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio data received' });
    }

    // Create form data manually (no FormData in Node edge runtime)
    const boundary = '----LeadAIBoundary' + Date.now();
    const CRLF = '\r\n';

    const header = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="audio.mp3"',
      'Content-Type: audio/mpeg',
      '',
      '',
    ].join(CRLF);

    const modelField = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="model"',
      '',
      'whisper-1',
      '',
    ].join(CRLF);

    const responseFormatField = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="response_format"',
      '',
      'verbose_json',
      '',
    ].join(CRLF);

    const timestampField = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="timestamp_granularities[]"',
      '',
      'word',
      '',
    ].join(CRLF);

    const footer = `--${boundary}--${CRLF}`;

    // Assemble raw multipart body
    const enc = new TextEncoder();
    const parts = [
      enc.encode(header),
      audioBuffer,
      enc.encode(CRLF + modelField + responseFormatField + timestampField + footer),
    ];
    const totalLength = parts.reduce((s, p) => s + p.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) { body.set(part, offset); offset += part.length; }

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    if (!whisperRes.ok) {
      const errText = await whisperRes.text();
      return res.status(whisperRes.status).json({ error: `Whisper error: ${errText}` });
    }

    const data = await whisperRes.json();

    // data.words = [ { word, start, end }, ... ]
    const words = data.words || [];
    const totalDuration = data.duration || (words.length ? words[words.length - 1].end : 30);

    if (!words.length) {
      return res.status(200).json({
        captions: [],
        duration: totalDuration,
        warning: 'Whisper returned no word timestamps — using full transcript',
        transcript: data.text || '',
      });
    }

    // Group words into caption chunks
    const captions = [];
    for (let i = 0; i < words.length; i += wordsPerCaption) {
      const chunk = words.slice(i, i + wordsPerCaption);
      const text = chunk.map(w => w.word.trim()).join(' ');
      const start = chunk[0].start;
      const end = chunk[chunk.length - 1].end;
      const progress = end / totalDuration;
      captions.push({ text, start, end, progress });
    }

    return res.status(200).json({ captions, duration: totalDuration });

  } catch (err) {
    console.error('whisper-sync error:', err);
    return res.status(500).json({ error: err.message });
  }
}

function streamToBuffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
