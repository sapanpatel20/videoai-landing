/**
 * api/voice.js — unified voice handler
 * POST ?provider=fish|openai|elevenlabs  body: { text, voiceId }
 * GET  ?list=true                        → returns ElevenLabs voice list
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: voice list (ElevenLabs) ──
  if (req.method === 'GET' && req.query.list === 'true') {
    if (!process.env.ELEVENLABS_API_KEY) {
      return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });
    }
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const data = await r.json();
      return res.status(200).json({
        voices: data.voices.map(v => ({ id: v.voice_id, name: v.name, category: v.category || 'general' }))
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const provider = req.query.provider || 'fish';
  const { text, voiceId } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  // ── Fish Audio ──
  if (provider === 'fish') {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'FISH_AUDIO_API_KEY not set' });
    const body = { text: text.slice(0, 10000), format: 'mp3', mp3_bitrate: 128, latency: 'balanced', normalize: true };
    if (voiceId && voiceId !== 'default' && voiceId.length >= 20) body.reference_id = voiceId;
    try {
      const r = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'model': 's1' },
        body: JSON.stringify(body),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Fish Audio ${r.status}: ${await r.text()}` });
      const buf = await r.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', buf.byteLength);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(Buffer.from(buf));
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── OpenAI TTS ──
  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY not set' });
    const validVoices = ['alloy','echo','fable','nova','onyx','shimmer','coral','ash','sage'];
    const voice = validVoices.includes(voiceId) ? voiceId : 'onyx';
    try {
      const r = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts-1', input: text.slice(0, 4096), voice, response_format: 'mp3', speed: 1.0 }),
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const buf = await r.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', buf.byteLength);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(Buffer.from(buf));
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── ElevenLabs ──
  if (provider === 'elevenlabs') {
    if (!process.env.ELEVENLABS_API_KEY) return res.status(500).json({ error: 'ELEVENLABS_API_KEY not set' });
    if (!voiceId) return res.status(400).json({ error: 'voiceId required for ElevenLabs' });
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_flash_v2_5', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const buf = await r.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', buf.byteLength);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(Buffer.from(buf));
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  return res.status(400).json({ error: `Unknown provider: ${provider}` });
}
