export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Could not fetch voices' });
    }

    const data = await response.json();

    // Return simplified list
    const voices = data.voices.map(v => ({
      id: v.voice_id,
      name: v.name,
      category: v.category || 'general'
    }));

    return res.status(200).json({ voices });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
