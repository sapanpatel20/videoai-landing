export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase not configured. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel env vars.' });
  }

  const { name, email, business, type, plan } = req.body;

  if (!name || !email || !type) {
    return res.status(400).json({ error: 'Name, email and business type are required.' });
  }

  try {
    // Insert into Supabase waitlist table
    const response = await fetch(`${supabaseUrl}/rest/v1/waitlist`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ name, email, business, type, plan })
    });

    if (!response.ok) {
      const errBody = await response.text();
      // Handle duplicate email gracefully
      if (response.status === 409 || errBody.includes('duplicate')) {
        return res.status(200).json({ success: true, duplicate: true, message: 'Already on the waitlist!' });
      }
      return res.status(response.status).json({ error: 'Database error', detail: errBody });
    }

    // Get total count for waitlist position
    const countRes = await fetch(`${supabaseUrl}/rest/v1/waitlist?select=id`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'count=exact'
      }
    });

    const count = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0');

    return res.status(200).json({ success: true, position: count });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
