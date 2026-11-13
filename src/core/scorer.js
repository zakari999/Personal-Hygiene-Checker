import { QUANTUM_UNIT, RUBRICS } from './rubrics.js';

/**
 * Computes exact sloppiness penalties, levels, and generates the standardized report.
 */
export function calculateHygieneScore(categoryEvaluations, rubricId = 'lab') {
  const rubric = RUBRICS[rubricId] || RUBRICS.lab;
  let totalPenaltyUnits = 0;
  const categoriesReport = [];

  for (const catConfig of rubric.categories) {
    const evalData = categoryEvaluations.find(c => 
      c.category.toLowerCase().trim() === catConfig.name.toLowerCase().trim() ||
      (catConfig.id && c.categoryId === catConfig.id)
    ) || {
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
      // Optional: keep clean passing categories or omit if module platform only reports penalties
      // The module platform only reports categories with penalties or reports all.
      // We list penalized ones, and if none, report 0.00 clean.
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

  const prevItems = [];
  (previousResult.categories || []).forEach(cat => {
    (cat.items || []).forEach(it => prevItems.push(`${cat.category}: ${it.citation} — ${it.issue}`));
  });

  const currItems = [];
  (currentResult.categories || []).forEach(cat => {
    (cat.items || []).forEach(it => currItems.push(`${cat.category}: ${it.citation} — ${it.issue}`));
  });

  const resolved = prevItems.filter(p => !currItems.some(c => c.slice(0, 35) === p.slice(0, 35)));
  const remaining = currItems.filter(c => prevItems.some(p => p.slice(0, 35) === c.slice(0, 35)));
  const newlyIntroduced = currItems.filter(c => !prevItems.some(p => p.slice(0, 35) === c.slice(0, 35)));

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
