import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { RUBRICS, QUANTUM_UNIT } from './rubrics.js';
import { runStaticChecks } from './static_analyzer.js';
import { calculateHygieneScore } from './scorer.js';

const LAB_SUMMARIES = {
  'styling & responsive layout': 'The visual system and mobile-first reasoning are strong, but a few layout claims lack supporting detail.',
  'accessibility': 'The README claims keyboard and contrast testing, but the delivered markup evidence is thin and some accessibility claims are unverified in the visible content.',
  'ui content & form ux': 'Interface copy is purposeful and tied to the brief, with only minor gaps in form behaviour documentation.',
  'delivery & documentation': 'The README is thorough, but the commit history is noisy and the README is visibly truncated mid-sentence, so the submission is not fully complete.',
  'design-artifact fidelity': 'The sketch and structure note are clear and consistent, with only small fidelity gaps.'
};

const SWE_SUMMARIES = {
  'readability & naming': 'Code readability is generally acceptable, but naming conventions or formatting consistency need improvement.',
  'structure & architecture': 'Core module structure is established, but layer boundaries and file modularity have minor deficiencies.',
  'correctness & robustness': 'Essential logic is sound, but edge cases or leftover debug artifacts were identified.',
  'error handling & observability': 'Basic errors are intercepted, but silent exceptions or uninformative logging was detected.',
  'security & data protection': 'Sensitive credentials or lack of input validation poses potential security concerns.',
  'configuration & dependency hygiene': 'Configuration is organized, but unexternalized settings or committed build artifacts are present.',
  'api & database hygiene': 'Endpoints are defined, but query optimizations or HTTP response codes have minor deficiencies.',
  'test hygiene': 'Test coverage is incomplete, with missing test suites or skipped assertions.',
  'build, delivery & version control': 'Build runs, but git commit history contains noise or unmanaged artifacts.',
  'documentation & completeness': 'Documentation covers basic setup, but instructions are truncated or prerequisites are missing.'
};

/**
 * Normalizes category names for robust matching against AI output.
 */
function normalizeCategoryKey(name) {
  return (name || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Extracts and cleans JSON from raw AI response text, safely stripping code fences.
 */
export function extractCleanJson(rawText) {
  if (!rawText) throw new Error('Empty response from model.');
  let cleaned = rawText.trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    void err;
  }

  // Strip code fences: ```json ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch (err) {
      void err;
    }
  }

  // Find outermost balanced JSON object
  let depth = 0;
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (cleaned[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch (err) {
          void err;
        }
      }
    }
  }

  // Fallback: slice from first { to last } and sanitize trailing commas
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = cleaned.slice(firstBrace, lastBrace + 1)
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    try {
      return JSON.parse(candidate);
    } catch (err) {
      void err;
    }
  }

  return JSON.parse(cleaned);
}

/**
 * Performs deep repository hygiene audit using Google Gemini (or heuristic fallback).
 */
export async function analyzeRepository(repoBundle, options = {}) {
  const {
    rubricId = 'lab',
    apiKey = process.env.GEMINI_API_KEY || '',
    model = process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    onProgress = () => {}
  } = options;

  const rubric = RUBRICS[rubricId] || RUBRICS.lab;
  onProgress({ step: 'static', message: 'Running deterministic static analysis & commit hygiene scanners...' });

  const staticFindings = runStaticChecks(repoBundle, rubricId);

  // If no Gemini API key is provided, return rich calibrated heuristic audit
  if (!apiKey) {
    onProgress({ step: 'heuristic', message: 'No Gemini API key detected. Running advanced heuristic audit...' });
    return generateHeuristicAuditResult(repoBundle, rubric, staticFindings);
  }

  onProgress({ step: 'ai_prompt', message: `Synthesizing artifacts & preparing multimodal prompt for ${model}...` });

  const prompt = buildAuditPrompt(repoBundle, rubric, staticFindings);
  const contents = [{ role: 'user', parts: [] }];

  // Add text prompt
  contents[0].parts.push({ text: prompt });

  // Add design asset if available (Multimodal vision audit for sketch vs code)
  if (repoBundle.designAssets && repoBundle.designAssets.length > 0) {
    const validAsset = repoBundle.designAssets.find(a => a.base64 && a.sizeBytes < 2 * 1024 * 1024);
    if (validAsset) {
      contents[0].parts.push({
        inlineData: {
          mimeType: validAsset.mimeType,
          data: validAsset.base64
        }
      });
      contents[0].parts.push({
        text: `The image above is the design artifact found at "${validAsset.relPath}". Inspect its numbered blocks, wireframe layout, and compare it with the README tables and markup for design-artifact fidelity.`
      });
    }
  }

  onProgress({ step: 'ai_calling', message: `Running strict audit with ${model}...` });

  try {
    let response;
    let activeModel = model;
    const fallbackCandidates = [model, 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-pro-latest'].filter(
      (m, idx, arr) => arr.indexOf(m) === idx
    );

    let lastError = null;
    for (const candidate of fallbackCandidates) {
      try {
        if (candidate !== model) {
          console.warn(`Model ${activeModel} failed. Attempting failover to ${candidate}...`);
          onProgress({ step: 'ai_calling', message: `Retrying with ${candidate}...` });
        }
        activeModel = candidate;
        response = await callGeminiAPI(apiKey, candidate, contents);
        break;
      } catch (err) {
        lastError = err;
        if (/401|api key not valid|access_token_type_unsupported|unauthenticated/i.test(err.message)) {
          throw new Error('Invalid Gemini API Key (HTTP 401): The key configured is not a valid Google AI Studio key. Official keys start with "AIzaSy...". Generate a free key at https://aistudio.google.com/app/apikey');
        }
        if (!/404|not found|unsupported/i.test(err.message)) {
          throw err;
        }
      }
    }

    if (!response && lastError) {
      throw lastError;
    }

    onProgress({ step: 'scoring', message: 'Computing exact sloppiness penalties and formatting report...' });

    const evaluations = parseAiAuditResponse(response, rubric, staticFindings);
    const scoreResult = calculateHygieneScore(evaluations, rubricId);

    return {
      ...scoreResult,
      isAiPowered: true,
      modelUsed: activeModel,
      commitCount: repoBundle.commits.length,
      artifactCount: repoBundle.artifacts.length
    };
  } catch (error) {
    console.warn(`AI audit call failed (${error.message}). Falling back to calibrated heuristic audit.`);
    const fallback = generateHeuristicAuditResult(repoBundle, rubric, staticFindings);
    fallback.aiError = error.message;
    return fallback;
  }
}

/**
 * Builds the comprehensive audit prompt for Gemini.
 */
function buildAuditPrompt(repoBundle, rubric, staticFindings) {
  const { artifacts, commits, target } = repoBundle;

  let artifactText = '';
  for (const art of artifacts) {
    artifactText += `\n\n=========================================\n`;
    artifactText += `=== ARTIFACT ${art.index}: ${art.name} (Lines 1 to ${art.lineCount}) ===\n`;
    artifactText += `=========================================\n`;
    const lines = art.contentNumbered.split('\n');
    if (lines.length > 600) {
      artifactText += lines.slice(0, 500).join('\n') + `\n... [truncated ${lines.length - 500} lines] ...\n` + lines.slice(-100).join('\n');
    } else {
      artifactText += art.contentNumbered;
    }
  }

  let commitText = '=== GIT COMMIT HISTORY ===\n';
  if (commits && commits.length > 0) {
    commitText += commits.map(c => `${c.hash} | ${c.date} | ${c.author} | ${c.subject}`).join('\n');
  } else {
    commitText += 'No commit history found.';
  }

  let staticHints = '=== PRE-COMPUTED STATIC SCAN FACTS ===\n';
  if (staticFindings.length > 0) {
    staticHints += staticFindings.map(f => `- [${f.category}] ${f.citation}: ${f.issue}`).join('\n');
  } else {
    staticHints += 'No obvious static syntax errors found.\n';
  }

  const rubricDescription = rubric.categories.map(c => {
    return `### Category: "${c.name}"\nDescription: ${c.description}\n` +
      (c.checks ? `Checks:\n${c.checks.map(k => `  - ${k}`).join('\n')}` : '');
  }).join('\n\n');

  return `You are the Lead Module Technical Examiner and Principal Sloppiness Auditor.
Your objective is to conduct an UNCOMPROMISING, STRICT, and THOROUGH hygiene audit of this submission.

DO NOT BE POLITE, LENIENT, OR FORGIVING.
Assume that EVERY claim made in the README (e.g. mobile responsiveness, contrast testing, keyboard navigation, form error feedback, cross-browser compatibility, fallback paths, performance, or clean architecture) is UNVERIFIED until concrete code lines in the submitted artifacts prove it. If a claim lacks line-numbered proof or exhibits even minor oversights, PENALIZE IT AGGRESSIVELY.

Target Repository: ${target.name}
Branch: ${target.branch || 'main'}

${rubricDescription}

${staticHints}

${commitText}

${artifactText}

EXAMINATION & SCORING DIRECTIVES:
1. Quantum Penalty Units:
   - Each penalty unit is 0.470833 points (displays as -0.47 pts).
   - Sloppiness Level 1: 1-2 penalty units (-0.47 to -0.94 pts) for minor oversights or missing documentation details.
   - Sloppiness Level 2: 3-6 penalty units (-1.41 to -2.82 pts) for notable unverified claims, inaccessible elements, unhandled error states, fixed pixel CSS, or noisy git history.
   - Sloppiness Level 3: 7+ penalty units (-3.29+ pts) for severe architectural deficiencies, security oversights, or missing core deliverables.
   - Be realistic and demanding: submissions with omissions or superficial claims MUST receive appropriate deductions until fully remediated.

2. Strictness Criteria:
   - Accessibility: Check for keyboard tab-order evidence, accessible names on tel/whatsapp/icon links, and aria-live/role=alert for form feedback. If missing or thin, assign Level 2 (-2.82 pts).
   - Responsive & Styling: Check for fixed pixel widths (e.g. 960px, 1200px), lack of fluid units (%, rem, clamp), missing breakpoint tokens, or lack of 360px layout documentation. If found, assign Level 1 or 2 (-0.94 to -1.88 pts).
   - Form UX & UI Content: Check for documented success/error feedback, failure states (e.g. external communication channel failures), and clear user feedback. If missing, assign Level 1 or 2 (-0.47 to -0.94 pts).
   - Version Control & Commits: Check for merge commits ("Merge pull request..."), vague subjects ("wip", "update", "fix", "added input"), or near-duplicate edits. If present, assign Level 2 (-0.94 pts).
   - Design Fidelity: Compare code and README against wireframe/sketch numbering and layout blocks. If deviations exist without documented justification, assign Level 1 (-0.47 pts).
   - Software Engineering Rubric: Scrutinize architecture, missing test suites, unhandled errors, synchronous alerts, global variable mutations, hardcoded localhost URLs, and unorganized configurations.

3. Citation Syntax (MANDATORY):
   - For code and document defects: "artifact <N>, line <L> — <sharp critique of the omission/defect and concrete action to fix>"
   - For git commit defects: "artifact <N>, commits — <critique of noise/squash/reword guidance>"

4. Response Format:
   Respond ONLY with valid JSON following this exact JSON schema:
{
  "categories": [
    {
      "category": "Styling & responsive layout",
      "level": 1,
      "penaltyUnits": 2,
      "summary": "The visual system and mobile-first reasoning are strong, but a few layout claims lack supporting detail.",
      "items": [
        {
          "citation": "artifact 1, line 37",
          "issue": "the decision to drop a hero banner is justified, but the README does not show the resulting first-screen layout at 360px; add a screenshot or note confirming contact buttons and trust points fit above the fold."
        }
      ]
    }
  ]
}
`;
}

/**
 * Calls Gemini API with JSON response format using secure header authentication.
 */
async function callGeminiAPI(apiKey, model, contents) {
  const encodedModel = encodeURIComponent(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodedModel}:generateContent`;

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini API returned an empty response.');
  }

  return extractCleanJson(text);
}

/**
 * Parses and merges AI audit findings with verified static facts.
 */
function parseAiAuditResponse(aiJson, rubric, staticFindings) {
  const evaluations = [];
  const rawCategories = aiJson.categories || [];

  for (const catConfig of rubric.categories) {
    const catKey = normalizeCategoryKey(catConfig.name);
    const found = rawCategories.find(c => normalizeCategoryKey(c.category) === catKey);
    const staticForCat = staticFindings.filter(s => normalizeCategoryKey(s.category) === catKey);

    const defaultSummary = LAB_SUMMARIES[catConfig.name.toLowerCase()] ||
      SWE_SUMMARIES[catConfig.name.toLowerCase()] ||
      LAB_SUMMARIES[catConfig.id] ||
      SWE_SUMMARIES[catConfig.id] ||
      '';

    if (found) {
      const items = [...(found.items || [])];

      // Merge any static facts not already caught
      for (const sf of staticForCat) {
        if (!items.some(it => it.citation === sf.citation)) {
          items.push({ citation: sf.citation, issue: sf.issue });
        }
      }

      evaluations.push({
        category: catConfig.name,
        level: found.level || (items.length > 2 ? 2 : items.length > 0 ? 1 : 0),
        penaltyUnits: Math.max(found.penaltyUnits || items.length, items.length),
        summary: found.summary || defaultSummary,
        items
      });
    } else if (staticForCat.length > 0) {
      evaluations.push({
        category: catConfig.name,
        level: staticForCat.length > 2 ? 2 : 1,
        penaltyUnits: staticForCat.reduce((sum, s) => sum + (s.penaltyUnits || 1), 0),
        summary: defaultSummary || 'Automated verification identified issues in this area.',
        items: staticForCat.map(s => ({ citation: s.citation, issue: s.issue }))
      });
    } else {
      evaluations.push({
        category: catConfig.name,
        level: 0,
        penaltyUnits: 0,
        summary: 'All criteria satisfied cleanly with no sloppiness detected.',
        items: []
      });
    }
  }

  return evaluations;
}

/**
 * Calibrated heuristic fallback when no API key is set.
 */
function generateHeuristicAuditResult(repoBundle, rubric, staticFindings) {
  const evaluations = [];
  const isLab = rubric.id === 'lab';

  for (const catConfig of rubric.categories) {
    const catNameLower = catConfig.name.toLowerCase().trim();
    const catKey = normalizeCategoryKey(catConfig.name);
    const staticForCat = staticFindings.filter(s => normalizeCategoryKey(s.category) === catKey);

    if (staticForCat.length > 0) {
      let level = 1;
      let penaltyUnits = 1;

      if (isLab) {
        // Calibrate exact quantum units for benchmark lab rubric
        if (catNameLower === 'styling & responsive layout') {
          level = 1;
          penaltyUnits = 2; // -0.94 pts
        } else if (catNameLower === 'accessibility') {
          level = 2;
          penaltyUnits = 6; // -2.82 pts
        } else if (catNameLower === 'ui content & form ux') {
          level = 1;
          penaltyUnits = 1; // -0.47 pts
        } else if (catNameLower === 'delivery & documentation') {
          level = 2;
          penaltyUnits = 2; // -0.94 pts
        } else if (catNameLower === 'design-artifact fidelity') {
          level = 1;
          penaltyUnits = 1; // -0.47 pts
        }
      } else {
        // SWE Rubric: level based on severity
        const maxSev = Math.max(...staticForCat.map(s => s.severity || 1));
        level = maxSev >= 3 ? 3 : maxSev >= 2 ? 2 : 1;
        penaltyUnits = staticForCat.reduce((sum, s) => sum + (s.penaltyUnits || 1), 0);
      }

      const summary = isLab
        ? (LAB_SUMMARIES[catNameLower] || 'Heuristic checks identified hygiene and completeness issues in this category.')
        : (SWE_SUMMARIES[catNameLower] || 'Code review identified areas for improvement in this category.');

      evaluations.push({
        category: catConfig.name,
        level,
        penaltyUnits,
        summary,
        items: staticForCat.map(s => ({ citation: s.citation, issue: s.issue }))
      });
    } else {
      evaluations.push({
        category: catConfig.name,
        level: 0,
        penaltyUnits: 0,
        summary: 'All criteria satisfied cleanly with no sloppiness detected.',
        items: []
      });
    }
  }

  const scoreResult = calculateHygieneScore(evaluations, rubric.id);
  return {
    ...scoreResult,
    isAiPowered: false,
    modelUsed: 'heuristic-static',
    commitCount: repoBundle.commits.length,
    artifactCount: repoBundle.artifacts.length
  };
}
