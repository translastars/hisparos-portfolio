// Check TS Jobs Board for Indeed scraping history and current state
// Uses gh CLI
const { execSync } = require('child_process');

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000 });
  } catch(e) {
    return e.stdout || e.message;
  }
}

// Get recent commits
const commits = JSON.parse(run('gh api "repos/translastars/jobs-board/commits?per_page=15"'));
console.log('=== Recent commits ===');
for (const c of commits) {
  const msg = c.commit.message.split('\n')[0];
  const date = c.commit.committer.date.substring(0, 19);
  console.log(`${c.sha.substring(0,8)} ${date} ${msg}`);
}

// Get the indeed scraper file
console.log('\n=== Indeed scraper file ===');
const content = run('gh api "repos/translastars/jobs-board/contents/scrapers/indeed.js" --jq ".content"');
if (content) {
  const decoded = Buffer.from(content.trim(), 'base64').toString('utf8');
  console.log(decoded.substring(0, 1500));
}

// Check if there was a different indeed approach before
console.log('\n=== Checking scrapers directory ===');
const scrapers = JSON.parse(run('gh api "repos/translastars/jobs-board/contents/scrapers"'));
for (const s of scrapers) {
  console.log(`  ${s.name} (${s.size} bytes)`);
}

// Get git log for indeed.js
console.log('\n=== Indeed scraper git log ===');
const log = run('gh api "repos/translastars/jobs-board/commits?path=scrapers/indeed.js&per_page=10"');
const logData = JSON.parse(log);
for (const c of logData) {
  console.log(`${c.sha.substring(0,8)} ${c.commit.committer.date.substring(0,19)} ${c.commit.message.split('\n')[0]}`);
}

// Check the main scraper runner
console.log('\n=== Main scraper runner (index.js or similar) ===');
const rootFiles = JSON.parse(run('gh api "repos/translastars/jobs-board/contents/"'));
for (const f of rootFiles) {
  if (f.name.endsWith('.js') || f.name.endsWith('.mjs') || f.name.endsWith('.bat') || f.name.endsWith('.ps1')) {
    console.log(`  ${f.name} (${f.size} bytes)`);
  }
}
