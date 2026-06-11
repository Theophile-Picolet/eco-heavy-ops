import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');

function readJson(relativePath: string) {
  return JSON.parse(readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log('[ops-api] ' + req.method + ' ' + req.url);
  next();
});
app.use('/assets', express.static(path.join(projectRoot, 'assets'), { maxAge: 0 }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.post('/api/session', (_req, res) => {
  res.json({ token: 'training-session', user: 'eco-learner', expiresIn: 3600 });
});

app.get('/api/dashboard', (_req, res) => {
  const analytics = readJson('data/analytics.json');
  res.json({
    summary: analytics.summary,
    charts: analytics.charts,
    logs: analytics.logs.slice(0, 20),
    generatedAt: new Date().toISOString()
  });
});

app.get('/api/records', (_req, res) => {
  res.json(readJson('data/records.json'));
});

app.get('/api/analytics', (_req, res) => {
  res.json(readJson('data/analytics.json'));
});

app.get('/api/settings', (_req, res) => {
  const analytics = readJson('data/analytics.json');
  res.json(analytics.settings);
});

app.listen(4100, () => {
  console.log('heavy-ops backend running on http://localhost:4100');
});
