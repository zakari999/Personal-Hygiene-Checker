// Client-side Application Logic for Repo Hygiene Checker

let currentResult = null;
let previousResult = null;
let checklistMode = true;
const checkedItems = new Set();

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
const btnToggleChecklist = document.getElementById('btnToggleChecklist');
const checklistLabel = document.getElementById('checklistLabel');

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

  // Check & Recheck handlers
  btnRunCheck.addEventListener('click', () => runCheck(false));
  btnRecheck.addEventListener('click', () => runCheck(true));

  // Utility buttons
  btnCopyReport.addEventListener('click', copyReportToClipboard);
  btnToggleChecklist.addEventListener('click', toggleChecklistMode);
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
  const model = modalModel.value || 'gemini-2.5-flash';

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

  const activeCategories = result.categories.filter(c => c.items && c.items.length > 0);

  if (activeCategories.length === 0) {
    categoriesList.innerHTML = `
      <div class="p-8 rounded-2xl bg-emerald-950/30 border border-emerald-700/40 text-center space-y-2">
        <i class="ph-bold ph-seal-check text-4xl text-emerald-400"></i>
        <h3 class="text-base font-semibold text-emerald-200">Zero Sloppiness Detected</h3>
        <p class="text-xs text-emerald-400">Your repository meets all professional hygiene criteria without any deductions.</p>
      </div>
    `;
    return;
  }

  activeCategories.forEach((cat, catIdx) => {
    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg';

    let itemsHtml = '';
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
            <span class="font-mono-code font-semibold text-slate-200 citation-tag">${escapeHtml(item.citation)}</span>
            <span class="text-slate-500 font-bold mx-1">—</span>
            <span>${escapeHtml(item.issue)}</span>
          </div>
        </div>
      `;
    });

    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h3 class="text-base font-bold text-white tracking-tight">${escapeHtml(cat.category)}</h3>
          <span class="text-xs font-medium text-slate-400">Sloppiness Level ${cat.level}</span>
        </div>
        <div class="font-mono-code font-bold text-sm text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20">
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
      // re-render checklist styling
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
}

// Copy full raw report matching platform output
function copyReportToClipboard() {
  if (!currentResult || !currentResult.reportText) return;
  navigator.clipboard.writeText(currentResult.reportText).then(() => {
    alert('Platform report copied to clipboard!');
  }).catch(() => {
    prompt('Copy the report below:', currentResult.reportText);
  });
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
