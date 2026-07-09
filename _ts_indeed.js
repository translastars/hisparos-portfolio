/**
 * Indeed Jobs Scraper — v3
 * Attempts multiple strategies to fetch Indeed job listings.
 * Strategy 1: Direct fetch (works from some residential IPs)
 * Strategy 2: indeed.co.uk (European)
 * Strategy 3: Google search for Indeed listings (fallback, strict filtering)
 */
const fetch = require('node-fetch');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const SEARCHES = [
  { q: 'localization', what: 'Localization' },
  { q: 'translation', what: 'Translation' },
  { q: 'translator', what: 'Translator' },
  { q: 'localization+manager', what: 'Localization Manager' },
  { q: 'localization+specialist', what: 'Localization Specialist' },
  { q: 'linguist', what: 'Linguist' },
  { q: 'traducción', what: 'Translation (ES)' },
  { q: 'traductor', what: 'Translator (ES)' },
];

async function scrapeIndeed(query, location = '') {
  // Try multiple Indeed domains
  const domains = ['www.indeed.com', 'uk.indeed.com', 'de.indeed.com', 'fr.indeed.com', 'es.indeed.com'];
  
  for (const domain of domains) {
    try {
      const url = `https://${domain}/jobs?q=${encodeURIComponent(query)}&l=${encodeURIComponent(location)}&sort=date`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000,
      });

      if (res.ok) {
        const html = await res.text();
        const jobs = parseIndeedHTML(html);
        if (jobs.length > 0) {
          console.log(`    Indeed [${domain}] → ${jobs.length} jobs`);
          return jobs;
        }
      }
    } catch (e) {
      // Try next domain
    }
  }

  // Fallback: Google search for Indeed listings
  console.log(`    Indeed direct blocked, trying Google fallback...`);
  const googleJobs = await googleIndeedFallback(query);
  return googleJobs;
}

function parseIndeedHTML(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const jobs = [];

  $('.job_seen_beacon, .jobsearch-SerpJobCard, .result, .cardOutline').each((_, card) => {
    const $card = $(card);
    const titleEl = $card.find('.jobTitle, .title a, [data-jk] a, h2 a, .jobTitle-color-purple').first();
    const companyEl = $card.find('.companyName, .company, .result-link-source, .css-63koeb').first();
    const locationEl = $card.find('.companyLocation, .location, .resultLocation, .css-1p0sjhy').first();
    const snippetEl = $card.find('.job-snippet, .summary, .resultSnippet, .css-944v2d').first();
    const salaryEl = $card.find('.salary-snippet, .salary, .estimated-salary, .css-1f4kg1d').first();
    const dateEl = $card.find('.date, .resultDate, .css-doq0rg').first();

    const title = titleEl.text().trim();
    const company = companyEl.text().trim();
    const location = locationEl.text().trim();
    const snippet = snippetEl.text().trim();
    const salary = salaryEl.text().trim();
    const dateStr = dateEl.text().trim();
    const link = titleEl.attr('href') || '';

    if (!title) return;
    if (title.includes('Sponsored') || $card.find('.sponsored').length > 0) return;

    const jobUrl = link.startsWith('http') ? link : `https://www.indeed.com${link}`;
    const country = normalizeIndeedCountry(location);
    const remote = location.toLowerCase().includes('remote') || title.toLowerCase().includes('remote');

    jobs.push({
      id: `in-${Buffer.from(jobUrl).toString('base64').slice(0, 20)}`,
      title,
      company,
      location,
      url: jobUrl,
      date: parseIndeedDate(dateStr),
      source: 'Indeed',
      type: classifyJobType(title),
      side: classifySide(company, title),
      remote,
      country,
      salary: salary || null,
      snippet: snippet.slice(0, 300),
      fetchedAt: new Date().toISOString(),
    });
  });

  return jobs;
}

/**
 * Google fallback — heavily filtered to avoid spam/placeholder jobs.
 */
async function googleIndeedFallback(query) {
  const searchUrl = `https://www.google.com/search?q=site:indeed.com+${encodeURIComponent(query)}+jobs`;
  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 10000,
    });
    if (!res.ok) return [];

    const html = await res.text();
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    const jobs = [];
    const seen = new Set();

    // Patterns that indicate a NON-job-title link text (spam/placeholder/CTA)
    const BAD_TITLE_PATTERNS = [
      /haz clic/i, /click here/i, /sponsored/i, /advertisement/i, /anuncio/i,
      /sign up/i, /learn more/i, /read more/i, /subscribe/i, /register/i,
      /free\s+(trial|download|guide)/i, /get started/i, /apply now/i,
      /^\s*\(?\d+\)?\s*$/, /^\s*$/, /^[^a-zA-ZÀ-ÿ]{3,}$/,
    ];

    function isRealJobTitle(text) {
      const t = text.trim();
      if (t.length < 8) return false;
      for (const p of BAD_TITLE_PATTERNS) {
        if (p.test(t)) return false;
      }
      // Must contain at least one meaningful word (4+ chars)
      const words = t.split(/\s+/).filter(w => w.length >= 4);
      return words.length > 0;
    }

    $('a[href*="indeed.com"]').each((_, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();

      // Skip absolute-non-http (javascript, mailto), relative, or google-internal URLs
      if (!href || href.startsWith('/') || href.startsWith('#') || href.startsWith('javascript:')) return;
      if (href.includes('google.com') || href.includes('accounts.google.com')) return;
      if (seen.has(href)) return;
      if (!text || text.length < 8) return;
      if (!isRealJobTitle(text)) return;

      seen.add(href);

      jobs.push({
        id: `in-g-${Buffer.from(href).toString('base64').slice(0, 20)}`,
        title: text.replace(/^[^a-zA-ZÀ-ÿ0-9]*/, '').trim(),
        company: '',
        location: '',
        url: href,
        date: new Date().toISOString(),
        source: 'Indeed',
        type: classifyJobType(text),
        side: 'both',
        remote: false,
        country: '',
        salary: null,
        snippet: '',
        fetchedAt: new Date().toISOString(),
      });
    });

    return jobs.slice(0, 20);
  } catch (e) {
    return [];
  }
}

function parseIndeedDate(dateStr) {
  const s = dateStr.toLowerCase().trim();
  const now = new Date();
  if (s.includes('today') || s.includes('just posted')) return now.toISOString();
  if (s.includes('30+')) {
    const d = new Date(now); d.setDate(d.getDate() - 30); return d.toISOString();
  }
  const match = s.match(/(\d+)\s*(day|days|hour|hours|week|weeks|month|months)/);
  if (match) {
    const num = parseInt(match[1]);
    const unit = match[2];
    const d = new Date(now);
    if (unit.startsWith('day')) d.setDate(d.getDate() - num);
    else if (unit.startsWith('hour')) d.setHours(d.getHours() - num);
    else if (unit.startsWith('week')) d.setDate(d.getDate() - num * 7);
    else if (unit.startsWith('month')) d.setMonth(d.getMonth() - num);
    return d.toISOString();
  }
  return now.toISOString();
}

/**
 * Normalize a location string to a country name.
 * Returns empty string if the country cannot be reliably determined.
 */
function normalizeIndeedCountry(location) {
  if (!location) return '';
  const parts = location.split(',').map((s) => s.trim());
  const last = parts[parts.length - 1] || '';

  // Known country names and common abbreviations
  const KNOWN_COUNTRIES = {
    'united states': 'United States', 'usa': 'United States', 'u.s.a.': 'United States', 'us': 'United States',
    'united kingdom': 'United Kingdom', 'uk': 'United Kingdom', 'england': 'United Kingdom', 'u.k.': 'United Kingdom',
    'spain': 'Spain', 'españa': 'Spain',
    'germany': 'Germany', 'deutschland': 'Germany',
    'france': 'France',
    'italy': 'Italy', 'italia': 'Italy',
    'netherlands': 'Netherlands', 'holland': 'Netherlands',
    'poland': 'Poland',
    'sweden': 'Sweden',
    'denmark': 'Denmark',
    'norway': 'Norway',
    'finland': 'Finland',
    'portugal': 'Portugal',
    'belgium': 'Belgium',
    'switzerland': 'Switzerland',
    'austria': 'Austria',
    'ireland': 'Ireland',
    'canada': 'Canada',
    'australia': 'Australia',
    'japan': 'Japan',
    'china': 'China',
    'india': 'India',
    'brazil': 'Brazil',
    'mexico': 'Mexico',
    'argentina': 'Argentina',
    'colombia': 'Colombia',
    'chile': 'Chile',
    'singapore': 'Singapore',
    'south korea': 'South Korea', 'korea': 'South Korea',
    'russia': 'Russia',
    'turkey': 'Turkey', 'türkiye': 'Turkey',
    'saudi arabia': 'Saudi Arabia',
    'uae': 'United Arab Emirates',
    'united arab emirates': 'United Arab Emirates',
    'israel': 'Israel',
    'south africa': 'South Africa',
    'egypt': 'Egypt',
    'nigeria': 'Nigeria',
    'new zealand': 'New Zealand',
    'romania': 'Romania',
    'czech republic': 'Czech Republic', 'czechia': 'Czech Republic',
    'hungary': 'Hungary',
    'ukraine': 'Ukraine',
    'greece': 'Greece',
    'indonesia': 'Indonesia',
    'thailand': 'Thailand',
    'vietnam': 'Vietnam',
    'malaysia': 'Malaysia',
    'philippines': 'Philippines',
    'taiwan': 'Taiwan',
  };

  const key = last.toLowerCase().trim();
  if (KNOWN_COUNTRIES[key]) return KNOWN_COUNTRIES[key];

  // US state (two-letter uppercase) = United States
  if (/^[A-Z]{2}$/.test(last)) return 'United States';

  // If we can't map it, return empty instead of the raw location
  return '';
}

// US states (used for country detection)
function classifyJobType(title) {
  const t = title.toLowerCase();
  if (t.includes('freelance') || t.includes('contract') || t.includes('independent')) return 'freelance';
  if (t.includes('intern') || t.includes('trainee') || t.includes('junior') || t.includes('associate')) return 'junior';
  if (t.includes('senior') || t.includes('lead') || t.includes('head') || t.includes('director') || t.includes('principal') || t.includes('chief') || t.includes('staff')) return 'senior';
  if (t.includes('manager') || t.includes('coordinator') || t.includes('specialist') || t.includes('analyst')) return 'mid';
  return 'mid';
}
function classifySide(company, title) {
  const c = company.toLowerCase().trim();
  const t = title.toLowerCase();
  const buyer = ['amazon','google','meta','microsoft','apple','netflix','sony','nintendo','uber','airbnb','asana','rover','tripadvisor','2k','tesla','bumble','blizzard','unity','ubisoft','adobe','salesforce','shopify','stripe','booking','expedia'];
  const vendor = ['transperfect','lionbridge','welocalize','rws','sdl','semantix','keywords studios','testronic','moravia','acclaro','big language','translate plus','the translation people','interpret'];
  if (buyer.some(k => c.includes(k))) return 'buyer';
  if (vendor.some(k => c.includes(k))) return 'vendor';
  if (t.includes('translator') || t.includes('interpreter') || t.includes('linguist')) return 'vendor';
  return 'both';
}

module.exports = { scrapeIndeed, SEARCHES };
