/**
 * api/trends.js — TikTok trending scraper + Claude rewrite
 *
 * POST ?action=scrape  { niche, count }
 *   Phase 1: starts Apify run, returns { runId }
 *   Phase 2: ?action=poll { runId } → returns results or { status:'running' }
 *
 * POST ?action=rewrite { trendingText, niche, platform, tone, cta, audience }
 */
export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const action = req.query.action || req.body?.action;

  // ── Phase 1: Start Apify run ──────────────────────────
  if (action === 'scrape') {
    const apiKey = process.env.APIFY_API_KEY;
    if (!apiKey) return res.status(500).json({
      error: 'APIFY_API_KEY not set. Go to Vercel → Project → Settings → Environment Variables → add APIFY_API_KEY'
    });

    const { niche = 'business tips', count = 8 } = req.body;

    // Build hashtag list from niche phrase — no # symbol, no spaces
    const words = niche.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(Boolean);
    const hashtags = [
      ...new Set([
        words.join(''),
        words[0],
        words.join('') + 'tips',
        words[0] + 'marketing',
        words.slice(0, 2).join(''),
      ])
    ].slice(0, 4);

    try {
      // Start the run asynchronously — returns immediately with runId
      const r = await fetch(
        `https://api.apify.com/v2/acts/clockworks~tiktok-hashtag-scraper/runs?token=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hashtags,
            resultsPerPage: Math.min(count * 2, 20),
            maxProfilesPerQuery: 2,
            shouldDownloadVideos: false,
            shouldDownloadCovers: false,
            shouldDownloadSubtitles: false,
            shouldDownloadSlideshowImages: false,
          }),
        }
      );

      if (!r.ok) {
        const txt = await r.text();
        return res.status(r.status).json({ error: `Apify error ${r.status}: ${txt}` });
      }

      const data = await r.json();
      const runId = data?.data?.id;
      if (!runId) return res.status(500).json({ error: 'Apify did not return a run ID' });

      return res.status(200).json({ runId, status: 'running', hashtags });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Phase 2: Poll run status + fetch results ──────────
  if (action === 'poll') {
    const apiKey = process.env.APIFY_API_KEY;
    const { runId, count = 8 } = req.body;
    if (!runId) return res.status(400).json({ error: 'runId required' });

    try {
      // Check run status
      const statusR = await fetch(
        `https://api.apify.com/v2/acts/clockworks~tiktok-hashtag-scraper/runs/${runId}?token=${apiKey}`
      );
      const statusData = await statusR.json();
      const runStatus = statusData?.data?.status;

      if (runStatus === 'RUNNING' || runStatus === 'READY') {
        return res.status(200).json({ status: 'running' });
      }

      if (runStatus !== 'SUCCEEDED') {
        return res.status(200).json({ status: 'failed', error: `Run ${runStatus}` });
      }

      // Fetch dataset items
      const datasetId = statusData?.data?.defaultDatasetId;
      const itemsR = await fetch(
        `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=${count * 3}&format=json`
      );
      const raw = await itemsR.json();

      const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n);

      const videos = (Array.isArray(raw) ? raw : [])
        .filter(i => i.text && (i.playCount || i.videoPlayCount) > 500)
        .sort((a, b) => ((b.playCount || b.videoPlayCount || 0) - (a.playCount || a.videoPlayCount || 0)))
        .slice(0, count)
        .map(item => {
          const text = (item.text || item.desc || '').replace(/\n+/g, ' ').trim();
          const hEnd = text.search(/[.!?]/);
          const hook = hEnd > 10 && hEnd < 120 ? text.slice(0, hEnd + 1) : text.slice(0, 100) + (text.length > 100 ? '...' : '');
          const plays = item.playCount || item.videoPlayCount || 0;
          const likes = item.diggCount || item.likeCount || 0;
          return {
            id: item.id || item.videoId || Math.random().toString(36).slice(2),
            hook,
            fullText: text.slice(0, 500),
            title: text.slice(0, 80),
            views: fmt(plays),
            likes: fmt(likes),
            comments: fmt(item.commentCount || 0),
            thumbnail: item.covers?.default || item.coverUrl || item.thumbnail || '',
            url: item.webVideoUrl || item.videoUrl || '',
            author: item.authorMeta?.name || item.author?.uniqueId || 'creator',
            duration: item.videoMeta?.duration || item.duration || 30,
          };
        });

      return res.status(200).json({ status: 'done', videos });

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Claude rewrite ────────────────────────────────────
  if (action === 'rewrite') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
    const {
      trendingText = '', niche = 'business', platform = 'Instagram Reels',
      tone = 'Professional', cta = 'Book a free consultation', audience = 'local business owners'
    } = req.body;
    if (!trendingText) return res.status(400).json({ error: 'trendingText required' });

    const prompt = `You are a viral short-form video script writer for ${niche}.

A trending TikTok has this script:
---
${trendingText.slice(0, 600)}
---

Rewrite as a UNIQUE script for a ${niche} business on ${platform}. Target: ${audience}. Tone: ${tone}. Duration: 30 seconds. CTA: "${cta}". Do NOT copy phrases. Make the hook stop the scroll.

Return ONLY:

[HOOK]
One attention-grabbing opening line

[BODY]
3-4 short punchy points

[CTA]
${cta}

[CAPTION]
Short video overlay text

[HASHTAGS]
5 hashtags comma separated`;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!r.ok) return res.status(r.status).json({ error: await r.text() });
      const data = await r.json();
      return res.status(200).json({ script: data.content?.[0]?.text || '' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'action must be scrape, poll, or rewrite' });
}
