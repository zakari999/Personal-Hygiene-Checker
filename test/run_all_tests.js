import { execSync } from 'node:child_process';

console.log('====================================================');
console.log('       RUNNING COMPREHENSIVE TEST SUITE             ');
console.log('====================================================\n');

try {
  console.log('1. Running Benchmark Scoring & Truncation Tests...');
  execSync('node test/verify_sample.js', { stdio: 'inherit' });

  console.log('\n2. Running Security, Normalization & Diff Resilience Tests...');
  execSync('node test/test_security_resilience.js', { stdio: 'inherit' });

  console.log('\n3. Running SWE Rubric (table.tsv) 10-Criteria Tests...');
  execSync('node test/test_swe_rubric.js', { stdio: 'inherit' });

  console.log('\n4. Running Server Endpoints & Mock Repo Integration Tests...');
  execSync('node test/test_server_endpoints.js', { stdio: 'inherit' });

  console.log('\n====================================================');
  console.log('🎉 ALL TEST SUITES PASSED CLEANLY (100% VERIFIED)   ');
  console.log('====================================================');
} catch (err) {
  console.error('\n❌ Test suite failed:', err.message);
  process.exit(1);
}
