/**
 * api/trends.js — unified trending handler
 * POST ?action=scrape  body: { niche, count }    → Apify TikTok trending
 * POST ?action=rewrite body: { trendingText, niche, platform, tone, cta, audience } → Claude rewrite
 */
export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const action = req.query.action || req.body.action;

  // ── SCRAPE trending TikToks ──
  if (action === 'scrape') {
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'APIFY_API_KEY not set in Vercel environment variables. Sign up free at apify.com.' });
    const { niche = 'business tips', count = 8 } = req.body;
    const words = niche.toLowerCase().replace(/[^a-z0-9 ]/g,'').split(' ').filter(Boolean);
    const hashtags = [words.join(''), words[0], ...words.slice(1), words.join('')+'tips', words[0]+'content'].slice(0,5);
    try {
      const r = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-hashtag-scraper/run-sync-get-dataset-items?token=${apiKey}&limit=${Math.min(count*3,30)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashtags, resultsPerPage: Math.min(count*3,30), maxProfilesPerQuery: 3, shouldDownloadVideos: false, shouldDownloadCovers: false }),
      });
      if (!r.ok) return res.status(r.status).json({ error: `Apify ${r.status}: ${await r.text()}` });
      const raw = await r.json();
      const fmt = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n);
      const videos = raw.filter(i => i.text && i.playCount > 1000)
        .sort((a,b) => (b.playCount||0)-(a.playCount||0)).slice(0,count)
        .map(item => {
          const text = (item.text||'').replace(/\n+/g,' ').trim();
          const hookEnd = text.search(/[.!?]/);
          const hook = hookEnd > 10 && hookEnd < 120 ? text.slice(0,hookEnd+1) : text.slice(0,100)+(text.length>100?'...':'');
          return { id: item.id||item.webVideoUrl, title: text.slice(0,80), hook, fullText: text.slice(0,500), views: fmt(item.playCount||0), likes: fmt(item.diggCount||0), comments: fmt(item.commentCount||0), thumbnail: item.covers?.default||'', url: item.webVideoUrl||'', author: item.authorMeta?.name||'creator' };
        });
      return res.status(200).json({ videos, niche, searched_hashtags: hashtags });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ── REWRITE with Claude ──
  if (action === 'rewrite') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    const { trendingText='', niche='business', platform='Instagram Reels', tone='Professional', cta='Book a free consultation', audience='local business owners' } = req.body;
    if (!trendingText) return res.status(400).json({ error: 'trendingText required' });
    const prompt = `You are a viral short-form video script writer specialising in ${niche}.\n\nA trending video has this script:\n---\n${trendingText.slice(0,800)}\n---\n\nRewrite as a UNIQUE script for a ${niche} business on ${platform}. Target: ${audience}. Tone: ${tone}. Duration: 30 seconds. CTA: "${cta}". Do NOT copy any phrases. Make the hook stop the scroll.\n\nReturn ONLY:\n\n[HOOK]\nOpening line\n\n[BODY]\nMain content\n\n[CTA]\n${cta}\n\n[CAPTION]\nShort overlay line\n\n[HASHTAGS]\n5-8 hashtags comma separated`;
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const data = await r.json();
      return res.status(200).json({ script: data.content?.[0]?.text || '' });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  return res.status(400).json({ error: 'action must be scrape or rewrite' });
}
