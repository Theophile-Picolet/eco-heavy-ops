import cors from "cors";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), "utf8"));
}

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const acceptEncoding = req.headers["accept-encoding"] || "";
  const originalJson = res.json;

  res.json = function (data) {
    const jsonStr = JSON.stringify(data);
    let compressed: Buffer | undefined;

    if (acceptEncoding.includes("br")) {
      compressed = zlib.brotliCompressSync(jsonStr, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 },
      });
      res.setHeader("Content-Encoding", "br");
    } else if (acceptEncoding.includes("gzip")) {
      compressed = zlib.gzipSync(jsonStr, { level: 6 });
      res.setHeader("Content-Encoding", "gzip");
    }

    if (compressed) {
      res.setHeader("Content-Length", compressed.length);
      return res.end(compressed);
    }

    res.setHeader("Content-Length", jsonStr.length);
    return res.end(jsonStr);
  } as typeof originalJson;

  next();
});

app.use((req, _res, next) => {
  console.log("[ops-api] " + req.method + " " + req.url);
  next();
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  "/assets",
  express.static(path.join(projectRoot, "frontend", "dist", "assets"), {
    maxAge: 86400000,
    etag: true,
  }),
);

app.use(express.static(path.join(projectRoot, "frontend", "dist")));

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    const isSession = req.method === "POST" && req.path === "/api/session";
    const isStaticData = [
      "/api/records",
      "/api/settings",
      "/api/analytics",
    ].includes(req.path);

    if (isSession) {
      res.setHeader("Cache-Control", "no-store");
    } else if (isStaticData) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=300, must-revalidate");
    }
  }
  next();
});

app.post("/api/session", (_req, res) => {
  res.json({ token: "training-session", user: "eco-learner", expiresIn: 3600 });
});

app.get("/api/dashboard", (_req, res) => {
  const analytics = readJson("data/analytics.json");
  res.json({
    summary: analytics.summary,
    charts: analytics.charts,
    logs: analytics.logs.slice(0, 20),
    generatedAt: new Date().toISOString(),
  });
});

app.get("/api/records", (_req, res) => {
  res.json(readJson("data/records.json"));
});

app.get("/api/analytics", (_req, res) => {
  res.json(readJson("data/analytics.json"));
});

app.get("/api/settings", (_req, res) => {
  const analytics = readJson("data/analytics.json");
  res.json(analytics.settings);
});

app.get("/api/meta", (_req, res) => {
  const pages = {
    "/": {
      title: "Heavy Ops Dashboard",
      description: "Supervision centralisée des opérations, flux et arbitrages en temps réel",
      keywords: "dashboard, supervision, opérations",
    },
    "/table": {
      title: "File Active - Heavy Ops",
      description: "Gestion détaillée des dossiers, historique et suivi par équipe",
      keywords: "dossiers, file, suivi",
    },
    "/analytics": {
      title: "Analyse & Tendances - Heavy Ops",
      description: "Tendances des flux, charge des équipes et signaux critiques",
      keywords: "analytics, tendances, charges",
    },
    "/settings": {
      title: "Paramètres - Heavy Ops",
      description: "Configuration du poste de supervision et des widgets",
      keywords: "settings, configuration, préférences",
    },
  };

  res.json(pages);
});

app.listen(4100, () => {
  console.log("heavy-ops backend running on http://localhost:4100");
});
