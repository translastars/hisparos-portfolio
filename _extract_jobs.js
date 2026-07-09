const fs = require('fs');
const h = fs.readFileSync('C:\\Users\\barto\\.openclaw\\workspace\\hisparos_portfolio\\jobs.html', 'utf8');
const start = h.indexOf('const jobs');
const end = h.indexOf('];', start) + 2;
const jsBlock = h.substring(start, end);

// Create a temporary module file
const tmpFile = 'C:\\Users\\barto\\.openclaw\\workspace\\hisparos_portfolio\\_jobs_data.js';
// Replace const with module.exports
const moduleJs = 'module.exports = ' + jsBlock.replace('const jobs = ', '').slice(0, -1) + ';';
fs.writeFileSync(tmpFile, moduleJs, 'utf8');

// Dynamic import
const jobs = require('C:\\Users\\barto\\.openclaw\\workspace\\hisparos_portfolio\\_jobs_data.js');
console.log('Jobs count:', jobs.length);
console.log('First:', jobs[0].title);
console.log('Last:', jobs[jobs.length-1].title);
console.log('Categories:', [...new Set(jobs.map(j=>j.categories).flat())]);
console.log('Types:', [...new Set(jobs.map(j=>j.type))]);
console.log('Countries:', [...new Set(jobs.map(j=>j.country))]);

fs.writeFileSync('C:\\Users\\barto\\.openclaw\\workspace\\hisparos_portfolio\\api\\data\\jobs.json', JSON.stringify(jobs, null, 2), 'utf8');
console.log('Saved api/data/jobs.json');
