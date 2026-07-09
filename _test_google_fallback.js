const fetch = require('node-fetch').default;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function tryGoogle() {
  const query = 'traductor+jurado+empleo';
  const url = `https://www.google.com/search?q=${query}+jobs&hl=en`;
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.5',
      },
      timeout: 10000,
    });
    
    console.log('Google status:', res.status);
    const html = await res.text();
    console.log('HTML length:', html.length);
    
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);
    
    // Extract all links with job titles
    const links = [];
    $('a[href*="indeed.com"], a[href*="linkedin.com"], a[href*="glassdoor.com"], a[href*="jooble.org"], a[href*="infojobs.net"], a[href*="jobtoday.com"]')
      .each((_, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (text && text.length > 5) {
          links.push({ text: text.substring(0, 80), href: href ? href.substring(0, 120) : '' });
        }
      });
    
    console.log(`\nFound ${links.length} job links from Google`);
    links.forEach((l, i) => {
      if (i < 20) console.log(`  ${i+1}. ${l.text} → ${l.href}`);
    });
    
    // Also try gdiv approach
    console.log('\nSearch results from Google:');
    $('div[data-sokoban-container], div.g, .MjjYud').each((_, el) => {
      const text = $(el).text().trim();
      if (text.includes('traductor') || text.includes('translator') || text.includes('legal')) {
        const firstLine = text.substring(0, 120);
        console.log(`  Result: ${firstLine}...`);
      }
    });
    
  } catch(e) {
    console.error('Error:', e.message);
  }
}

tryGoogle();
