import { QUANTUM_UNIT, RUBRICS } from './rubrics.js';

function normalizeCategory(str = '') {
  return str.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '').trim();
}

function getItemKey(categoryName, item) {
  const normCat = normalizeCategory(categoryName);
  const citation = (item.citation || '').toLowerCase().trim();
  const issueSnippet = (item.issue || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  return `${normCat}::${citation}::${issueSnippet}`;
}

/**
 * Computes exact sloppiness penalties, levels, and generates the standardized report.
 */
export function calculateHygieneScore(categoryEvaluations, rubricId = 'lab') {
  const rubric = RUBRICS[rubricId] || RUBRICS.lab;
  let totalPenaltyUnits = 0;
  const categoriesReport = [];

  for (const catConfig of rubric.categories) {
    const configKey = normalizeCategory(catConfig.name);

    const evalData = categoryEvaluations.find(c => {
      const evalKey = normalizeCategory(c.category);
      return evalKey === configKey || (catConfig.id && c.categoryId === catConfig.id);
    }) || {
      category: catConfig.name,
      level: 0,
      penaltyUnits: 0,
      summary: 'All criteria satisfied cleanly with no sloppiness detected.',
      items: []
    };

    const penaltyUnits = Math.max(0, evalData.penaltyUnits || (evalData.items ? evalData.items.length : 0));
    totalPenaltyUnits += penaltyUnits;

    // Platform truncates/floors category deductions to 2 decimal places
    const deduction = penaltyUnits > 0 ? Math.floor(penaltyUnits * QUANTUM_UNIT * 100) / 100 : 0.00;

    let level = evalData.level;
    if (level === undefined || level === null) {
      if (penaltyUnits === 0) level = 0;
      else if (penaltyUnits <= 2) level = 1;
      else level = 2;
    }

    categoriesReport.push({
      category: catConfig.name,
      level,
      penaltyUnits,
      deduction,
      deductionFormatted: deduction > 0 ? `−${deduction.toFixed(2)} pts` : `0.00 pts`,
      summary: evalData.summary || '',
      items: evalData.items || []
    });
  }

  // Total penalty is calculated from total unrounded penalty units
  const totalPenalty = totalPenaltyUnits > 0
    ? Number((Math.round(totalPenaltyUnits * QUANTUM_UNIT * 100) / 100).toFixed(2))
    : 0.00;

  const totalDeductionFormatted = totalPenalty > 0 ? `−${totalPenalty.toFixed(2)} pts` : `0.00 pts`;

  // Build the exact text report matching the module platform
  const lines = [];
  lines.push('Sloppiness penalty');
  lines.push(totalDeductionFormatted);
  lines.push('');

  for (const cat of categoriesReport) {
    if (cat.items.length === 0 && cat.level === 0) {
      continue;
    }

    lines.push(cat.category);
    lines.push(`Sloppiness Level ${cat.level}`);
    lines.push(cat.deductionFormatted);
    if (cat.summary) {
      lines.push(cat.summary);
    }
    lines.push('');

    for (const item of cat.items) {
      lines.push(`${item.citation} — ${item.issue}`);
    }
    lines.push('');
  }

  if (totalPenalty === 0) {
    lines.push('All hygiene checks passed! No sloppiness detected across the repository.');
    lines.push('');
  }

  lines.push('This was your Professional Hygiene Check. Review the issues above and correct them before your final submission — this pass has now been used.');

  const reportText = lines.join('\n').trim();

  return {
    rubricId,
    rubricName: rubric.name,
    totalPenalty: Number(totalPenalty.toFixed(2)),
    totalDeductionFormatted,
    categories: categoriesReport,
    reportText
  };
}

/**
 * Compares current run against a previous run to report improvement diffs.
 */
export function compareHygieneRuns(previousResult, currentResult) {
  if (!previousResult) return null;

  const prevPenalty = previousResult.totalPenalty || 0;
  const currPenalty = currentResult.totalPenalty || 0;
  const improvement = Number((prevPenalty - currPenalty).toFixed(2));

  const prevItemMap = new Map();
  (previousResult.categories || []).forEach(cat => {
    (cat.items || []).forEach(it => {
      const key = getItemKey(cat.category, it);
      prevItemMap.set(key, { category: cat.category, item: it });
    });
  });

  const currItemMap = new Map();
  (currentResult.categories || []).forEach(cat => {
    (cat.items || []).forEach(it => {
      const key = getItemKey(cat.category, it);
      currItemMap.set(key, { category: cat.category, item: it });
    });
  });

  const resolved = [];
  for (const [key, val] of prevItemMap.entries()) {
    if (!currItemMap.has(key)) {
      resolved.push(`${val.category}: ${val.item.citation} — ${val.item.issue}`);
    }
  }

  const remaining = [];
  for (const [key, val] of currItemMap.entries()) {
    if (prevItemMap.has(key)) {
      remaining.push(`${val.category}: ${val.item.citation} — ${val.item.issue}`);
    }
  }

  const newlyIntroduced = [];
  for (const [key, val] of currItemMap.entries()) {
    if (!prevItemMap.has(key)) {
      newlyIntroduced.push(`${val.category}: ${val.item.citation} — ${val.item.issue}`);
    }
  }

  return {
    previousPenalty: prevPenalty,
    currentPenalty: currPenalty,
    improvement,
    isImproved: improvement > 0,
    resolvedCount: resolved.length,
    remainingCount: remaining.length,
    newCount: newlyIntroduced.length,
    resolved,
    remaining,
    newlyIntroduced
  };
}
