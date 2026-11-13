import assert from 'node:assert';
import { calculateHygieneScore, compareHygieneRuns } from '../src/core/scorer.js';
import { checkMarkdownTruncation } from '../src/core/ingestor.js';
import { runStaticChecks } from '../src/core/static_analyzer.js';

console.log('Testing Hygiene Checker Scoring & Evaluation Engine...\n');

// 1. Verify Sample Benchmark Scoring from the User's Prompt
const sampleEvaluations = [
  {
    category: 'Styling & responsive layout',
    level: 1,
    penaltyUnits: 2, // 2 * 0.47 = -0.94 pts
    summary: 'The visual system and mobile-first reasoning are strong, but a few layout claims lack supporting detail.',
    items: [
      {
        citation: 'artifact 1, line 37',
        issue: 'the decision to drop a hero banner is justified, but the README does not show the resulting first-screen layout at 360px; add a screenshot or note confirming contact buttons and trust points fit above the fold.'
      },
      {
        citation: 'artifact 1, line 51',
        issue: 'the diagnosis lists fixed pixel widths in the old CSS but the rebuild’s breakpoints and spacing scale are not stated; document the type scale, spacing tokens and breakpoints so the responsive system is verifiable.'
      }
    ]
  },
  {
    category: 'Accessibility',
    level: 2,
    penaltyUnits: 6, // 6 * 0.47 = -2.82 pts
    summary: 'The README claims keyboard and contrast testing, but the delivered markup evidence is thin and some accessibility claims are unverified in the visible content.',
    items: [
      {
        citation: 'artifact 1, line 43',
        issue: 'the audit says keyboard-only testing was done, but no focus-order or focus-visible evidence is cited; add the actual tab-order result and any focus styles to back the claim.'
      },
      {
        citation: 'artifact 1, line 39',
        issue: 'the trust photo is described as “a clearly labelled placeholder”; ensure the placeholder image has meaningful alt text and is not announced as a real photo of Kwame to screen-reader users.'
      },
      {
        citation: 'artifact 1, line 52',
        issue: 'the diagnosis notes the old phone number was plain text; confirm the rebuild uses tel:/WhatsApp links with accessible names, not icon-only links without labels.'
      },
      {
        citation: 'artifact 1, line 34',
        issue: 'the form is described as “backup” but no validation/error-feedback behaviour is documented; state how errors are announced (aria-live/role=alert) so the form is usable without sight.'
      }
    ]
  },
  {
    category: 'UI content & form UX',
    level: 1,
    penaltyUnits: 1, // 1 * 0.47 = -0.47 pts
    summary: 'Interface copy is purposeful and tied to the brief, with only minor gaps in form behaviour documentation.',
    items: [
      {
        citation: 'artifact 1, line 39',
        issue: 'the switch from a name/phone/problem form to WhatsApp is well reasoned, but the README does not say what happens if WhatsApp is unavailable; add a fallback (e.g. tel: link) so the message path never silently fails.'
      },
      {
        citation: 'artifact 1, line 34',
        issue: 'the “short form (backup)” is described but its validation and success/error feedback are not documented; specify the states a user sees after submitting.'
      }
    ]
  },
  {
    category: 'Delivery & documentation',
    level: 2,
    penaltyUnits: 2, // 2 * 0.47 = -0.94 pts
    summary: 'The README is thorough, but the commit history is noisy and the README is visibly truncated mid-sentence, so the submission is not fully complete.',
    items: [
      {
        citation: 'artifact 1, line 53',
        issue: 'the README cuts off mid-word (“Proof sits in “About Whe”), so the diagnosis section is incomplete; finish the findings table and re-check the whole document renders end to end.'
      },
      {
        citation: 'artifact 1, commits',
        issue: 'many near-duplicate README edits (“Readme edit”, “Readme diagnosis edit”, “Revise issues in README for clarity and detail”, “Revise primary colour description in README”) should be squashed or given descriptive subjects so history reads cleanly.'
      },
      {
        citation: 'artifact 1, commits',
        issue: 'vague subjects like “description in README”, “Added visual system” and “Why riders trust Wheelhouse” don’t say what changed; use imperative, scoped subjects (e.g. “docs: add diagnosis findings table”).'
      },
      {
        citation: 'artifact 1, line 4',
        issue: 'the “before” link points at commit e0c6f94 but the README never states setup/run steps; add a short “how to run locally” note so a reviewer can reproduce the page.'
      }
    ]
  },
  {
    category: 'Design-artifact fidelity',
    level: 1,
    penaltyUnits: 1, // 1 * 0.47 = -0.47 pts
    summary: 'The sketch and structure note are clear and consistent, with only small fidelity gaps.',
    items: [
      {
        citation: 'artifact 1, line 19',
        issue: 'the sketch is referenced as docs/sketch.png but the README does not describe its numbering legend beyond the table; ensure the numbered blocks in the image match the table rows 1–11 exactly.'
      },
      {
        citation: 'artifact 1, line 39',
        issue: 'the README notes block 10 changed during the build, but the sketch still shows the original form; update the sketch or add an annotation so the design artifact matches the delivered page.'
      }
    ]
  }
];

const result = calculateHygieneScore(sampleEvaluations, 'lab');

console.log('Result total penalty:', result.totalPenalty, 'Formatted:', result.totalDeductionFormatted);
assert.strictEqual(result.totalPenalty, 5.65, 'Total penalty should match exactly 5.65 pts');
assert.strictEqual(result.totalDeductionFormatted, '−5.65 pts');

console.log('\nGenerated Report Preview:');
console.log('--------------------------------------------------');
console.log(result.reportText);
console.log('--------------------------------------------------\n');

// 2. Test Markdown Truncation Scanner
const truncatedMarkdown = `# My Report
Some introduction...
| Column 1 | Column 2 |
Proof sits in "About Whe`;

const truncResult = checkMarkdownTruncation(truncatedMarkdown);
console.log('Truncation test result:', truncResult);
assert.strictEqual(truncResult.isTruncated, true, 'Should detect truncation');

// 3. Test Diff Comparison Engine
const fixedEvaluations = sampleEvaluations.slice(0, 2); // resolved 3 categories
const rerunResult = calculateHygieneScore(fixedEvaluations, 'lab');
const diff = compareHygieneRuns(result, rerunResult);

console.log('Diff result:', {
  previous: diff.previousPenalty,
  current: diff.currentPenalty,
  improvement: diff.improvement,
  isImproved: diff.isImproved
});

assert.strictEqual(diff.isImproved, true);
assert(diff.improvement > 0);

console.log('\n All verification tests passed successfully!');
