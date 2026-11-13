import { RUBRICS, QUANTUM_UNIT } from './rubrics.js';
import { runStaticChecks } from './static_analyzer.js';
import { calculateHygieneScore } from './scorer.js';

/**
 * Performs deep repository hygiene audit using Google Gemini (or heuristic fallback).
 */
export async function analyzeRepository(repoBundle, options = {}) {
  const {
    rubricId = 'lab',
    apiKey = process.env.GEMINI_API_KEY || '',
    model = 'gemini-2.5-flash',
    onProgress = () => {}
  } = options;

  const rubric = RUBRICS[rubricId] || RUBRICS.lab;
  onProgress({ step: 'static', message: 'Running deterministic static analysis & commit hygiene scanners...' });

  const staticFindings = runStaticChecks(repoBundle, rubricId);

  // If no Gemini API key is provided, return rich static/heuristic audit with a recommendation notice
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
    const response = await callGeminiAPI(apiKey, model, contents);
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
    console.warn(`AI audit call failed (${error.message}). Falling back to static heuristic audit.`);
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
    // Include numbered lines (cap at 600 lines per file if huge to keep fast)
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
 * Calls Gemini API with JSON response format.
 */
async function callGeminiAPI(apiKey, model, contents) {
  // Use v1beta endpoint for gemini models
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json'
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

  return JSON.parse(text);
}

/**
 * Parses and merges AI audit findings with verified static facts.
 */
function parseAiAuditResponse(aiJson, rubric, staticFindings) {
  const evaluations = [];
  const rawCategories = aiJson.categories || [];

  for (const catConfig of rubric.categories) {
    const found = rawCategories.find(c => c.category.toLowerCase().trim() === catConfig.name.toLowerCase().trim());
    const staticForCat = staticFindings.filter(s => s.category.toLowerCase().trim() === catConfig.name.toLowerCase().trim());

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
        summary: found.summary || '',
        items
      });
    } else if (staticForCat.length > 0) {
      evaluations.push({
        category: catConfig.name,
        level: staticForCat.length > 2 ? 2 : 1,
        penaltyUnits: staticForCat.reduce((sum, s) => sum + (s.penaltyUnits || 1), 0),
        summary: 'Automated verification identified issues in delivery and specifications.',
        items: staticForCat.map(s => ({ citation: s.citation, issue: s.issue }))
      });
    } else {
      evaluations.push({
        category: catConfig.name,
        level: 0,
        penaltyUnits: 0,
        summary: 'No sloppiness detected in this area.',
        items: []
      });
    }
  }

  return evaluations;
}

/**
 * Heuristic fallback when no API key is set.
 */
function generateHeuristicAuditResult(repoBundle, rubric, staticFindings) {
  const evaluations = [];

  for (const catConfig of rubric.categories) {
    const staticForCat = staticFindings.filter(s => s.category.toLowerCase().trim() === catConfig.name.toLowerCase().trim());

    if (staticForCat.length > 0) {
      evaluations.push({
        category: catConfig.name,
        level: staticForCat.length > 2 ? 2 : 1,
        penaltyUnits: staticForCat.reduce((sum, s) => sum + (s.penaltyUnits || 1), 0),
        summary: 'Heuristic checks identified hygiene and completeness issues in this category.',
        items: staticForCat.map(s => ({ citation: s.citation, issue: s.issue }))
      });
    } else {
      evaluations.push({
        category: catConfig.name,
        level: 0,
        penaltyUnits: 0,
        summary: 'Heuristic checks found no obvious formatting or structural omissions.',
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
