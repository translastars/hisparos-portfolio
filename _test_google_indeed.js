const fetch = require('node-fetch').default;
const cheerio = require('cheerio');

async function testGoogleFallback() {
  const query = 'traductor+jurado';
  const url = 'https://www.google.com/search?q=site:indeed.com+' + query + '+jobs';
  
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      Accept: 'text/html',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    timeout: 10000,
  });
  
  const html = await res.text();
  const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] || 'no title';
  console.log('Google status:', res.status);
  console.log('Title:', title.substring(0, 80));
  console.log('Length:', html.length);
  console.log('Captcha:', html.toLowerCase().includes('captcha') || html.toLowerCase().includes('unusual traffic'));
  
  // Try to find any indeed links
  const $ = cheerio.load(html);
  const links = $('a[href*="indeed.com"]');
  console.log('\nIndeed links found:', links.length);
  
  links.each((i, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    if (text.length > 5) {
      console.log('  ' + (i+1) + '.', text.substring(0, 60), '→', href ? href.substring(0, 80) : '');
    }
  });
}

testGoogleFallback();
