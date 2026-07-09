/**
 * Upload news data to Vercel API
 * Usage: node scripts/upload_news.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const VERCEl_URL = 'https://hisparosportfolio.vercel.app/api/news/upload';
const NEWS_FILE = path.join(__dirname, '..', 'api', 'data', 'news.json');
const LOCK_FILE = path.join(__dirname, '..', 'api', 'data', 'news_upload.lock');

function postJSON(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      port: 443,
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };
    const req = https.request(opts, res => {
      let resp = '';
      res.on('data', c => resp += c);
      res.on('end', () => {
        try { resolve(JSON.parse(resp)); } catch(e) { resolve({ error: resp.substring(0,200) }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Check lock file to avoid concurrent uploads
  if (fs.existsSync(LOCK_FILE)) {
    const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
    if (age < 60000) { console.log('~ Upload locked (less than 1min ago)'); process.exit(0); }
  }
  fs.writeFileSync(LOCK_FILE, String(Date.now()));

  // Read news data
  if (!fs.existsSync(NEWS_FILE)) {
    console.log('✗ news.json not found. Run scrapers/news_scraper.js first.');
    fs.unlinkSync(LOCK_FILE);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8'));
  console.log(`📰 Uploading ${data.total} articles to Vercel...`);

  const result = await postJSON(VERCEl_URL, data);
  if (result.success) {
    console.log(`✓ Uploaded: ${result.total} articles`);
  } else {
    console.log(`✗ Upload failed:`, result.error || JSON.stringify(result));
    // Don't remove lock on failure to avoid rapid retries
    process.exit(1);
  }

  fs.unlinkSync(LOCK_FILE);
}

main().catch(e => { console.error('✗', e.message); process.exit(1); });
