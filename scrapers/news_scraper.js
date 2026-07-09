/**
 * Hisparos News Scraper v2
 * Fetches legal/sworn/financial translation news via Google News RSS + industry feeds
 * Deduplicates by title, categorizes, outputs news.json
 * Usage: node scrapers/news_scraper.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '..', 'api', 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const MAX_PER_FEED = 20;
const MAX_TOTAL = 150;

const SOURCES = [
  // ── Google News: legal/sworn translation (English) ──
  { url: 'https://news.google.com/rss/search?q=%22legal+translation%22+OR+%22sworn+translation%22+OR+%22certified+translation%22&hl=en-US&gl=US&ceid=US:en', source: 'Google News', cat: 'Legal', max: 20 },
  // ── Google News: traducción jurada/jurídica (Spanish) ──
  { url: 'https://news.google.com/rss/search?q=%22traducci%C3%B3n+jurada%22+OR+%22traducci%C3%B3n+jur%C3%ADdica%22+OR+%22traductor+jurado%22&hl=es&gl=ES&ceid=ES:es', source: 'Google News', cat: 'Spain', max: 20 },
  // ── Google News: financial translation ──
  { url: 'https://news.google.com/rss/search?q=%22financial+translation%22+OR+%22translation+services%22+finance&hl=en-US&gl=US&ceid=US:en', source: 'Google News', cat: 'Financial', max: 15 },
  // ── Google News: EU justice / translation ──
  { url: 'https://news.google.com/rss/search?q=%22court+of+justice%22+EU+translation+language&hl=en-US&gl=US&ceid=US:en', source: 'Google News', cat: 'EU', max: 15 },
  // ── Google News: legal AI certification ──
  { url: 'https://news.google.com/rss/search?q=legal+translation+AI+certification+sworn+court&hl=en-US&gl=US&ceid=US:en', source: 'Google News', cat: 'Legal', max: 10 },
  // ── Google News: BOE traductor jurado ──
  { url: 'https://news.google.com/rss/search?q=BOE+traducci%C3%B3n+jurada+int%C3%A9rprete&hl=es&gl=ES&ceid=ES:es', source: 'Google News', cat: 'Spain', max: 10 },
  // ── Industry feeds (for broader context) ──
  { url: 'https://slator.com/feed/', source: 'Slator', cat: 'Industry', max: 10 },
  { url: 'https://elia-association.org/feed/', source: 'ELIA', cat: 'Industry', max: 8 },
  { url: 'https://www.locworld.com/feed/', source: 'LocWorld', cat: 'Industry', max: 8 },
  { url: 'https://www.welocalize.com/feed/', source: 'Welocalize', cat: 'Industry', max: 8 },
  { url: 'https://unbabel.com/feed/', source: 'Unbabel', cat: 'Tech', max: 8 },
  { url: 'https://translatorswithoutborders.org/feed/', source: 'TWB', cat: 'Global', max: 8 },
  { url: 'https://poeditor.com/blog/feed/', source: 'POEditor', cat: 'Tech', max: 5 },
  { url: 'https://www.nimdzi.com/feed/', source: 'Nimdzi', cat: 'Industry', max: 5 },
];

const SOURCE_COLORS = {
  'Google News': '#4285F4',
  'Slator': '#1a73e8',
  'ELIA': '#2a9d8f',
  'LocWorld': '#0d9488',
  'Welocalize': '#0077b6',
  'Unbabel': '#00a3ff',
  'TWB': '#e76f51',
  'POEditor': '#512da8',
  'Nimdzi': '#e63946',
  'default': '#FF5432'
};

// ── RSS XML Parser ──
function parseRSS(xml, sourceName) {
  const articles = [];
  // Remove CDATA
  xml = xml.replace(/<!\[CDATA\[([^\]]*)\]\]>/g, '$1');
  
  // Find all <item> or <entry> blocks
  const items = xml.match(/<(?:item|entry)[^>]*>[\s\S]*?<\/(?:item|entry)>/g) || [];
  
  for (const item of items) {
    const extract = (tag) => {
      const m = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const extractAttr = (tag, attr) => {
      const m = item.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, 'i'));
      return m ? m[1].trim() : '';
    };

    let title = extract('title');
    let link = extract('link');
    // Atom feeds have link as <link href="..."/>
    if (!link || link === '') link = extractAttr('link', 'href');
    // Google News has <link> with text content
    if (!link || link.startsWith('http') === false) link = extractAttr('link', 'href');
    // For Google News, the actual URL is in <link> or <guid>
    if (!link || link === '') link = extract('guid');
    
    // Google News format has link in <feed><entry><link href="..."/>
    if (!link || link.startsWith('http') === false) {
      const l2 = item.match(/<link[^>]*href=["']([^"']*)["']/i);
      if (l2) link = l2[1];
    }

    let desc = extract('description') || extract('summary') || extract('content:encoded') || '';
    // Strip HTML tags from description
    desc = desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    let date = extract('pubDate') || extract('published') || extract('updated') || extract('dc:date') || '';
    // Normalize date to ISO
    if (date) {
      try { date = new Date(date).toISOString(); } catch(e) { date = ''; }
    }

    // Get image from media:content or enclosure
    let image = extractAttr('media:content', 'url') || extractAttr('enclosure', 'url') || '';

    // For Google News articles, clean up the link and get better data
    if (sourceName === 'Google News' && link) {
      // Google News wraps URLs: extract the real URL
      const realUrl = link.match(/[\?&]url=([^&]+)/);
      if (realUrl) link = decodeURIComponent(realUrl[1]);
      // Get image from media:content
      if (!image) image = extractAttr('media:content', 'url');
    }

    if (title && title.length > 10 && !title.startsWith('Google News')) {
      articles.push({ title, link, description: desc, date, image, cat: '' });
    }
  }
  return articles;
}

// ── Fetch URL ──
function fetchURL(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 12000, rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(data));
    });
    req.on('error', () => resolve(''));
    req.on('timeout', () => { req.destroy(); resolve(''); });
  });
}

// ── Main ──
async function main() {
  console.log('📰 Hisparos News Scraper v2 — Legal/Sworn/Financial focus');
  console.log(`🔍 Fetching ${SOURCES.length} feeds...\n`);

  const allArticles = [];

  for (let idx = 0; idx < SOURCES.length; idx++) {
    const feed = SOURCES[idx];
    let currentSource = feed.source; // Track source for parseRSS
    const source = feed.source;
    
    process.stdout.write(`  ${idx+1}. ${source} (${feed.cat})... `);
    
    const xml = await fetchURL(feed.url);
    if (!xml || xml.length < 100) {
      console.log('❌ (empty/error)');
      continue;
    }

    const articles = parseRSS(xml, source);
    
    // Assign category + source to each
    articles.forEach(a => {
      a.cat = feed.cat;
      a.source = source;
    });

    const limited = articles.slice(0, feed.max);
    console.log(`✅ ${limited.length} articles`);
    allArticles.push(...limited);
  }

  // Sort by date (newest first)
  allArticles.sort((a, b) => {
    if (a.date && b.date) return new Date(b.date) - new Date(a.date);
    if (a.date) return -1;
    if (b.date) return 1;
    return 0;
  });

  // Deduplicate by title (fuzzy: normalize and compare)
  const seen = new Set();
  const unique = [];
  for (const a of allArticles) {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(a);
    }
  }

  // Trim to max
  const final = unique.slice(0, MAX_TOTAL);

  // Group counts
  const counts = {};
  final.forEach(a => { counts[a.cat] = (counts[a.cat] || 0) + 1; });

  // Add source display names
  final.forEach(a => {
    a.source_display = a.source;
    a.color = SOURCE_COLORS[a.source] || SOURCE_COLORS['default'];
  });

  const output = {
    count: final.length,
    articles: final,
    generated: new Date().toISOString(),
    sources: [...new Set(final.map(a => a.source))],
    categories: counts
  };

  fs.writeFileSync(NEWS_FILE, JSON.stringify(output, null, 2));
  console.log(`\n✅ Saved to ${NEWS_FILE}`);
  console.log(`📊 ${final.length} unique articles across ${Object.keys(counts).length} categories:`);
  Object.entries(counts).sort((a,b) => b[1]-a[1]).forEach(([cat, n]) => console.log(`   ${cat}: ${n}`));
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
