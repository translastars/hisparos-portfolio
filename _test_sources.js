const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Try multiple job sources
  const sources = [
    'https://www.proz.com/translation-jobs?subcategory=11',  // Legal/Paten
    'https://www.proz.com/translation-jobs?subcategory=21',  // Finance
    'https://www.google.com/search?q=sworn+translator+jobs+Spain&ibp=htl;jobs',
    'https://www.google.com/search?q=legal+translator+jobs+remote&ibp=htl;jobs',
    'https://www.google.com/search?q=traductor+jurado+empleo&ibp=htl;jobs',
  ];
  
  for (const url of sources) {
    console.log('\n========== ' + url.substring(0,70) + ' ==========');
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
      await new Promise(r => setTimeout(r, 3000));
      
      const info = await page.evaluate(() => {
        const results = [];
        
        // ProZ format
        document.querySelectorAll('.job-listing, tr[class*="job"], .job-card, .job-row').forEach(card => {
          const title = card.querySelector('a[href*="job"]')?.textContent?.trim() || 
                       card.querySelector('h2, h3, .title')?.textContent?.trim() || '';
          if (title) {
            results.push({ source: 'ProZ', title: title.substring(0,60) });
          }
        });
        
        // Google Jobs format - look for job cards
        document.querySelectorAll('[role="listitem"], [jsname], .pE8v4d, .O3N9E, .nJlQnd').forEach(card => {
          const title = card.querySelector('.tNxQIb, .QkpHJc, h3')?.textContent?.trim() || '';
          if (title) results.push({ source: 'GoogleJobs', title: title.substring(0,60) });
        });
        
        // General: look for any job-like links
        document.querySelectorAll('a[href*="job"], a[href*="employment"], a[href*="career"]').forEach(a => {
          const t = a.textContent.trim();
          if (t.length > 5 && t.length < 200) results.push({ source: 'any', href: a.href?.substring(0,80), title: t.substring(0,60) });
        });
        
        return {
          title: document.title,
          captcha: document.body.innerText.toLowerCase().includes('captcha') || document.body.innerText.toLowerCase().includes('challenge'),
          results: results.slice(0, 10),
          pageText: document.body.innerText.substring(0, 500)
        };
      });
      
      console.log('Title:', info.title);
      console.log('CAPTCHA:', info.captcha);
      console.log('Results:', info.results.length);
      if (info.results.length > 0) {
        info.results.forEach(r => console.log('  - ' + r.source + ': ' + r.title));
      } else {
        console.log('Text sample:', info.pageText.substring(0, 300));
      }
    } catch(e) {
      console.log('ERROR: ' + e.message.substring(0, 80));
    }
  }
  
  await browser.close();
})();
