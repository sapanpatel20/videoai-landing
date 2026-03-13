export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Check env var exists at all
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(500).json({
      error: 'ELEVENLABS_API_KEY is not set in Vercel environment variables'
    });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      }
    });

    // Return the real ElevenLabs error so we can see what's wrong
    if (!response.ok) {
      const errorBody = await response.text();
      return res.status(response.status).json({
        error: 'ElevenLabs returned error',
        status: response.status,
        detail: errorBody
      });
    }

    const data = await response.json();

    const voices = data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category || 'general'
    }));

    return res.status(200).json({ voices });

  } catch (err) {
    return res.status(500).json({
      error: err.message,
      type: err.constructor.name
    });
  }
}
