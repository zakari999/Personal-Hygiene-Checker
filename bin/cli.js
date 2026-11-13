#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { ingestRepository } from '../src/core/ingestor.js';
import { analyzeRepository } from '../src/core/ai_analyzer.js';
import { RUBRICS } from '../src/core/rubrics.js';

dotenv.config();

const args = process.argv.slice(2);

function showHelp() {
  console.log(`
Project Hygiene Checker — CLI
----------------------------------------
Usage:
  node bin/cli.js <repo-url-or-path> [options]

Options:
  --rubric <lab|swe>       Choose rubric: 'lab' (Module Lab & Design, default) or 'swe' (Software Engineering table.tsv)
  --key <apiKey>           Google Gemini API key (or set GEMINI_API_KEY in .env)
  --model <modelName>      Model to use (default: gemini-2.0-flash)
  --output, -o <file>      Save report output to specified file path
  --json                   Output results as structured JSON
  --strict                 Exit with code 1 if any sloppiness penalty > 0 (ideal for CI)
  --help, -h               Show this help message

Examples:
  node bin/cli.js ./my-local-lab --rubric lab
  node bin/cli.js https://github.com/user/codebase --rubric swe
  node bin/cli.js ./submission --output report.md
  node bin/cli.js ./my-lab --strict
`);
}

async function main() {
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  let repoInput = null;
  let rubricId = 'lab';
  let apiKey = process.env.GEMINI_API_KEY || '';
  let model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  let jsonOutput = false;
  let outputFile = null;
  let strictMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--rubric' || arg === '-r') && args[i + 1]) {
      rubricId = args[++i];
    } else if ((arg === '--key' || arg === '-k') && args[i + 1]) {
      apiKey = args[++i];
    } else if ((arg === '--model' || arg === '-m') && args[i + 1]) {
      model = args[++i];
    } else if ((arg === '--output' || arg === '-o') && args[i + 1]) {
      outputFile = args[++i];
    } else if (arg === '--json') {
      jsonOutput = true;
    } else if (arg === '--strict') {
      strictMode = true;
    } else if (!arg.startsWith('-') && !repoInput) {
      repoInput = arg;
    }
  }

  if (!repoInput) {
    console.error('Error: Repository URL or local folder path is required.');
    process.exit(1);
  }

  const validRubrics = ['lab', 'swe'];
  if (!validRubrics.includes(rubricId)) {
    console.warn(`Warning: Unknown rubric "${rubricId}". Falling back to "lab".`);
    rubricId = 'lab';
  }

  if (!jsonOutput) {
    console.log(`\n🔍 Analyzing repository: ${repoInput}`);
    console.log(`📋 Rubric: ${RUBRICS[rubricId] ? RUBRICS[rubricId].name : rubricId}`);
    if (apiKey) {
      console.log(`🤖 Model: ${model} (Gemini AI Powered)`);
    } else {
      console.log(`⚡ Mode: Static heuristic analysis (Set GEMINI_API_KEY to enable deep AI inspection)`);
    }
    console.log('------------------------------------------------------------\n');
  }

  try {
    const repoBundle = ingestRepository(repoInput);

    const result = await analyzeRepository(repoBundle, {
      rubricId,
      apiKey,
      model,
      onProgress: (p) => {
        if (!jsonOutput) {
          console.log(`[${p.step}] ${p.message}`);
        }
      }
    });

    if (outputFile) {
      const contentToWrite = jsonOutput ? JSON.stringify(result, null, 2) : result.reportText;
      fs.writeFileSync(path.resolve(outputFile), contentToWrite, 'utf-8');
      if (!jsonOutput) {
        console.log(`\n💾 Saved report to: ${outputFile}`);
      }
    }

    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('\n============================================================');
      console.log('                 HYGIENE CHECK REPORT                       ');
      console.log('============================================================\n');
      console.log(result.reportText);
      console.log('\n============================================================\n');
    }

    if (strictMode && result.totalPenalty > 0) {
      console.error(`❌ Strict mode check failed: Sloppiness penalty of ${result.totalPenalty} pts detected.`);
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error during hygiene check: ${error.message}`);
    process.exit(1);
  }
}

main();
