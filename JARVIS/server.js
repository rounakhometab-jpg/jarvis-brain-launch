import "dotenv/config";

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { GoogleGenAI } from "@google/genai";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --------------------------------------------------
// JARVIS - Google Gemini Backend
// Compatible with Render deployment
// --------------------------------------------------

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const ENABLE_WEB_SEARCH =
  process.env.ENABLE_WEB_SEARCH === "true";

// Initialize Gemini only when the API key exists.
const ai = GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
  : null;

// --------------------------------------------------
// Middleware
// --------------------------------------------------

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "20kb" }));

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: "Too many requests. Please try again in a minute.",
    },
  })
);

// Serve index.html, style.css and script.js from public/
app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------
// JARVIS personality and modes
// --------------------------------------------------

const DEFAULT_MODE = "general";

const MODES = {
  general: "You are JARVIS, a helpful, intelligent AI assistant. Be clear, practical, accurate, and friendly.",

  assistant: "You are JARVIS, a professional personal assistant. Help with planning, organizing, reminders, and everyday tasks.",

  coding: "You are JARVIS, an expert software engineer. Explain code clearly and provide correct, secure, practical solutions.",

  teacher: "You are JARVIS, a patient teacher. Explain concepts step by step using simple language and examples.",

  study: "You are JARVIS, a study assistant. Help the user understand subjects, prepare notes, and practice concepts.",

  writer: "You are JARVIS, a professional writer. Produce clear, polished writing suited to the user's requested purpose.",

  creative: "You are JARVIS, a creative partner. Help brainstorm original ideas, stories, designs, and projects.",

  business: "You are JARVIS, a business assistant. Help with business planning, productivity, customer communication, and analysis.",

  science: "You are JARVIS, a science assistant. Explain scientific topics accurately and distinguish established facts from uncertainty.",

  math: "You are JARVIS, a mathematics tutor. Solve problems carefully and explain the steps.",

  translator: "You are JARVIS, a translation assistant. Translate naturally while preserving the original meaning and tone.",

  hindi: "You are JARVIS. Prefer natural Hindi or Hinglish, matching the language used by the user.",

  english: "You are JARVIS, an English language assistant. Help with grammar, vocabulary, writing, and communication.",

  research: "You are JARVIS, a research assistant. Give structured, evidence-conscious answers and identify uncertainty.",

  analyst: "You are JARVIS, an analytical assistant. Break problems into parts, compare options, and explain conclusions.",

  career: "You are JARVIS, a career assistant. Help with resumes, interviews, professional development, and job planning.",

  fitness: "You are JARVIS, a general fitness assistant. Offer sensible exercise and wellness information without pretending to diagnose medical conditions.",

  cooking: "You are JARVIS, a cooking assistant. Give practical recipes, ingredient substitutions, and clear cooking instructions.",

  travel: "You are JARVIS, a travel planning assistant. Help with itineraries, budgets, packing, and destination planning. Verify current details when possible.",

  motivation: "You are JARVIS, an encouraging and realistic coach. Help users turn goals into manageable actions.",

  interview: "You are JARVIS, an interview coach. Provide practice questions, sample answers, and constructive feedback.",

  security: "You are JARVIS, a cybersecurity education assistant. Emphasize defensive, lawful, and responsible security practices.",

  data: "You are JARVIS, a data analysis assistant. Help interpret data, explain statistics, and suggest suitable analysis methods.",

  product: "You are JARVIS, a product planning assistant. Help compare requirements, prioritize features, and improve user experience.",

  marketing: "You are JARVIS, a marketing assistant. Help with ethical marketing strategy, audience research, and promotional copy.",

  legal: "You are JARVIS, a legal information assistant. Provide general information, clarify uncertainty, and recommend qualified legal advice for specific cases.",

  health: "You are JARVIS, a health information assistant. Provide general educational information, avoid diagnosis, and recommend professional medical care when appropriate.",

  finance: "You are JARVIS, a financial education assistant. Explain financial concepts and risks without guaranteeing returns or pretending to provide personalized professional advice.",

  concise: "You are JARVIS. Answer directly and concisely, prioritizing the most useful information.",

  detailed: "You are JARVIS. Give comprehensive, well-organized answers with examples and step-by-step explanations when helpful.",
};

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "online",
    app: "JARVIS",
    provider: "Google Gemini",
    model: GEMINI_MODEL,
    configured: Boolean(GEMINI_API_KEY),
    webSearchEnabled: ENABLE_WEB_SEARCH,
    modes: Object.keys(MODES).length,
  });
});

// --------------------------------------------------
// Available modes
// --------------------------------------------------

app.get("/api/modes", (req, res) => {
  res.json({
    success: true,
    modes: Object.keys(MODES),
    defaultMode: DEFAULT_MODE,
  });
});

// --------------------------------------------------
// Chat endpoint
// --------------------------------------------------

app.post("/api/chat", async (req, res) => {
  try {
    if (!ai) {
      return res.status(503).json({
        success: false,
        error:
          "Gemini API key is missing. Add GEMINI_API_KEY in Render Environment settings.",
      });
    }

    const { message, mode = DEFAULT_MODE, history = [] } =
      req.body ?? {};

    // Validate user message.
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please enter a message.",
      });
    }

    if (message.length > 12000) {
      return res.status(400).json({
        success: false,
        error: "Message is too long. Maximum length is 12000 characters.",
      });
    }

    // Choose a known mode; unknown modes use general.
    const selectedMode =
      typeof mode === "string" && MODES[mode]
        ? mode
        : DEFAULT_MODE;

    const systemInstruction = MODES[selectedMode];

    // Accept only a limited amount of valid chat history.
    const safeHistory = Array.isArray(history)
      ? history
          .filter(
            (item) =>
              item &&
              ["user", "model"].includes(item.role) &&
              typeof item.text === "string"
          )
          .slice(-10)
          .map((item) => ({
            role: item.role,
            parts: [{ text: item.text.slice(0, 4000) }],
          }))
      : [];

    const contents = [
      ...safeHistory,
      {
        role: "user",
        parts: [{ text: message.trim() }],
      },
    ];

    const generationConfig = {
      model: GEMINI_MODEL,
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 2048,
      },
    };

    // Optional Google Search grounding.
    if (ENABLE_WEB_SEARCH) {
      generationConfig.config.tools = [{ googleSearch: {} }];
    }

    const result = await ai.models.generateContent(generationConfig);

    const reply = result.text;

    if (typeof reply !== "string" || !reply.trim()) {
      console.error("Gemini returned an empty response.");

      return res.status(502).json({
        success: false,
        error: "Gemini returned an empty response. Please try again.",
      });
    }

    return res.status(200).json({
      success: true,
      provider: "Google Gemini",
      model: GEMINI_MODEL,
      mode: selectedMode,
      reply: reply.trim(),
    });
  } catch (error) {
    // Log the technical error on the server, not secret credentials.
    console.error("JARVIS Gemini API error:", {
      message: error?.message,
      status: error?.status,
    });

    const status = Number(error?.status);

    if (status === 429) {
      return res.status(429).json({
        success: false,
        error: "Gemini request limit reached. Please wait and try again.",
      });
    }

    if (status === 401 || status === 403) {
      return res.status(502).json({
        success: false,
        error: "Gemini API key is invalid or does not have permission.",
      });
    }

    return res.status(500).json({
      success: false,
      error: "JARVIS could not complete the request. Please try again.",
    });
  }
});

// --------------------------------------------------
// Frontend fallback
// --------------------------------------------------

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------------------------------------
// Handle unknown API routes
// --------------------------------------------------

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint not found.",
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(`J.A.R.V.I.S. running on port ${PORT}`);
  console.log(`Gemini model: ${GEMINI_MODEL}`);
  console.log(`Gemini API configured: ${Boolean(GEMINI_API_KEY)}`);
});
