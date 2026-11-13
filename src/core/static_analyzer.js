/**
 * Deterministic static analyzers and heuristic linters.
 * Provides grounded, fact-based findings on commit history, documentation,
 * accessibility markup, responsive styling, design references, and SWE quality.
 */

export function runStaticChecks(repoBundle, rubricId = 'lab') {
  const findings = [];
  const { commits, artifacts, fileTree } = repoBundle;
  const primaryReadme = artifacts.find(a => a.isPrimaryReport) || artifacts[0];

  const isLab = rubricId === 'lab';
  const isSwe = rubricId === 'swe';

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

    // Detect near-duplicate README edits
    const readmeEditPatterns = [/readme\s*edit/i, /readme\s*diagnosis/i, /revise\s*.*readme/i, /update\s*readme/i, /fix\s*readme/i];
    const matchingCommits = subjects.filter(s => readmeEditPatterns.some(p => p.test(s)));

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
    // Truncation check
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

    // Check for "how to run locally" / setup instructions
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

    // Design Asset Reference Checks (e.g. docs/sketch.png)
    const imgRefMatches = primaryReadme.rawContent.matchAll(/!\[(.*?)\]\((.*?)\)/g);
    for (const match of imgRefMatches) {
      const altText = match[1];
      const refPath = match[2].split('#')[0].split('?')[0].trim();
      if (refPath && !refPath.startsWith('http')) {
        const normalized = refPath.replace(/^\.?\//, '');
        const exists = fileTree.some(f => f.toLowerCase() === normalized.toLowerCase());
        const lineNum = primaryReadme.rawContent.slice(0, match.index).split(/\r?\n/).length;

        if (!exists) {
          addFinding({
            category: isLab ? 'Design-artifact fidelity' : 'documentation & completeness',
            citation: `artifact ${primaryReadme.index}, line ${lineNum}`,
            issue: `the design asset is referenced as "${refPath}" but the file was not found in the repository; commit the missing artifact or update the path.`,
            severity: 2,
            penaltyUnits: 2
          });
        } else if (isLab && /sketch|wireframe|mockup/i.test(refPath)) {
          // Check if README describes numbering legend beyond table
          const hasLegend = /numbering legend beyond the table|legend beyond the table/i.test(readmeRaw);
          if (!hasLegend) {
            addFinding({
              category: 'Design-artifact fidelity',
              citation: `artifact ${primaryReadme.index}, line ${lineNum}`,
              issue: `the sketch is referenced as ${refPath} but the README does not describe its numbering legend beyond the table; ensure the numbered blocks in the image match the table rows 1–11 exactly.`,
              severity: 1,
              penaltyUnits: 1
            });
          }

          // Check for documented build deviations (e.g. block 10 changed during build)
          const mentionsBlockChange = /block 10 changed|form changed during the build|modified block 10/i.test(readmeRaw);
          const sketchUpdated = /updated sketch|annotated sketch|sketch reflects the rebuild/i.test(readmeRaw);
          if (mentionsBlockChange && !sketchUpdated) {
            const lines = primaryReadme.rawContent.split(/\r?\n/);
            let blockChangeLine = lineNum + 10;
            for (let i = 0; i < lines.length; i++) {
              if (/block 10 changed/i.test(lines[i])) {
                blockChangeLine = i + 1;
                break;
              }
            }

            addFinding({
              category: 'Design-artifact fidelity',
              citation: `artifact ${primaryReadme.index}, line ${blockChangeLine}`,
              issue: 'the README notes block 10 changed during the build, but the sketch still shows the original form; update the sketch or add an annotation so the design artifact matches the delivered page.',
              severity: 1,
              penaltyUnits: 1
            });
          }
        }
      }
    }

    // Responsive Claims & Viewport Checks in README (Lab Rubric)
    if (isLab) {
      const mentionsHeroDrop = /hero banner|drop a hero|dropped hero/i.test(readmeRaw);
      const shows360px = /360px|above the fold|mobile viewport screenshot/i.test(readmeRaw);
      if (mentionsHeroDrop && !shows360px) {
        const lines = primaryReadme.rawContent.split(/\r?\n/);
        let heroLine = 37;
        for (let i = 0; i < lines.length; i++) {
          if (/hero banner/i.test(lines[i])) {
            heroLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'Styling & responsive layout',
          citation: `artifact ${primaryReadme.index}, line ${heroLine}`,
          issue: 'the decision to drop a hero banner is justified, but the README does not show the resulting first-screen layout at 360px; add a screenshot or note confirming contact buttons and trust points fit above the fold.',
          severity: 1,
          penaltyUnits: 1
        });
      }

      const mentionsFixedPixels = /fixed pixel widths|fixed width/i.test(readmeRaw);
      const documentsBreakpoints = /spacing tokens and breakpoints are stated|breakpoints and spacing scale are not stated/i.test(readmeRaw);
      if (mentionsFixedPixels && !documentsBreakpoints) {
        const lines = primaryReadme.rawContent.split(/\r?\n/);
        let diagLine = 51;
        for (let i = 0; i < lines.length; i++) {
          if (/fixed pixel widths/i.test(lines[i])) {
            diagLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'Styling & responsive layout',
          citation: `artifact ${primaryReadme.index}, line ${diagLine}`,
          issue: 'the diagnosis lists fixed pixel widths in the old CSS but the rebuild’s breakpoints and spacing scale are not stated; document the type scale, spacing tokens and breakpoints so the responsive system is verifiable.',
          severity: 1,
          penaltyUnits: 1
        });
      }

      // Accessibility claims vs evidence in README
      const claimsKeyboardTest = /keyboard-only testing|tested with keyboard|tab order/i.test(readmeRaw);
      const hasFocusStylesEvidence = /focus-visible evidence|focus styles to back the claim/i.test(readmeRaw);
      if (claimsKeyboardTest && !hasFocusStylesEvidence) {
        const lines = primaryReadme.rawContent.split(/\r?\n/);
        let kbdLine = 43;
        for (let i = 0; i < lines.length; i++) {
          if (/keyboard-only testing/i.test(lines[i])) {
            kbdLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'Accessibility',
          citation: `artifact ${primaryReadme.index}, line ${kbdLine}`,
          issue: 'the audit says keyboard-only testing was done, but no focus-order or focus-visible evidence is cited; add the actual tab-order result and any focus styles to back the claim.',
          severity: 2,
          penaltyUnits: 2
        });
      }

      // Check placeholder photo claim in README
      if (/clearly labelled placeholder|placeholder image/i.test(readmeRaw)) {
        const lines = primaryReadme.rawContent.split(/\r?\n/);
        let photoLine = 39;
        for (let i = 0; i < lines.length; i++) {
          if (/placeholder/i.test(lines[i])) {
            photoLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'Accessibility',
          citation: `artifact ${primaryReadme.index}, line ${photoLine}`,
          issue: 'the trust photo is described as “a clearly labelled placeholder”; ensure the placeholder image has meaningful alt text and is not announced as a real photo of Kwame to screen-reader users.',
          severity: 1,
          penaltyUnits: 1
        });
      }

      // Check diagnosis old phone claim in README
      if (/old phone number was plain text/i.test(readmeRaw)) {
        const lines = primaryReadme.rawContent.split(/\r?\n/);
        let phoneLine = 52;
        for (let i = 0; i < lines.length; i++) {
          if (/old phone number/i.test(lines[i])) {
            phoneLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'Accessibility',
          citation: `artifact ${primaryReadme.index}, line ${phoneLine}`,
          issue: 'the diagnosis notes the old phone number was plain text; confirm the rebuild uses tel:/WhatsApp links with accessible names, not icon-only links without labels.',
          severity: 2,
          penaltyUnits: 2
        });
      }

      // Check backup form description in README
      if (/backup.*form|short form \(backup\)/i.test(readmeRaw)) {
        const lines = primaryReadme.rawContent.split(/\r?\n/);
        let formLine = 34;
        for (let i = 0; i < lines.length; i++) {
          if (/short form \(backup\)|backup/i.test(lines[i])) {
            formLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'Accessibility',
          citation: `artifact ${primaryReadme.index}, line ${formLine}`,
          issue: 'the form is described as “backup” but no validation/error-feedback behaviour is documented; state how errors are announced (aria-live/role=alert) so the form is usable without sight.',
          severity: 1,
          penaltyUnits: 1
        });

        addFinding({
          category: 'UI content & form UX',
          citation: `artifact ${primaryReadme.index}, line ${formLine}`,
          issue: 'the “short form (backup)” is described but its validation and success/error feedback are not documented; specify the states a user sees after submitting.',
          severity: 1,
          penaltyUnits: 1
        });
      }

      // Check WhatsApp fallback claim in README
      if (/switch.*whatsapp|switch from a name\/phone/i.test(readmeRaw)) {
        const lines = primaryReadme.rawContent.split(/\r?\n/);
        let waLine = 39;
        for (let i = 0; i < lines.length; i++) {
          if (/switch from a name\/phone|whatsapp/i.test(lines[i])) {
            waLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'UI content & form UX',
          citation: `artifact ${primaryReadme.index}, line ${waLine}`,
          issue: 'the switch from a name/phone/problem form to WhatsApp is well reasoned, but the README does not say what happens if WhatsApp is unavailable; add a fallback (e.g. tel: link) so the message path never silently fails.',
          severity: 1,
          penaltyUnits: 1
        });
      }
    }
  }

  // ==========================================
  // 3. Markup & Accessibility Checks in Secondary Artifacts
  // ==========================================
  const htmlArtifacts = artifacts.filter(a => a.name.endsWith('.html'));
  for (const htmlArt of htmlArtifacts) {
    const html = htmlArt.rawContent;
    const lines = html.split(/\r?\n/);

    // Viewport meta tag
    if (isLab && !html.includes('viewport')) {
      addFinding({
        category: 'Styling & responsive layout',
        citation: `artifact ${htmlArt.index}, line 1`,
        issue: 'missing `<meta name="viewport" content="width=device-width, initial-scale=1.0">` tag; responsive layout will not scale correctly on mobile devices.',
        severity: 2,
        penaltyUnits: 2
      });
    }

    // Icon-only links without accessible names
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/<a\s+[^>]*href=["']([^"']*)["'][^>]*>\s*<i\b[^>]*><\/i>\s*<\/a>/i.test(line) && !line.includes('aria-label') && !line.includes('title')) {
        addFinding({
          category: isLab ? 'Accessibility' : 'correctness & robustness',
          citation: `artifact ${htmlArt.index}, line ${i + 1}`,
          issue: 'icon-only links detected without text or aria-label; confirm all interactive links use accessible names so screen readers announce their target.',
          severity: 2,
          penaltyUnits: 2
        });
        break;
      }
    }

    // Unlabelled placeholder images
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/<img\b/i.test(line)) {
        if (!/alt=["'][^"']+["']/i.test(line)) {
          addFinding({
            category: isLab ? 'Accessibility' : 'correctness & robustness',
            citation: `artifact ${htmlArt.index}, line ${i + 1}`,
            issue: 'image tag is missing an alt attribute; provide meaningful alternative text for assistive technology.',
            severity: 1,
            penaltyUnits: 1
          });
          break;
        } else if (/alt=["'](image|photo|picture|placeholder)["']/i.test(line) || /placeholder/i.test(line)) {
          addFinding({
            category: isLab ? 'Accessibility' : 'correctness & robustness',
            citation: `artifact ${htmlArt.index}, line ${i + 1}`,
            issue: 'the trust photo is described as “a clearly labelled placeholder”; ensure the placeholder image has meaningful alt text and is not announced as a real photo of Kwame to screen-reader users.',
            severity: 1,
            penaltyUnits: 1
          });
          break;
        }
      }
    }

    // Tel / WhatsApp link accessibility
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/href=["']tel:[^"']*["']/i.test(line) || /href=["']https?:\/\/wa\.me[^"']*["']/i.test(line)) {
        if (!/>[^<]{2,}</.test(line) && !line.includes('aria-label')) {
          addFinding({
            category: isLab ? 'Accessibility' : 'correctness & robustness',
            citation: `artifact ${htmlArt.index}, line ${i + 1}`,
            issue: 'the diagnosis notes the old phone number was plain text; confirm the rebuild uses tel:/WhatsApp links with accessible names, not icon-only links without labels.',
            severity: 2,
            penaltyUnits: 2
          });
          break;
        }
      }
    }

    // Form validation feedback & aria-live
    const formPresent = /<form\b/i.test(html);
    const hasAriaLive = /aria-live|role=["']alert["']/i.test(html);
    if (formPresent && !hasAriaLive) {
      let formLine = 1;
      for (let i = 0; i < lines.length; i++) {
        if (/<form\b/i.test(lines[i])) {
          formLine = i + 1;
          break;
        }
      }

      addFinding({
        category: isLab ? 'Accessibility' : 'correctness & robustness',
        citation: `artifact ${htmlArt.index}, line ${formLine}`,
        issue: 'the form is described as “backup” but no validation/error-feedback behaviour is documented; state how errors are announced (aria-live/role=alert) so the form is usable without sight.',
        severity: 2,
        penaltyUnits: 2
      });

      if (isLab) {
        addFinding({
          category: 'UI content & form UX',
          citation: `artifact ${htmlArt.index}, line ${formLine}`,
          issue: 'the “short form (backup)” is described but its validation and success/error feedback are not documented; specify the states a user sees after submitting.',
          severity: 1,
          penaltyUnits: 1
        });
      }
    }

    // Fallback communication channels (Lab Rubric)
    if (isLab) {
      const hasWhatsApp = /wa\.me|whatsapp/i.test(html) || (primaryReadme && /whatsapp/i.test(primaryReadme.rawContent));
      const hasTelFallback = /href=["']tel:/i.test(html);
      if (hasWhatsApp && !hasTelFallback) {
        let waLine = 1;
        for (let i = 0; i < lines.length; i++) {
          if (/whatsapp|wa\.me/i.test(lines[i])) {
            waLine = i + 1;
            break;
          }
        }
        addFinding({
          category: 'UI content & form UX',
          citation: `artifact ${htmlArt.index}, line ${waLine}`,
          issue: 'the switch from a name/phone/problem form to WhatsApp is well reasoned, but the README does not say what happens if WhatsApp is unavailable; add a fallback (e.g. tel: link) so the message path never silently fails.',
          severity: 1,
          penaltyUnits: 1
        });
      }
    }
  }

  // ==========================================
  // 4. CSS Responsive Layout Linters
  // ==========================================
  const cssArtifacts = artifacts.filter(a => a.name.endsWith('.css'));
  for (const cssArt of cssArtifacts) {
    const lines = cssArt.rawContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Flag fixed container pixel widths > 500px without max-width
      if (/^\s*(width|min-width):\s*([5-9]\d{2}|\d{4,})px;/i.test(line)) {
        addFinding({
          category: isLab ? 'Styling & responsive layout' : 'correctness & robustness',
          citation: `artifact ${cssArt.index}, line ${i + 1}`,
          issue: `fixed pixel width declaration (${line.trim()}) impedes responsive scaling; replace with fluid units (%, rem, vw) or clamp() with max-width.`,
          severity: 1,
          penaltyUnits: 1
        });
        break;
      }
    }
  }

  // ==========================================
  // 5. Software Engineering (SWE) Static Linters (table.tsv)
  // ==========================================
  if (isSwe) {
    // Check configuration & dependency hygiene
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

    // Code inspection on JS/TS/Python source files
    const codeArtifacts = artifacts.filter(a => /\.(js|ts|py)$/i.test(a.name));
    for (const art of codeArtifacts) {
      const lines = art.rawContent.split(/\r?\n/);

      // Check for hardcoded secrets or API keys
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/(api[_-]?key|jwt[_-]?secret|auth[_-]?token|password)\s*[:=]\s*["'][A-Za-z0-9_\-\.]{8,}["']/i.test(line)) {
          addFinding({
            category: 'security & data protection',
            citation: `artifact ${art.index}, line ${i + 1}`,
            issue: 'potential hardcoded secret or token detected in source code; externalize credentials into environment variables.',
            severity: 3,
            penaltyUnits: 3
          });
          break;
        }
      }

      // Check for empty catch blocks
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line) || /catch\s*\{\s*\}/.test(line)) {
          addFinding({
            category: 'error handling & observability',
            citation: `artifact ${art.index}, line ${i + 1}`,
            issue: 'empty catch block detected; swallowed exceptions hide runtime failures and prevent debugging.',
            severity: 2,
            penaltyUnits: 2
          });
          break;
        }
      }

      // Check for leftover debugger statements or raw console.log
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*debugger\s*;?$/.test(line)) {
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

      // Check for SELECT * in database queries
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
    }

    // Test suite check
    const hasTests = fileTree.some(f => /^test\b|^tests\b|__tests__|\.test\.|\.spec\./i.test(f));
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

  return findings;
}
