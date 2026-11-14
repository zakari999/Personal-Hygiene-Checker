import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { ingestRepository, listRepositoryBranches } from '../core/ingestor.js';
import { analyzeRepository } from '../core/ai_analyzer.js';
import { compareHygieneRuns } from '../core/scorer.js';
import { RUBRICS } from '../core/rubrics.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
const envPath = path.join(projectRoot, '.env');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(projectRoot, 'public')));

// Serve test fixtures for local testing/sketches
app.use('/fixtures', express.static(path.join(projectRoot, 'test/fixtures')));

// API: Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API: Get Rubrics
app.get('/api/rubrics', (req, res) => {
  res.json({
    rubrics: Object.values(RUBRICS)
  });
});

// API: Get Config / Status
app.get('/api/config', (req, res) => {
  const rawKey = (process.env.GEMINI_API_KEY || '').trim();
  const hasKey = Boolean(rawKey && rawKey.length > 5);
  // Accept standard Google AI Studio keys (AIzaSy...) and Google developer keys (AQ.Ab... or length >= 15)
  const isValidFormat = Boolean(hasKey && rawKey.length >= 15);
  res.json({
    hasGeminiKey: hasKey,
    isValidKeyFormat: isValidFormat,
    keyHint: hasKey ? `${rawKey.slice(0, 6)}...${rawKey.slice(-4)}` : '',
    defaultModel: process.env.GEMINI_MODEL || 'gemini-3-flash-preview'
  });
});

// API: List Remote or Local Branches
app.get('/api/branches', (req, res) => {
  const repoUrl = req.query.repo;
  if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
    return res.status(400).json({ success: false, error: 'repo query param is required.' });
  }

  try {
    const data = listRepositoryBranches(repoUrl.trim());
    res.json({
      success: true,
      ...data
    });
  } catch (err) {
    res.json({
      success: true,
      branches: ['main'],
      defaultBranch: 'main'
    });
  }
});

// API: Save Config (.env)
app.post('/api/config', (req, res) => {
  const { apiKey, model } = req.body || {};
  if (apiKey && typeof apiKey === 'string') {
    process.env.GEMINI_API_KEY = apiKey.trim();
  }
  if (model && typeof model === 'string') {
    process.env.GEMINI_MODEL = model.trim();
  }

  try {
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf-8');
    }

    if (apiKey) {
      if (/GEMINI_API_KEY=/.test(envContent)) {
        envContent = envContent.replace(/GEMINI_API_KEY=.*/, `GEMINI_API_KEY=${apiKey.trim()}`);
      } else {
        envContent += `\nGEMINI_API_KEY=${apiKey.trim()}`;
      }
    }

    if (model) {
      if (/GEMINI_MODEL=/.test(envContent)) {
        envContent = envContent.replace(/GEMINI_MODEL=.*/, `GEMINI_MODEL=${model.trim()}`);
      } else {
        envContent += `\nGEMINI_MODEL=${model.trim()}`;
      }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n');
  } catch (err) {
    console.warn('Could not persist to .env:', err.message);
  }

  const rawKey = (process.env.GEMINI_API_KEY || '').trim();
  res.json({
    success: true,
    hasGeminiKey: Boolean(rawKey && rawKey.length > 5),
    isValidKeyFormat: Boolean(rawKey && rawKey.length >= 15)
  });
});

// Helper to sanitize artifacts for client-side citation viewer
function serializeArtifacts(artifacts = []) {
  return artifacts.map(art => ({
    index: art.index,
    name: art.name,
    lineCount: art.lineCount,
    lines: (art.rawContent || '').split(/\r?\n/)
  }));
}

// API: Run Repository Hygiene Check
app.post('/api/check', async (req, res, next) => {
  const { repoUrl, branch, rubricId = 'lab', apiKey, model = 'gemini-3-flash-preview' } = req.body || {};

  if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
    return res.status(400).json({ success: false, error: 'Repository URL or local path is required.' });
  }

  const validRubrics = ['lab', 'swe'];
  const safeRubricId = validRubrics.includes(rubricId) ? rubricId : 'lab';

  try {
    const keyToUse = (apiKey && typeof apiKey === 'string' && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
    const repoBundle = ingestRepository(repoUrl.trim(), branch ? branch.trim() : null);

    const result = await analyzeRepository(repoBundle, {
      rubricId: safeRubricId,
      apiKey: keyToUse,
      model: typeof model === 'string' ? model.trim() : 'gemini-3-flash-preview'
    });

    res.json({
      success: true,
      repo: repoBundle.target.name,
      branch: repoBundle.target.branch || 'main',
      commitCount: repoBundle.commits.length,
      latestCommit: repoBundle.commits[0] || null,
      artifacts: serializeArtifacts(repoBundle.artifacts),
      commits: repoBundle.commits,
      result
    });
  } catch (error) {
    next(error);
  }
});

// API: Re-check Repository (With Diff against previous run)
app.post('/api/recheck', async (req, res, next) => {
  const { repoUrl, branch, rubricId = 'lab', apiKey, model = 'gemini-3-flash-preview', previousResult } = req.body || {};

  if (!repoUrl || typeof repoUrl !== 'string' || !repoUrl.trim()) {
    return res.status(400).json({ success: false, error: 'Repository URL or local path is required.' });
  }

  const validRubrics = ['lab', 'swe'];
  const safeRubricId = validRubrics.includes(rubricId) ? rubricId : 'lab';

  try {
    const keyToUse = (apiKey && typeof apiKey === 'string' && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
    const repoBundle = ingestRepository(repoUrl.trim(), branch ? branch.trim() : null);

    const currentResult = await analyzeRepository(repoBundle, {
      rubricId: safeRubricId,
      apiKey: keyToUse,
      model: typeof model === 'string' ? model.trim() : 'gemini-3-flash-preview'
    });

    const diff = previousResult ? compareHygieneRuns(previousResult, currentResult) : null;

    res.json({
      success: true,
      repo: repoBundle.target.name,
      branch: repoBundle.target.branch || 'main',
      commitCount: repoBundle.commits.length,
      latestCommit: repoBundle.commits[0] || null,
      artifacts: serializeArtifacts(repoBundle.artifacts),
      commits: repoBundle.commits,
      result: currentResult,
      diff
    });
  } catch (error) {
    next(error);
  }
});

// Global Express Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error occurred.'
  });
});

let server = null;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 Hygiene Checker server running on http://localhost:${PORT}`);
    console.log(`==================================================\n`);
  });
}

export { app, server };
