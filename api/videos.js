/**
 * api/videos.js — unified video history handler
 * POST body: { action:'save', session_id, script, hook, niche, platform, tone, voice_provider, caption_style, thumbnail }
 * GET  ?action=list&session_id=xxx&limit=30
 * DELETE ?session_id=xxx&id=yyy
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sb = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };

  if (!sb || !key) return res.status(200).json({ saved: false, videos: [], reason: 'Supabase not configured' });

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const { id, session_id } = req.query;
    if (!id || !session_id) return res.status(400).json({ error: 'id and session_id required' });
    await fetch(`${sb}/rest/v1/videos?id=eq.${id}&session_id=eq.${session_id}`, { method: 'DELETE', headers });
    return res.status(200).json({ deleted: true });
  }

  // ── GET list ──
  if (req.method === 'GET') {
    const { session_id, limit = '20', offset = '0' } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const url = `${sb}/rest/v1/videos?session_id=eq.${encodeURIComponent(session_id)}&order=created_at.desc&limit=${Math.min(50,parseInt(limit))}&offset=${parseInt(offset)}&select=id,hook,niche,platform,voice_provider,caption_style,thumbnail,created_at`;
    const r = await fetch(url, { headers: { ...headers, 'Prefer': 'count=exact' } });
    if (!r.ok) return res.status(200).json({ videos: [], total: 0 });
    const videos = await r.json();
    const total = parseInt(r.headers.get('content-range')?.split('/')[1] || videos.length);
    return res.status(200).json({ videos, total });
  }

  // ── POST save ──
  if (req.method === 'POST') {
    const { session_id, script = '', hook, niche = '', platform = '', tone = '', voice_provider = '', caption_style = '', thumbnail = null } = req.body;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });
    const extractedHook = hook || script.match(/\[HOOK\]([\s\S]*?)(?=\[|$)/i)?.[1]?.trim().slice(0, 120) || script.slice(0, 120);
    try {
      const r = await fetch(`${sb}/rest/v1/videos`, {
        method: 'POST',
        headers: { ...headers, 'Prefer': 'return=representation' },
        body: JSON.stringify({ session_id, script, hook: extractedHook, niche, platform, tone, voice_provider, caption_style, thumbnail, created_at: new Date().toISOString() }),
      });
      if (!r.ok) return res.status(200).json({ saved: false, reason: await r.text() });
      const data = await r.json();
      return res.status(200).json({ saved: true, id: data[0]?.id });
    } catch (err) { return res.status(200).json({ saved: false, reason: err.message }); }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
