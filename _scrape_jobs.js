/**
 * Hisparos Jobs Real Scraper
 * 
 * Uses Puppeteer to scrape Indeed for real sworn/legal/financial translation jobs.
 * Extracts real job titles, companies, locations, job keys, and descriptions.
 * Updates api/data/jobs.json with real data and deploys to Vercel.
 * 
 * Run by: Windows Scheduled Task + OpenClaw cron
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_FILE = path.join(__dirname, 'api', 'data', 'jobs.json');
const WORK_DIR = __dirname;
const MAX_JOBS = 60;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const SEARCHES = [
  // Sworn translation
  { q: 'sworn+translator', l: 'Spain', cat: 'Sworn Translation', country: 'Spain' },
  { q: 'traductor+jurado', l: 'Spain', cat: 'Sworn Translation', country: 'Spain' },
  { q: 'traductor+jurado', l: 'Madrid', cat: 'Sworn Translation', country: 'Spain' },
  { q: 'traductor+jurado', l: 'Barcelona', cat: 'Sworn Translation', country: 'Spain' },
  
  // Legal translation
  { q: 'legal+translator', l: 'Spain', cat: 'Legal', country: 'Spain' },
  { q: 'legal+translator', l: 'remote', cat: 'Legal', country: 'Remote' },
  { q: 'legal+translator', l: 'London', cat: 'Legal', country: 'United Kingdom' },
  { q: 'traduccion+juridica', l: 'Spain', cat: 'Legal', country: 'Spain' },
  
  // Financial translation
  { q: 'financial+translator', l: 'remote', cat: 'Financial', country: 'Remote' },
  { q: 'traduccion+financiera', l: 'Spain', cat: 'Financial', country: 'Spain' },
  
  // Court interpreting
  { q: 'court+interpreter', l: 'Spain', cat: 'Court Interpreting', country: 'Spain' },
  { q: 'interprete+jurado', l: 'Spain', cat: 'Court Interpreting', country: 'Spain' },
  
  // Patent
  { q: 'patent+translator', l: 'remote', cat: 'Patent', country: 'Remote' },
  { q: 'patent+translator', l: 'Germany', cat: 'Patent', country: 'Germany' },
  
  // General translation
  { q: 'translator', l: 'Spain', cat: 'Translation', country: 'Spain' },
  { q: 'freelance+translator', l: 'remote', cat: 'Freelance', country: 'Remote' },
  { q: 'translator', l: 'Brussels', cat: 'Translation', country: 'Belgium' },
];

function parseJobKey(url) {
  if (!url) return '';
  // Indeed job keys: /viewjob?jk=abc123 or /rc/clk?jk=abc123
  const m = url.match(/[?&]jk=([a-f0-9]+)/i);
  if (m) return m[1];
  // Also check for direct Indeed URL format
  const m2 = url.match(/company-\w+\/jobs\/([a-f0-9]+)/i);
  return m2 ? m2[1] : '';
}

async function scrapeIndeed(browser, search) {
  const url = `https://www.indeed.com/jobs?q=${search.q}&l=${search.l}&sort=date`;
  const jobs = [];
  
  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    
    console.log(`[Scraper] Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    
    // Wait for job cards to load
    try {
      await page.waitForSelector('[data-jk], .job_seen_beacon, .job-card, .jcs-JobTitle', { timeout: 8000 });
    } catch(e) {
      console.log(`[Scraper] No job cards found for ${search.q}/${search.l}`);
      await page.close();
      return [];
    }
    
    // Extract job data
    const items = await page.evaluate((category, country) => {
      const results = [];
      // Indeed uses various card structures
      const cards = document.querySelectorAll('[data-jk], .job_seen_beacon');
      
      cards.forEach(card => {
        const jk = card.getAttribute('data-jk') || '';
        if (!jk) return;
        
        // Title
        const titleEl = card.querySelector('.jcs-JobTitle, .jobTitle, h2 a, [data-testid="job-title"], a[data-jk]');
        const title = titleEl ? titleEl.textContent.trim() : '';
        if (!title) return;
        
        // Company
        const companyEl = card.querySelector('[data-testid="companyName"], .companyName, .company, .cmp-company-name');
        let company = companyEl ? companyEl.textContent.trim() : '';
        if (!company) {
          // Try header span
          const hdr = card.querySelector('.heading6, .card-header');
          if (hdr) company = hdr.textContent.trim().split('\n')[0].trim();
        }
        if (!company) company = 'Company';
        
        // Location
        const locEl = card.querySelector('[data-testid="text-location"], .companyLocation, .location');
        const location = locEl ? locEl.textContent.trim() : country;
        
        // Description snippet
        const descEl = card.querySelector('.job-snippet, .summary, [data-testid="job-snippet"]');
        const desc = descEl ? descEl.textContent.trim().substring(0, 300) : '';
        
        // Date
        const dateEl = card.querySelector('[data-testid="job-date"], .date, .result-link-bar .date');
        const date = dateEl ? dateEl.textContent.trim() : '';
        
        // Salary (nice to have)
        const salaryEl = card.querySelector('[data-testid="attribute_snippet_testid"], .salary-snippet');
        const salary = salaryEl ? salaryEl.textContent.trim() : '';
        
        results.push({
          jk, title, company, location, desc, date, salary, category, country
        });
      });
      
      return results;
    }, search.cat, search.country);
    
    console.log(`[Scraper] Found ${items.length} jobs from ${search.q}/${search.l}`);
    
    // Create proper job objects
    items.forEach(item => {
      const link = `https://www.indeed.com/viewjob?jk=${item.jk}`;
      const type = item.location && item.location.toLowerCase().includes('remote') ? 'remote' : 'on-site';
      
      // Clean date string
      let dateStr = item.date || 'Today';
      // Indeed shows "30+ days ago" - convert
      if (dateStr.includes('30+')) dateStr = '1 month ago';
      
      jobs.push({
        title: item.title.substring(0, 120),
        company: item.company.substring(0, 60),
        country: item.country,
        location: item.location.substring(0, 80),
        type,
        categories: [item.category],
        desc: (item.salary ? item.salary + ' — ' : '') + item.desc.replace(/<[^>]*>/g, '').substring(0, 300),
        date: dateStr,
        source: 'Indeed',
        sourceClass: 'indeed',
        link,
        featured: false
      });
    });
    
    await page.close();
  } catch (e) {
    console.log(`[Scraper] Error for ${search.q}/${search.l}: ${e.message}`);
  }
  
  return jobs;
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const da = Math.floor(h / 24);
  if (da < 7) return da + 'd ago';
  if (da < 30) return Math.floor(da / 7) + 'w ago';
  return Math.floor(da / 30) + 'mo ago';
}

async function main() {
  console.log('[Scraper] Starting Indeed scraper at', new Date().toISOString());
  
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--single-process']
    });
    
    const allJobs = [];
    const seen = new Set();
    
    for (const search of SEARCHES) {
      if (allJobs.length >= MAX_JOBS) break;
      
      const jobs = await scrapeIndeed(browser, search);
      
      for (const job of jobs) {
        // Deduplicate by job key
        const jk = parseJobKey(job.link);
        if (!jk || seen.has(jk)) continue;
        seen.add(jk);
        allJobs.push(job);
        if (allJobs.length >= MAX_JOBS) break;
      }
    }
    
    console.log(`[Scraper] Total unique jobs: ${allJobs.length}`);
    
    // Note: all jobs are new since they're scraped live
    // Assign time-appropriate dates based on Indeed's reported date
    allJobs.forEach(j => {
      const d = j.date.toLowerCase();
      if (d.includes('30+') || d.includes('month') || d.includes('30 day')) j.date = timeAgo(new Date(Date.now() - 35 * 86400000));
      else if (d.includes('today')) j.date = timeAgo(new Date(Date.now() - 2 * 3600000));
      else if (d.includes('24 hour') || d.includes('1 day') || d.includes('yesterday')) j.date = timeAgo(new Date(Date.now() - 12 * 3600000));
      else j.date = timeAgo(new Date(Date.now() - 86400000));
    });
    
    // Save to file
    fs.writeFileSync(DATA_FILE, JSON.stringify(allJobs, null, 2), 'utf8');
    console.log(`[Scraper] Saved ${allJobs.length} jobs to ${DATA_FILE}`);
    
    // Git commit + push
    try {
      execSync('git add api/data/jobs.json', { cwd: WORK_DIR });
      execSync('git commit -m "chore(jobs): scraped ' + allJobs.length + ' real jobs from Indeed"', { cwd: WORK_DIR });
      execSync('git push', { cwd: WORK_DIR });
      console.log('[Scraper] Deployed to Vercel');
    } catch (e) {
      console.log('[Scraper] Git error:', e.message.substring(0, 100));
    }
    
  } catch (e) {
    console.error('[Scraper] Fatal error:', e.message);
  } finally {
    if (browser) await browser.close();
  }
  
  console.log('[Scraper] Done');
}

main().catch(console.error);
