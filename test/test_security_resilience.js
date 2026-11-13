import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import { normalizeRepoInput, checkMarkdownTruncation } from '../src/core/ingestor.js';
import { extractCleanJson } from '../src/core/ai_analyzer.js';
import { compareHygieneRuns } from '../src/core/scorer.js';

console.log('Testing Security & Resilience Edge Cases...\n');

// 1. Test Command Injection & Malicious Inputs in normalizeRepoInput
console.log('1. Testing URL normalization & injection protection...');

// Valid inputs
const normHttps = normalizeRepoInput('https://github.com/facebook/react');
assert.strictEqual(normHttps.owner, 'facebook');
assert.strictEqual(normHttps.repo, 'react');
assert.strictEqual(normHttps.branch, null);
console.log('  ✓ HTTPS GitHub URL normalized correctly');

const normBranch = normalizeRepoInput('https://github.com/facebook/react/tree/dev');
assert.strictEqual(normBranch.branch, 'dev');
console.log('  ✓ Tree branch URL parsed correctly');

const normSsh = normalizeRepoInput('git@github.com:facebook/react.git');
assert.strictEqual(normSsh.owner, 'facebook');
assert.strictEqual(normSsh.repo, 'react');
console.log('  ✓ SSH GitHub URL parsed correctly');

// Malicious inputs should throw
assert.throws(() => {
  normalizeRepoInput('https://github.com/foo/bar"; rm -rf /; #');
}, /Invalid (repository URL|GitHub repository identifiers)/);
console.log('  ✓ Shell injection in repo URL rejected');

assert.throws(() => {
  normalizeRepoInput('https://github.com/foo/bar/tree/dev;cat /etc/passwd');
}, /Invalid (git branch name|repository URL)/);
console.log('  ✓ Shell injection in branch name rejected');

// Home directory expansion
const homeNorm = normalizeRepoInput('~/');
assert(homeNorm.isLocal === true);
assert(homeNorm.path === os.homedir());
console.log('  ✓ Home directory (~) expansion works');

// 2. Test Markdown Truncation Edge Cases
console.log('\n2. Testing Markdown Truncation Scanner...');

const unclosedCode = checkMarkdownTruncation('# Title\n```js\nconst x = 1;\n');
assert.strictEqual(unclosedCode.isTruncated, true);
assert(unclosedCode.details.includes('Unclosed code block'));
console.log('  ✓ Unclosed code block detected');

const unclosedLink = checkMarkdownTruncation('# Title\nCheck out [our project](https://example.com');
assert.strictEqual(unclosedLink.isTruncated, true);
assert(unclosedLink.details.includes('Unclosed markdown bracket'));
console.log('  ✓ Unclosed link detected');

const trailingDashes = checkMarkdownTruncation('# Title\nIn conclusion, we observed that —');
assert.strictEqual(trailingDashes.isTruncated, true);
console.log('  ✓ Trailing dash detected');

const cleanMd = checkMarkdownTruncation('# Title\nThis is a complete report.\nEverything renders cleanly.\n');
assert.strictEqual(cleanMd.isTruncated, false);
console.log('  ✓ Complete markdown passes cleanly');

// 3. Test Robust JSON Extraction from AI responses
console.log('\n3. Testing AI JSON Response Sanitization...');

const wrappedInFences = '```json\n{"categories": [{"category": "Styling", "level": 1}]}\n```';
const parsed1 = extractCleanJson(wrappedInFences);
assert.strictEqual(parsed1.categories[0].category, 'Styling');
console.log('  ✓ Code-fence wrapped JSON extracted cleanly');

const withSurroundingText = 'Here is the audit output:\n{"categories": []}\nHope this helps!';
const parsed2 = extractCleanJson(withSurroundingText);
assert(Array.isArray(parsed2.categories));
console.log('  ✓ JSON with conversational prelude/postlude extracted cleanly');

// 4. Test Diff Comparison Accuracy (Verify same-category issue prefix bug is solved)
console.log('\n4. Testing Diff Engine Distinct Item Fingerprinting...');

const runA = {
  totalPenalty: 1.88,
  categories: [
    {
      category: 'Styling & responsive layout',
      items: [
        { citation: 'artifact 1, line 37', issue: 'the decision to drop hero banner is justified but lacks 360px layout note.' },
        { citation: 'artifact 1, line 51', issue: 'the diagnosis lists fixed pixel widths in old CSS but rebuild breakpoints are missing.' }
      ]
    }
  ]
};

// Fixed line 37, line 51 still remains
const runB = {
  totalPenalty: 0.94,
  categories: [
    {
      category: 'Styling & responsive layout',
      items: [
        { citation: 'artifact 1, line 51', issue: 'the diagnosis lists fixed pixel widths in old CSS but rebuild breakpoints are missing.' }
      ]
    }
  ]
};

const diff = compareHygieneRuns(runA, runB);
assert.strictEqual(diff.resolvedCount, 1, 'Should resolve exactly 1 issue');
assert.strictEqual(diff.remainingCount, 1, 'Should have 1 remaining issue');
assert(diff.resolved[0].includes('line 37'), 'Resolved item should be line 37');
assert(diff.remaining[0].includes('line 51'), 'Remaining item should be line 51');
console.log('  ✓ Same-category diff comparison is 100% accurate and distinct');

console.log('\n✓ All Security & Resilience Tests Passed Successfully!\n');
