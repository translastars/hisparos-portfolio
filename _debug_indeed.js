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
  await page.setViewport({ width: 1280, height: 900 });
  
  console.log('Navigating to Indeed...');
  await page.goto('https://www.indeed.com/jobs?q=legal+translator&l=remote&sort=date', { waitUntil: 'networkidle2', timeout: 25000 });
  console.log('Page loaded. Title:', await page.title());
  
  // Wait a bit for dynamic content
  await new Promise(r => setTimeout(r, 3000));
  
  // Check for CAPTCHA
  const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
  const hasCaptcha = pageText.includes('captcha') || pageText.includes('CAPTCHA') || pageText.includes('challenge');
  console.log('CAPTCHA:', hasCaptcha);
  
  // Extract job data - try multiple selector approaches
  const jobs = await page.evaluate(() => {
    const results = [];
    
    // Method 1: Look for job cards in the mosaic layout
    document.querySelectorAll('[data-jk]').forEach(card => {
      const jk = card.getAttribute('data-jk');
      const titleEl = card.querySelector('.jobTitle, [data-testid="job-title"], h2, a[data-jk]');
      const title = titleEl ? titleEl.textContent.trim() : '';
      if (!title) return;
      
      // Company
      const companyEl = card.querySelector('[data-testid="companyName"], .companyName');
      const company = companyEl ? companyEl.textContent.trim() : '';
      
      // Location
      const locEl = card.querySelector('[data-testid="text-location"], .companyLocation');
      const location = locEl ? locEl.textContent.trim() : '';
      
      // Date
      const dateEl = card.querySelector('[data-testid="job-date"]');
      const date = dateEl ? dateEl.textContent.trim() : '';
      
      // Description
      const descEl = card.querySelector('.job-snippet, [data-testid="job-snippet"]');
      const desc = descEl ? descEl.textContent.trim() : '';
      
      // Salary
      const salEl = card.querySelector('.salary-snippet, [data-testid="attribute_snippet_testid"]');
      const salary = salEl ? salEl.textContent.trim() : '';
      
      results.push({ jk, title, company, location, date, desc, salary });
    });
    
    // Method 2: Try other selectors
    if (results.length === 0) {
      document.querySelectorAll('a[id^="job_"], [id^="jobCard"], .job-card, article').forEach(card => {
        const link = card.querySelector('a[href*="jk="]');
        const title = link ? link.textContent.trim() : (card.querySelector('h2, h3, .title') || {}).textContent || '';
        if (!title) return;
        results.push({ 
          title,
          link: link ? link.href : '',
          company: (card.querySelector('.company') || {}).textContent || '',
          location: (card.querySelector('.location') || {}).textContent || ''
        });
      });
    }
    
    return results;
  });
  
  console.log('Jobs found:', jobs.length);
  if (jobs.length > 0) {
    console.log('First job:', JSON.stringify(jobs[0], null, 2));
    console.log('Total unique jk:', [...new Set(jobs.map(j => j.jk).filter(Boolean))].length);
  } else {
    // Get page structure for debugging
    const structure = await page.evaluate(() => {
      const mainEl = document.querySelector('#mosaic-provider-jobcards, [class*="jobsearch"], main, [role="main"]');
      return {
        mainHtml: mainEl ? mainEl.innerHTML.substring(0, 2000) : 'No main element found',
        classNames: [...new Set([...document.querySelectorAll('[class]')].map(e => {
          if (e.className && typeof e.className === 'string') return e.className.substring(0, 80);
          return '';
        }).filter(Boolean))].slice(0, 30)
      };
    });
    console.log('Page structure:', JSON.stringify(structure, null, 2));
  }
  
  await page.screenshot({ path: '_indeed_stealth.png' });
  console.log('Screenshot saved to _indeed_stealth.png');
  await browser.close();
})();
