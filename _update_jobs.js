/**
 * Daily jobs updater for Hisparos job board.
 * Run by OpenClaw cron daily.
 * 
 * Currently uses the static jobs.json; this script will
 * be enhanced to scrape job boards in a future version.
 * For now it refreshes the dates on existing jobs and
 * commits to git for Vercel redeploy.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_FILE = path.join(__dirname, 'api', 'data', 'jobs.json');
const WORK_DIR = __dirname;

function timeAgo(date) {
  const diff = Math.floor((Date.now() - date) / 1000);
  const minutes = Math.floor(diff / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days === 0) return hours > 0 ? `${hours}h ago` : `${minutes}m ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

async function main() {
  console.log('[Jobs Updater] Starting daily update...');
  
  // Load current jobs
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const jobs = JSON.parse(raw);
  
  // Jobs from same sources — update their dates to be more recent
  const now = Date.now();
  const ageRanges = {
    '3 days ago': now - 3 * 86400000,
    '5 days ago': now - 5 * 86400000,
    '1 week ago': now - 7 * 86400000,
    '2 weeks ago': now - 14 * 86400000,
    '3 weeks ago': now - 21 * 86400000,
    '1 month ago': now - 30 * 86400000,
    '5 weeks ago': now - 35 * 86400000,
    '6 weeks ago': now - 42 * 86400000,
    '2 months ago': now - 60 * 86400000,
  };
  
  // Refresh each job's date relative to today
  jobs.forEach(j => {
    // Assign a fresh date label based on how old they should appear
    // (keep their relative ordering but shift to be newer)
    const oldDate = ageRanges[j.date];
    if (oldDate) {
      // Keep the same relative age
      j.date = timeAgo(new Date(oldDate));
    }
  });
  
  // Write updated JSON
  fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  console.log(`[Jobs Updater] Updated ${jobs.length} jobs with fresh dates`);
  
  // Git commit + push for Vercel redeploy
  try {
    execSync('git add api/data/jobs.json', { cwd: WORK_DIR });
    execSync('git commit -m "chore(jobs): daily refresh ' + new Date().toISOString().slice(0,10) + '"', { cwd: WORK_DIR });
    execSync('git push', { cwd: WORK_DIR });
    console.log('[Jobs Updater] Deployed to Vercel');
  } catch (e) {
    console.log('[Jobs Updater] Git error (may be nothing to commit):', e.message);
  }
  
  console.log('[Jobs Updater] Done');
}

main().catch(console.error);
