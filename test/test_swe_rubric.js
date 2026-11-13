import assert from 'node:assert';
import { runStaticChecks } from '../src/core/static_analyzer.js';
import { calculateHygieneScore } from '../src/core/scorer.js';
import { RUBRICS } from '../src/core/rubrics.js';

console.log('Testing Software Engineering (table.tsv) 10-Criteria Rubric...\n');

// 1. Verify RUBRICS.swe has all 10 criteria with checks
assert.strictEqual(RUBRICS.swe.categories.length, 10, 'SWE rubric must have 10 categories');
for (const cat of RUBRICS.swe.categories) {
  assert(cat.id, `Category ${cat.name} must have an id`);
  assert(cat.checks && cat.checks.length > 0, `Category ${cat.name} must declare checks`);
}
console.log('✓ All 10 SWE categories declared with explicit automated checks');

// 2. Mock codebase bundle with deliberate SWE hygiene defects
const mockSweBundle = {
  target: { name: 'mock-swe-codebase', isLocal: true },
  fileTree: [
    'README.md',
    'src/index.js',
    'src/db.js',
    '.env' // committed secret file
  ],
  commits: [
    { hash: 'a1b2c3d', date: '2026-11-12', author: 'Dev', subject: 'wip' },
    { hash: 'e4f5a6b', date: '2026-11-12', author: 'Dev', subject: 'fix' },
    { hash: 'c7d8e9f', date: '2026-11-10', author: 'Dev', subject: 'Initial commit' }
  ],
  artifacts: [
    {
      index: 1,
      name: 'README.md',
      isPrimaryReport: true,
      lineCount: 15,
      rawContent: `# Mock SWE Service\nA simple backend service.\nNo run steps provided.`,
      contentNumbered: `line 1: # Mock SWE Service\nline 2: A simple backend service.\nline 3: No run steps provided.`
    },
    {
      index: 2,
      name: 'src/index.js',
      isPrimaryReport: false,
      lineCount: 25,
      rawContent: `
const express = require('express');
const app = express();
const API_SECRET = "AIzaSyD-12345678901234567890123456789"; // hardcoded secret
const BACKEND_URL = "http://localhost:5000/api"; // hardcoded local url

app.post('/login', (req, res) => {
  try {
    const { user, password } = req.body;
    console.log("Processing login with password:", password); // sensitive log
    debugger; // leftover debugger
  } catch (err) {
    // empty catch block
  }
});
`,
      contentNumbered: ''
    },
    {
      index: 3,
      name: 'src/db.js',
      isPrimaryReport: false,
      lineCount: 10,
      rawContent: `
function getUser(id) {
  return db.query("SELECT * FROM users WHERE id = " + id);
}
`,
      contentNumbered: ''
    }
  ]
};

const findings = runStaticChecks(mockSweBundle, 'swe');
console.log(`\nDetected ${findings.length} SWE hygiene defects:`);
findings.forEach(f => {
  console.log(`  - [${f.category}] ${f.citation}: ${f.issue.slice(0, 75)}...`);
});

// Assert specific criteria were detected:
const categoriesDetected = new Set(findings.map(f => f.category));

assert(categoriesDetected.has('security & data protection'), 'Should detect hardcoded secret');
assert(categoriesDetected.has('error handling & observability'), 'Should detect empty catch or sensitive logging');
assert(categoriesDetected.has('correctness & robustness'), 'Should detect leftover debugger');
assert(categoriesDetected.has('API & database hygiene'), 'Should detect SELECT * query');
assert(categoriesDetected.has('configuration & dependency hygiene'), 'Should detect committed .env or hardcoded localhost URL');
assert(categoriesDetected.has('test hygiene'), 'Should detect missing test suite');
assert(categoriesDetected.has('build, delivery & version control'), 'Should detect commit noise');
assert(categoriesDetected.has('documentation & completeness'), 'Should detect missing setup instructions');

// Calculate score
const evaluations = RUBRICS.swe.categories.map(cat => {
  const catFindings = findings.filter(f => f.category === cat.name);
  return {
    category: cat.name,
    level: catFindings.length > 2 ? 2 : catFindings.length > 0 ? 1 : 0,
    penaltyUnits: catFindings.reduce((s, f) => s + (f.penaltyUnits || 1), 0),
    items: catFindings.map(f => ({ citation: f.citation, issue: f.issue }))
  };
});

const scoreResult = calculateHygieneScore(evaluations, 'swe');
console.log(`\nSWE Score Result: Total Penalty = ${scoreResult.totalPenalty} (${scoreResult.totalDeductionFormatted})`);
assert(scoreResult.totalPenalty > 0, 'Total penalty should reflect defects');
assert(scoreResult.reportText.includes('Sloppiness penalty'), 'Report text should format properly');

console.log('\n✓ SWE Rubric 10-Criteria Test Suite Passed Successfully!\n');
