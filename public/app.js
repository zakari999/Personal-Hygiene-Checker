// Client-side Application Logic for Repo Hygiene Checker

let currentResult = null;
let currentArtifacts = [];
let currentCommits = [];
let previousResult = null;
let checklistMode = true;
let currentFilter = 'all';
const checkedItems = new Set();

// Load persisted checked items from localStorage
try {
  const savedChecks = JSON.parse(localStorage.getItem('hygiene_checker_checked_items') || '[]');
  savedChecks.forEach(k => checkedItems.add(k));
} catch {
  // ignore storage errors
}

// Elements
const btnOpenConfig = document.getElementById('btnOpenConfig');
const btnCloseModal = document.getElementById('btnCloseModal');
const btnCancelModal = document.getElementById('btnCancelModal');
const btnSaveConfig = document.getElementById('btnSaveConfig');
const modalConfig = document.getElementById('modalConfig');
const modalApiKey = document.getElementById('modalApiKey');
const modalModel = document.getElementById('modalModel');
const configKeyStatus = document.getElementById('configKeyStatus');

const inputRepoUrl = document.getElementById('inputRepoUrl');
const selectRubric = document.getElementById('selectRubric');
const btnRunCheck = document.getElementById('btnRunCheck');
const progressCard = document.getElementById('progressCard');
const progressTitle = document.getElementById('progressTitle');
const progressSubtitle = document.getElementById('progressSubtitle');

const diffBanner = document.getElementById('diffBanner');
const diffTitle = document.getElementById('diffTitle');
const diffSubtitle = document.getElementById('diffSubtitle');
const diffBadge = document.getElementById('diffBadge');

const resultsSection = document.getElementById('resultsSection');
const badgeTotalPenalty = document.getElementById('badgeTotalPenalty');
const subSummary = document.getElementById('subSummary');
const categoriesList = document.getElementById('categoriesList');
const btnRecheck = document.getElementById('btnRecheck');
const btnCopyReport = document.getElementById('btnCopyReport');
const btnDownloadReport = document.getElementById('btnDownloadReport');
const btnToggleChecklist = document.getElementById('btnToggleChecklist');
const checklistLabel = document.getElementById('checklistLabel');

// Code Viewer Modal Elements
const modalCodeViewer = document.getElementById('modalCodeViewer');
const btnCloseCodeViewer = document.getElementById('btnCloseCodeViewer');
const btnDismissCodeViewer = document.getElementById('btnDismissCodeViewer');
const codeViewerTitle = document.getElementById('codeViewerTitle');
const codeViewerSubtitle = document.getElementById('codeViewerSubtitle');
const codeViewerContent = document.getElementById('codeViewerContent');
const codeViewerFooter = document.getElementById('codeViewerFooter');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await fetchConfig();

  // Setup Sample Buttons
  document.querySelectorAll('.btn-sample').forEach(btn => {
    btn.addEventListener('click', () => {
      inputRepoUrl.value = btn.getAttribute('data-url');
    });
  });

  // Modal handlers
  btnOpenConfig.addEventListener('click', () => modalConfig.classList.remove('hidden'));
  btnCloseModal.addEventListener('click', () => modalConfig.classList.add('hidden'));
  btnCancelModal.addEventListener('click', () => modalConfig.classList.add('hidden'));
  btnSaveConfig.addEventListener('click', saveConfig);

  // Code Viewer handlers
  btnCloseCodeViewer.addEventListener('click', () => modalCodeViewer.classList.add('hidden'));
  btnDismissCodeViewer.addEventListener('click', () => modalCodeViewer.classList.add('hidden'));

  // Check & Recheck handlers
  btnRunCheck.addEventListener('click', () => runCheck(false));
  btnRecheck.addEventListener('click', () => runCheck(true));

  // Utility buttons
  btnCopyReport.addEventListener('click', copyReportToClipboard);
  if (btnDownloadReport) {
    btnDownloadReport.addEventListener('click', downloadReportMarkdown);
  }
  btnToggleChecklist.addEventListener('click', toggleChecklistMode);

  // Filter Tabs
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(t => {
        t.className = 'filter-tab px-3 py-1 rounded-lg text-xs font-medium bg-slate-800/80 hover:bg-slate-800 text-slate-400 border border-slate-700';
      });
      tab.className = 'filter-tab px-3 py-1 rounded-lg text-xs font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30';
      currentFilter = tab.getAttribute('data-filter');
      if (currentResult) {
        renderResults({ result: currentResult }, null);
      }
    });
  });
});

// Fetch Server & Key Configuration
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.hasGeminiKey) {
      configKeyStatus.textContent = 'API Key Configured ✓';
      configKeyStatus.classList.add('text-emerald-400');
    } else {
      configKeyStatus.textContent = 'Configure API Key';
      configKeyStatus.classList.remove('text-emerald-400');
    }
    if (data.defaultModel) {
      modalModel.value = data.defaultModel;
    }
  } catch (err) {
    console.warn('Failed to load config:', err);
  }
}

// Save Configuration
async function saveConfig() {
  const apiKey = modalApiKey.value.trim();
  const model = modalModel.value;

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, model })
    });
    const data = await res.json();
    if (data.success) {
      modalConfig.classList.add('hidden');
      await fetchConfig();
      alert('Configuration saved successfully!');
    }
  } catch (err) {
    alert('Error saving configuration: ' + err.message);
  }
}

// Run or Re-run Hygiene Check
async function runCheck(isRecheck = false) {
  const repoUrl = inputRepoUrl.value.trim();
  if (!repoUrl) {
    alert('Please enter a GitHub repository URL or a local folder path.');
    inputRepoUrl.focus();
    return;
  }

  const rubricId = selectRubric.value;
  const model = modalModel.value || 'gemini-2.0-flash';

  // UI state
  progressCard.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  diffBanner.classList.add('hidden');

  progressTitle.textContent = isRecheck ? 'Re-checking Repository & Comparing Diffs...' : 'Inspecting Repository...';
  progressSubtitle.textContent = 'Pulling commits, numbering line artifacts, and executing deep hygiene audit...';

  try {
    const endpoint = isRecheck ? '/api/recheck' : '/api/check';
    const payload = {
      repoUrl,
      rubricId,
      model,
      previousResult: isRecheck ? currentResult : null
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to inspect repository.');
    }

    if (isRecheck) {
      previousResult = currentResult;
    }
    currentResult = data.result;
    currentArtifacts = data.artifacts || [];
    currentCommits = data.commits || [];

    renderResults(data, isRecheck ? data.diff : null);
  } catch (err) {
    alert('Hygiene Check Error: ' + err.message);
  } finally {
    progressCard.classList.add('hidden');
  }
}

// Render Results matching the Module Lab portal
function renderResults(data, diff) {
  const { result } = data;
  resultsSection.classList.remove('hidden');

  // Total penalty badge
  badgeTotalPenalty.textContent = result.totalDeductionFormatted;
  if (result.totalPenalty === 0) {
    badgeTotalPenalty.className = 'font-mono-code text-2xl px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
    subSummary.textContent = 'All hygiene checks passed with zero sloppiness detected! Clean and ready for final submission.';
  } else {
    badgeTotalPenalty.className = 'font-mono-code text-2xl px-3 py-1 rounded-xl bg-rose-500/15 text-rose-400 border border-rose-500/30';
    subSummary.textContent = 'Review the issues below and correct them on your codebase before final submission.';
  }

  // Handle Diff Banner if rechecking
  if (diff) {
    diffBanner.classList.remove('hidden');
    if (diff.isImproved) {
      diffTitle.textContent = `Score Improved by +${diff.improvement.toFixed(2)} pts!`;
      diffSubtitle.textContent = `Penalties dropped from ${diff.previousPenalty.toFixed(2)} pts to ${diff.currentPenalty.toFixed(2)} pts. Resolved ${diff.resolvedCount} issues.`;
      diffBadge.textContent = `+${diff.improvement.toFixed(2)} pts`;
      diffBadge.className = 'px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono-code font-bold text-sm border border-emerald-500/30';
    } else if (diff.improvement < 0) {
      diffTitle.textContent = `Sloppiness Increased (${diff.improvement.toFixed(2)} pts)`;
      diffSubtitle.textContent = 'New issues were introduced since the last check.';
      diffBadge.textContent = `${diff.improvement.toFixed(2)} pts`;
      diffBadge.className = 'px-3 py-1.5 rounded-lg bg-rose-500/20 text-rose-300 font-mono-code font-bold text-sm border border-rose-500/30';
    } else {
      diffTitle.textContent = 'Score Unchanged';
      diffSubtitle.textContent = 'No change in total penalties detected since the last check.';
      diffBadge.textContent = '0.00 pts';
      diffBadge.className = 'px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 font-mono-code font-bold text-sm border border-slate-700';
    }
  }

  // Render Category Cards
  categoriesList.innerHTML = '';

  let filteredCategories = result.categories || [];
  if (currentFilter === 'penalties') {
    filteredCategories = filteredCategories.filter(c => c.items && c.items.length > 0);
  } else if (currentFilter === 'clean') {
    filteredCategories = filteredCategories.filter(c => !c.items || c.items.length === 0);
  }

  if (filteredCategories.length === 0) {
    categoriesList.innerHTML = `
      <div class="p-8 rounded-2xl bg-emerald-950/30 border border-emerald-700/40 text-center space-y-2">
        <i class="ph-bold ph-seal-check text-4xl text-emerald-400"></i>
        <h3 class="text-base font-semibold text-emerald-200">Zero Sloppiness Detected</h3>
        <p class="text-xs text-emerald-400">No issues found matching the active filter.</p>
      </div>
    `;
    return;
  }

  filteredCategories.forEach((cat) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg';

    let itemsHtml = '';
    const hasItems = cat.items && cat.items.length > 0;

    if (!hasItems) {
      itemsHtml = `
        <div class="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-xs text-emerald-300 flex items-center gap-2">
          <i class="ph-bold ph-check-circle text-emerald-400"></i>
          <span>Passing cleanly — no sloppiness detected in this category.</span>
        </div>
      `;
    } else {
      cat.items.forEach((item, itemIdx) => {
        const itemKey = `${cat.category}-${item.citation}-${itemIdx}`;
        const isChecked = checkedItems.has(itemKey);

        itemsHtml += `
          <div class="flex items-start gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
            ${checklistMode ? `
              <input type="checkbox" id="${itemKey}" data-key="${itemKey}" ${isChecked ? 'checked' : ''} 
                class="item-checkbox mt-1 w-4 h-4 rounded border-slate-700 text-rose-600 focus:ring-rose-500 focus:ring-offset-slate-900 cursor-pointer">
            ` : ''}
            <div class="text-xs leading-relaxed text-slate-300 ${isChecked ? 'line-through opacity-50' : ''}">
              <button class="citation-btn font-mono-code font-semibold text-rose-300 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 px-1.5 py-0.5 rounded border border-rose-500/20 text-left transition-colors cursor-pointer" data-citation="${escapeHtml(item.citation)}">
                ${escapeHtml(item.citation)}
              </button>
              <span class="text-slate-500 font-bold mx-1">—</span>
              <span>${escapeHtml(item.issue)}</span>
            </div>
          </div>
        `;
      });
    }

    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h3 class="text-base font-bold text-white tracking-tight">${escapeHtml(cat.category)}</h3>
          <span class="text-xs font-medium text-slate-400">Sloppiness Level ${cat.level}</span>
        </div>
        <div class="font-mono-code font-bold text-sm ${cat.deduction > 0 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'} px-2.5 py-1 rounded-lg border">
          ${cat.deductionFormatted}
        </div>
      </div>

      ${cat.summary ? `
        <p class="text-xs text-slate-400 leading-relaxed italic">
          ${escapeHtml(cat.summary)}
        </p>
      ` : ''}

      <div class="space-y-2 pt-1">
        ${itemsHtml}
      </div>
    `;

    categoriesList.appendChild(card);
  });

  // Attach checkbox listeners
  document.querySelectorAll('.item-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const key = e.target.getAttribute('data-key');
      if (e.target.checked) {
        checkedItems.add(key);
      } else {
        checkedItems.delete(key);
      }
      try {
        localStorage.setItem('hygiene_checker_checked_items', JSON.stringify([...checkedItems]));
      } catch {
        // ignore
      }
      const textContainer = e.target.nextElementSibling;
      if (textContainer) {
        if (e.target.checked) {
          textContainer.classList.add('line-through', 'opacity-50');
        } else {
          textContainer.classList.remove('line-through', 'opacity-50');
        }
      }
    });
  });

  // Attach citation button listeners to open code viewer
  document.querySelectorAll('.citation-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const citation = e.target.getAttribute('data-citation');
      openCitationViewer(citation);
    });
  });
}

// Open Citation Code Viewer Modal
function openCitationViewer(citation) {
  if (!citation) return;

  const isCommitsCitation = citation.toLowerCase().includes('commits');

  if (isCommitsCitation) {
    codeViewerTitle.textContent = `Git Commit History Inspector`;
    codeViewerSubtitle.textContent = `Inspecting ${currentCommits.length} commits for conventional formatting, scopes, and micro-edits`;
    codeViewerFooter.textContent = `Citation: ${citation} across repository git log`;

    if (!currentCommits || currentCommits.length === 0) {
      codeViewerContent.innerHTML = `<div class="text-slate-500 italic p-4">No commit history available.</div>`;
    } else {
      let html = '<div class="space-y-1.5">';
      currentCommits.forEach((c) => {
        const isVague = /^(added|adding|updated|updating|changed|description|edit|fix|wip|temp)\b/i.test(c.subject) && !c.subject.includes(':');
        const isDuplicateEdit = /readme\s*(edit|diagnosis)/i.test(c.subject);

        html += `
          <div class="flex items-center gap-3 p-2 rounded ${isDuplicateEdit || isVague ? 'bg-rose-950/40 border border-rose-800/50' : 'bg-slate-900/60 border border-slate-800/60'}">
            <span class="font-mono-code text-rose-400 font-semibold px-2 py-0.5 rounded bg-slate-950 text-xs">${escapeHtml(c.hash)}</span>
            <span class="text-slate-500 text-xs">${escapeHtml(c.date)}</span>
            <span class="text-slate-300 font-medium text-xs flex-1 truncate">${escapeHtml(c.subject)}</span>
            ${isDuplicateEdit ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Squash Candidate</span>' : ''}
            ${isVague ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">Vague Subject</span>' : ''}
          </div>
        `;
      });
      html += '</div>';
      codeViewerContent.innerHTML = html;
    }

    modalCodeViewer.classList.remove('hidden');
    return;
  }

  // Citation format: "artifact <N>, line <L>"
  const artMatch = citation.match(/artifact\s*(\d+)/i);
  const lineMatch = citation.match(/line\s*(\d+)/i);

  const artIndex = artMatch ? parseInt(artMatch[1], 10) : 1;
  const targetLine = lineMatch ? parseInt(lineMatch[1], 10) : null;

  const targetArtifact = currentArtifacts.find(a => a.index === artIndex) || currentArtifacts[0];

  if (!targetArtifact) {
    alert(`Could not locate source artifact for citation: "${citation}"`);
    return;
  }

  codeViewerTitle.textContent = `${targetArtifact.name} (Artifact ${targetArtifact.index})`;
  codeViewerSubtitle.textContent = targetLine
    ? `Inspecting line ${targetLine} of ${targetArtifact.lineCount} total lines`
    : `Inspecting ${targetArtifact.name}`;

  codeViewerFooter.textContent = `Citation: ${citation} in ${targetArtifact.name}`;

  const lines = targetArtifact.lines || [];
  let html = '';

  const startLine = targetLine ? Math.max(1, targetLine - 8) : 1;
  const endLine = targetLine ? Math.min(lines.length, targetLine + 8) : Math.min(lines.length, 50);

  for (let i = startLine; i <= endLine; i++) {
    const lineText = lines[i - 1] || '';
    const isTarget = i === targetLine;

    html += `
      <div class="flex items-start py-0.5 px-2 rounded ${isTarget ? 'line-highlight font-semibold text-rose-200' : 'text-slate-400 hover:text-slate-200'}">
        <span class="w-12 shrink-0 select-none text-right pr-4 text-slate-600 font-mono-code">${i}</span>
        <span class="whitespace-pre-wrap break-all">${escapeHtml(lineText)}</span>
      </div>
    `;
  }

  codeViewerContent.innerHTML = html;
  modalCodeViewer.classList.remove('hidden');
}

// Copy full raw report matching platform output
function copyReportToClipboard() {
  if (!currentResult || !currentResult.reportText) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentResult.reportText).then(() => {
      alert('Platform report copied to clipboard!');
    }).catch(() => {
      prompt('Copy the report below:', currentResult.reportText);
    });
  } else {
    prompt('Copy the report below:', currentResult.reportText);
  }
}

// Download Report as Markdown (.md)
function downloadReportMarkdown() {
  if (!currentResult || !currentResult.reportText) return;

  const blob = new Blob([currentResult.reportText], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hygiene-report-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Toggle Checklist Mode
function toggleChecklistMode() {
  checklistMode = !checklistMode;
  checklistLabel.textContent = checklistMode ? 'Checklist Mode' : 'Read-only Mode';
  if (currentResult) {
    renderResults({ result: currentResult }, null);
  }
}

// HTML escape helper
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
