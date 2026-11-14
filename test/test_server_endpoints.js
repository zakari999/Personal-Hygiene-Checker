import assert from 'node:assert';

process.env.NODE_ENV = 'test';
import { app } from '../src/server/server.js';

async function testEndpoints() {
  console.log('Testing Express API server endpoints...');

  // Listen on ephemeral random port to never clash with running dev server
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test /api/rubrics
    const resRubrics = await fetch(`${baseUrl}/api/rubrics`);
    const dataRubrics = await resRubrics.json();
    assert(dataRubrics.rubrics.length >= 2, 'Should return both rubrics');
    console.log('✓ /api/rubrics works. Rubrics found:', dataRubrics.rubrics.map(r => r.id));

    // Test /api/config
    const resConfig = await fetch(`${baseUrl}/api/config`);
    const dataConfig = await resConfig.json();
    console.log('✓ /api/config works. Status:', dataConfig);

    // Test /api/branches
    const resBranches = await fetch(`${baseUrl}/api/branches?repo=https://github.com/zakari999/wheelhouse-bike-repair.git`);
    const dataBranches = await resBranches.json();
    assert(dataBranches.branches.length >= 2, 'Should return remote branches');
    console.log('✓ /api/branches works. Branches found:', dataBranches.branches);

    // Test /api/check with mock repo in fast deterministic mode
    const resCheck = await fetch(`${baseUrl}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repoUrl: './test/fixtures/mock_lab_repo',
        rubricId: 'lab',
        apiKey: '' // deterministic heuristic mode for unit tests
      })
    });
    const dataCheck = await resCheck.json();
    assert(dataCheck.success === true, 'Check API should return success: true');
    console.log('✓ /api/check works. Penalty reported:', dataCheck.result.totalDeductionFormatted);

    console.log('\nAll server endpoints verified successfully!');
  } finally {
    server.close();
  }
}

testEndpoints().catch(err => {
  console.error('Server endpoint test failed:', err);
  process.exit(1);
});
