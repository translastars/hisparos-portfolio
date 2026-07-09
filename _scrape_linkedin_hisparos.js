const cheerio = require('cheerio');
const fetch = require('node-fetch').default;
const fs = require('fs');
const path = require('path');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// STRICT: only legal/sworn/financial/certified translation keywords
const KEYWORDS = [
  'sworn translator',
  'legal translator',
  'traductor jurado',
  'traducción jurídica',
  'financial translator',
  'court interpreter legal',
  'judicial translator',
  'certified translator legal',
  'traductor jurídico',
  'judicial interpreter court',
  'translator law firm',
  'legal translation',
  'sworn translation',
  'translator legal Spain',
  'traductor financiero',
  'translator European Union',
  'legal interpreter court',
  'traducción financiera',
  'legal localization',
];

function isLegalSwornRelevant(title, desc) {
  const t = (title + ' ' + (desc || '')).toLowerCase();
  // Must contain at least one legal/sworn/financial keyword
  const primary = [/jurad/, /sworn/, /legal/, /jurídic/, /juridic/, /judicial/, /court/,
    /financier/, /financial/, /certified.*legal/, /law.?firm/, /european.?union/i];
  
  const hasPrimary = primary.some(p => p.test(t));
  if (!hasPrimary) return false;
  
  // Must also be translation/linguistic related
  const secondary = [/translat/, /interpret/, /traduc/, /languag/, /linguist/, /localiz/];
  const hasSecondary = secondary.some(p => p.test(t));
  
  return hasSecondary;
}

function extractCountry(location) {
  if (!location) return '';
  const l = location.toLowerCase();
  if (l.includes('remote') || l.includes('anywhere') || l.includes('worldwide') || l.includes('global')) return 'Remote';
  if (l.includes('spain') || l.includes('españa') || l.includes('españ')) return 'Spain';
  if (l.includes('uk') || l.includes('united kingdom') || l.includes('england') || l.includes('london')) return 'United Kingdom';
  if (l.includes('germany') || l.includes('deutschland') || l.includes('berlin')) return 'Germany';
  if (l.includes('france') || l.includes('paris')) return 'France';
  if (l.includes('belgium') || l.includes('brussels')) return 'Belgium';
  if (l.includes('netherlands') || l.includes('holland') || l.includes('amsterdam')) return 'Netherlands';
  if (l.includes('switzerland') || l.includes('geneva')) return 'Switzerland';
  if (l.includes('italy') || l.includes('italia') || l.includes('rome')) return 'Italy';
  if (l.includes('portugal') || l.includes('lisbon')) return 'Portugal';
  if (l.includes('ireland') || l.includes('dublin')) return 'Ireland';
  if (l.includes('austria') || l.includes('vienna')) return 'Austria';
  if (l.includes('sweden') || l.includes('stockholm')) return 'Sweden';
  if (l.includes('denmark') || l.includes('copenhagen')) return 'Denmark';
  if (l.includes('usa') || l.includes('united states') || l.includes('new york')) return 'United States';
  if (l.includes('canada') || l.includes('toronto')) return 'Canada';
  if (l.includes('mexico')) return 'Mexico';
  if (l.includes('poland')) return 'Poland';
  if (l.includes('japan') || l.includes('tokyo')) return 'Japan';
  if (l.includes('china')) return 'China';
  if (l.includes('brazil')) return 'Brazil';
  return 'Remote';
}

function classifyCategories(title) {
  const t = title.toLowerCase();
  const cats = [];
  if (/sworn|jurad|certified|certificado|oficial/i.test(t)) cats.push('Sworn Translation');
  if (/jurídic|juridic|legal|judicial|abogad|law|attorney|court|law.?firm/i.test(t)) cats.push('Legal');
  if (/financier|financial|finance|banca|banking/i.test(t)) cats.push('Financial');
  if (/european.?union|eu|comisión/i.test(t)) cats.push('EU Institutions');
  if (/government|state|public|ministerio/i.test(t)) cats.push('Government');
  if (/freelance|remote|remoto/i.test(t)) cats.push('Freelance');
  if (!cats.length) cats.push('Legal');
  return cats;
}

function classifyType(title, location) {
  const t = title.toLowerCase();
  const l = (location || '').toLowerCase();
  if (t.includes('remote') || l.includes('remote') || t.includes('remoto') || l.includes('remoto')) return 'remote';
  if (t.includes('hybrid') || l.includes('hybrid')) return 'hybrid';
  return 'on-site';
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}

function timeAgo(isoStr) {
  if (!isoStr) return 'recent';
  const diff = Date.now() - new Date(isoStr).getTime();
  if (isNaN(diff)) return 'recent';
  const days = Math.floor(diff / 86400000);
  if (days < 1) { const h = Math.floor(diff / 3600000); return h <= 1 ? 'Today' : h + 'h ago'; }
  if (days === 1) return '1d ago';
  if (days < 7) return days + 'd ago';
  if (days < 30) return Math.floor(days/7) + 'w ago';
  if (days < 365) return Math.floor(days/30) + 'mo ago';
  return Math.floor(days/365) + 'y ago';
}

async function scrapeLinkedIn(keywords) {
  const url = 'https://www.linkedin.com/jobs/search/?keywords=' + encodeURIComponent(keywords) + '&sortBy=DD';
  
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
      'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      'Cache-Control': 'no-cache',
      'Sec-Fetch-Mode': 'navigate',
    },
    timeout: 15000,
  });

  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const jobs = [];
  const seenUrls = new Set();

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html());
      const items = data.itemListElement || (data.url ? [data] : []);
      items.forEach((item) => {
        const j = item.item || item;
        if (!j || !j.title) return;
        const title = j.title;
        const company = (j.hiringOrganization && j.hiringOrganization.name) || '';
        const locObj = j.jobLocation;
        let locStr = '';
        if (locObj) {
          const addr = locObj.address || locObj;
          locStr = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean).join(', ');
        }
        const link = j.url || '';
        if (seenUrls.has(link)) return;
        if (!isLegalSwornRelevant(title, j.description || '')) return;
        seenUrls.add(link);
        
        const desc = (j.description || '').replace(/<[^>]*>/g, '').slice(0, 300);
        const country = extractCountry(locStr);
        const cats = classifyCategories(title);
        const type = classifyType(title, locStr);
        const pubDate = j.datePosted || new Date().toISOString();
        
        jobs.push({
          title, company, country,
          location: locStr || country || 'Remote',
          type, categories: cats,
          desc,
          date: formatDate(pubDate),
          ago: timeAgo(pubDate),
          source: 'LinkedIn',
          sourceClass: 'linkedin',
          link,
          featured: false,
        });
      });
    } catch(e) {}
  });

  // HTML job cards
  $('.job-search-card, .base-card, .result-card').each((_, card) => {
    const $card = $(card);
    const titleEl = $card.find('.base-search-card__title, h3, .job-card-title').first();
    const companyEl = $card.find('.base-search-card__subtitle, .job-card-company, .job-card-list__company-name').first();
    const locationEl = $card.find('.job-search-card__location, .job-card-location').first();
    const dateEl = $card.find('time').first();
    const linkEl = $card.find('a.base-card__full-link, a[href*="/jobs/view"]').first();

    const title = titleEl.text().trim();
    const company = companyEl.text().trim();
    const location = locationEl.text().trim();
    const link = linkEl.attr('href') || '';

    if (!title || title.length < 5 || seenUrls.has(link)) return;
    if (!isLegalSwornRelevant(title, '')) return;
    seenUrls.add(link);

    const dateStr = dateEl.attr('datetime') || '';
    const country = extractCountry(location);
    const cats = classifyCategories(title);
    const type = classifyType(title, location);
    const pubDate = dateStr || new Date().toISOString();

    jobs.push({
      title, company, country,
      location: location || country || 'Remote',
      type, categories: cats,
      desc: (title + ' at ' + company + '. Apply on LinkedIn.'),
      date: formatDate(pubDate),
      ago: timeAgo(pubDate),
      source: 'LinkedIn',
      sourceClass: 'linkedin',
      link: link.startsWith('http') ? link : 'https://www.linkedin.com' + link,
      featured: false,
    });
  });

  return jobs;
}

async function run() {
  console.log('=== LinkedIn Scraper for Hisparos (Legal/Sworn/FInancial) ===\n');
  
  let allJobs = [];
  const seen = new Set();
  
  for (const kw of KEYWORDS) {
    try {
      const jobs = await scrapeLinkedIn(kw);
      const newJobs = [];
      for (const j of jobs) {
        const key = j.title.substring(0, 30) + '|' + j.company.substring(0, 20) + '|' + j.link.substring(0, 40);
        if (!seen.has(key)) {
          seen.add(key);
          newJobs.push(j);
        }
      }
      console.log('  [' + kw.substring(0, 25).padEnd(25) + '] ' + jobs.length + ' raw → ' + newJobs.length + ' new');
      allJobs = allJobs.concat(newJobs);
      await new Promise(r => setTimeout(r, 1200));
    } catch(e) {
      console.log('  [' + kw.substring(0, 25).padEnd(25) + '] Error: ' + e.message);
    }
  }
  
  console.log('\nTotal unique jobs: ' + allJobs.length);
  allJobs.forEach((j, i) => {
    console.log('  ' + (i+1) + '. ' + j.title.substring(0, 55).padEnd(55) + ' @ ' + j.company.substring(0, 25).padEnd(25) + ' [' + j.country + ']');
  });
  
  // Save
  const JOBS_FILE = path.join(__dirname, 'api', 'data', 'jobs.json');
  
  // Keep existing + new
  let existing = [];
  try {
    if (fs.existsSync(JOBS_FILE)) {
      existing = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    }
  } catch(e) {}
  
  const existingUrls = new Set(existing.map(j => j.link));
  const merged = [...existing];
  let newCount = 0;
  for (const job of allJobs) {
    if (!existingUrls.has(job.link) && job.link && job.link.startsWith('http')) {
      merged.unshift(job);
      newCount++;
    }
  }
  
  const final = merged.slice(0, 50);
  fs.writeFileSync(JOBS_FILE, JSON.stringify(final, null, 2));
  console.log('\n💾 Saved ' + final.length + ' jobs (+' + newCount + ' new)');
  
  // Update FALLBACK_JOBS
  const HTML_FILE = path.join(__dirname, 'jobs.html');
  if (fs.existsSync(HTML_FILE)) {
    let html = fs.readFileSync(HTML_FILE, 'utf8');
    const fbStart = html.indexOf('const FALLBACK_JOBS = [');
    const fbEnd = html.indexOf('];', fbStart) + 2;
    const fbArray = final.slice(0, 25).map(j => JSON.stringify(j)).join(',\n  ');
    html = html.substring(0, fbStart) + 'const FALLBACK_JOBS = [\n  ' + fbArray + '\n];' + html.substring(fbEnd);
    fs.writeFileSync(HTML_FILE, html);
    console.log('✅ Updated FALLBACK_JOBS in jobs.html');
  }
  
  return { total: final.length, new: newCount };
}

run()
  .then(r => { console.log('\nDone.'); process.exit(0); })
  .catch(e => { console.error('Fatal:', e.message); process.exit(1); });
