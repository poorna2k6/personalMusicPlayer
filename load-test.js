'use strict';

const autocannon = require('autocannon');

const BASE_URL = 'http://localhost:5000';
const CONNECTIONS = 100;
const DURATION = 30; // seconds per endpoint

const endpoints = [
  { name: 'GET /api/health', path: '/api/health' },
  { name: 'GET /api/tracks', path: '/api/tracks' },
  { name: 'GET /api/tracks/artists', path: '/api/tracks/artists' },
  { name: 'GET /api/tracks/albums', path: '/api/tracks/albums' },
  { name: 'GET /api/playlists', path: '/api/playlists' },
];

function formatLatency(val) {
  if (val === undefined || val === null || val < 0) return 'N/A';
  return `${val.toFixed(2)} ms`;
}

function printResults(name, result) {
  const r = result;
  const errors = (r.errors || 0) + (r.timeouts || 0);
  const totalReqs = r.requests.total || 0;
  const errorRate = totalReqs > 0 ? ((errors / totalReqs) * 100).toFixed(2) : '0.00';

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Endpoint: ${name}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  Duration:           ${DURATION}s`);
  console.log(`  Connections:        ${CONNECTIONS}`);
  console.log(`  Requests/sec (avg): ${r.requests.average.toFixed(2)}`);
  console.log(`  Requests/sec (min): ${r.requests.min}`);
  console.log(`  Requests/sec (max): ${r.requests.max}`);
  console.log(`  Total requests:     ${totalReqs}`);
  console.log(`  Throughput (avg):   ${(r.throughput.average / 1024).toFixed(2)} KB/s`);
  console.log(`\n  Latency:`);
  console.log(`    Average:          ${formatLatency(r.latency.average)}`);
  console.log(`    p50:              ${formatLatency(r.latency.p50)}`);
  console.log(`    p75:              ${formatLatency(r.latency.p75)}`);
  console.log(`    p90:              ${formatLatency(r.latency.p90)}`);
  console.log(`    p95:              ${formatLatency(r.latency.p95)}`);
  console.log(`    p99:              ${formatLatency(r.latency.p99)}`);
  console.log(`    Max:              ${formatLatency(r.latency.max)}`);
  console.log(`\n  Errors:             ${r.errors || 0}`);
  console.log(`  Timeouts:           ${r.timeouts || 0}`);
  console.log(`  Error rate:         ${errorRate}%`);

  // Status code breakdown
  if (r['2xx'] !== undefined || r['4xx'] !== undefined || r['5xx'] !== undefined) {
    console.log(`\n  Status codes:`);
    if (r['1xx']) console.log(`    1xx: ${r['1xx']}`);
    if (r['2xx']) console.log(`    2xx: ${r['2xx']}`);
    if (r['3xx']) console.log(`    3xx: ${r['3xx']}`);
    if (r['4xx']) console.log(`    4xx: ${r['4xx']}`);
    if (r['5xx']) console.log(`    5xx: ${r['5xx']}`);
  }

  return {
    name,
    reqPerSec: r.requests.average,
    latencyAvg: r.latency.average,
    latencyP50: r.latency.p50,
    latencyP95: r.latency.p95,
    latencyP99: r.latency.p99,
    errors,
    errorRate,
    totalReqs,
  };
}

async function runTest(endpoint) {
  return new Promise((resolve, reject) => {
    console.log(`\nStarting load test: ${endpoint.name} ...`);
    const instance = autocannon({
      url: BASE_URL + endpoint.path,
      connections: CONNECTIONS,
      duration: DURATION,
      pipelining: 1,
      timeout: 10,
    }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });

    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  PERSONAL MUSIC PLAYER - LOAD TEST');
  console.log('='.repeat(60));
  console.log(`  Target:      ${BASE_URL}`);
  console.log(`  Connections: ${CONNECTIONS} concurrent`);
  console.log(`  Duration:    ${DURATION}s per endpoint`);
  console.log(`  Endpoints:   ${endpoints.length}`);
  console.log(`  Total time:  ~${DURATION * endpoints.length}s`);
  console.log('='.repeat(60));

  const allResults = [];

  for (const endpoint of endpoints) {
    try {
      const result = await runTest(endpoint);
      const summary = printResults(endpoint.name, result);
      allResults.push(summary);
    } catch (err) {
      console.error(`\nFailed to test ${endpoint.name}: ${err.message}`);
      allResults.push({ name: endpoint.name, error: err.message });
    }
  }

  // Final summary table
  console.log('\n\n' + '='.repeat(80));
  console.log('  FINAL SUMMARY');
  console.log('='.repeat(80));
  console.log(
    'Endpoint'.padEnd(30) +
    'Req/s'.padStart(10) +
    'Avg Lat'.padStart(12) +
    'p50'.padStart(10) +
    'p95'.padStart(10) +
    'p99'.padStart(10) +
    'ErrRate'.padStart(10)
  );
  console.log('-'.repeat(80));

  for (const r of allResults) {
    if (r.error) {
      console.log(r.name.padEnd(30) + ' ERROR: ' + r.error);
    } else {
      const name = r.name.length > 29 ? r.name.substring(0, 26) + '...' : r.name;
      console.log(
        name.padEnd(30) +
        r.reqPerSec.toFixed(1).padStart(10) +
        (r.latencyAvg ? r.latencyAvg.toFixed(1) + 'ms' : 'N/A').padStart(12) +
        (r.latencyP50 ? r.latencyP50.toFixed(1) + 'ms' : 'N/A').padStart(10) +
        (r.latencyP95 ? r.latencyP95.toFixed(1) + 'ms' : 'N/A').padStart(10) +
        (r.latencyP99 ? r.latencyP99.toFixed(1) + 'ms' : 'N/A').padStart(10) +
        (r.errorRate + '%').padStart(10)
      );
    }
  }
  console.log('='.repeat(80));

  // Bottleneck analysis
  console.log('\n  BOTTLENECK ANALYSIS:');
  for (const r of allResults) {
    if (r.error) continue;
    const issues = [];
    if (r.latencyP99 > 1000) issues.push('HIGH p99 latency (>1s) - possible SQLite lock contention');
    if (r.latencyP95 > 500) issues.push('HIGH p95 latency (>500ms) - slow query or I/O');
    if (parseFloat(r.errorRate) > 1) issues.push(`Error rate ${r.errorRate}% - possible connection drops or 5xx errors`);
    if (r.reqPerSec < 100) issues.push('Low throughput (<100 req/s) under 100 connections');

    if (issues.length > 0) {
      console.log(`\n  ${r.name}:`);
      issues.forEach(i => console.log(`    - ${i}`));
    } else {
      console.log(`  ${r.name}: OK`);
    }
  }

  console.log('\n' + '='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
