export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!process.env.PEXELS_API_KEY) {
    return res.status(500).json({ error: 'PEXELS_API_KEY not set in Vercel environment variables' });
  }

  const { query, per_page = 6, type = 'photos' } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'No search query provided' });
  }

  try {
    // Fetch both photos and videos in parallel
    const [photoRes, videoRes] = await Promise.all([
      fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${per_page}&orientation=portrait`,
        { headers: { 'Authorization': process.env.PEXELS_API_KEY } }
      ),
      fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${per_page}&orientation=portrait`,
        { headers: { 'Authorization': process.env.PEXELS_API_KEY } }
      )
    ]);

    const photoData = photoRes.ok ? await photoRes.json() : { photos: [] };
    const videoData = videoRes.ok ? await videoRes.json() : { videos: [] };

    const photos = (photoData.photos || []).map(p => ({
      id: p.id,
      type: 'photo',
      url: p.src.large,
      thumb: p.src.medium,
      photographer: p.photographer,
      alt: p.alt || query
    }));

    const videos = (videoData.videos || []).map(v => {
      // Pick the smallest HD file for fast loading
      var files = v.video_files || [];
      // Prefer portrait mp4 around 720p
      var best = files.find(f => f.width <= 720 && f.file_type === 'video/mp4')
               || files.find(f => f.file_type === 'video/mp4')
               || files[0];
      return {
        id: v.id,
        type: 'video',
        url: best ? best.link : '',
        thumb: v.image,  // thumbnail image
        width: best ? best.width : 0,
        height: best ? best.height : 0,
        duration: v.duration,
        photographer: v.user ? v.user.name : ''
      };
    }).filter(v => v.url);

    return res.status(200).json({ photos, videos });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
