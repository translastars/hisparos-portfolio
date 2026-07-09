/**
 * Hisparos Jobs Scraper — Daily job scraper for sworn/legal/financial translation jobs.
 * 
 * Fetches real job listings from Indeed RSS feeds across multiple queries and countries.
 * Updates api/data/jobs.json and commits to git for Vercel redeploy.
 * 
 * Run by: Windows Scheduled Task "TranslaStars Jobs Board" (08:30, 14:30, 20:30)
 * Also run by: OpenClaw cron daily at 09:00 CEST
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'api', 'data', 'jobs.json');
const WORK_DIR = __dirname;
const MAX_JOBS = 100;

// Indeed RSS feeds — sworn/legal/financial translation queries across countries
const RSS_FEEDS = [
  // Spain — Traducción Jurada
  { url: 'https://www.indeed.com/rss?q=traductor+jurado&l=Spain', tag: 'Sworn Translation', country: 'Spain' },
  { url: 'https://www.indeed.com/rss?q=sworn+translator&l=Spain', tag: 'Sworn Translation', country: 'Spain' },
  { url: 'https://www.indeed.com/rss?q=legal+translator&l=Spain', tag: 'Legal', country: 'Spain' },
  { url: 'https://www.indeed.com/rss?q=traducci%C3%B3n+jur%C3%ADdica&l=Spain', tag: 'Legal', country: 'Spain' },
  { url: 'https://www.indeed.com/rss?q=traducci%C3%B3n+financiera&l=Spain', tag: 'Financial', country: 'Spain' },
  { url: 'https://www.indeed.com/rss?q=court+interpreter&l=Spain', tag: 'Court Interpreting', country: 'Spain' },
  { url: 'https://www.indeed.com/rss?q=translator&l=Madrid', tag: 'Translation', country: 'Spain' },
  { url: 'https://www.indeed.com/rss?q=translator&l=Barcelona', tag: 'Translation', country: 'Spain' },
  
  // Remote / UK / EU
  { url: 'https://www.indeed.com/rss?q=legal+translator&l=remote', tag: 'Legal', country: 'Remote' },
  { url: 'https://www.indeed.com/rss?q=sworn+translator&l=remote', tag: 'Sworn Translation', country: 'Remote' },
  { url: 'https://www.indeed.com/rss?q=financial+translator&l=remote', tag: 'Financial', country: 'Remote' },
  { url: 'https://www.indeed.com/rss?q=freelance+translator+legal&l=remote', tag: 'Legal', country: 'Remote' },
  { url: 'https://www.indeed.com/rss?q=legal+translator&l=London', tag: 'Legal', country: 'United Kingdom' },
  { url: 'https://www.indeed.com/rss?q=translator&l=United+Kingdom', tag: 'Translation', country: 'United Kingdom' },
  
  // Europe
  { url: 'https://www.indeed.com/rss?q=legal+translator&l=France', tag: 'Legal', country: 'France' },
  { url: 'https://www.indeed.com/rss?q=translator&l=Germany', tag: 'Translation', country: 'Germany' },
  { url: 'https://www.indeed.com/rss?q=translator&l=Belgium', tag: 'Translation', country: 'Belgium' },
  
  // Patent
  { url: 'https://www.indeed.com/rss?q=patent+translator&l=remote', tag: 'Patent', country: 'Remote' },
  { url: 'https://www.indeed.com/rss?q=patent+translator&l=Germany', tag: 'Patent', country: 'Germany' },
];

function parseRSS(xml) {
  const items = [];
  const itemRe = /<item>[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const get = (tag) => {
      const r = new RegExp('<' + tag + '>([^<]*)</' + tag + '>', 'i');
      const match = r.exec(block);
      return match ? match[1].trim() : '';
    };
    const title = get('title');
    const link = get('link');
    const rawDesc = get('description');
    const pubDate = get('pubDate');
    // Indeed uses <source> tag for company
    const company = get('source') || 'Company';
    const location = get('location') || '';
    if (title && link) {
      items.push({ title, link, desc: rawDesc.replace(/<[^>]*>/g, ''), company, location, pubDate });
    }
  }
  return items;
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return Math.floor(s) + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const da = Math.floor(h / 24);
  if (da < 7) return da + 'd ago';
  if (da < 30) return Math.floor(da / 7) + 'w ago';
  return Math.floor(da / 30) + 'mo ago';
}

function categorize(title, desc, defaultTag) {
  const t = (title + ' ' + desc).toLowerCase();
  if (/sworn|traductor jurado|jurado/i.test(t)) return 'Sworn Translation';
  if (/court interpreter|judicial interpreter|interprete|interpretación/i.test(t)) return 'Court Interpreting';
  if (/patent|patente/i.test(t)) return 'Patent';
  if (/financial|finance|financier|banking|bancar/i.test(t)) return 'Financial';
  if (/legal|law firm|lawyer|abogado|jurídic|notarial|litigat/i.test(t)) return 'Legal';
  if (/freelance|freelancer|remote/i.test(t)) return 'Freelance';
  return defaultTag || 'Translation';
}

function determineType(title, desc, location) {
  const t = (title + ' ' + desc + ' ' + location).toLowerCase();
  if (/remote/i.test(t) && !/on.?site|office|presencial/i.test(t)) return 'remote';
  if (/hybrid|mixto|híbrido/i.test(t)) return 'hybrid';
  if (/freelance|freelancer|contractor|autonomo|autónomo/i.test(t)) return 'remote';
  return 'on-site';
}

function detectSource(link, company) {
  const l = (link + '').toLowerCase();
  const c = (company + '').toLowerCase();
  if (l.includes('linkedin')) return { source: 'LinkedIn', sourceClass: 'linkedin' };
  if (l.includes('indeed') || !c.includes('linkedin')) return { source: 'Indeed', sourceClass: 'indeed' };
  return { source: 'Indeed', sourceClass: 'indeed' };
}

async function scrapeJobs() {
  console.log('[Jobs Scraper] Starting scrape at', new Date().toISOString());
  const seen = new Set();
  const allJobs = [];
  
  for (const feed of RSS_FEEDS) {
    try {
      console.log('[Jobs Scraper] Fetching', feed.url);
      const resp = await fetch(feed.url, { signal: AbortSignal.timeout(8000) });
      const xml = await resp.text();
      const items = parseRSS(xml);
      console.log('[Jobs Scraper] Got', items.length, 'items from', feed.url);
      
      for (const item of items) {
        // Deduplicate by title + company
        const key = (item.title + '|' + item.company).toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) continue;
        seen.add(key);
        
        const date = item.pubDate ? timeAgo(new Date(item.pubDate)) : 'Today';
        const cat = categorize(item.title, item.desc, feed.tag);
        const type = determineType(item.title, item.desc, item.location || feed.country);
        const srcInfo = detectSource(item.link, item.company);
        const company = item.company || 'Company';
        const title = item.title.replace(/<[^>]*>/g, '').trim();
        
        allJobs.push({
          title: title.substring(0, 120),
          company: company.substring(0, 60),
          country: feed.country,
          location: (item.location || feed.country).substring(0, 80),
          type,
          categories: [cat],
          desc: item.desc.replace(/<[^>]*>/g, '').substring(0, 300),
          date,
          source: srcInfo.source,
          sourceClass: srcInfo.sourceClass,
          link: item.link,
          featured: Math.random() < 0.15
        });
        
        if (allJobs.length >= MAX_JOBS) break;
      }
    } catch (e) {
      console.log('[Jobs Scraper] Error for', feed.url, ':', e.message);
    }
    if (allJobs.length >= MAX_JOBS) break;
  }
  
  // Sort by date (newest first) — items with "Today" or "m ago" come first
  const priority = (j) => {
    if (j.date.includes('s ago') || j.date.includes('m ago')) return 0;
    if (j.date.includes('h ago')) return 1;
    if (j.date.includes('d ago')) return 2;
    if (j.date.includes('Today')) return 0;
    return 3;
  };
  allJobs.sort((a, b) => priority(a) - priority(b));
  
  console.log('[Jobs Scraper] Total unique jobs:', allJobs.length);
  return allJobs.slice(0, MAX_JOBS);
}

async function main() {
  console.log('[Jobs Updater] Starting...');
  
  if (process.argv.includes('--scrape')) {
    // Scrape real jobs from Indeed RSS
    const jobs = await scrapeJobs();
    fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf8');
    console.log('[Jobs Updater] Saved', jobs.length, 'jobs to', DATA_FILE);
  } else {
    console.log('[Jobs Updater] Refresh mode (existing data with fresh dates)');
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const jobs = JSON.parse(raw);
    
    const ageRanges = {
      '3 days ago': 3, '5 days ago': 5, '1 week ago': 7, '2 weeks ago': 14,
      '3 weeks ago': 21, '1 month ago': 30, '5 weeks ago': 35, '6 weeks ago': 42, '2 months ago': 60
    };
    const now = Date.now();
    jobs.forEach(j => {
      const days = ageRanges[j.date];
      if (days) j.date = timeAgo(new Date(now - days * 86400000));
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf8');
    console.log('[Jobs Updater] Refreshed', jobs.length, 'jobs');
  }
  
  // Git commit + push for Vercel redeploy
  try {
    const { execSync } = require('child_process');
    execSync('git add api/data/jobs.json', { cwd: WORK_DIR });
    execSync('git commit -m "chore(jobs): daily update ' + new Date().toISOString().slice(0,10) + '"', { cwd: WORK_DIR });
    execSync('git push', { cwd: WORK_DIR });
    console.log('[Jobs Updater] Deployed to Vercel');
  } catch (e) {
    console.log('[Jobs Updater] Git error (may be nothing to commit):', e.message);
  }
  
  console.log('[Jobs Updater] Done');
}

main().catch(console.error);
