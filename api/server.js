const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./database');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.tmx', '.json', '.csv', '.xlsx', '.xls'].includes(ext) || file.mimetype === 'application/json') {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported. Allowed: .tmx, .json, .csv`));
    }
  }
});

// ====== HELPERS ======

function cleanXml(text) {
  return text
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, c) => String.fromCharCode(c))
    .replace(/\s+/g, ' ').trim();
}

function getLangCode(langStr) {
  if (!langStr) return 'EN';
  // Extract ISO code from xml:lang="en-US" or lang="en"
  const m = langStr.match(/^([a-z]{2,3})/i);
  return m ? m[1].toUpperCase() : 'EN';
}

function isShortTerm(text) {
  // A short term is typically 1-5 words, no punctuation, not a sentence
  const wordCount = text.split(/\s+/).length;
  if (wordCount <= 5) {
    // Check it's not a full sentence (no period, comma at end for short phrases is OK)
    const hasSentenceEnd = /[.!?]$/.test(text) && wordCount > 2;
    const hasVerbPhrase = /\b(is|are|was|were|shall|will|may|must|has|have|been|been|being)\b/i.test(text);
    return !hasSentenceEnd && !hasVerbPhrase && wordCount <= 4;
  }
  return false;
}

function isExcluded(text, db) {
  const patterns = db.prepare('SELECT pattern, match_type FROM exclusion_list').all();
  for (const p of patterns) {
    if (p.match_type === 'exact' && text.toLowerCase() === p.pattern.toLowerCase()) return true;
    if (p.match_type === 'contains' && text.toLowerCase().includes(p.pattern.toLowerCase())) return true;
    if (p.match_type === 'regex') {
      try {
        if (new RegExp(p.pattern, 'i').test(text)) return true;
      } catch(e) {}
    }
  }
  return false;
}

// ====== TMX PARSER (multilingual, context-aware) ======

function parseTmx(xml) {
  const results = []; // { term_text, lang, context, is_context }
  const tuRegex = /<tu[^>]*>([\s\S]*?)<\/tu>/gi;
  let tuMatch;

  while ((tuMatch = tuRegex.exec(xml)) !== null) {
    const tuContent = tuMatch[1];
    const tuvs = [];
    const tuvRegex = /<tuv[^>]*(?:xml:)?lang="([^"]+)"[^>]*>[\s\S]*?<seg>([\s\S]*?)<\/seg>[\s\S]*?<\/tuv>/gi;
    let tuvMatch;

    while ((tuvMatch = tuvRegex.exec(tuContent)) !== null) {
      tuvs.push({
        lang: getLangCode(tuvMatch[1]),
        text: cleanXml(tuvMatch[2])
      });
    }

    if (tuvs.length < 2) continue;

    // Detect: if any TU has a long segment (context) and others are short (terms)
    const longSegments = tuvs.filter(t => !isShortTerm(t.text));
    const shortSegments = tuvs.filter(t => isShortTerm(t.text));

    if (shortSegments.length > 0 && longSegments.length > 0) {
      // Long segments are context for the short ones
      const contextByLang = {};
      longSegments.forEach(t => { contextByLang[t.lang] = t.text; });

      for (const s of shortSegments) {
        const context = contextByLang[s.lang] || longSegments[0]?.text || null;
        if (!isExcluded(s.text, getDb())) {
          results.push({
            term_text: s.text,
            term_lang: s.lang,
            context_usage: context,
            translations: longSegments
              .filter(t => t.lang !== s.lang)
              .map(t => ({ text: t.text, lang: t.lang }))
          });
        }
      }
    } else if (shortSegments.length >= 2) {
      // All short - use first as term, rest as translations
      const main = shortSegments[0];
      const others = shortSegments.slice(1);
      if (!isExcluded(main.text, getDb())) {
        results.push({
          term_text: main.text,
          term_lang: main.lang,
          context_usage: null,
          translations: others.map(t => ({ text: t.text, lang: t.lang }))
        });
      }
      // Also add pairings from any long segments as context-bearing entries
      for (const ls of longSegments) {
        results.push({
          term_text: ls.text,
          term_lang: ls.lang,
          context_usage: ls.text,
          translations: shortSegments
            .filter(t => t.lang !== ls.lang)
            .map(t => ({ text: t.text, lang: t.lang }))
        });
      }
    } else if (longSegments.length >= 2) {
      // All long segments - they're context-bearing entries with each other as translations
      const main = longSegments[0];
      const others = longSegments.slice(1);
      results.push({
        term_text: main.text,
        term_lang: main.lang,
        context_usage: main.text,
        translations: others.map(t => ({ text: t.text, lang: t.lang }))
      });
    }
  }

  return results;
}

// ====== API ROUTES ======

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', multilingual: true });
});

app.get('/api/languages', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM languages ORDER BY name').all());
});

app.get('/api/domains', (req, res) => {
  const db = getDb();
  const domains = db.prepare(`
    SELECT d.*, COUNT(DISTINCT t.id) as term_count 
    FROM domains d LEFT JOIN terms t ON t.domain_id = d.id 
    GROUP BY d.id ORDER BY d.name
  `).all();
  res.json(domains);
});

// SEARCH TERMS (multilingual: returns term + all its translations)
app.get('/api/terms', (req, res) => {
  const db = getDb();
  const { q, lang, domain, page = 1, limit = 50 } = req.query;
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));
  const offset = (pageNum - 1) * limitNum;

  let where = ['1=1'];
  let params = [];

  if (q && q.trim()) {
    where.push(`(
      t.term_text LIKE ? OR tt.translation_text LIKE ? OR t.context_usage LIKE ?
    )`);
    const like = `%${q.trim()}%`;
    params.push(like, like, like);
  }

  if (lang) {
    where.push('(t.lang_code = ? OR tt.lang_code = ?)');
    params.push(lang.toUpperCase(), lang.toUpperCase());
  }

  if (domain) {
    where.push('d.slug = ?');
    params.push(domain.toLowerCase());
  }

  const whereClause = where.join(' AND ');

  // Get unique term IDs
  const countResult = db.prepare(`
    SELECT COUNT(DISTINCT t.id) as total FROM terms t
    LEFT JOIN term_translations tt ON t.id = tt.term_id
    LEFT JOIN domains d ON t.domain_id = d.id
    WHERE ${whereClause}
  `).get(...params);

  const total = countResult.total;

  // Get term IDs for this page
  const termIds = db.prepare(`
    SELECT DISTINCT t.id FROM terms t
    LEFT JOIN term_translations tt ON t.id = tt.term_id
    LEFT JOIN domains d ON t.domain_id = d.id
    WHERE ${whereClause}
    ORDER BY t.confidence DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limitNum, offset).map(r => r.id);

  if (termIds.length === 0) {
    return res.json({
      terms: [],
      pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 0, hasNext: false, hasPrev: false }
    });
  }

  // Fetch full terms with all translations
  const placeholders = termIds.map(() => '?').join(',');
  const terms = db.prepare(`
    SELECT t.id, t.term_text, t.lang_code, t.domain_id, d.name as domain_name, d.slug as domain_slug,
           t.context_usage, t.notes, t.confidence, t.created_at, t.source_file
    FROM terms t LEFT JOIN domains d ON t.domain_id = d.id
    WHERE t.id IN (${placeholders})
    ORDER BY t.confidence DESC, t.created_at DESC
  `).all(...termIds);

  // Fetch all translations for these terms
  const translations = db.prepare(`
    SELECT tt.term_id, tt.translation_text, tt.lang_code 
    FROM term_translations tt WHERE tt.term_id IN (${placeholders})
  `).all(...termIds);

  // Group translations by term_id
  const transByTerm = {};
  for (const tr of translations) {
    if (!transByTerm[tr.term_id]) transByTerm[tr.term_id] = [];
    transByTerm[tr.term_id].push({ text: tr.translation_text, lang: tr.lang_code });
  }

  const result = terms.map(t => ({
    id: t.id,
    term: t.term_text,
    lang: t.lang_code,
    translations: transByTerm[t.id] || [],
    domain: t.domain_name || 'General',
    domain_slug: t.domain_slug,
    context: t.context_usage,
    notes: t.notes,
    confidence: t.confidence,
    created_at: t.created_at,
    source_file: t.source_file,
    lang_count: (transByTerm[t.id] || []).length
  }));

  const totalPages = Math.ceil(total / limitNum);

  res.json({
    terms: result,
    pagination: {
      page: pageNum, limit: limitNum, total, totalPages,
      hasNext: pageNum < totalPages, hasPrev: pageNum > 1
    }
  });
});

// GET single term with translations
app.get('/api/terms/:id', (req, res) => {
  const db = getDb();
  const term = db.prepare(`
    SELECT t.*, d.name as domain_name, d.slug as domain_slug 
    FROM terms t LEFT JOIN domains d ON t.domain_id = d.id WHERE t.id = ?
  `).get(req.params.id);
  if (!term) return res.status(404).json({ error: 'Term not found' });

  const translations = db.prepare('SELECT translation_text, lang_code FROM term_translations WHERE term_id = ?').all(term.id);
  
  res.json({
    id: term.id, term: term.term_text, lang: term.lang_code,
    translations, domain: term.domain_name, domain_slug: term.domain_slug,
    context: term.context_usage, notes: term.notes, confidence: term.confidence,
    created_at: term.created_at, source_file: term.source_file
  });
});

// ADD a term with translations
app.post('/api/terms', (req, res) => {
  const db = getDb();
  const { term, lang, translations, domain, context, notes, confidence } = req.body;
  if (!term || !lang || !translations || !translations.length) {
    return res.status(400).json({ error: 'term, lang, and translations[] are required' });
  }

  let domainId = null;
  if (domain) {
    const d = db.prepare('SELECT id FROM domains WHERE slug = ? OR LOWER(name) = LOWER(?)').get(domain, domain);
    if (d) domainId = d.id;
  }

  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO terms (term_text, lang_code, domain_id, context_usage, notes, confidence)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      term.trim(), lang.toUpperCase(), domainId,
      context || null, notes || null, confidence || 0.7
    );
    const termId = result.lastInsertRowid;

    const insT = db.prepare('INSERT INTO term_translations (term_id, translation_text, lang_code) VALUES (?, ?, ?)');
    for (const t of translations) {
      if (t.text && t.lang) {
        insT.run(termId, t.text.trim(), t.lang.toUpperCase());
      }
    }
    return termId;
  });

  const termId = tx();
  res.status(201).json({ id: termId, message: 'Term + translations created' });
});

// UPLOAD TMX
app.post('/api/upload/tmx', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const db = getDb();
  const filePath = req.file.path;

  try {
    const xmlContent = fs.readFileSync(filePath, 'utf-8');
    const extracted = parseTmx(xmlContent);

    if (extracted.length === 0) {
      fs.unlinkSync(filePath);
      db.prepare(`INSERT INTO upload_log (filename, file_type, terms_imported, status, errors) VALUES (?, ?, ?, ?, ?)`)
        .run(req.file.originalname, 'tmx', 0, 'failed', 'No usable bilingual units found');
      return res.status(400).json({ error: 'No usable bilingual units found in TMX' });
    }

    let termCount = 0;
    let transCount = 0;
    let errors = [];

    const tx = db.transaction(() => {
      const insertTerm = db.prepare(`
        INSERT INTO terms (term_text, lang_code, context_usage, confidence, source_file)
        VALUES (?, ?, ?, ?, ?)
      `);
      const insertTrans = db.prepare(
        'INSERT INTO term_translations (term_id, translation_text, lang_code) VALUES (?, ?, ?)'
      );

      for (const item of extracted) {
        try {
          const result = insertTerm.run(item.term_text, item.term_lang, item.context_usage, 0.6, req.file.originalname);
          const termId = result.lastInsertRowid;
          termCount++;

          for (const t of item.translations) {
            insertTrans.run(termId, t.text, t.lang);
            transCount++;
          }
        } catch (e) {
          errors.push(e.message);
        }
      }
    });
    tx();

    db.prepare(`INSERT INTO upload_log (filename, file_type, terms_imported, translations_imported, status, errors) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(req.file.originalname, 'tmx', termCount, transCount, 'completed', errors.length > 0 ? errors.join('; ') : null);
    fs.unlinkSync(filePath);

    res.json({
      imported: termCount, translations: transCount,
      errors: errors.length > 0 ? errors : undefined,
      file: req.file.originalname,
      message: `Imported ${termCount} terms with ${transCount} translations`
    });

  } catch (e) {
    db.prepare(`INSERT INTO upload_log (filename, file_type, status, errors) VALUES (?, ?, ?, ?)`)
      .run(req.file.originalname, 'tmx', 'failed', e.message);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.status(500).json({ error: `TMX parsing failed: ${e.message}` });
  }
});

// SEED from bundled TMX
app.post('/api/seed', (req, res) => {
  const db = getDb();

  // Check if already seeded
  const count = db.prepare('SELECT COUNT(*) as c FROM terms').get();
  if (count.c > 0) {
    return res.json({ message: 'Database already has data. Reset or upload more TMX files.' });
  }

  const tmxPath = path.join(__dirname, '..', 'data', 'legal_demo.tmx');
  if (!fs.existsSync(tmxPath)) {
    return res.status(404).json({ error: 'Seed TMX file not found' });
  }

  try {
    const xmlContent = fs.readFileSync(tmxPath, 'utf-8');
    const extracted = parseTmx(xmlContent);

    const insertTerm = db.prepare(`
      INSERT INTO terms (term_text, lang_code, domain_id, context_usage, confidence, source_file)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertTrans = db.prepare(
      'INSERT INTO term_translations (term_id, translation_text, lang_code) VALUES (?, ?, ?)'
    );
    const getDomainId = db.prepare('SELECT id FROM domains WHERE slug = ?');

    let termCount = 0;
    let transCount = 0;
    const legalDomainId = 1; // Legal

    const tx = db.transaction(() => {
      for (const item of extracted) {
        try {
          const result = insertTerm.run(
            item.term_text, item.term_lang,
            legalDomainId, item.context_usage,
            0.85, 'legal_demo.tmx'
          );
          const termId = result.lastInsertRowid;
          termCount++;

          for (const t of item.translations) {
            insertTrans.run(termId, t.text, t.lang);
            transCount++;
          }
        } catch (e) {
          console.error('Seed error:', e.message);
        }
      }
    });
    tx();

    db.prepare(`INSERT INTO upload_log (filename, file_type, terms_imported, translations_imported, status) VALUES (?, ?, ?, ?, ?)`)
      .run('legal_demo.tmx', 'tmx', termCount, transCount, 'seeded');

    res.json({
      imported: termCount, translations: transCount,
      message: `Seeded ${termCount} legal terms with ${transCount} translations from demo TMX`
    });
  } catch (e) {
    res.status(500).json({ error: `Seed failed: ${e.message}` });
  }
});

// RESET database
app.post('/api/reset', (req, res) => {
  const db = getDb();
  db.exec(`
    DELETE FROM term_translations;
    DELETE FROM terms;
    DELETE FROM upload_log;
  `);
  res.json({ message: 'Database cleared. Use /api/seed to re-seed.' });
});

// EXCLUSION LIST
app.get('/api/exclusions', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM exclusion_list ORDER BY category, pattern').all());
});

app.post('/api/exclusions', (req, res) => {
  const db = getDb();
  const { pattern, match_type, category, notes } = req.body;
  if (!pattern) return res.status(400).json({ error: 'pattern is required' });
  try {
    const result = db.prepare(
      'INSERT INTO exclusion_list (pattern, match_type, category, notes) VALUES (?, ?, ?, ?)'
    ).run(pattern, match_type || 'exact', category || 'other', notes || null);
    res.status(201).json({ id: result.lastInsertRowid, message: 'Exclusion added' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/exclusions/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM exclusion_list WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Exclusion not found' });
  res.json({ message: 'Exclusion removed' });
});

// DELETE term
app.delete('/api/terms/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM terms WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Term not found' });
  res.json({ message: 'Term and its translations deleted' });
});

// UPDATE term
app.put('/api/terms/:id', (req, res) => {
  const db = getDb();
  const { term, lang, domain, context, notes, confidence } = req.body;
  let domainId = null;
  if (domain) {
    const d = db.prepare('SELECT id FROM domains WHERE slug = ? OR LOWER(name) = LOWER(?)').get(domain, domain);
    if (d) domainId = d.id;
  }

  const result = db.prepare(`
    UPDATE terms SET
      term_text = COALESCE(?, term_text),
      lang_code = COALESCE(?, lang_code),
      domain_id = COALESCE(?, domain_id),
      context_usage = COALESCE(?, context_usage),
      notes = COALESCE(?, notes),
      confidence = COALESCE(?, confidence),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    term || null, lang ? lang.toUpperCase() : null,
    domainId, context !== undefined ? context : null,
    notes !== undefined ? notes : null,
    confidence !== undefined ? confidence : null,
    req.params.id
  );

  if (result.changes === 0) return res.status(404).json({ error: 'Term not found' });
  res.json({ message: 'Term updated' });
});

// UPLOAD LOG
app.get('/api/uploads', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM upload_log ORDER BY created_at DESC LIMIT 50').all());
});

// STATS
app.get('/api/stats', (req, res) => {
  const db = getDb();
  const totalTerms = db.prepare('SELECT COUNT(*) as c FROM terms').get().c;
  const totalTranslations = db.prepare('SELECT COUNT(*) as c FROM term_translations').get().c;
  const totalDomains = db.prepare('SELECT COUNT(*) as c FROM domains').get().c;
  const totalUploads = db.prepare('SELECT COUNT(*) as c FROM upload_log').get().c;
  const totalExclusions = db.prepare('SELECT COUNT(*) as c FROM exclusion_list').get().c;
  const recentTerms = db.prepare("SELECT COUNT(*) as c FROM terms WHERE created_at > datetime('now', '-7 days')").get().c;
  const langStats = db.prepare(`
    SELECT lang_code, COUNT(*) as count FROM terms GROUP BY lang_code ORDER BY count DESC
  `).all();
  const targetLangs = db.prepare(`
    SELECT tt.lang_code, COUNT(*) as count FROM term_translations tt GROUP BY tt.lang_code ORDER BY count DESC
  `).all();
  const domainStats = db.prepare(`
    SELECT d.name, COUNT(DISTINCT t.id) as count FROM domains d
    LEFT JOIN terms t ON t.domain_id = d.id
    GROUP BY d.id ORDER BY count DESC
  `).all();
  const topTerms = db.prepare(`
    SELECT t.term_text, t.lang_code, COUNT(tt.id) as trans_count
    FROM terms t JOIN term_translations tt ON t.id = tt.term_id
    GROUP BY t.id ORDER BY trans_count DESC LIMIT 10
  `).all();

  res.json({
    totalTerms, totalTranslations, totalDomains, totalUploads, totalExclusions, recentTerms,
    languages: { source: langStats, target: targetLangs },
    domainStats, topTerms
  });
});

// EXPORT
app.get('/api/export', (req, res) => {
  const db = getDb();
  const terms = db.prepare(`
    SELECT t.id, t.term_text, t.lang_code, d.name as domain,
           t.context_usage, t.notes, t.confidence, t.created_at, t.source_file
    FROM terms t LEFT JOIN domains d ON t.domain_id = d.id
    ORDER BY t.term_text
  `).all();

  // Add translations for each
  const exportData = terms.map(t => {
    const trans = db.prepare('SELECT translation_text, lang_code FROM term_translations WHERE term_id = ?').all(t.id);
    return { ...t, translations: trans };
  });

  res.json(exportData);
});

// ====== START ======
app.listen(PORT, '0.0.0.0', () => {
  console.log(`📚 Terminology System v2 — Multilingual`);
  console.log(`   Server:    http://localhost:${PORT}`);
  console.log(`   Search:    http://localhost:${PORT}/`);
  console.log(`   Admin:     http://localhost:${PORT}/admin.html`);
  console.log(`   LAN:       http://192.168.68.53:${PORT}`);
});
