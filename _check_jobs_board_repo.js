const { execSync } = require('child_process');
try {
  // List API directory
  const list = execSync('gh api repos/translastars/jobs-board/contents/api', { encoding: 'utf8', maxBuffer: 10000000 });
  const files = JSON.parse(list);
  console.log("=== API directory contents ===");
  files.forEach(f => console.log(`  ${f.name} (${f.type})`));
  
  // Read main files
  const targets = ['api/index.js', 'api/package.json', 'package.json', 'vercel.json', 'index.html'];
  targets.forEach(async (t) => {
    try {
      const content = execSync(`gh api repos/translastars/jobs-board/contents/${t} --jq .content`, { encoding: 'utf8' });
      const decoded = Buffer.from(content.trim(), 'base64').toString('utf8');
      console.log(`\n=== ${t} ===`);
      const lines = decoded.split('\n');
      console.log(lines.slice(0, 60).join('\n'));
      if (lines.length > 60) console.log(`... (${lines.length - 60} more lines)`);
    } catch(e) {
      console.log(`\n=== ${t} === ERROR: ${e.message}`);
    }
  });
} catch(e) {
  console.error("Error:", e.message);
}
