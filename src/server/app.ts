import express from "express";

const app = express();
app.use(express.json({ limit: "50mb" }));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Solusat Proxy Route
app.get("/api/proxy/solusat/vehicles", async (req, res) => {
  let apiBase = "https://ws.solusat.com.br/espelho/full/vehicles";
  
  // Forward query params to avoid Solusat caching
  const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
  if (queryString) {
    apiBase += `?${queryString}`;
  }

  try {
    const apiKey = req.headers['apikey'] as string;
    const apiToken = req.headers['apitoken'] as string;

    if (!apiKey || !apiToken) {
      console.warn("[SOLUSAT PROXY] Missing headers");
      return res.status(400).json({ error: "apiKey and apiToken headers are required" });
    }

    console.log(`[SOLUSAT PROXY] Fetching: ${apiBase} (Key: ${apiKey.substring(0, 4)}...)`);
    const response = await fetch(apiBase, {
      method: "GET",
      headers: {
        "apiKey": apiKey,
        "apiToken": apiToken,
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      }
    });

    const data = await response.json();
    console.log(`[SOLUSAT PROXY] Solusat Response Status: ${response.status}, API Data Status: ${data.status}`);
    res.json(data);
  } catch (error) {
    console.error("[SOLUSAT PROXY] Fatal Error:", error);
    res.status(500).json({ error: "Failed to fetch from Solusat" });
  }
});

export default app;
