const RssParser = require('rss-parser');
const parser = new RssParser({
  timeout: 8000,
  customFields: { item: ['media:content', 'enclosure'] }
});

const RSS_FEEDS = [
  { url: 'https://slator.com/feed/', source: 'Slator', category: 'Tech' },
  { url: 'https://multilingual.com/feed/', source: 'MultiLingual', category: 'Tech' },
  { url: 'https://www.traduccionjurada.com/feed/', source: 'Traducción Jurada', category: 'Spain' },
  { url: 'https://feeds.feedburner.com/TedX', source: 'TedX', category: 'Tech' },
  { url: 'https://www.lexology.com/rss.ashx', source: 'Lexology', category: 'EU' },
  { url: 'https://www.gala-global.org/news/feed', source: 'GALA', category: 'Tech' },
  { url: 'https://europa.eu/newsroom/rss.xml', source: 'EU Official', category: 'EU' },
  { url: 'https://www.proz.com/feed/', source: 'ProZ.com', category: 'Careers' },
  // Extra legal sources
  { url: 'https://curia.europa.eu/jcms/jcms/p1_3717879/rss', source: 'CJEU', category: 'EU' },
  { url: 'https://www.poderjudicial.es/cgpj/es/Servicios/RSS/', source: 'Poder Judicial', category: 'Spain' },
  { url: 'https://noticias.juridicas.com/feed/', source: 'Noticias Jurídicas', category: 'Spain' },
];

// Image fallback pools for categories
const CAT_IMAGES = {
  'EU': [
    'https://images.unsplash.com/photo-1526379879527-8559ecfcaec0',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b',
    'https://images.unsplash.com/photo-1516307365426-bea591f05011'
  ],
  'Spain': [
    'https://images.unsplash.com/photo-1450101499163-c8848c66ca85',
    'https://images.unsplash.com/photo-1589829545856-d10d557cf95f',
    'https://images.unsplash.com/photo-1516307365426-bea591f05011'
  ],
  'Tech': [
    'https://images.unsplash.com/photo-1526379879527-8559ecfcaec0',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c',
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b'
  ],
  'Careers': [
    'https://images.unsplash.com/photo-1521791055366-0d553872125f',
    'https://images.unsplash.com/photo-1450101499163-c8848c66ca85',
    'https://images.unsplash.com/photo-1559827291-baf8ed1d95e4'
  ],
  'UK': [
    'https://images.unsplash.com/photo-1486299267070-83823f5448dd',
    'https://images.unsplash.com/photo-1514924013411-cbf25faa35bb',
    'https://images.unsplash.com/photo-1532375810709-75b1da00537c'
  ]
};

const SOURCE_IMAGES = {
  'Slator': 'https://images.unsplash.com/photo-1526379879527-8559ecfcaec0',
  'MultiLingual': 'https://images.unsplash.com/photo-1519389950473-47ba0277781c',
  'Traducción Jurada': 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85',
  'Lexology': 'https://images.unsplash.com/photo-1526379879527-8559ecfcaec0',
  'GALA': 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b',
  'EU Official': 'https://images.unsplash.com/photo-1559827291-baf8ed1d95e4',
  'ProZ.com': 'https://images.unsplash.com/photo-1521791055366-0d553872125f',
  'CJEU': 'https://images.unsplash.com/photo-1516307365426-bea591f05011',
  'Poder Judicial': 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f',
  'Noticias Jurídicas': 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85',
  'BOE': 'https://images.unsplash.com/photo-1516307365426-bea591f05011'
};

function extractImage(item) {
  // Try media:content
  if (item['media:content'] && item['media:content'].$) {
    return item['media:content'].$.url;
  }
  // Try enclosure
  if (item.enclosure && item.enclosure.url) {
    return item.enclosure.url;
  }
  // Try content html for <img>
  if (item.content) {
    const m = item.content.match(/<img[^>]+src="([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
  
  try {
    const allArticles = [];
    
    for (const feed of RSS_FEEDS) {
      try {
        const parsed = await parser.parseURL(feed.url);
        if (parsed.items && parsed.items.length > 0) {
          parsed.items.slice(0, 30).forEach(item => {
            let image = extractImage(item);
            if (!image) {
              image = SOURCE_IMAGES[feed.source] || CAT_IMAGES[feed.category]?.[0] || '';
            }
            if (image && !image.startsWith('http')) {
              image = SOURCE_IMAGES[feed.source] || CAT_IMAGES[feed.category]?.[0] || '';
            }
            let dateStr = item.isoDate || item.pubDate || '';
            let date = '';
            if (dateStr) {
              try { date = new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); } catch(e) { date = ''; }
            }
            allArticles.push({
              title: item.title || 'Untitled',
              link: item.link || '#',
              description: (item.contentSnippet || item.content || '').substring(0, 200),
              image: image,
              source: feed.source,
              category: feed.category,
              date: date,
              ago: dateStr ? timeAgo(new Date(dateStr)) : ''
            });
          });
        }
      } catch(e) {
        // Feed failed, skip
        console.error('Feed error:', feed.source, e.message);
      }
    }
    
    // Sort by date (newest first), with un-dated at end
    allArticles.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date) - new Date(a.date);
    });
    
    res.json({ articles: allArticles, count: allArticles.length });
  } catch (err) {
    console.error('News API error:', err);
    res.status(500).json({ error: err.message });
  }
};

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  if (days < 30) return Math.floor(days / 7) + 'w ago';
  return Math.floor(days / 30) + 'mo ago';
}
