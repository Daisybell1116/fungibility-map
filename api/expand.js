export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

const { system, prompt } = req.body || {};
  if (!prompt) {
    res.status(400).json({ error: "Missing prompt" });
    return;
  }

try {
  const response = await fetch("https://ai-gateway.vercel.sh/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    res.status(response.status).json({ error: data });
    return;
  }
  res.status(200).json(data);
} catch (err) {
  res.status(500).json({ error: String(err) });
}
}
