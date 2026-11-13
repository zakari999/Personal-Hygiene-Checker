import assert from 'node:assert';
import http from 'node:http';

async function testEndpoints() {
  console.log('Testing Express API server endpoints...');

  // Dynamically import server
  const serverProcess = await import('../src/server/server.js');
  
  // Wait 1 second for port listening
  await new Promise(r => setTimeout(r, 1000));

  // Test /api/rubrics
  const resRubrics = await fetch('http://localhost:3000/api/rubrics');
  const dataRubrics = await resRubrics.json();
  assert(dataRubrics.rubrics.length >= 2, 'Should return both rubrics');
  console.log('✓ /api/rubrics works. Rubrics found:', dataRubrics.rubrics.map(r => r.id));

  // Test /api/config
  const resConfig = await fetch('http://localhost:3000/api/config');
  const dataConfig = await resConfig.json();
  console.log('✓ /api/config works. Status:', dataConfig);

  // Test /api/check with mock repo
  const resCheck = await fetch('http://localhost:3000/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repoUrl: './test/fixtures/mock_lab_repo',
      rubricId: 'lab'
    })
  });
  const dataCheck = await resCheck.json();
  assert(dataCheck.success === true, 'Check API should return success: true');
  console.log('✓ /api/check works. Penalty reported:', dataCheck.result.totalDeductionFormatted);

  console.log('\nAll server endpoints verified successfully!');
  process.exit(0);
}

testEndpoints().catch(err => {
  console.error('Server endpoint test failed:', err);
  process.exit(1);
});
