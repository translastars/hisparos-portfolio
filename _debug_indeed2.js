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
  
  console.log('Go to Indeed...');
  await page.goto('https://www.indeed.com/jobs?q=legal+translator&l=remote&sort=date', { 
    waitUntil: 'networkidle2', 
    timeout: 30000 
  });
  
  // Wait much longer for dynamic content
  await new Promise(r => setTimeout(r, 8000));
  
  // Check page info
  const info = await page.evaluate(() => ({
    title: document.title,
    captcha: document.body.innerText.substring(0, 200),
    jobCards: document.querySelectorAll('[data-jk]').length,
    mosaicZones: document.querySelectorAll('.mosaic-zone').length,
    // Check the main job search content area
    mainZone: document.querySelector('.mosaic-zone')?.innerHTML?.substring(0, 300) || 'none',
    listItems: document.querySelectorAll('[role="listitem"]').length,
    links: document.querySelectorAll('a[href*="jk="]').length,
    jobLinks: document.querySelectorAll('a[href*="/viewjob"]').length,
    headings2: document.querySelectorAll('h2').length,
    headings3: document.querySelectorAll('h3').length,
  }));
  
  console.log('Info:', JSON.stringify(info, null, 2));
  
  if (info.jobLinks > 0 || info.links > 0) {
    // Extract all job data
    const jobs = await page.evaluate(() => {
      const results = [];
      
      // Get all links to viewjob pages
      document.querySelectorAll('a[href*="jk="], a[href*="/viewjob"]').forEach(link => {
        const href = link.getAttribute('href') || '';
        const jk = href.match(/jk=([a-f0-9]+)/i)?.[1] || '';
        if (!jk || results.some(r => r.jk === jk)) return;
        
        // Find the parent card container
        const card = link.closest('[data-jk], .job_seen_beacon, li, article') || link;
        
        const title = link.textContent.trim();
        const company = card.querySelector('.companyName, [data-testid="companyName"]')?.textContent?.trim() || '';
        const location = card.querySelector('.companyLocation, [data-testid="text-location"]')?.textContent?.trim() || '';
        const date = card.querySelector('[data-testid="job-date"]')?.textContent?.trim() || '';
        const desc = card.querySelector('.job-snippet, [data-testid="job-snippet"]')?.textContent?.trim() || '';
        const salary = card.querySelector('.salary-snippet, [data-testid="attribute_snippet_testid"]')?.textContent?.trim() || '';
        
        results.push({
          jk, title: title.substring(0, 120), company: company.substring(0, 60),
          location, date, desc: (salary ? salary + ' - ' : '') + desc,
          link: 'https://www.indeed.com' + href
        });
      });
      
      return results;
    });
    console.log('Jobs found:', jobs.length);
    if (jobs.length > 0) {
      console.log('First 3:', JSON.stringify(jobs.slice(0, 3), null, 2));
      // Save to file
      require('fs').writeFileSync('_scraped_jobs.json', JSON.stringify(jobs, null, 2));
      console.log('Saved to _scraped_jobs.json');
    }
  } else {
    // Get the full HTML
    const html = await page.content();
    console.log('Page HTML length:', html.length);
    // Find mosaic provider for job cards
    const zoneMatch = html.match(/mosaic-provider-jobcards[\s\S]{0,500}/);
    console.log('Jobcards zone:', zoneMatch ? zoneMatch[0].substring(0, 500) : 'Not found');
    
    // Show the main content area
    const main = await page.evaluate(() => {
      const mainEl = document.querySelector('#jobsearch, main, [role="main"]');
      return mainEl ? mainEl.innerHTML.substring(0, 2000) : 'No main';
    });
    console.log('MAIN CONTENT:', main.substring(0, 1500));
  }
  
  await browser.close();
})();
