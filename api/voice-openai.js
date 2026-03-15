/**
 * api/voice-openai.js
 * ─────────────────────────────────────────────
 * OpenAI TTS endpoint — returns MP3 audio
 *
 * Cost: $15 per 1M characters = ~$0.001 per 30-second script
 * That is 20x cheaper than ElevenLabs
 *
 * Voices available: alloy, echo, fable, nova, onyx, shimmer,
 *                   coral, ash, sage (13 total)
 *
 * Vercel env var needed: OPENAI_API_KEY
 *
 * POST body: { text: "...", voiceId: "onyx" }
 * Response: audio/mpeg binary
 */

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const { text, voiceId = 'onyx' } = req.body;

  if (!text) return res.status(400).json({ error: 'text is required' });
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OPENAI_API_KEY not set in Vercel environment variables'
    });
  }

  // Validate voice — fallback to onyx if invalid
  const validVoices = ['alloy','echo','fable','nova','onyx','shimmer','coral','ash','sage','verse','ballad','marin','cedar'];
  const voice = validVoices.includes(voiceId) ? voiceId : 'onyx';

  // Truncate to OpenAI's 4096 char limit
  const inputText = text.slice(0, 4096);

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',         // tts-1 = fast + cheap. Use tts-1-hd for higher quality
        input: inputText,
        voice: voice,
        response_format: 'mp3', // mp3 works everywhere
        speed: 1.0,             // 0.25–4.0 — 1.0 is natural
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: 'OpenAI TTS error: ' + errText
      });
    }

    const audioBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(Buffer.from(audioBuffer));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
