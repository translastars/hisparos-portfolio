const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'terms.db');

let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS languages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL
    );

    -- Main terms table: each term has a source language + 1+ targets via term_translations
    CREATE TABLE IF NOT EXISTS terms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_text TEXT NOT NULL,
      lang_code TEXT NOT NULL,
      domain_id INTEGER,
      context_usage TEXT,
      notes TEXT,
      confidence REAL DEFAULT 0.7,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_file TEXT,
      FOREIGN KEY (domain_id) REFERENCES domains(id)
    );

    -- One term can have multiple translations (multilingual)
    CREATE TABLE IF NOT EXISTS term_translations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      term_id INTEGER NOT NULL,
      translation_text TEXT NOT NULL,
      lang_code TEXT NOT NULL,
      FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE
    );

    -- Exclusion list: terms/patterns to ignore
    CREATE TABLE IF NOT EXISTS exclusion_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      match_type TEXT DEFAULT 'exact' CHECK(match_type IN ('exact', 'contains', 'regex')),
      category TEXT DEFAULT 'other' CHECK(category IN ('company', 'person', 'address', 'url', 'email', 'number', 'date', 'other')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Upload log
    CREATE TABLE IF NOT EXISTS upload_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      file_type TEXT NOT NULL,
      terms_imported INTEGER DEFAULT 0,
      translations_imported INTEGER DEFAULT 0,
      status TEXT DEFAULT 'completed',
      errors TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_terms_text ON terms(term_text);
    CREATE INDEX IF NOT EXISTS idx_terms_lang ON terms(lang_code);
    CREATE INDEX IF NOT EXISTS idx_terms_domain ON terms(domain_id);
    CREATE INDEX IF NOT EXISTS idx_translations_term ON term_translations(term_id);
    CREATE INDEX IF NOT EXISTS idx_translations_text ON term_translations(translation_text);
    CREATE INDEX IF NOT EXISTS idx_translations_lang ON term_translations(lang_code);
    CREATE INDEX IF NOT EXISTS idx_exclusion_pattern ON exclusion_list(pattern);
  `);

  // Seed languages
  const existingLangs = db.prepare('SELECT COUNT(*) as c FROM languages').get();
  if (existingLangs.c === 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO languages (code, name) VALUES (?, ?)');
    const langs = [
      ['EN', 'English'], ['ES', 'Spanish'], ['FR', 'French'],
      ['DE', 'German'], ['IT', 'Italian'], ['PT', 'Portuguese'],
      ['CA', 'Catalan'], ['GA', 'Galician'], ['EU', 'Basque'],
      ['NL', 'Dutch'], ['RU', 'Russian'], ['ZH', 'Chinese'],
      ['AR', 'Arabic'], ['JA', 'Japanese']
    ];
    const tx = db.transaction(() => {
      for (const [code, name] of langs) insert.run(code, name);
    });
    tx();
  }

  // Seed domains
  const existingDomains = db.prepare('SELECT COUNT(*) as c FROM domains').get();
  if (existingDomains.c === 0) {
    const insert = db.prepare('INSERT OR IGNORE INTO domains (name, slug) VALUES (?, ?)');
    const domains = [
      ['Legal', 'legal'], ['Financial', 'financial'],
      ['Immigration', 'immigration'], ['Corporate', 'corporate'],
      ['Academic', 'academic'], ['Patent', 'patent'],
      ['Medical', 'medical'], ['Technical', 'technical'],
      ['Administrative', 'administrative'], ['Notarial', 'notarial'],
      ['Judicial', 'judicial'], ['Commercial', 'commercial'],
      ['Property', 'property'], ['Labor', 'labor'],
      ['Tax', 'tax']
    ];
    const tx = db.transaction(() => {
      for (const [name, slug] of domains) insert.run(name, slug);
    });
    tx();
  }

  // Seed sample exclusions (common sensitive patterns)
  const existingExcl = db.prepare('SELECT COUNT(*) as c FROM exclusion_list').get();
  if (existingExcl.c === 0) {
    const insert = db.prepare('INSERT INTO exclusion_list (pattern, match_type, category, notes) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      insert.run('S.L.', 'contains', 'company', 'Limited company (Sp. Sociedad Limitada)');
      insert.run('S.A.', 'contains', 'company', 'Corporation (Sp. Sociedad Anónima)');
      insert.run('LLP', 'contains', 'company', 'Limited Liability Partnership');
      insert.run('Ltd', 'contains', 'company', 'Limited company');
      insert.run('Inc.', 'contains', 'company', 'Incorporated');
      insert.run('GmbH', 'contains', 'company', 'German limited liability company');
      insert.run('S.L.P.', 'contains', 'company', 'Professional limited company (Spain)');
      insert.run('[@]', 'regex', 'email', 'Email addresses (contains @)');
      insert.run('http', 'contains', 'url', 'URLs');
      insert.run('www.', 'contains', 'url', 'Web addresses');
      insert.run('Calle ', 'contains', 'address', 'Street address pattern (Sp.)');
      insert.run('Avenida ', 'contains', 'address', 'Street address (Sp. Avenida)');
      insert.run('Plaza ', 'contains', 'address', 'Street address (Sp. Plaza)');
      insert.run('C/ ', 'contains', 'address', 'Street address (Sp. C/)');
      insert.run('NIF ', 'contains', 'number', 'Spanish tax ID');
      insert.run('CIF ', 'contains', 'number', 'Spanish company tax ID');
      insert.run('DNI ', 'contains', 'number', 'Spanish ID number');
      insert.run('NIE ', 'contains', 'number', 'Foreigner ID (Spain)');
      insert.run('+34', 'contains', 'number', 'Spanish phone number');
    });
    tx();
  }
}

module.exports = { getDb };
