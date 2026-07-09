const fetch = require('node-fetch').default;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function testLinkedIn() {
  const url = 'https://www.linkedin.com/jobs/search/?keywords=legal%20translation&sortBy=DD';
  
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
      },
      timeout: 15000,
    });
    
    console.log('LinkedIn status:', res.status);
    const html = await res.text();
    console.log('HTML length:', html.length);
    
    // Check JSON-LD
    const ldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (ldMatch) {
      console.log('\nJSON-LD found! Length:', ldMatch[1].length);
      try {
        const data = JSON.parse(ldMatch[1]);
        console.log('Data keys:', Object.keys(data));
        if (data.itemListElement) {
          console.log('Items:', data.itemListElement.length);
          data.itemListElement.forEach((item, i) => {
            if (i < 5) {
              const j = item.item || item;
              console.log(`  ${i+1}. ${j.title} @ ${j.hiringOrganization?.name}`);
            }
          });
        }
      } catch(e) {
        console.log('JSON parse error:', e.message);
        console.log('First 200 chars:', ldMatch[1].substring(0, 200));
      }
    } else {
      console.log('\nNo JSON-LD found');
    }
    
    // Check for captcha/block
    console.log('\nIndicators:');
    console.log('  Contains captcha:', html.toLowerCase().includes('captcha'));
    console.log('  Contains challenge:', html.toLowerCase().includes('challenge'));
    console.log('  Contains job-search-card:', html.includes('job-search-card'));
    console.log('  Contains base-card:', html.includes('base-card'));
    console.log('  Title:', html.match(/<title>([^<]*)<\/title>/i)?.[1]?.substring(0, 80));
    
  } catch(e) {
    console.error('Error:', e.message);
  }
}

testLinkedIn();
