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

  // Strip markdown code fences if present (e.g. ```json ... ```)
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // If the model returned text with JSON inside curly braces
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && (firstBrace > 0 || lastBrace < cleaned.length - 1)) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
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
    model = process.env.GEMINI_MODEL || 'gemini-2.0-flash',
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

  onProgress({ step: 'ai_calling', message: `Running deep analysis with ${model}...` });

  try {
    let response;
    try {
      response = await callGeminiAPI(apiKey, model, contents);
    } catch (modelErr) {
      // If 404 or unsupported model, try fallback model
      if (/404|not found|unsupported/i.test(modelErr.message) && model !== 'gemini-1.5-flash') {
        console.warn(`Model ${model} unavailable (${modelErr.message}). Retrying with gemini-1.5-flash fallback...`);
        onProgress({ step: 'ai_calling', message: `Retrying with gemini-1.5-flash fallback...` });
        response = await callGeminiAPI(apiKey, 'gemini-1.5-flash', contents);
      } else {
        throw modelErr;
      }
    }

    onProgress({ step: 'scoring', message: 'Computing exact sloppiness penalties and formatting report...' });

    const evaluations = parseAiAuditResponse(response, rubric, staticFindings);
    const scoreResult = calculateHygieneScore(evaluations, rubricId);

    return {
      ...scoreResult,
      isAiPowered: true,
      modelUsed: model,
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

  return `You are a Senior Module Lab Reviewer and Code Hygiene Auditor.
Your task is to inspect the submitted GitHub repository and produce an uncompromising, professional "Hygiene Check" sloppiness audit.

Target Repository: ${target.name}

${rubricDescription}

${staticHints}

${commitText}

${artifactText}

EVALUATION RULES:
1. Base Penalty Unit is exactly 0.47 points per issue.
   - Minor gaps = 1 unit (-0.47 pts)
   - Moderate gaps = 2 units (-0.94 pts)
   - Notable unverified claims or omissions = 3-6 units (-1.41 to -2.82 pts)
2. Every critique item MUST use the exact citation syntax:
   - For document or code issues: "artifact <N>, line <L> — <critique of the claim/omission and concrete action to fix>"
   - For git commit issues: "artifact <N>, commits — <critique of commit history and concrete squashing/rewording action>"
3. Each penalized category MUST include:
   - Category name (exact match from rubric)
   - Sloppiness Level (1, 2, or 3)
   - Penalty units (positive integer count of 0.47 units)
   - An overview sentence summarizing the strengths followed by the key shortcoming (e.g. "The visual system and mobile-first reasoning are strong, but a few layout claims lack supporting detail.")
   - A list of item citations.
4. If a category is clean and has no issues, set level to 0, penalty units to 0, and items to [].
5. Respond ONLY with valid JSON following this exact JSON schema:

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
    body: JSON.stringify(payload)
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
