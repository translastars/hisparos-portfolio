const fs = require('fs');
const path = require('path');

// Check local jobs.json
const jobs = JSON.parse(fs.readFileSync(path.join(__dirname, 'api/data/jobs.json'), 'utf8'));
console.log('jobs.json: ' + jobs.length + ' jobs');

// Check FALLBACK_JOBS in jobs.html
const html = fs.readFileSync(path.join(__dirname, 'jobs.html'), 'utf8');
const m = html.match(/const FALLBACK_JOBS = \[([\s\S]*?)\];/);
if (!m) { console.log('FALLBACK_JOBS: NOT FOUND'); process.exit(1); }
const fbCount = m[1].split('},{').length;
console.log('FALLBACK_JOBS: ' + fbCount + ' entries');

// Check git status
console.log('\n--- GIT STATUS ---');
const { execSync } = require('child_process');
try {
  const status = execSync('git status --short', { cwd: __dirname, encoding: 'utf8' });
  console.log(status || '(clean)');
} catch(e) {
  console.log('git status error:', e.message);
}

// Check last commit
try {
  const log = execSync('git log --oneline -1', { cwd: __dirname, encoding: 'utf8' });
  console.log('Last commit:', log.trim());
} catch(e) {}
