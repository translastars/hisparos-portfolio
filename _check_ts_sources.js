const { execSync } = require('child_process');

// Get jobs.json from TS Jobs Board
const raw = execSync('gh api "repos/translastars/jobs-board/contents/data/jobs.json" --jq ".content"', { encoding: 'utf8', timeout: 20000 });
const decoded = Buffer.from(raw.trim(), 'base64').toString('utf8');
const data = JSON.parse(decoded);
const jobs = data.jobs || data;

const srcCount = {};
for (const j of jobs) {
  const s = j.source || j.company || 'unknown';
  srcCount[s] = (srcCount[s] || 0) + 1;
}

console.log('Total jobs:', jobs.length);
console.log('Last update:', data.lastUpdated || 'N/A');
console.log('\nBy source:');
for (const [k, v] of Object.entries(srcCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k}: ${v}`);
}

// Also check the indeed scraper log locally if it exists
const fs = require('fs');
const logPath = 'C:\\Users\\barto\\Dropbox\\OpenClaw Proyectos\\Jobs Board\\data\\scrape_log.jsonl';
// Or try the main TS jobs-board repo local checkout
const localRepo = 'C:\\Users\\barto\\Dropbox\\OpenClaw Proyectos\\Jobs Board';
console.log('\nLocal repo path:', fs.existsSync(localRepo) ? 'EXISTS' : 'NOT FOUND');

if (fs.existsSync(localRepo)) {
  const files = fs.readdirSync(localRepo);
  console.log('Files:', files.join(', '));
  const dataDir = localRepo + '\\data';
  if (fs.existsSync(dataDir)) {
    const dataFiles = fs.readdirSync(dataDir);
    console.log('Data files:', dataFiles.join(', '));
    if (fs.existsSync(dataDir + '\\scrape_log.jsonl')) {
      const logLines = fs.readFileSync(dataDir + '\\scrape_log.jsonl', 'utf8').trim().split('\n');
      const lastFew = logLines.slice(-5);
      console.log('\nLast 5 log entries:');
      for (const line of lastFew) {
        try {
          const entry = JSON.parse(line);
          console.log(`  ${entry.ts} | raw:${entry.raw} unique:${entry.unique} linkedin:${entry.linkedin} indeed:${entry.indeed} errors:${entry.errors}`);
        } catch(e) {
          console.log(`  ${line.substring(0, 120)}`);
        }
      }
    }
  }
}
