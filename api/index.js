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
        let data = loadJSON('news');
        if (!data || !data.articles || !data.articles.length) {
          data = { articles: [], total: 0, generated: null };
        }
        res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
        res.end(JSON.stringify({ articles: data.articles, count: data.articles.length, generated: data.generated }));
        break;
      }

      case '/news/upload': {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'POST required' }));
          break;
        }
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const fp = path.join(DATA_DIR, 'news.json');
            fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8');
            cache['news'] = data;
            res.end(JSON.stringify({ success: true, total: (data.articles || []).length }));
          } catch(e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Invalid JSON: ' + e.message }));
          }
        });
        break;
      }

      case '/jobs': {
        const jobs = loadJSON('jobs') || [];
        let filtered = [...jobs];
        const qCat = params.get('category');
        const qType = params.get('type');
        const qCountry = params.get('country');
        const qSource = params.get('source');
        if (qCat) filtered = filtered.filter(j => j.categories.some(c => c.toLowerCase() === qCat.toLowerCase()));
        if (qType) filtered = filtered.filter(j => j.type === qType);
        if (qCountry) filtered = filtered.filter(j => j.country.toLowerCase() === qCountry.toLowerCase());
        if (qSource) filtered = filtered.filter(j => j.source.toLowerCase() === qSource.toLowerCase());
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
