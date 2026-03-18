export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const { projectId } = req.body || {};
    if (!projectId) return res.status(400).json({ ok: false, error: "projectId required" });

    // Starter: return queued job id.
    // Next step: call Creatomate API here and return real render ID.
    const renderJobId = `rnd_${Date.now()}`;

    return res.status(200).json({
      ok: true,
      projectId,
      renderJobId,
      status: "queued"
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
