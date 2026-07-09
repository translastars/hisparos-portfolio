/**
 * Debug Indeed — check what HTML structure Indeed returns
 */
const fetch = require('node-fetch').default;

async function main() {
  const url = 'https://es.indeed.com/jobs?q=traductor+jurado&sort=date';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
    timeout: 15000,
  });
  
  console.log('Status:', res.status);
  console.log('Content-Type:', res.headers.get('content-type'));
  console.log('Content-Length:', res.headers.get('content-length'));
  
  const html = await res.text();
  console.log('HTML length:', html.length);
  
  // Check for common indicators
  console.log('\nIndicators:');
  console.log('  Contains captcha:', html.toLowerCase().includes('captcha'));
  console.log('  Contains "no results":', html.includes('no ha producido ningún resultado') || html.includes('no results'));
  console.log('  Contains job_seen_beacon:', html.includes('job_seen_beacon'));
  console.log('  Contains jobsearch-SerpJobCard:', html.includes('jobsearch-SerpJobCard'));
  console.log('  Contains data-jk:', html.includes('data-jk'));
  console.log('  Contains jobTitle:', html.includes('jobTitle'));
  console.log('  Contains mosaic:', html.includes('mosaic-provider'));
  console.log('  Contains Indeed UK:', html.includes('uk.indeed.com'));
  
  // Save first 5000 chars for inspection
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  
  console.log('\nTitle tag content:', $('title').text().trim().substring(0, 100));
  
  // Try to find any job-like elements
  console.log('\nJob elements found:');
  const selectors = [
    '.job_seen_beacon', '.jobsearch-SerpJobCard', '.result', '.cardOutline', 
    '.job-card', '.resultWithShelf', '.mosaic-provider-jobcards', 
    '.jobTitle', '[data-jk]', 'a[href*="jk="]', '.companyName',
    '.job_card', '.job-listing', '.job-result', '.job-card-container'
  ];
  
  for (const sel of selectors) {
    const count = $(sel).length;
    if (count > 0) console.log(`  ${sel}: ${count} found`);
  }
  
  // Save a snippet of HTML for manual inspection
  const snippets = [
    html.substring(0, 2000),
    html.substring(html.length - 1000),
  ];
  
  // Look for the actual job cards region
  const mosaicMatch = html.match(/<div[^>]*mosaic-provider[^>]*>[\s\S]{0,2000}/);
  if (mosaicMatch) {
    console.log('\nMosaic region (first 1000 chars):');
    console.log(mosaicMatch[0].substring(0, 1000));
  }
  
  // Find job title patterns
  const jobTitleMatches = html.match(/class="[^"]*jobTitle[^"]*"[^>]*>([^<]+)</);
  if (jobTitleMatches) {
    console.log('\nFirst jobTitle match:', jobTitleMatches[1].trim());
  }
  
  // Check if there's a redirect/block page
  if (html.includes('navegador') || html.includes('browser')) {
    console.log('\n⚠️  Block page detected - contains "navegador" or "browser"');
  }
}

main().catch(console.error);
