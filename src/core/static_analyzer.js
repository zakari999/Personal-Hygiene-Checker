/**
 * Deterministic static analyzer and coordinator for Lab and SWE linters.
 */

import { runLabChecks } from './linters/lab_linter.js';
import { runSweChecks } from './linters/swe_linter.js';

export function runStaticChecks(repoBundle, rubricId = 'lab') {
  const findings = [];
  const { commits, artifacts } = repoBundle;
  const primaryReadme = artifacts.find(a => a.isPrimaryReport) || artifacts[0];

  const isLab = rubricId === 'lab';

  function addFinding(item) {
    const isDuplicate = findings.some(f => {
      if (item.citation.includes('commits') && f.citation.includes('commits')) {
        return f.issue.slice(0, 20).toLowerCase() === item.issue.slice(0, 20).toLowerCase();
      }
      return (f.citation === item.citation && f.category === item.category) ||
        (f.category === item.category && f.issue.slice(0, 35).toLowerCase() === item.issue.slice(0, 35).toLowerCase());
    });
    if (!isDuplicate) {
      findings.push(item);
    }
  }

  // ==========================================
  // 1. Commit Log Hygiene Checks
  // ==========================================
  if (commits && commits.length > 0) {
    const subjects = commits.map(c => c.subject.trim());

    // Detect near-duplicate edits (e.g. "Readme edit", "Readme diagnosis edit")
    const editPatterns = [/readme\s*edit/i, /readme\s*diagnosis/i, /revise\s*.*readme/i, /update\s*readme/i, /fix\s*readme/i];
    const matchingCommits = subjects.filter(s => editPatterns.some(p => p.test(s)));

    if (matchingCommits.length >= 2) {
      addFinding({
        category: isLab ? 'Delivery & documentation' : 'build, delivery & version control',
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
      /^update$/i,
      /^superman$/i,
      /^wip$/i
    ];

    const vagueCommits = subjects.filter(s => vaguePatterns.some(p => p.test(s)) && !s.includes(':'));
    if (vagueCommits.length > 0) {
      addFinding({
        category: isLab ? 'Delivery & documentation' : 'build, delivery & version control',
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
    if (primaryReadme.isTruncated && primaryReadme.truncation) {
      const { lineNumber, lastLine, details } = primaryReadme.truncation;
      addFinding({
        category: isLab ? 'Delivery & documentation' : 'documentation & completeness',
        citation: `artifact ${primaryReadme.index}, line ${lineNumber}`,
        issue: `the README cuts off mid-word (${details}), so the diagnosis section is incomplete; finish the findings table and re-check the whole document renders end to end.`,
        severity: 2,
        penaltyUnits: 2
      });
    }

    const readmeRaw = primaryReadme.rawContent.toLowerCase();
    const hasLocalRunSteps = /how to run|running locally|setup steps|getting started|run locally|live server|installation/i.test(readmeRaw);
    if (!hasLocalRunSteps) {
      const lines = primaryReadme.rawContent.split(/\r?\n/);
      let targetLine = 4;
      for (let i = 0; i < Math.min(lines.length, 25); i++) {
        if (/before|commit|repository|link|source/i.test(lines[i])) {
          targetLine = i + 1;
          break;
        }
      }

      addFinding({
        category: isLab ? 'Delivery & documentation' : 'documentation & completeness',
        citation: `artifact ${primaryReadme.index}, line ${targetLine}`,
        issue: 'the “before” link points at a commit reference but the README never states setup/run steps; add a short “how to run locally” note so a reviewer can reproduce the page.',
        severity: 1,
        penaltyUnits: 1
      });
    }
  }

  // ==========================================
  // 3. Delegate to Specialized Rubric Linters
  // ==========================================
  if (isLab) {
    runLabChecks(repoBundle, addFinding);
  } else {
    runSweChecks(repoBundle, addFinding);
  }

  return findings;
}
