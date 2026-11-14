// Client-side Application Logic for Repo Hygiene Checker — Precision Sharp UI

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
} catch (err) {
  console.debug('Could not load cached checklist items:', err.message);
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
const selectBranch = document.getElementById('selectBranch');
const btnRefreshBranches = document.getElementById('btnRefreshBranches');
const selectRubric = document.getElementById('selectRubric');
const btnRunCheck = document.getElementById('btnRunCheck');
const progressCard = document.getElementById('progressCard');
const progressTitle = document.getElementById('progressTitle');
const progressSubtitle = document.getElementById('progressSubtitle');

const aiWarningBanner = document.getElementById('aiWarningBanner');
const aiWarningTitle = document.getElementById('aiWarningTitle');
const aiWarningMessage = document.getElementById('aiWarningMessage');

const diffBanner = document.getElementById('diffBanner');
const diffTitle = document.getElementById('diffTitle');
const diffSubtitle = document.getElementById('diffSubtitle');
const diffBadge = document.getElementById('diffBadge');

const resultsSection = document.getElementById('resultsSection');
const badgeTotalPenalty = document.getElementById('badgeTotalPenalty');
const badgeTargetInfo = document.getElementById('badgeTargetInfo');
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
    btn.addEventListener('click', async () => {
      inputRepoUrl.value = btn.getAttribute('data-url');
      const branch = btn.getAttribute('data-branch') || 'main';
      const rubric = btn.getAttribute('data-rubric') || 'lab';
      selectRubric.value = rubric;

      await fetchBranches(inputRepoUrl.value, branch);
    });
  });

  // Fetch branches on URL change or blur
  inputRepoUrl.addEventListener('blur', () => {
    if (inputRepoUrl.value.trim()) {
      fetchBranches(inputRepoUrl.value.trim());
    }
  });

  btnRefreshBranches.addEventListener('click', (e) => {
    e.preventDefault();
    if (inputRepoUrl.value.trim()) {
      fetchBranches(inputRepoUrl.value.trim(), selectBranch.value);
    }
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
        t.className = 'filter-tab px-2 py-0.5 rounded-sm text-xs font-mono bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-200';
      });
      tab.className = 'filter-tab px-2 py-0.5 rounded-sm text-xs font-mono bg-zinc-200 text-zinc-950 font-semibold';
      currentFilter = tab.getAttribute('data-filter');
      if (currentResult) {
        renderResults({ result: currentResult, repo: currentResult.repo, branch: currentResult.branch }, null);
      }
    });
  });
});

// Fetch branches for repo URL
async function fetchBranches(repoUrl, preferredBranch = null) {
  if (!repoUrl) return;

  btnRefreshBranches.innerHTML = '<i class="ph ph-circle-notch animate-spin text-[10px]"></i>';
  try {
    const res = await fetch(`/api/branches?repo=${encodeURIComponent(repoUrl)}`);
    const data = await res.json();
    if (data.success && data.branches && data.branches.length > 0) {
      selectBranch.innerHTML = '';
      data.branches.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b;
        opt.textContent = b;
        selectBranch.appendChild(opt);
      });

      const targetBranch = preferredBranch && data.branches.includes(preferredBranch)
        ? preferredBranch
        : (data.branches.includes(data.defaultBranch) ? data.defaultBranch : data.branches[0]);

      selectBranch.value = targetBranch;
    }
  } catch (err) {
    console.debug('Could not auto-fetch branches:', err.message);
  } finally {
    btnRefreshBranches.innerHTML = '<i class="ph ph-arrows-clockwise text-[10px]"></i> fetch';
  }
}

// Fetch Server & Key Configuration
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.hasGeminiKey) {
      if (data.isValidKeyFormat) {
        configKeyStatus.textContent = 'API Key Active ✓';
        configKeyStatus.className = 'text-emerald-400 font-semibold';
      } else {
        configKeyStatus.textContent = 'Key Too Short ⚠️';
        configKeyStatus.className = 'text-amber-400 font-semibold';
      }
    } else {
      configKeyStatus.textContent = 'API Settings';
      configKeyStatus.className = 'text-zinc-300';
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

  const branch = selectBranch.value || 'main';
  const rubricId = selectRubric.value;
  const model = modalModel.value || 'gemini-3-flash-preview';

  // UI state
  progressCard.classList.remove('hidden');
  resultsSection.classList.add('hidden');
  diffBanner.classList.add('hidden');
  aiWarningBanner.classList.add('hidden');

  progressTitle.textContent = isRecheck ? 'Re-checking Branch & Computing Diffs...' : `Auditing Branch: ${branch}...`;
  progressSubtitle.textContent = 'Pulling commits, inspecting line artifacts, and executing uncompromising sloppiness audit...';

  try {
    const endpoint = isRecheck ? '/api/recheck' : '/api/check';
    const payload = {
      repoUrl,
      branch,
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
    currentResult.repo = data.repo;
    currentResult.branch = data.branch;
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

  // AI Diagnostic Warning Banner
  if (result.aiError) {
    aiWarningBanner.classList.remove('hidden');
    if (/401|api key not valid|invalid/i.test(result.aiError)) {
      aiWarningTitle.textContent = 'Invalid Gemini API Key Detected (HTTP 401)';
      aiWarningMessage.innerHTML = `Google AI rejected the key configured in <code class="text-zinc-200">.env</code>. Official keys start with <strong class="text-white">AIzaSy...</strong>. Please open <button onclick="document.getElementById('btnOpenConfig').click()" class="underline text-amber-200 hover:text-white font-bold">API Settings</button> and paste a valid key from Google AI Studio. The audit ran using deterministic static linters.`;
    } else {
      aiWarningTitle.textContent = 'AI Engine Notice (Fell back to static linters)';
      aiWarningMessage.textContent = result.aiError;
    }
  } else {
    aiWarningBanner.classList.add('hidden');
  }

  // Target info badge
  const activeBranch = data.branch || result.branch || 'main';
  const activeRepo = data.repo || result.repo || 'target';
  const modelMode = result.isAiPowered ? `AI:${result.modelUsed}` : 'STATIC HEURISTIC';
  badgeTargetInfo.textContent = `${activeRepo} • branch:${activeBranch} • [${modelMode}]`;

  // Total penalty badge
  badgeTotalPenalty.textContent = result.totalDeductionFormatted;
  if (result.totalPenalty === 0) {
    badgeTotalPenalty.className = 'font-mono-code text-2xl font-bold px-2 py-0.5 rounded-sm bg-emerald-950/60 text-emerald-400 border border-emerald-800/80';
    subSummary.textContent = 'All hygiene checks passed with zero sloppiness detected. Clean and ready for final submission.';
  } else {
    badgeTotalPenalty.className = 'font-mono-code text-2xl font-bold px-2 py-0.5 rounded-sm bg-rose-950/60 text-rose-400 border border-rose-800/80';
    subSummary.textContent = 'Review the issues below and correct them on your codebase before final submission.';
  }

  // Handle Diff Banner if rechecking
  if (diff) {
    diffBanner.classList.remove('hidden');
    if (diff.isImproved) {
      diffTitle.textContent = `Score Improved by +${diff.improvement.toFixed(2)} pts!`;
      diffSubtitle.textContent = `Penalties dropped from ${diff.previousPenalty.toFixed(2)} pts to ${diff.currentPenalty.toFixed(2)} pts. Resolved ${diff.resolvedCount} issues.`;
      diffBadge.textContent = `+${diff.improvement.toFixed(2)} pts`;
      diffBadge.className = 'px-2.5 py-1 rounded-sm bg-emerald-900/80 text-emerald-200 font-mono-code font-bold text-xs border border-emerald-700';
    } else if (diff.improvement < 0) {
      diffTitle.textContent = `Sloppiness Increased (${diff.improvement.toFixed(2)} pts)`;
      diffSubtitle.textContent = 'New issues were introduced since the last check.';
      diffBadge.textContent = `${diff.improvement.toFixed(2)} pts`;
      diffBadge.className = 'px-2.5 py-1 rounded-sm bg-rose-900/80 text-rose-200 font-mono-code font-bold text-xs border border-rose-700';
    } else {
      diffTitle.textContent = 'Score Unchanged';
      diffSubtitle.textContent = 'No change in total penalties detected since the last check.';
      diffBadge.textContent = '0.00 pts';
      diffBadge.className = 'px-2.5 py-1 rounded-sm bg-zinc-800 text-zinc-300 font-mono-code font-bold text-xs border border-zinc-700';
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
      <div class="p-6 rounded-sm bg-[#10121a] border border-zinc-800 text-center space-y-1">
        <i class="ph-bold ph-check-circle text-2xl text-emerald-400"></i>
        <h3 class="text-xs font-mono font-bold text-emerald-200 uppercase">Zero Issues in Filter</h3>
        <p class="text-[11px] font-mono text-zinc-500">No issues found matching the selected view filter.</p>
      </div>
    `;
    return;
  }

  filteredCategories.forEach((cat) => {
    const card = document.createElement('div');
    card.className = 'bg-[#10121a] border border-zinc-800 rounded-sm p-4 space-y-3';

    let itemsHtml = '';
    const hasItems = cat.items && cat.items.length > 0;

    if (!hasItems) {
      itemsHtml = `
        <div class="p-2.5 rounded-sm bg-emerald-950/20 border border-emerald-900/40 text-[11px] font-mono text-emerald-300 flex items-center gap-2">
          <i class="ph-bold ph-check text-xs text-emerald-400"></i>
          <span>Passing cleanly — no sloppiness detected in this criterion.</span>
        </div>
      `;
    } else {
      cat.items.forEach((item, itemIdx) => {
        const itemKey = `${cat.category}-${item.citation}-${itemIdx}`;
        const isChecked = checkedItems.has(itemKey);

        itemsHtml += `
          <div class="flex items-start gap-2.5 p-2.5 rounded-sm bg-[#090a0f] border border-zinc-800 hover:border-zinc-700 transition-colors">
            ${checklistMode ? `
              <input type="checkbox" id="${itemKey}" data-key="${itemKey}" ${isChecked ? 'checked' : ''} 
                class="item-checkbox mt-0.5 w-3.5 h-3.5 rounded-sm border-zinc-700 bg-zinc-900 text-zinc-100 focus:ring-0 cursor-pointer">
            ` : ''}
            <div class="text-xs leading-relaxed text-zinc-300 ${isChecked ? 'line-through opacity-40' : ''}">
              <button class="citation-btn font-mono-code font-bold text-rose-300 hover:text-rose-200 bg-rose-950/50 hover:bg-rose-900/60 px-1 py-0.5 rounded-sm border border-rose-800/80 text-left transition-colors cursor-pointer" data-citation="${escapeHtml(item.citation)}">
                ${escapeHtml(item.citation)}
              </button>
              <span class="text-zinc-600 font-bold mx-1">—</span>
              <span class="text-zinc-300 font-normal">${escapeHtml(item.issue)}</span>
            </div>
          </div>
        `;
      });
    }

    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
        <div>
          <h3 class="text-sm font-bold text-white tracking-tight font-mono">${escapeHtml(cat.category)}</h3>
          <span class="text-[11px] font-mono text-zinc-500">Sloppiness Level ${cat.level}</span>
        </div>
        <div class="font-mono-code font-bold text-xs ${cat.deduction > 0 ? 'text-rose-400 bg-rose-950/50 border-rose-800/70' : 'text-emerald-400 bg-emerald-950/50 border-emerald-800/70'} px-2 py-0.5 rounded-sm border">
          ${cat.deductionFormatted}
        </div>
      </div>

      ${cat.summary ? `
        <p class="text-xs text-zinc-400 leading-relaxed font-sans">
          ${escapeHtml(cat.summary)}
        </p>
      ` : ''}

      <div class="space-y-1.5 pt-0.5">
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
      } catch (err) {
        console.debug('Could not persist checklist item state:', err.message);
      }
      const textContainer = e.target.nextElementSibling;
      if (textContainer) {
        if (e.target.checked) {
          textContainer.classList.add('line-through', 'opacity-40');
        } else {
          textContainer.classList.remove('line-through', 'opacity-40');
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
      codeViewerContent.innerHTML = `<div class="text-zinc-500 italic p-4">No commit history available.</div>`;
    } else {
      let html = '<div class="space-y-1">';
      currentCommits.forEach((c) => {
        const isVague = /^(added|adding|updated|updating|changed|description|edit|fix|wip|temp)\b/i.test(c.subject) && !c.subject.includes(':');
        const isDuplicateEdit = /readme\s*(edit|diagnosis)/i.test(c.subject);
        const isMerge = /^merge\s+(pull\s+request|branch)/i.test(c.subject);

        html += `
          <div class="flex items-center gap-2.5 p-1.5 rounded-sm ${isMerge || isDuplicateEdit || isVague ? 'bg-rose-950/40 border border-rose-800/60' : 'bg-[#10121a] border border-zinc-800'}">
            <span class="font-mono-code text-rose-300 font-semibold px-1.5 py-0.2 rounded-sm bg-black text-[11px]">${escapeHtml(c.hash)}</span>
            <span class="text-zinc-500 text-[11px]">${escapeHtml(c.date)}</span>
            <span class="text-zinc-300 font-medium text-xs flex-1 truncate font-mono">${escapeHtml(c.subject)}</span>
            ${isMerge ? '<span class="text-[10px] uppercase font-mono px-1 py-0.2 rounded-sm bg-rose-950 text-rose-300 border border-rose-800">merge</span>' : ''}
            ${isVague ? '<span class="text-[10px] uppercase font-mono px-1 py-0.2 rounded-sm bg-amber-950 text-amber-300 border border-amber-800">vague</span>' : ''}
            ${isDuplicateEdit ? '<span class="text-[10px] uppercase font-mono px-1 py-0.2 rounded-sm bg-rose-950 text-rose-300 border border-rose-800">squash</span>' : ''}
          </div>
        `;
      });
      html += '</div>';
      codeViewerContent.innerHTML = html;
    }

    modalCodeViewer.classList.remove('hidden');
    return;
  }

  // Parse artifact index and line number from citation (e.g. "artifact 1, line 37")
  const match = citation.match(/artifact\s+(\d+)(?:,\s*lines?\s+(\d+))?/i);
  if (!match) {
    codeViewerTitle.textContent = `Citation Viewer`;
    codeViewerSubtitle.textContent = citation;
    codeViewerContent.innerHTML = `<div class="p-4 text-zinc-400">Could not parse line citation: ${escapeHtml(citation)}</div>`;
    modalCodeViewer.classList.remove('hidden');
    return;
  }

  const artifactIdx = parseInt(match[1], 10);
  const targetLine = match[2] ? parseInt(match[2], 10) : null;

  const artifact = currentArtifacts.find(a => a.index === artifactIdx) || currentArtifacts[0];

  if (!artifact) {
    codeViewerTitle.textContent = `Artifact ${artifactIdx} Not Found`;
    codeViewerSubtitle.textContent = citation;
    codeViewerContent.innerHTML = `<div class="p-4 text-zinc-500 italic">Artifact ${artifactIdx} could not be located in current audit bundle.</div>`;
    modalCodeViewer.classList.remove('hidden');
    return;
  }

  codeViewerTitle.textContent = `Artifact ${artifact.index}: ${artifact.name}`;
  codeViewerSubtitle.textContent = targetLine ? `Referenced Line: ${targetLine} (${artifact.lineCount} total lines)` : `${artifact.lineCount} total lines`;
  codeViewerFooter.textContent = `Citation: ${citation} — ${artifact.name}`;

  const lines = artifact.lines || [];
  let html = '';

  const startIdx = targetLine ? Math.max(0, targetLine - 15) : 0;
  const endIdx = targetLine ? Math.min(lines.length, targetLine + 15) : Math.min(lines.length, 100);

  for (let i = startIdx; i < endIdx; i++) {
    const lineNum = i + 1;
    const isTarget = targetLine && lineNum === targetLine;
    const lineText = lines[i] || '';

    html += `
      <div class="flex items-start py-0.5 px-2 font-mono text-xs ${isTarget ? 'line-highlight text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'}">
        <span class="w-10 shrink-0 text-zinc-600 select-none text-right pr-3 font-mono">${lineNum}</span>
        <span class="flex-1 whitespace-pre-wrap break-all">${escapeHtml(lineText)}</span>
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
    }).catch((err) => {
      console.debug('Clipboard writeText failed, using prompt fallback:', err?.message);
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
  a.download = `hygiene-check-${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Toggle Checklist Mode
function toggleChecklistMode() {
  checklistMode = !checklistMode;
  checklistLabel.textContent = checklistMode ? 'Checklist Mode' : 'Standard View';
  if (currentResult) {
    renderResults({ result: currentResult, repo: currentResult.repo, branch: currentResult.branch }, null);
  }
}

// Simple HTML escaping helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
