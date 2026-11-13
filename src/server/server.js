import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { ingestRepository } from '../core/ingestor.js';
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

// API: Get Rubrics
app.get('/api/rubrics', (req, res) => {
  res.json({
    rubrics: Object.values(RUBRICS)
  });
});

// API: Get Config / Status
app.get('/api/config', (req, res) => {
  const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 5);
  res.json({
    hasGeminiKey: hasKey,
    defaultModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash'
  });
});

// API: Save Config (.env)
app.post('/api/config', (req, res) => {
  const { apiKey, model } = req.body;
  if (apiKey) {
    process.env.GEMINI_API_KEY = apiKey.trim();
  }
  if (model) {
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

  res.json({
    success: true,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY)
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
app.post('/api/check', async (req, res) => {
  const { repoUrl, rubricId = 'lab', apiKey, model = 'gemini-2.0-flash' } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ error: 'Repository URL is required.' });
  }

  try {
    const keyToUse = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
    const repoBundle = ingestRepository(repoUrl);

    const result = await analyzeRepository(repoBundle, {
      rubricId,
      apiKey: keyToUse,
      model
    });

    res.json({
      success: true,
      repo: repoBundle.target.name,
      commitCount: repoBundle.commits.length,
      latestCommit: repoBundle.commits[0] || null,
      artifacts: serializeArtifacts(repoBundle.artifacts),
      result
    });
  } catch (error) {
    console.error('Error in /api/check:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to inspect repository.'
    });
  }
});

// API: Re-check Repository (With Diff against previous run)
app.post('/api/recheck', async (req, res) => {
  const { repoUrl, rubricId = 'lab', apiKey, model = 'gemini-2.0-flash', previousResult } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ error: 'Repository URL is required.' });
  }

  try {
    const keyToUse = (apiKey && apiKey.trim()) || process.env.GEMINI_API_KEY || '';
    const repoBundle = ingestRepository(repoUrl);

    const currentResult = await analyzeRepository(repoBundle, {
      rubricId,
      apiKey: keyToUse,
      model
    });

    const diff = previousResult ? compareHygieneRuns(previousResult, currentResult) : null;

    res.json({
      success: true,
      repo: repoBundle.target.name,
      commitCount: repoBundle.commits.length,
      latestCommit: repoBundle.commits[0] || null,
      artifacts: serializeArtifacts(repoBundle.artifacts),
      result: currentResult,
      diff
    });
  } catch (error) {
    console.error('Error in /api/recheck:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to re-check repository.'
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Hygiene Checker server running on http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});
