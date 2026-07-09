const fs = require('fs');
const path = require('path');

const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, 'api/data/jobs.json'), 'utf8'));
console.log('jobs.json:', jobs.length, 'jobs');

let html = fs.readFileSync(path.join(__dirname, 'jobs.html'), 'utf8');

// Find ALL occurrences of FALLBACK_JOBS
let idx = html.indexOf('const FALLBACK_JOBS = [');
if (idx < 0) {
  console.log('FALLBACK_JOBS not found!');
  process.exit(1);
}

let end = html.indexOf('];', idx) + 2;
console.log('Current FALLBACK_JOBS at', idx, 'length', end-idx, 'bytes');

// Generate new 25-entry fallback
const fbArray = jobs.slice(0, 25).map(j => JSON.stringify(j)).join(',\n  ');
const newBlock = 'const FALLBACK_JOBS = [\n  ' + fbArray + '\n];';

html = html.substring(0, idx) + newBlock + html.substring(end);

fs.writeFileSync(path.join(__dirname, 'jobs.html'), html);

// Verify
const newIdx = html.indexOf('const FALLBACK_JOBS = [');
const newEnd = html.indexOf('];', newIdx);
const block = html.substring(newIdx, newEnd);
const count = block.split('"title"').length - 1;
console.log('Updated FALLBACK_JOBS:', count, 'entries');
