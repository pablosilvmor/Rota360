import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Solusat Proxy Route
  app.get("/api/proxy/solusat/vehicles", async (req, res) => {
    const apiBase = "https://ws.solusat.com.br/espelho/full/vehicles";
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
          "apiToken": apiToken
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

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
