import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json({ limit: "50mb" }));

// API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// AI Chat Route
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    // Configura o AI para atuar como assistente do Rota 360
    const systemInstruction = "Você é um assistente virtual especialista no sistema Rota 360 (desenvolvido por Bemon Engenharia e Montagens Ltda). O Rota 360 é um sistema de Gestão de Frota, com funcionalidades de Painel, Frota (cadastro de veículos), Inspeções, Checklist, Combustível, Rastreamento, Relatórios, Motoristas, AutoAlerta e Central de Cadastros. Seja prestativo, educado, forneça respostas em português do Brasil e ajude o usuário com suas dúvidas de forma detalhada sobre os processos do sistema Rota 360. Seja minimalista mas claro.";

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: message,
      config: {
        systemInstruction,
      }
    });

    res.json({ response: response.text });
  } catch (error) {
    console.error("[AI CHAT] Error:", error);
    res.status(500).json({ error: "Falha ao comunicar com a inteligência artificial." });
  }
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

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      console.log(`[SOLUSAT PROXY] Solusat Response Status: ${response.status}, API Data Status: ${data.status}`);
      res.json(data);
    } catch (e) {
      console.error("[SOLUSAT PROXY] Error parsing JSON. Raw response snippet:", text.substring(0, 200));
      res.status(502).json({ error: "Invalid JSON from Solusat API", raw: text.substring(0, 100) });
    }
  } catch (error) {
    console.error("[SOLUSAT PROXY] Fatal Error:", error);
    res.status(500).json({ error: "Failed to fetch from Solusat" });
  }
});

export default app;
