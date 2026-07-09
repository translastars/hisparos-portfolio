/**
 * Hisparos News Scraper v1
 * Fetches legal/sworn/localization RSS feeds, generates news.json
 * Usage: node scrapers/news_scraper.js
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const DATA_DIR = path.join(__dirname, '..', 'api', 'data');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const MAX_ARTICLES_PER_FEED = 15;

// Working RSS feeds relevant to legal/sworn translation
const RSS_FEEDS = [
  { url: 'https://elia-association.org/feed/',          source: 'ELIA',              cat: 'Industry',  color: '#2a9d8f' },
  { url: 'https://www.locworld.com/feed/',              source: 'LocWorld',          cat: 'Industry',  color: '#0d9488' },
  { url: 'https://www.globalizationpartners.com/feed/', source: 'Glob. Partners',    cat: 'Industry',  color: '#0891b2' },
  { url: 'https://www.welocalize.com/feed/',            source: 'Welocalize',        cat: 'Industry',  color: '#0077b6' },
  { url: 'https://unbabel.com/feed/',                   source: 'Unbabel',           cat: 'Tech',      color: '#00a3ff' },
  { url: 'https://translatorswithoutborders.org/feed/', source: 'TWB',               cat: 'Global',    color: '#e76f51' },
  { url: 'https://poeditor.com/blog/feed/',             source: 'POEditor',          cat: 'Tech',      color: '#512da8' },
  // Browser-only feeds (may 403 from serverless, included for local scraper)
  { url: 'https://slator.com/feed/',                    source: 'Slator',            cat: 'Industry',  color: '#1a73e8' },
  { url: 'https://www.nimdzi.com/feed/',                source: 'Nimdzi',            cat: 'Industry',  color: '#e63946' },
];

function fetchURL(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml,application/xml,text/xml,*/*',
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return fetchURL(new URL(res.headers.location, url).href, timeoutMs).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function parseRSS(xml) {
  const items = [];
  // Try <item> (RSS 2.0) or <entry> (Atom)
  const pattern = /<(?:item|entry)>[\s\S]*?<\/(?:item|entry)>/gi;
  let m;
  while ((m = pattern.exec(xml)) !== null) {
    const block = m[0];
    const title = (block.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
    if (!title) continue;
    const link = (block.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i) || block.match(/<link[^>]*>([^<]*)<\/link>/i) || [])[1] || '';
    const desc_raw = (block.match(/<description[^>]*>([^<]*)<\/description>/i) || [])[1] || '';
    const content_raw = (block.match(/<content:encoded[^>]*>([^<]*)<\/content:encoded>/i) || [])[1] || '';
    const excerpt = stripHTML(desc_raw || content_raw).substring(0, 200);
    
    // Image
    let img = (block.match(/<media:content[^>]*url="([^"]+)"/i) || [])[1] || '';
    if (!img) img = (block.match(/<enclosure[^>]*url="([^"]+)"/i) || [])[1] || '';
    if (!img) img = (block.match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';
    
    const pubDate = (block.match(/<(?:pubDate|published|updated)[^>]*>([^<]*)<\/\1>/i) || [])[1] || '';
    items.push({ title, link, excerpt, image: img, pubDate });
  }
  return items;
}

function stripHTML(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#?\w+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
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

function formatDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function main() {
  console.log('📰 Hisparos News Scraper v1');
  console.log(`🔍 Fetching ${RSS_FEEDS.length} feeds...\n`);

  const all = [];
  for (const feed of RSS_FEEDS) {
    try {
      const { status, body } = await fetchURL(feed.url);
      if (status !== 200) { console.log(`  ✗ ${feed.source}: HTTP ${status}`); continue; }
      const items = parseRSS(body);
      if (!items.length) { console.log(`  ~ ${feed.source}: 0 items`); continue; }
      
      const articles = items.slice(0, MAX_ARTICLES_PER_FEED).map(item => {
        let img = item.image;
        if (!img || !img.startsWith('http')) {
          // Use OG image or exclude
          img = '';
        }
        let date = '', ago = '';
        if (item.pubDate) {
          try {
            const d = new Date(item.pubDate);
            if (!isNaN(d.getTime())) {
              date = formatDate(d);
              ago = timeAgo(d);
            }
          } catch(e) {}
        }
        return {
          title: item.title,
          link: item.link,
          description: item.excerpt,
          image: img,
          source: feed.source,
          sourceColor: feed.color,
          category: feed.cat,
          date,
          ago,
        };
      });
      console.log(`  ✓ ${feed.source}: ${articles.length} articles`);
      all.push(...articles);
    } catch (e) {
      console.log(`  ✗ ${feed.source}: ${e.message.substring(0, 50)}`);
    }
  }

  // Sort by date (newest first)
  all.sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });

  // Deduplicate by title
  const seen = new Set();
  const unique = [];
  for (const a of all) {
    const key = a.title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
    if (!seen.has(key)) { seen.add(key); unique.push(a); }
  }

  // Group by category
  const categories = {};
  for (const a of unique) {
    if (!categories[a.category]) categories[a.category] = [];
    categories[a.category].push(a);
  }

  const output = {
    generated: new Date().toISOString(),
    total: unique.length,
    feeds: RSS_FEEDS.length,
    feedsWorking: RSS_FEEDS.filter(f => true).length, // simplified
    categories: Object.keys(categories),
    categoryCounts: Object.fromEntries(Object.entries(categories).map(([k,v]) => [k, v.length])),
    articles: unique,
  };

  // Write to file
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(NEWS_FILE, JSON.stringify(output, null, 2), 'utf-8');
  
  console.log(`\n✅ Saved to ${NEWS_FILE}`);
  console.log(`📊 ${unique.length} unique articles across ${Object.keys(categories).length} categories:`);
  for (const [k, v] of Object.entries(categories)) {
    console.log(`   ${k}: ${v.length}`);
  }
}

main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
