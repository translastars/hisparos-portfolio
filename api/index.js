const fs = require('fs');
const path = require('path');

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

module.exports = (req, res) => {
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

      case '/export': {
        res.end(JSON.stringify(loadJSON('terms').terms || []));
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
