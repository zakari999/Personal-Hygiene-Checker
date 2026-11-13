/**
 * Deterministic linters for Module Lab Report & Design Rubric (Rubric A).
 */

export function runLabChecks(repoBundle, addFinding) {
  const { artifacts, fileTree } = repoBundle;
  const primaryReadme = artifacts.find(a => a.isPrimaryReport) || artifacts[0];

  if (primaryReadme) {
    const readmeRaw = primaryReadme.rawContent.toLowerCase();

    // 1. Design Asset Reference Checks (e.g. docs/sketch.png)
    const imgRefMatches = primaryReadme.rawContent.matchAll(/!\[(.*?)\]\((.*?)\)/g);
    for (const match of imgRefMatches) {
      const refPath = match[2].split('#')[0].split('?')[0].trim();
      if (refPath && !refPath.startsWith('http')) {
        const normalized = refPath.replace(/^\.?\//, '');
        const exists = fileTree.some(f => f.toLowerCase() === normalized.toLowerCase());
        const lineNum = primaryReadme.rawContent.slice(0, match.index).split(/\r?\n/).length;

        if (!exists) {
          addFinding({
            category: 'Design-artifact fidelity',
            citation: `artifact ${primaryReadme.index}, line ${lineNum}`,
            issue: `the design asset is referenced as "${refPath}" but the file was not found in the repository; commit the missing artifact or update the path.`,
            severity: 2,
            penaltyUnits: 2
          });
        } else if (/sketch|wireframe|mockup/i.test(refPath)) {
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

    // 2. Responsive Claims & Viewport Checks in README
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

    // 3. Accessibility claims in README
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

    // 4. Form and UI UX claims in README
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

  // 5. Secondary Artifacts: HTML & CSS Linters
  const htmlArtifacts = artifacts.filter(a => a.name.endsWith('.html') || a.name.endsWith('.htm'));
  for (const htmlArt of htmlArtifacts) {
    const html = htmlArt.rawContent;
    const lines = html.split(/\r?\n/);

    if (!/<meta\b[^>]*name=["']viewport["']/i.test(html)) {
      addFinding({
        category: 'Styling & responsive layout',
        citation: `artifact ${htmlArt.index}, line 1`,
        issue: 'missing `<meta name="viewport" content="width=device-width, initial-scale=1.0">` tag; responsive layout will not scale correctly on mobile devices.',
        severity: 2,
        penaltyUnits: 2
      });
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const hasIcon = /<a\s+[^>]*href=["'][^"']*["'][^>]*>\s*(?:<i\b[^>]*>.*?<\/i>|<svg\b[^>]*>.*?<\/svg>)\s*<\/a>/i.test(line);
      if (hasIcon && !line.includes('aria-label') && !line.includes('title')) {
        addFinding({
          category: 'Accessibility',
          citation: `artifact ${htmlArt.index}, line ${i + 1}`,
          issue: 'icon-only links detected without text or aria-label; confirm all interactive links use accessible names so screen readers announce their target.',
          severity: 2,
          penaltyUnits: 2
        });
        break;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/<img\b/i.test(line)) {
        if (!/alt=["'][^"']+["']/i.test(line)) {
          addFinding({
            category: 'Accessibility',
            citation: `artifact ${htmlArt.index}, line ${i + 1}`,
            issue: 'image tag is missing an alt attribute; provide meaningful alternative text for assistive technology.',
            severity: 1,
            penaltyUnits: 1
          });
          break;
        } else if (/alt=["'](image|photo|picture|placeholder)["']/i.test(line) || /placeholder/i.test(line)) {
          addFinding({
            category: 'Accessibility',
            citation: `artifact ${htmlArt.index}, line ${i + 1}`,
            issue: 'the trust photo is described as “a clearly labelled placeholder”; ensure the placeholder image has meaningful alt text and is not announced as a real photo of Kwame to screen-reader users.',
            severity: 1,
            penaltyUnits: 1
          });
          break;
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/href=["']tel:[^"']*["']/i.test(line) || /href=["']https?:\/\/wa\.me[^"']*["']/i.test(line)) {
        if (!/>[^<]{2,}</.test(line) && !line.includes('aria-label')) {
          addFinding({
            category: 'Accessibility',
            citation: `artifact ${htmlArt.index}, line ${i + 1}`,
            issue: 'the diagnosis notes the old phone number was plain text; confirm the rebuild uses tel:/WhatsApp links with accessible names, not icon-only links without labels.',
            severity: 2,
            penaltyUnits: 2
          });
          break;
        }
      }
    }

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
        category: 'Accessibility',
        citation: `artifact ${htmlArt.index}, line ${formLine}`,
        issue: 'the form is described as “backup” but no validation/error-feedback behaviour is documented; state how errors are announced (aria-live/role=alert) so the form is usable without sight.',
        severity: 2,
        penaltyUnits: 2
      });

      addFinding({
        category: 'UI content & form UX',
        citation: `artifact ${htmlArt.index}, line ${formLine}`,
        issue: 'the “short form (backup)” is described but its validation and success/error feedback are not documented; specify the states a user sees after submitting.',
        severity: 1,
        penaltyUnits: 1
      });
    }

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

  // 6. CSS Linters
  const cssArtifacts = artifacts.filter(a => a.name.endsWith('.css') || a.name.endsWith('.scss'));
  for (const cssArt of cssArtifacts) {
    const lines = cssArt.rawContent.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*(width|min-width):\s*([5-9]\d{2}|\d{4,})px;/i.test(line)) {
        addFinding({
          category: 'Styling & responsive layout',
          citation: `artifact ${cssArt.index}, line ${i + 1}`,
          issue: `fixed pixel width declaration (${line.trim()}) impedes responsive scaling; replace with fluid units (%, rem, vw) or clamp() with max-width.`,
          severity: 1,
          penaltyUnits: 1
        });
        break;
      }
    }
  }
}
