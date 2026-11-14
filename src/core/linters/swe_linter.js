/**
 * Deterministic linters for Software Engineering & Codebase Hygiene Rubric (Rubric B / table.tsv).
 */

export function runSweChecks(repoBundle, addFinding) {
  const { artifacts, fileTree } = repoBundle;

  // 1. Configuration & Dependency Hygiene
  const committedSecrets = fileTree.filter(f => /^\.env($|\.)/i.test(f) && !f.includes('.example'));
  if (committedSecrets.length > 0) {
    addFinding({
      category: 'configuration & dependency hygiene',
      citation: 'artifact 1, line 1',
      issue: `sensitive environment file (${committedSecrets.join(', ')}) committed to repository; externalize secrets and add .env to .gitignore.`,
      severity: 2,
      penaltyUnits: 2
    });
  }

  const committedBuildDirs = fileTree.filter(f => /^node_modules\/|^dist\/|^build\//i.test(f));
  if (committedBuildDirs.length > 0) {
    addFinding({
      category: 'configuration & dependency hygiene',
      citation: 'artifact 1, commits',
      issue: 'build artifacts or package dependencies (node_modules/dist) are committed to git; clean repository and configure .gitignore.',
      severity: 2,
      penaltyUnits: 2
    });
  }

  const hasGitignore = fileTree.some(f => /(^|\/)\.gitignore$/i.test(f));
  if (!hasGitignore) {
    addFinding({
      category: 'configuration & dependency hygiene',
      citation: 'artifact 1, line 1',
      issue: 'no .gitignore file found in repository; untracked temporary files and system caches risk polluting version control.',
      severity: 1,
      penaltyUnits: 1
    });
  }

  // 2. Code Inspection on Source Files (excluding test harnesses & fixtures)
  const codeArtifacts = artifacts.filter(a => /\.(js|mjs|cjs|ts|jsx|tsx|py|java|go|rs|php)$/i.test(a.name));
  for (const art of codeArtifacts) {
    const isTestArtifact = /(^|\/)(test|tests|fixtures|__tests__)\/|\.(test|spec)\./i.test(art.name);
    if (isTestArtifact) continue;

    const lines = art.rawContent.split(/\r?\n/);

    // Structure & Architecture: Oversized file check
    if (lines.length > 500) {
      addFinding({
        category: 'structure & architecture',
        citation: `artifact ${art.index}, line 1`,
        issue: `source file contains ${lines.length} lines; consider splitting into smaller, focused modules with dedicated responsibilities.`,
        severity: 1,
        penaltyUnits: 1
      });
    }

    // Security & Data Protection: Hardcoded secrets and API keys
    const secretPatterns = [
      /(AIzaSy[0-9A-Za-z_-]{25,45})/,
      /(ghp_[0-9A-Za-z]{30,45})/,
      /(sk_live_[0-9a-zA-Z]{20,40})/,
      /(AKIA[0-9A-Z]{16})/,
      /(api|jwt|auth|app|secret|key|token|password)[_-]?(key|secret|token|credential|pwd)?\s*[:=]\s*["'][A-Za-z0-9_\-\.]{8,}["']/i
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (secretPatterns.some(p => p.test(line)) && !line.includes('process.env')) {
        addFinding({
          category: 'security & data protection',
          citation: `artifact ${art.index}, line ${i + 1}`,
          issue: 'potential hardcoded secret, token, or credential detected; externalize into environment variables.',
          severity: 3,
          penaltyUnits: 3
        });
        break;
      }
    }

    // Error Handling & Observability: Empty catch blocks
    const emptyCatchRegex = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/[^\r\n]*|\/\*[\s\S]*?\*\/|\s)*\}/g;
    let catchMatch;
    while ((catchMatch = emptyCatchRegex.exec(art.rawContent)) !== null) {
      const lineNum = art.rawContent.slice(0, catchMatch.index).split(/\r?\n/).length;
      addFinding({
        category: 'error handling & observability',
        citation: `artifact ${art.index}, line ${lineNum}`,
        issue: 'empty catch block detected; swallowed exceptions hide runtime failures and prevent debugging.',
        severity: 2,
        penaltyUnits: 2
      });
      break;
    }

    // Observability: Sensitive logging
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/console\.(log|info|debug)\(.*(password|secret|bearer|apiKey|authToken).*\)/i.test(line)) {
        addFinding({
          category: 'error handling & observability',
          citation: `artifact ${art.index}, line ${i + 1}`,
          issue: 'logging statement may leak sensitive credentials (passwords, tokens) to standard output.',
          severity: 2,
          penaltyUnits: 2
        });
        break;
      }
    }

    // Correctness & Robustness: Leftover debugger breakpoints
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*debugger\s*;?(?:\s*\/\/.*)?$/.test(line)) {
        addFinding({
          category: 'correctness & robustness',
          citation: `artifact ${art.index}, line ${i + 1}`,
          issue: 'leftover `debugger` breakpoint found in source code; remove debugging artifacts before submission.',
          severity: 1,
          penaltyUnits: 1
        });
        break;
      }
    }

    // API & Database Hygiene: SELECT * queries
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/SELECT\s+\*\s+FROM/i.test(line)) {
        addFinding({
          category: 'API & database hygiene',
          citation: `artifact ${art.index}, line ${i + 1}`,
          issue: '`SELECT *` used in query; specify explicit projection fields to avoid over-fetching and leaking columns.',
          severity: 1,
          penaltyUnits: 1
        });
        break;
      }
    }

    // Config & Dependency Hygiene: Hardcoded local development URLs in production code
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/["']https?:\/\/localhost:\d+/i.test(line) && !line.includes('process.env')) {
        addFinding({
          category: 'configuration & dependency hygiene',
          citation: `artifact ${art.index}, line ${i + 1}`,
          issue: `hardcoded local URL (${line.trim().slice(0, 40)}) found in production module; externalize host configuration.`,
          severity: 1,
          penaltyUnits: 1
        });
        break;
      }
    }

    // Readability & Naming: Legacy var declaration
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*var\s+[a-zA-Z0-9_$]+/i.test(line)) {
        addFinding({
          category: 'readability & naming',
          citation: `artifact ${art.index}, line ${i + 1}`,
          issue: 'legacy `var` declaration detected; modernize codebase using block-scoped `const` or `let`.',
          severity: 1,
          penaltyUnits: 1
        });
        break;
      }
    }

    // Error Handling: Synchronous modal dialogs
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/(^|[^\w\.])(alert|confirm|prompt)\s*\(/i.test(line) && !line.includes('//')) {
        addFinding({
          category: 'error handling & observability',
          citation: `artifact ${art.index}, line ${i + 1}`,
          issue: 'synchronous dialog (`alert`/`prompt`) used; implement accessible, non-blocking UI notifications.',
          severity: 1,
          penaltyUnits: 1
        });
        break;
      }
    }
  }

  // 3. CSS Architecture & Specificity Checks
  const cssArtifacts = artifacts.filter(a => /\.css$/i.test(a.name));
  for (const art of cssArtifacts) {
    const matches = art.rawContent.match(/!important/g);
    if (matches && matches.length >= 3) {
      addFinding({
        category: 'structure & architecture',
        citation: `artifact ${art.index}, line 1`,
        issue: `${matches.length} \`!important\` declarations found; refactor selector specificity instead of overriding cascade.`,
        severity: 1,
        penaltyUnits: 1
      });
      break;
    }
  }

  // 4. Test Suite Check
  const hasTests = fileTree.some(f => /(^|\/)(test|tests|__tests__)\b|\.(test|spec)\./i.test(f));
  if (!hasTests) {
    addFinding({
      category: 'test hygiene',
      citation: 'artifact 1, line 1',
      issue: 'no test directory or test suites detected; provide isolated, reproducible unit or integration tests.',
      severity: 2,
      penaltyUnits: 2
    });
  }
}
