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
- **Deep Multimodal AI Inspection (Recommended: Google Gemini 2.5 Flash)**:
  - Ingests entire repositories (all source files line-numbered, complete git log) using Gemini's **1M+ token context window**.
  - Multimodal vision inspection: visually checks `docs/sketch.png` or wireframes against the HTML/CSS markup and README tables for design fidelity.
- **Interactive Web Dashboard**:
  - Checkbox checklist mode: check off issues as you fix them.
  - One-click **"Recheck Repo Now"** button: pulls the latest git commit and displays an **Improvement Diff Banner** showing penalty reductions.
  - Copy Platform Report to clipboard with one click.
- **Terminal CLI**:
  - Directly executable in your terminal: `node bin/cli.js <repo-url>`.

---

## 🚀 Quick Start

### 1. Installation
The project runs on Node.js (v18+). Dependencies are already installed:
```bash
npm install
```

### 2. Configure Your API Key (Recommended)
We recommend **Google Gemini 2.5 Flash** for deep audits. You can get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).

Set it in `.env` (or configure it directly in the Web UI):
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```
*(Note: If no API key is provided, the tool runs in **Static Heuristic Mode**, which still detects commit hygiene, markdown truncation, accessibility markup omissions, and run steps).*

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

# Audit using the Software Engineering Rubric (table.tsv)
node bin/cli.js https://github.com/username/my-codebase --rubric swe

# Audit a local folder
node bin/cli.js ./my-local-project
```

---

## 📊 Verification & Test Suite

Run the built-in test suite to verify the scoring mathematics and sample report output:
```bash
npm test
```
This tests:
1. Exact scoring calculation against the benchmark $(-5.65\text{ pts})$.
2. Markdown truncation detection on unclosed quotes/incomplete tables.
3. Commit history noise detection.
4. Diff comparison engine across rechecks.

---

## 🛠 Project Structure

```
├── bin/
│   └── cli.js                  # Command-line interface executable
├── public/
│   ├── index.html              # Sleek Tailwind web application
│   └── app.js                  # Client logic, checklist & diff rechecker
├── src/
│   ├── core/
│   │   ├── rubrics.js          # Rubric A (Lab) and Rubric B (SWE table.tsv)
│   │   ├── ingestor.js         # Git clone/pull, commit parser, line-numbered artifacts
│   │   ├── static_analyzer.js  # Heuristic linters (truncation, accessibility, commit noise)
│   │   ├── ai_analyzer.js      # Deep Gemini 2.5 Flash integration & multimodal prompt
│   │   └── scorer.js           # Exact penalty math (-0.47 quantum) & report formatter
│   └── server/
│       └── server.js           # Express REST API server
├── test/
│   ├── verify_sample.js        # Benchmark verification test
│   └── fixtures/               # Mock repository test fixtures
├── table.tsv                   # Software Engineering criteria
└── package.json
```
