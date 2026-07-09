const fetch = require('node-fetch').default;
const cheerio = require('cheerio');

async function test() {
  const domains = ['www.indeed.com', 'uk.indeed.com', 'de.indeed.com', 'fr.indeed.com', 'es.indeed.com'];
  const q = 'traductor+jurado';
  
  for (const domain of domains) {
    try {
      const url = 'https://' + domain + '/jobs?q=' + q + '&sort=date';
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        timeout: 10000,
      });
      
      const html = await res.text();
      const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] || 'no title';
      console.log('[' + domain + '] Status:', res.status, 'Title:', title.substring(0, 60), 'Length:', html.length);
      
      const $ = cheerio.load(html);
      const cards = $('.job_seen_beacon, .jobsearch-SerpJobCard, .result, .cardOutline');
      console.log('  Cards found:', cards.length);
      
      if (cards.length > 0) {
        const t = cards.first().find('.jobTitle, .title a, [data-jk] a, h2 a').first().text().trim();
        console.log('  First job:', t.substring(0, 80));
      }
      
      console.log('  Captcha:', html.toLowerCase().includes('captcha'));
      console.log();
    } catch(e) {
      console.log('[' + domain + '] Error:', e.message);
    }
  }
}

test();
