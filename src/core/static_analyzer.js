/**
 * Deterministic static analyzers and heuristic linters.
 * Provides grounded, fact-based findings on commit history, documentation,
 * accessibility markup, responsive styling, and design references.
 */

export function runStaticChecks(repoBundle, rubricId = 'lab') {
  const findings = [];
  const { commits, artifacts, designAssets, fileTree } = repoBundle;
  const primaryReadme = artifacts.find(a => a.isPrimaryReport) || artifacts[0];

  // ==========================================
  // 1. Commit Log Hygiene Checks
  // ==========================================
  if (commits && commits.length > 0) {
    const subjects = commits.map(c => c.subject.trim());

    // Detect near-duplicate README edits
    const readmeEditPatterns = [/readme\s*edit/i, /readme\s*diagnosis/i, /revise\s*.*readme/i, /update\s*readme/i, /fix\s*readme/i];
    const matchingCommits = subjects.filter(s => readmeEditPatterns.some(p => p.test(s)));

    if (matchingCommits.length >= 2) {
      findings.push({
        category: rubricId === 'lab' ? 'Delivery & documentation' : 'build, delivery & version control',
        citation: 'artifact 1, commits',
        issue: `many near-duplicate README edits (${matchingCommits.slice(0, 4).map(s => `“${s}”`).join(', ')}) should be squashed or given descriptive subjects so history reads cleanly.`,
        severity: 2,
        penaltyUnits: 1
      });
    }

    // Detect vague subjects without imperative verbs or scopes
    const vaguePatterns = [
      /^(added|adding|updated|updating|changed|changing|description|edit|fixes|fixed|done|wip|temp)\b/i,
      /^description in readme$/i,
      /^added visual system$/i,
      /^why riders trust wheelhouse$/i,
      /^readme edit$/i,
      /^fix$/i,
      /^update$/i
    ];

    const vagueCommits = subjects.filter(s => vaguePatterns.some(p => p.test(s)) && !s.includes(':'));
    if (vagueCommits.length > 0) {
      findings.push({
        category: rubricId === 'lab' ? 'Delivery & documentation' : 'build, delivery & version control',
        citation: 'artifact 1, commits',
        issue: `vague subjects like ${vagueCommits.slice(0, 3).map(s => `“${s}”`).join(' and ')} don’t say what changed; use imperative, scoped subjects (e.g. “docs: add diagnosis findings table”).`,
        severity: 1,
        penaltyUnits: 1
      });
    }
  }

  // ==========================================
  // 2. Primary Documentation & Truncation Checks
  // ==========================================
  if (primaryReadme) {
    // Truncation check
    if (primaryReadme.isTruncated && primaryReadme.truncation) {
      const { lineNumber, lastLine, details } = primaryReadme.truncation;
      findings.push({
        category: rubricId === 'lab' ? 'Delivery & documentation' : 'documentation & completeness',
        citation: `artifact 1, line ${lineNumber}`,
        issue: `the README cuts off mid-word (${details}), so the diagnosis section is incomplete; finish the findings table and re-check the whole document renders end to end.`,
        severity: 2,
        penaltyUnits: 2
      });
    }

    const readmeRaw = primaryReadme.rawContent.toLowerCase();

    // Check for "how to run locally" / setup instructions
    const hasLocalRunSteps = /how to run|running locally|setup steps|getting started|run locally|live server|installation/i.test(readmeRaw);
    if (!hasLocalRunSteps) {
      // Find where commit reference or before link is mentioned (or line 4/first section)
      const lines = primaryReadme.rawContent.split(/\r?\n/);
      let targetLine = 4;
      for (let i = 0; i < Math.min(lines.length, 25); i++) {
        if (/before|commit|repository|link|source/i.test(lines[i])) {
          targetLine = i + 1;
          break;
        }
      }

      findings.push({
        category: rubricId === 'lab' ? 'Delivery & documentation' : 'documentation & completeness',
        citation: `artifact 1, line ${targetLine}`,
        issue: 'the README does not state setup/run steps; add a short “how to run locally” note so a reviewer can reproduce the page.',
        severity: 1,
        penaltyUnits: 1
      });
    }

    // Design Asset Reference Checks (e.g. docs/sketch.png)
    const imgRefMatches = primaryReadme.rawContent.matchAll(/!\[.*?\]\((.*?)\)/g);
    for (const match of imgRefMatches) {
      const refPath = match[1].split('#')[0].split('?')[0].trim();
      if (refPath && !refPath.startsWith('http')) {
        const normalized = refPath.replace(/^\.?\//, '');
        const exists = fileTree.some(f => f.toLowerCase() === normalized.toLowerCase());
        if (!exists) {
          // Find line number
          const lineNum = primaryReadme.rawContent.slice(0, match.index).split(/\r?\n/).length;
          findings.push({
            category: rubricId === 'lab' ? 'Design-artifact fidelity' : 'documentation & completeness',
            citation: `artifact 1, line ${lineNum}`,
            issue: `the design asset is referenced as "${refPath}" but the file was not found in the repository; commit the missing artifact or update the path.`,
            severity: 2,
            penaltyUnits: 2
          });
        }
      }
    }
  }

  // ==========================================
  // 3. Markup & Accessibility Checks in Secondary Artifacts
  // ==========================================
  const htmlArtifact = artifacts.find(a => a.name.endsWith('.html'));
  if (htmlArtifact) {
    const html = htmlArtifact.rawContent;

    // Check 1: Icon-only links without accessible names
    const iconLinkRegex = /<a\s+[^>]*href=["']([^"']*)["'][^>]*>\s*<i\b[^>]*><\/i>\s*<\/a>/gi;
    if (iconLinkRegex.test(html)) {
      findings.push({
        category: rubricId === 'lab' ? 'Accessibility' : 'correctness & robustness',
        citation: `artifact ${htmlArtifact.index}, line 1`,
        issue: 'icon-only links detected without text or aria-label; confirm all interactive links use accessible names so screen readers announce their target.',
        severity: 2,
        penaltyUnits: 2
      });
    }

    // Check 2: Form error feedback without aria-live
    const formPresent = /<form\b/i.test(html);
    const hasAriaLive = /aria-live|role=["']alert["']/i.test(html);
    if (formPresent && !hasAriaLive) {
      // Find line where form begins
      const lines = html.split(/\r?\n/);
      let formLine = 1;
      for (let i = 0; i < lines.length; i++) {
        if (/<form\b/i.test(lines[i])) {
          formLine = i + 1;
          break;
        }
      }
      findings.push({
        category: rubricId === 'lab' ? 'Accessibility' : 'correctness & robustness',
        citation: `artifact ${htmlArtifact.index}, line ${formLine}`,
        issue: 'the form does not declare aria-live or role="alert" for dynamic validation error feedback; state how errors are announced so the form is usable without sight.',
        severity: 2,
        penaltyUnits: 2
      });
    }
  }

  return findings;
}
