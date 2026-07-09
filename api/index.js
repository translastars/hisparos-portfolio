const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
let cache = {};

function loadJSON(name) {
  if (!cache[name]) {
    const fp = path.join(DATA_DIR, name + '.json');
    if (fs.existsSync(fp)) cache[name] = JSON.parse(fs.readFileSync(fp, 'utf-8'));
  }
  return cache[name];
}

// ===== Native RSS Parser (no deps) =====
const RSS_FEEDS = [
  { url: 'https://slator.com/feed/', source: 'Slator', cat: 'Tech' },
  { url: 'https://multilingual.com/feed/', source: 'MultiLingual', cat: 'Tech' },
  { url: 'https://www.traduccionjurada.com/feed/', source: 'Traducción Jurada', cat: 'Spain' },
  { url: 'https://www.lexology.com/rss.ashx', source: 'Lexology', cat: 'EU' },
  { url: 'https://www.gala-global.org/news/feed', source: 'GALA', cat: 'Tech' },
  { url: 'https://europa.eu/newsroom/rss.xml', source: 'EU Official', cat: 'EU' },
  { url: 'https://www.proz.com/feed/', source: 'ProZ.com', cat: 'Careers' },
  { url: 'https://curia.europa.eu/jcms/jcms/p1_3717879/rss', source: 'CJEU', cat: 'EU' },
  { url: 'https://www.poderjudicial.es/cgpj/es/Servicios/RSS/', source: 'Poder Judicial', cat: 'Spain' },
  { url: 'https://noticias.juridicas.com/feed/', source: 'Noticias Jurídicas', cat: 'Spain' },
];

const CAT_IMGS = {
  EU: ['https://images.unsplash.com/photo-1526379879527-8559ecfcaec0', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b', 'https://images.unsplash.com/photo-1516307365426-bea591f05011'],
  Spain: ['https://images.unsplash.com/photo-1450101499163-c8848c66ca85', 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f', 'https://images.unsplash.com/photo-1516307365426-bea591f05011'],
  UK: ['https://images.unsplash.com/photo-1486299267070-83823f5448dd', 'https://images.unsplash.com/photo-1514924013411-cbf25faa35bb', 'https://images.unsplash.com/photo-1532375810709-75b1da00537c'],
  Tech: ['https://images.unsplash.com/photo-1526379879527-8559ecfcaec0', 'https://images.unsplash.com/photo-1519389950473-47ba0277781c', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b'],
  Careers: ['https://images.unsplash.com/photo-1521791055366-0d553872125f', 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85', 'https://images.unsplash.com/photo-1559827291-baf8ed1d95e4'],
};

const SRC_IDX = { Slator:0, MultiLingual:3, 'Traducción Jurada':4, Lexology:0, GALA:2, 'EU Official':5, 'ProZ.com':5, CJEU:0, 'Poder Judicial':4, 'Noticias Jurídicas':4 };

function xmlGet(text, tag) {
  const m = text.match(new RegExp('<' + tag + '>([^<]*)<\\\\/' + tag + '>', 'i'));
  return m ? m[1].trim() : '';
}

function parseRSS(xml) {
  const items = [];
  // Split into <item>...</item>
  const itemRe = /<item>[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const block = m[0];
    const title = xmlGet(block, 'title');
    if (!title) continue;
    const link = xmlGet(block, 'link');
    const rawDesc = xmlGet(block, 'description');
    // Extract image from media:content or enclosure
    let img = '';
    const mc = block.match(/<media:content[^>]*url="([^"]+)"/i);
    if (mc) img = mc[1];
    if (!img) { const enc = block.match(/<enclosure[^>]*url="([^"]+)"/i); if (enc) img = enc[1]; }
    if (!img) { const imgtag = block.match(/<img[^>]+src="([^"]+)"/i); if (imgtag) img = imgtag[1]; }
    const pubDate = xmlGet(block, 'pubDate') || xmlGet(block, 'dc:date');
    items.push({ title, link, desc: rawDesc.replace(/<[^>]*>/g, '').substring(0, 200), image: img, pubDate });
  }
  return items;
}

async function fetchNewsRSS() {
  const all = [];
  for (const feed of RSS_FEEDS) {
    try {
      const resp = await fetch(feed.url, { signal: AbortSignal.timeout(6000) });
      const xml = await resp.text();
      const items = parseRSS(xml);
      items.slice(0, 15).forEach(item => {
        let img = item.image;
        if (!img || !img.startsWith('http')) {
          const idx = SRC_IDX[feed.source];
          const imgs = CAT_IMGS[feed.cat];
          if (idx != null && imgs) img = imgs[idx % imgs.length];
          else if (imgs) img = imgs[0];
        }
        let date = '', ago = '';
        if (item.pubDate) {
          try {
            const d = new Date(item.pubDate);
            date = d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
            ago = timeAgo(d);
          } catch(e) {}
        }
        all.push({ title: item.title, link: item.link || '#', description: item.desc, image: img, source: feed.source, category: feed.cat, date, ago });
      });
    } catch(e) { /* feed failed */ }
  }
  all.sort((a, b) => (b.date ? new Date(b.date) : 0) - (a.date ? new Date(a.date) : 0));
  return all;
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

// ===== Main handler =====
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }

  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname.replace(/\/api/g, '').replace(/\/+$/, '') || '/';
    const params = url.searchParams;

    switch (pathname) {
      case '/':
      case '/health':
        res.end(JSON.stringify({ status: 'ok', version: '2.0.0', multilingual: true }));
        break;

      case '/stats':
        res.end(JSON.stringify(loadJSON('stats')));
        break;

      case '/languages':
        res.end(JSON.stringify(loadJSON('languages')));
        break;

      case '/domains':
        res.end(JSON.stringify(loadJSON('domains')));
        break;

      case '/exclusions':
        res.end(JSON.stringify(loadJSON('exclusions')));
        break;

      case '/terms': {
        const data = loadJSON('terms');
        let results = data.terms || [];
        const q = (params.get('q') || params.get('search') || '').trim().toLowerCase();
        if (q) results = results.filter(t => (t.term||'').toLowerCase().includes(q) || (t.context||'').toLowerCase().includes(q) || (t.translations||[]).some(tr => (tr.text||'').toLowerCase().includes(q)));
        const lang = params.get('lang');
        if (lang) results = results.filter(t => t.lang === lang.toUpperCase());
        const domain = params.get('domain');
        if (domain) results = results.filter(t => t.domain_slug === domain.toLowerCase());
        const page = Math.max(1, parseInt(params.get('page')) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(params.get('limit')) || 50));
        const total = results.length;
        const pages = Math.ceil(total / limit);
        const paged = results.slice((page - 1) * limit, page * limit);
        res.end(JSON.stringify({ terms: paged, pagination: { page, limit, total, totalPages: pages, hasNext: page < pages, hasPrev: page > 1 } }));
        break;
      }

      case '/uploads':
        res.end(JSON.stringify([]));
        break;

      case '/export':
        res.end(JSON.stringify((loadJSON('terms').terms || [])));
        break;

      case '/news': {
        const articles = await fetchNewsRSS();
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        res.end(JSON.stringify({ articles, count: articles.length }));
        break;
      }

      case '/jobs': {
        const jobs = loadJSON('jobs') || [];
        let filtered = [...jobs];
        const qCat = params.get('category');
        const qType = params.get('type');
        const qCountry = params.get('country');
        const qSource = params.get('source');
        const qSearch = params.get('search');
        if (qCat) filtered = filtered.filter(j => j.categories.some(c => c.toLowerCase() === qCat.toLowerCase()));
        if (qType) filtered = filtered.filter(j => j.type === qType);
        if (qCountry) filtered = filtered.filter(j => j.country.toLowerCase() === qCountry.toLowerCase());
        if (qSource) filtered = filtered.filter(j => j.source.toLowerCase() === qSource.toLowerCase());
        if (qSearch) {
          const s = qSearch.toLowerCase();
          filtered = filtered.filter(j => (j.title||'').toLowerCase().includes(s) || (j.company||'').toLowerCase().includes(s) || (j.desc||'').toLowerCase().includes(s) || (j.location||'').toLowerCase().includes(s));
        }
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        res.end(JSON.stringify({ jobs: filtered, count: filtered.length, total: jobs.length }));
        break;
      }

      default:
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (e) {
    console.error('API error:', e);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
