# GitHub Repo Project Hygiene Checker

> **Professional automated sloppiness auditor for module lab submissions & software engineering repositories.**
> Formats output identically to the official module grading platform and provides an interactive "Fix & Recheck" loop so you can eliminate penalties before final submission.

---

## 🎯 Features

- **Exact Platform Output Replication**:
  - Top-level `Sloppiness penalty\n−X.XX pts`
  - Per-category breakdowns with `Sloppiness Level X` and `-X.XX pts`
  - Exact citation syntax:
    - Document & code citations: `artifact <N>, line <L> — <critique & fix instruction>`
    - Commit history citations: `artifact <N>, commits — <squashing & conventional commit guidance>`
  - Official platform closing statement.
- **Quantum Scoring Engine**:
  - Implements the platform's exact unrounded quantum penalty unit ($5.65 / 12 \approx 0.470833\text{ pts}$), guaranteeing identical subtotals and total deductions.
- **Dual Rubrics Supported**:
  - **Rubric A (Module Lab Report & Design Rubric)**: Matches your lab platform (Styling & responsive layout, Accessibility, UI content & form UX, Delivery & documentation, Design-artifact fidelity).
  - **Rubric B (Software Engineering Hygiene Rubric)**: Incorporates all 10 criteria from `table.tsv` (Readability & naming, Architecture, Robustness, Error handling, Security, Dependency hygiene, API & database, Tests, Version control, Documentation).
- **Deep Multimodal AI Inspection (Recommended: Google Gemini 2.0 Flash)**:
  - Ingests entire repositories (all source files line-numbered, complete git log) using Gemini's **1M+ token context window**.
  - Multimodal vision inspection: visually checks `docs/sketch.png` or wireframes against the HTML/CSS markup and README tables for design fidelity.
  - Automatic fallback: graceful model failover from `gemini-2.0-flash` to `gemini-1.5-flash`.
- **Interactive Web Dashboard**:
  - Checkbox checklist mode: check off issues as you fix them (persisted to `localStorage`).
  - One-click **"★ Kwame's Wheelhouse (Benchmark Lab)"** sample loader.
  - Interactive **Code Citation Line Inspector**: click any `artifact <N>, line <L>` tag to preview referenced code with highlighted target lines.
  - Interactive **Git Commit History Inspector**: click any `artifact <N>, commits` tag to view all commits with squash and vague message badges.
  - One-click **"Recheck Repo Now"** button: pulls the latest git commit and displays an **Improvement Diff Banner** showing penalty reductions.
  - Export & Sharing: Copy Platform Report to clipboard or **Download .md Report** with one click.
  - Category Filter tabs (All Categories, Penalties Only, Zero Deductions).
- **Security & Injection Hardened**:
  - Uses `execFileSync` without shell invocation, immune to command injection.
  - 60-second timeouts and `GIT_TERMINAL_PROMPT=0` to prevent server hangs.
  - Sanitized header-based Gemini API authentication (`x-goog-api-key`).
- **Terminal CLI**:
  - Directly executable in your terminal: `node bin/cli.js <repo-url> [options]`.
  - Supports `--strict` flag to fail CI/CD pipelines if sloppiness is detected.

---

## 🚀 Quick Start

### 1. Installation
The project runs on Node.js (v18+). Dependencies are already installed:
```bash
npm install
```

### 2. Configure Your API Key (Recommended)
We recommend **Google Gemini 2.0 Flash** for deep audits. You can get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

Set it in `.env` (or configure it directly in the Web UI):
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
```
*(Note: If no API key is provided, the tool runs in **Calibrated Heuristic Mode**, which evaluates both Lab and SWE rubrics deterministically using line-numbered syntax linters).*

### 3. Launch the Web UI
```bash
npm start
```
Open your browser to:
👉 **`http://localhost:3000`**

### 4. Or Run via CLI
```bash
# Audit using the Module Lab Rubric (default)
node bin/cli.js https://github.com/username/my-module-lab

# Audit the benchmark sample repo locally
node bin/cli.js ./test/fixtures/mock_lab_repo

# Audit using the Software Engineering Rubric (table.tsv)
node bin/cli.js ./test/fixtures/mock_lab_repo --rubric swe

# Save report to markdown file
node bin/cli.js ./test/fixtures/mock_lab_repo -o report.md

# Run in CI mode (fails with exit code 1 if penalties > 0)
node bin/cli.js ./test/fixtures/mock_lab_repo --strict
```

---

## 📊 Verification & Test Suite

Run the built-in test suite:
```bash
npm test
```
This runs 4 comprehensive automated test suites:
1. **Benchmark Scoring Verification** (`test/verify_sample.js`): Exact scoring calculation against the benchmark ($-5.65\text{ pts}$).
2. **Security & Resilience Tests** (`test/test_security_resilience.js`): Shell injection resistance, markdown truncation on unclosed code blocks/links, JSON extraction, and diff engine fingerprinting.
3. **SWE Rubric 10-Criteria Verification** (`test/test_swe_rubric.js`): Hardcoded secrets, empty catch blocks, sensitive logging, leftover debuggers, `SELECT *`, test coverage, and commit noise.
4. **Server Integration Tests** (`test/test_server_endpoints.js`): Express REST API endpoints (`/api/rubrics`, `/api/config`, `/api/check`).

---

## 🛠 Project Structure

```
├── bin/
│   └── cli.js                  # Command-line interface executable with --strict and -o flags
├── public/
│   ├── index.html              # Sleek Tailwind web application with Code Inspector modal
│   └── app.js                  # Client logic, checklist persistence, diff rechecker, code viewer
├── src/
│   ├── core/
│   │   ├── rubrics.js          # Rubric A (Lab) and Rubric B (SWE 10-criteria from table.tsv)
│   │   ├── ingestor.js         # Secure git sync, commit parser, line-numbered artifacts, truncation
│   │   ├── static_analyzer.js  # Coordinator for deterministic static scanners
│   │   ├── linters/
│   │   │   ├── lab_linter.js   # Lab-specific linters (A11y, responsive CSS, forms, design fidelity)
│   │   │   └── swe_linter.js   # SWE linters (secrets, empty catch, debugger, SELECT *, test detection)
│   │   ├── ai_analyzer.js      # Gemini 2.0 Flash integration, header auth, clean JSON extraction
│   │   └── scorer.js           # Exact quantum penalty math (-0.47) and item fingerprint diff engine
│   └── server/
│       └── server.js           # Express REST API server with /api/health and error middleware
├── test/
│   ├── run_all_tests.js        # Comprehensive test runner
│   ├── verify_sample.js        # Benchmark verification test (-5.65 pts)
│   ├── test_security_resilience.js # Shell injection, truncation, and diff resilience tests
│   ├── test_swe_rubric.js      # SWE 10-criteria static analysis tests
│   ├── test_server_endpoints.js # Express API server integration tests
│   └── fixtures/               # Realistic mock repository test fixtures (Kwame's Wheelhouse)
├── table.tsv                   # Software Engineering criteria
├── .gitignore                  # Git hygiene ignore rules
└── package.json
```
