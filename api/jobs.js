const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800');
  
  try {
    // Load from static JSON file
    const jobsPath = path.join(__dirname, 'data', 'jobs.json');
    const raw = fs.readFileSync(jobsPath, 'utf8');
    const jobs = JSON.parse(raw);
    
    // Support filtering
    const { category, type, country, source, search } = req.query || {};
    
    let filtered = [...jobs];
    if (category) {
      filtered = filtered.filter(j => j.categories.some(c => c.toLowerCase() === category.toLowerCase()));
    }
    if (type) {
      filtered = filtered.filter(j => j.type === type);
    }
    if (country) {
      filtered = filtered.filter(j => j.country.toLowerCase() === country.toLowerCase());
    }
    if (source) {
      filtered = filtered.filter(j => j.source.toLowerCase() === source.toLowerCase());
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(j => 
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.desc.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
      );
    }
    
    res.json({
      jobs: filtered,
      count: filtered.length,
      total: jobs.length,
      facets: {
        categories: [...new Set(jobs.flatMap(j => j.categories))].sort(),
        types: [...new Set(jobs.map(j => j.type))].sort(),
        countries: [...new Set(jobs.map(j => j.country))].sort(),
        sources: [...new Set(jobs.map(j => j.source))].sort()
      }
    });
  } catch (err) {
    console.error('Jobs API error:', err);
    res.status(500).json({ error: err.message });
  }
};
