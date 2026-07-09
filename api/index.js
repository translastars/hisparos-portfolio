const fs = require('fs');
const path = require('path');
const RssParser = require('rss-parser');
const rssParser = new RssParser({ timeout: 8000, customFields: { item: ['media:content', 'enclosure'] } });

const DATA_DIR = path.join(__dirname, 'data');

// Cache for loaded data
let cache = {};

function loadJSON(name) {
  if (!cache[name]) {
    const filePath = path.join(DATA_DIR, name + '.json');
    if (fs.existsSync(filePath)) {
      cache[name] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }
  return cache[name];
}

const RSS_FEEDS = [
  { url: 'https://slator.com/feed/', source: 'Slator', category: 'Tech' },
  { url: 'https://multilingual.com/feed/', source: 'MultiLingual', category: 'Tech' },
  { url: 'https://www.traduccionjurada.com/feed/', source: 'Traducción Jurada', category: 'Spain' },
  { url: 'https://www.lexology.com/rss.ashx', source: 'Lexology', category: 'EU' },
  { url: 'https://www.gala-global.org/news/feed', source: 'GALA', category: 'Tech' },
  { url: 'https://europa.eu/newsroom/rss.xml', source: 'EU Official', category: 'EU' },
  { url: 'https://www.proz.com/feed/', source: 'ProZ.com', category: 'Careers' },
  { url: 'https://curia.europa.eu/jcms/jcms/p1_3717879/rss', source: 'CJEU', category: 'EU' },
  { url: 'https://www.poderjudicial.es/cgpj/es/Servicios/RSS/', source: 'Poder Judicial', category: 'Spain' },
  { url: 'https://noticias.juridicas.com/feed/', source: 'Noticias Jurídicas', category: 'Spain' },
];

const CAT_IMGS = {
  'EU': ['https://images.unsplash.com/photo-1526379879527-8559ecfcaec0', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b', 'https://images.unsplash.com/photo-1516307365426-bea591f05011'],
  'Spain': ['https://images.unsplash.com/photo-1450101499163-c8848c66ca85', 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f', 'https://images.unsplash.com/photo-1516307365426-bea591f05011'],
  'Tech': ['https://images.unsplash.com/photo-1526379879527-8559ecfcaec0', 'https://images.unsplash.com/photo-1519389950473-47ba0277781c', 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b'],
  'Careers': ['https://images.unsplash.com/photo-1521791055366-0d553872125f', 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85', 'https://images.unsplash.com/photo-1559827291-baf8ed1d95e4'],
  'UK': ['https://images.unsplash.com/photo-1486299267070-83823f5448dd', 'https://images.unsplash.com/photo-1514924013411-cbf25faa35bb', 'https://images.unsplash.com/photo-1532375810709-75b1da00537c']
};

const SRC_IMGS = {
  'Slator': 0, 'MultiLingual': 3, 'Traducción Jurada': 4, 'Lexology': 0,
  'GALA': 2, 'EU Official': 5, 'ProZ.com': 5, 'CJEU': 0, 'Poder Judicial': 4, 'Noticias Jurídicas': 4
};

function extractImage(item) {
  if (item['media:content'] && item['media:content'].$) return item['media:content'].$.url;
  if (item.enclosure && item.enclosure.url) return item.enclosure.url;
  if (item.content) { const m = item.content.match(/<img[^>]+src="([^"]+)"/); if (m) return m[1]; }
  return null;
}

async function fetchNews() {
  const articles = [];
  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await rssParser.parseURL(feed.url);
      if (parsed.items) {
        parsed.items.slice(0, 30).forEach(item => {
          let image = extractImage(item);
          if (!image) {
            const srcIdx = SRC_IMGS[feed.source];
            const catImgs = CAT_IMGS[feed.category];
            if (catImgs && srcIdx != null) image = catImgs[srcIdx % catImgs.length];
            else if (catImgs) image = catImgs[0];
          }
          if (image && !image.startsWith('http')) image = '';
          if (!image && CAT_IMGS[feed.category]) image = CAT_IMGS[feed.category][0];
          const dateStr = item.isoDate || item.pubDate || '';
          let date = '', ago = '';
          if (dateStr) {
            try { date = new Date(dateStr).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); ago = timeAgo(new Date(dateStr)); } catch(e) {}
          }
          articles.push({ title: item.title || 'Untitled', link: item.link || '#', description: (item.contentSnippet || item.content || '').substring(0, 200), image, source: feed.source, category: feed.category, date, ago });
        });
      }
    } catch(e) { /* feed failed */ }
  }
  articles.sort((a, b) => (b.date ? new Date(b.date) : 0) - (a.date ? new Date(a.date) : 0));
  return articles;
}

function timeAgo(d) { const s=Math.floor((Date.now()-d)/1000); if(s<60) return 'Just now'; const m=Math.floor(s/60); if(m<60) return m+'m ago'; const h=Math.floor(m/60); if(h<24) return h+'h ago'; const da=Math.floor(h/24); if(da<7) return da+'d ago'; if(da<30) return Math.floor(da/7)+'w ago'; return Math.floor(da/30)+'mo ago'; }

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname.replace(/\/api/g, '').replace(/\/$/, '') || '/';
  const params = url.searchParams;

  try {
    switch (pathname) {
      case '/':
      case '/health': {
        res.end(JSON.stringify({ status: 'ok', version: '2.0.0', multilingual: true }));
        break;
      }

      case '/stats': {
        res.end(JSON.stringify(loadJSON('stats')));
        break;
      }

      case '/languages': {
        res.end(JSON.stringify(loadJSON('languages')));
        break;
      }

      case '/domains': {
        res.end(JSON.stringify(loadJSON('domains')));
        break;
      }

      case '/exclusions': {
        res.end(JSON.stringify(loadJSON('exclusions')));
        break;
      }

      case '/terms': {
        const data = loadJSON('terms');
        let results = data.terms || [];
        const q = params.get('q') || params.get('search') || '';

        // Filter by search query
        if (q.trim()) {
          const like = q.trim().toLowerCase();
          results = results.filter(t =>
            (t.term && t.term.toLowerCase().includes(like)) ||
            (t.context && t.context.toLowerCase().includes(like)) ||
            (t.translations && t.translations.some(tr => tr.text && tr.text.toLowerCase().includes(like)))
          );
        }

        // Filter by language
        const lang = params.get('lang');
        if (lang) {
          results = results.filter(t => t.lang === lang.toUpperCase());
        }

        // Filter by domain
        const domain = params.get('domain');
        if (domain) {
          results = results.filter(t => t.domain_slug === domain.toLowerCase());
        }

        // Pagination
        const page = Math.max(1, parseInt(params.get('page')) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(params.get('limit')) || 50));
        const offset = (page - 1) * limit;
        const total = results.length;
        const totalPages = Math.ceil(total / limit);
        const paged = results.slice(offset, offset + limit);

        res.end(JSON.stringify({
          terms: paged,
          pagination: {
            page, limit, total, totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }));
        break;
      }

      case '/uploads': {
        res.end(JSON.stringify([]));
        break;
      }

      case '/export': {
        res.end(JSON.stringify(loadJSON('terms').terms || []));
        break;
      }

      case '/news': {
        const articles = await fetchNews();
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        res.end(JSON.stringify({ articles, count: articles.length }));
        break;
      }

      case '/jobs': {
        const jobs = loadJSON('jobs');
        let filtered = jobs ? [...jobs] : [];
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
          filtered = filtered.filter(j => j.title.toLowerCase().includes(s) || j.company.toLowerCase().includes(s) || j.desc.toLowerCase().includes(s) || j.location.toLowerCase().includes(s));
        }
        res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
        res.end(JSON.stringify({ jobs: filtered, count: filtered.length, total: jobs ? jobs.length : 0 }));
        break;
      }

      default:
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
