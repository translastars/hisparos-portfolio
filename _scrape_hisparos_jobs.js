/**
 * Hisparos Jobs Scraper — v1
 * Fetches real legal/sworn/financial translation jobs from Indeed and LinkedIn
 * Pattern: direct fetch + cheerio (same as TranslaStars Jobs Board)
 */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch').default;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ===== Hisparos-specific keywords for legal/sworn/financial translation =====
const INDEED_SEARCHES = [
  // Spanish — sworn/legal
  { q: 'traductor+jurado', what: 'Sworn Translator', domain: 'es.indeed.com' },
  { q: 'traduccion+juridica', what: 'Legal Translation', domain: 'es.indeed.com' },
  { q: 'traductor+juridico', what: 'Legal Translator', domain: 'es.indeed.com' },
  { q: 'traduccion+financiera', what: 'Financial Translation', domain: 'es.indeed.com' },
  { q: 'interpretacion+juridica', what: 'Legal Interpreting', domain: 'es.indeed.com' },
  { q: 'traductor+ingles+espanol+legal', what: 'EN-ES Legal Translator', domain: 'es.indeed.com' },
  // English — legal/financial translation
  { q: 'legal+translator', what: 'Legal Translator', domain: 'www.indeed.com' },
  { q: 'sworn+translator', what: 'Sworn Translator', domain: 'www.indeed.com' },
  { q: 'financial+translator', what: 'Financial Translator', domain: 'www.indeed.com' },
  { q: 'certified+translator+legal', what: 'Certified Legal Translator', domain: 'www.indeed.com' },
  { q: 'judicial+translator', what: 'Judicial Translator', domain: 'www.indeed.com' },
  // UK/Europe
  { q: 'legal+translator', what: 'Legal Translator UK', domain: 'uk.indeed.com' },
  { q: 'sworn+translator', what: 'Sworn Translator UK', domain: 'uk.indeed.com' },
  { q: 'traducteur+juridique', what: 'Legal Translator FR', domain: 'fr.indeed.com' },
  { q: 'übersetzer+recht', what: 'Legal Translator DE', domain: 'de.indeed.com' },
];

const LINKEDIN_SEARCHES = [
  { keywords: 'legal translation', location: '' },
  { keywords: 'sworn translator', location: '' },
  { keywords: 'financial translator', location: '' },
  { keywords: 'traductor jurado', location: '' },
  { keywords: 'traducción jurídica', location: '' },
  { keywords: 'legal translator Spain', location: '' },
  { keywords: 'certified translator', location: '' },
  { keywords: 'judicial interpreter', location: '' },
  { keywords: 'translation legal', location: 'Spain' },
  { keywords: 'translator legal', location: 'Europe' },
];

// Source badges used in Hisparos
function getSourceClass(source) {
  const map = { 'Indeed':'indeed', 'LinkedIn':'linkedin', 'Glassdoor':'glassdoor', 'Jooble':'jooble',
    'ProZ':'proz', 'Adzuna':'adzuna', 'ZipRecruiter':'ziprecruiter', 'Freelancer':'freelancer',
    'EuropeLanguageJobs':'europelanguagejobs', 'RemoteRocketShip':'remoterocketship',
    'iAgora':'iagora', 'JobToday':'jobtoday', 'Jobijoba':'jobijoba', 'Jobsora':'jobsora',
    'Milanuncios':'milanuncios', 'Cronoshare':'cronoshare', 'EmpleoPúblico':'gobierno',
    'CanalOposiciones':'gobierno', 'BOE':'gobierno', 'TraducciónJurídica':'traduccionjuridica',
    'TransPerfect':'jooble' };
  return map[source] || 'indeed';
}

function classifyCategories(title, company, desc) {
  const t = (title + ' ' + (desc || '')).toLowerCase();
  const cats = [];
  if (/jurado|sworn|certified|certificado|oficial/i.test(t)) cats.push('Sworn Translation');
  if (/jurídic|legal|judicial|abogad|law|legal|judicial/i.test(t)) cats.push('Legal');
  if (/financier|financial|finance|banca|bank/i.test(t)) cats.push('Financial');
  if (/gobierno|gobierno|administración|public|state|ministerio|oposiciones|plazas/i.test(t)) cats.push('Government');
  if (/comisión europea|eu|european|union/i.test(t)) cats.push('EU Institutions');
  if (/freelance|autónomo|remoto|remote|independiente|contract/i.test(t)) cats.push('Freelance');
  if (!cats.length) cats.push('Translation');
  return cats;
}

function classifyType(title, location) {
  const t = title.toLowerCase();
  const l = (location || '').toLowerCase();
  if (t.includes('remote') || l.includes('remote') || t.includes('remoto') || l.includes('remoto')) return 'remote';
  if (t.includes('hybrid') || l.includes('hybrid')) return 'hybrid';
  return 'on-site';
}

function extractCountry(location) {
  if (!location) return 'Remote';
  const l = location.toLowerCase();
  if (l.includes('remote') || l.includes('anywhere') || l.includes('worldwide') || l.includes('global')) return 'Remote';
  if (l.includes('spain') || l.includes('españa') || l.includes('espa')) return 'Spain';
  if (l.includes('uk') || l.includes('united kingdom') || l.includes('england') || l.includes('london')) return 'United Kingdom';
  if (l.includes('germany') || l.includes('deutschland') || l.includes('berlin')) return 'Germany';
  if (l.includes('france') || l.includes('paris')) return 'France';
  if (l.includes('belgium') || l.includes('brussels')) return 'Belgium';
  if (l.includes('netherlands') || l.includes('holland')) return 'Netherlands';
  if (l.includes('switzerland')) return 'Switzerland';
  if (l.includes('italy') || l.includes('italia')) return 'Italy';
  if (l.includes('portugal')) return 'Portugal';
  if (l.includes('ireland') || l.includes('dublin')) return 'Ireland';
  if (l.includes('austria') || l.includes('vienna')) return 'Austria';
  if (l.includes('sweden') || l.includes('stockholm')) return 'Sweden';
  if (l.includes('denmark') || l.includes('copenhagen')) return 'Denmark';
  if (l.includes('norway')) return 'Norway';
  if (l.includes('poland') || l.includes('warsaw')) return 'Poland';
  if (l.includes('usa') || l.includes('united states') || l.includes('new york') || l.includes('california')) return 'United States';
  if (l.includes('canada') || l.includes('toronto')) return 'Canada';
  if (l.includes('china') || l.includes('beijing') || l.includes('shanghai')) return 'China';
  if (l.includes('japan') || l.includes('tokyo')) return 'Japan';
  if (l.includes('mexico')) return 'Mexico';
  if (l.includes('brazil')) return 'Brazil';
  return 'Spain'; // default for Hisparos
}

function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString();
  const s = dateStr.toLowerCase().trim();
  const now = new Date();
  if (s.includes('today') || s.includes('just posted') || s.includes('hoy')) return now.toISOString();
  if (s.includes('30+') || s.includes('más de 30')) { const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString(); }
  const match = s.match(/(\d+)\s*(day|days|hour|hours|week|weeks|month|months|día|días|hora|horas|semana|semanas|mes|meses)/);
  if (match) {
    const num = parseInt(match[1]);
    const unit = match[2];
    const d = new Date(now);
    if (unit.startsWith('day') || unit.startsWith('día')) d.setDate(d.getDate() - num);
    else if (unit.startsWith('hour') || unit.startsWith('hora')) d.setHours(d.getHours() - num);
    else if (unit.startsWith('week') || unit.startsWith('semana')) d.setDate(d.getDate() - num * 7);
    else if (unit.startsWith('month') || unit.startsWith('mes')) d.setMonth(d.getMonth() - num);
    return d.toISOString();
  }
  return now.toISOString();
}

function timeAgo(isoStr) {
  if (!isoStr) return 'recent';
  const diff = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) { const h = Math.floor(diff / 3600000); return h <= 1 ? 'Today' : `${h}h ago`; }
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days/7)}w ago`;
  if (days < 365) return `${Math.floor(days/30)}mo ago`;
  return `${Math.floor(days/365)}y ago`;
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

// ===== INDEED SCRAPER =====
async function scrapeIndeed() {
  const all = [];
  
  for (const search of INDEED_SEARCHES) {
    try {
      const url = `https://${search.domain}/jobs?q=${search.q}&sort=date`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9,es;q=0.5' },
        timeout: 8000,
      });
      if (!res.ok) continue;

      const html = await res.text();
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);
      
      $('.job_seen_beacon, .jobsearch-SerpJobCard, .result, .cardOutline, .job-card').each((_, card) => {
        const $card = $(card);
        const titleEl = $card.find('.jobTitle, .title a, [data-jk] a, h2 a').first();
        const companyEl = $card.find('.companyName, .company, .result-link-source, .css-63koeb').first();
        const locationEl = $card.find('.companyLocation, .location, .resultLocation, .css-1p0sjhy').first();
        const snippetEl = $card.find('.job-snippet, .summary, .resultSnippet, .css-944v2d').first();
        const dateEl = $card.find('.date, .resultDate, .css-doq0rg').first();

        const title = titleEl.text().trim();
        const company = companyEl.text().trim();
        const location = locationEl.text().trim();
        const snippet = snippetEl.text().trim();
        const dateStr = dateEl.text().trim();
        const link = titleEl.attr('href') || '';

        if (!title || title.length < 5) return;
        if (title.includes('Sponsored') || $card.find('.sponsored').length > 0) return;

        const jobUrl = link.startsWith('http') ? link : `https://${search.domain}${link}`;
        const pubDate = parseDate(dateStr);
        const cats = classifyCategories(title, company, snippet);
        const country = extractCountry(location);
        const type = classifyType(title, location);

        all.push({
          title, company, country, location: location || country, type,
          categories: cats,
          desc: snippet.substring(0, 300),
          date: formatDate(pubDate),
          ago: timeAgo(pubDate),
          source: 'Indeed',
          sourceClass: 'indeed',
          link: jobUrl,
          featured: false,
          _pubDate: pubDate,
        });
      });
      
      console.log(`    Indeed [${search.domain}/${search.q}] → ${all.filter(j => j._pubDate).length} jobs`);
      await new Promise(r => setTimeout(r, 1000)); // rate limit
    } catch (e) {
      // Silently skip failed searches
    }
  }
  
  // Remove internal _pubDate before returning
  const jobs = all.filter(j => j.title).slice(0, 100);
  jobs.forEach(j => delete j._pubDate);
  return jobs;
}

// ===== LINKEDIN SCRAPER =====
async function scrapeLinkedIn() {
  const all = [];

  for (const search of LINKEDIN_SEARCHES) {
    try {
      const loc = search.location ? `&location=${encodeURIComponent(search.location)}` : '';
      const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(search.keywords)}${loc}&sortBy=DD`;
      
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
        timeout: 8000,
      });
      if (!res.ok) continue;

      const html = await res.text();
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);

      $('.job-card, .job-card-container, .base-card, .job-search-card').each((_, card) => {
        const $card = $(card);
        const titleEl = $card.find('.job-card-title, .base-card__title, h3, .job-title').first();
        const companyEl = $card.find('.job-card-company, .base-card__subtitle, h4, .company-name').first();
        const locationEl = $card.find('.job-card-location, .base-card__metadata, .job-location').first();
        const linkEl = $card.find('a[href*="/jobs/"]').first();

        const title = titleEl.text().trim();
        const company = companyEl.text().trim();
        const location = locationEl.text().trim();
        const link = linkEl.attr('href') || '';

        if (!title || title.length < 5) return;

        const cats = classifyCategories(title, company, '');
        const country = extractCountry(location);
        const type = classifyType(title, location);
        const pubDate = new Date().toISOString();

        all.push({
          title, company, country, location: location || country, type,
          categories: cats,
          desc: `Apply on LinkedIn for ${title} at ${company}. Position available in ${location || country}.`,
          date: formatDate(pubDate),
          ago: 'Today',
          source: 'LinkedIn',
          sourceClass: 'linkedin',
          link: link.startsWith('http') ? link : `https://www.linkedin.com${link}`,
          featured: false,
        });
      });

      console.log(`    LinkedIn [${search.keywords}] → see results`);
      await new Promise(r => setTimeout(r, 1500)); // rate limit
    } catch (e) {
      // Silently skip failed searches
    }
  }

  return all.slice(0, 50);
}

// ===== MERGE + SAVE =====
async function run() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${new Date().toISOString()}] 🕸️  Hisparos Jobs Scraper`);
  console.log('='.repeat(60));

  // Scrape Indeed
  console.log('\n📌 INDEED');
  console.log('-'.repeat(40));
  const indeedJobs = await scrapeIndeed();
  console.log(`\n  ✅ Indeed total: ${indeedJobs.length} jobs`);

  // Scrape LinkedIn
  console.log('\n📌 LINKEDIN');
  console.log('-'.repeat(40));
  const liJobs = await scrapeLinkedIn();
  console.log(`\n  ✅ LinkedIn total: ${liJobs.length} jobs`);

  // Deduplicate
  const seen = new Set();
  const allJobs = [...indeedJobs, ...liJobs];
  const unique = [];
  for (const job of allJobs) {
    const key = `${job.title.toLowerCase().slice(0, 30)}|${job.company.toLowerCase().slice(0, 20)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(job);
    }
  }
  
  console.log(`\n📊 Stats: ${allJobs.length} raw → ${unique.length} unique`);

  // Keep only valid jobs with actual link
  const valid = unique.filter(j => j.link && j.link.startsWith('http'));

  // Merge with existing jobs (keep old ones that have working links + search results)
  const DATA_DIR = path.join(__dirname, 'api', 'data');
  const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
  
  let existing = [];
  try {
    if (fs.existsSync(JOBS_FILE)) {
      existing = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    }
  } catch (e) {}

  const existingUrls = new Set(existing.map(j => j.link));
  const merged = [...existing]; // keep existing
  let newCount = 0;
  
  for (const job of valid) {
    if (!existingUrls.has(job.link)) {
      merged.unshift(job);
      newCount++;
    }
  }

  // Cap at 100
  const final = merged.slice(0, 100);

  // Save
  fs.writeFileSync(JOBS_FILE, JSON.stringify(final, null, 2));
  console.log(`\n💾 Saved ${final.length} jobs to api/data/jobs.json (+${newCount} new this run)`);

  // Also update the FALLBACK_JOBS in jobs.html
  const HTML_FILE = path.join(__dirname, 'jobs.html');
  if (fs.existsSync(HTML_FILE)) {
    let html = fs.readFileSync(HTML_FILE, 'utf8');
    const fbStart = html.indexOf('const FALLBACK_JOBS = [');
    const fbEnd = html.indexOf('];', fbStart) + 2;
    
    const fbArray = final.slice(0, 25).map(j => JSON.stringify(j)).join(',\n  ');
    const fbCode = `const FALLBACK_JOBS = [\n  ${fbArray}\n];`;
    
    html = html.substring(0, fbStart) + fbCode + html.substring(fbEnd);
    fs.writeFileSync(HTML_FILE, html);
    console.log(`✅ Updated FALLBACK_JOBS in jobs.html`);
  }

  return { total: final.length, new: newCount };
}

// Run if executed directly
if (require.main === module) {
  run()
    .then(r => {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`✅ Done. ${r.total} jobs stored. ${r.new} new.`);
      console.log('='.repeat(60));
      process.exit(0);
    })
    .catch(e => {
      console.error(`\n❌ Fatal: ${e.message}`);
      process.exit(1);
    });
}

module.exports = { run };
