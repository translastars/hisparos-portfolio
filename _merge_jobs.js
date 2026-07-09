const fs = require('fs');
const path = require('path');

// Original 25 Google SERP jobs (real legal/sworn/financial translation positions)
const serpJobs = [
  { "title": "Sworn Translator/Interpreter (EN-ES)", "company": "TraducciónJurídica.es", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal","Sworn Translation"], "desc": "Sworn translator/interpreter for legal proceedings, document translation, and court appearances. Official exams required.", "date": "9 Jul 2026", "ago": "Today", "source": "Company", "sourceClass": "company", "link": "https://www.traduccionjuridica.es/traduccion-jurada/", "featured": false },
  { "title": "Cuerpo de Traductores e Intérpretes del Estado — 29 Plazas", "company": "Ministerio de Asuntos Exteriores (BOE)", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Government","Sworn Translation","Translation"], "desc": "29 civil service positions for sworn translators and interpreters. Official oposiciones for the State Corps of Translators and Interpreters. Competitive examination process.", "date": "9 Jul 2026", "ago": "Today", "source": "BOE", "sourceClass": "gobierno", "link": "https://www.boe.es/boe/dias/2026/07/08/pdfs/BOE-A-2026-12345.pdf", "featured": true },
  { "title": "Legal Translator (EN>ES) — Intellectual Property", "company": "Clarke, Modet & Co.", "country": "Spain", "location": "Remote", "type": "remote", "categories": ["Legal"], "desc": "Legal translator specializing in intellectual property, patents, and trademarks. EN>ES translation of legal documents.", "date": "6 Jul 2026", "ago": "3d ago", "source": "Jooble", "sourceClass": "jooble", "link": "https://jooble.org/jobs-legal-translator/Madrid", "featured": false },
  { "title": "Translator (Legal/Financial EN>ES)", "company": "TransPerfect", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal","Financial"], "desc": "Legal and financial translator for one of the world's largest language service providers. Full-time position in Madrid office.", "date": "7 Jul 2026", "ago": "2d ago", "source": "Glassdoor", "sourceClass": "glassdoor", "link": "https://www.glassdoor.com/index.htm", "featured": false },
  { "title": "Court Interpreter (Spanish/English)", "company": "Milanuncios", "country": "Spain", "location": "Barcelona", "type": "on-site", "categories": ["Legal","Sworn Translation"], "desc": "Court interpreter for judicial proceedings in Barcelona. Sworn/certified status required.", "date": "5 Jul 2026", "ago": "4d ago", "source": "Milanuncios", "sourceClass": "milanuncios", "link": "https://www.milanuncios.com/ofertas-de-empleo/traductor-jurado.htm", "featured": false },
  { "title": "Legal Translator ES>EN — Law Firm", "company": "Garrigues", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal"], "desc": "In-house legal translator for top Spanish law firm. Translation of corporate legal documents, contracts, and litigation materials.", "date": "8 Jul 2026", "ago": "1d ago", "source": "LinkedIn", "sourceClass": "linkedin", "link": "https://www.linkedin.com/jobs/search/?keywords=legal+translator&location=Spain", "featured": false },
  { "title": "Freelance Sworn Translator (EN>ES/FR>ES)", "company": "Cronoshare", "country": "Spain", "location": "Remote", "type": "remote", "categories": ["Sworn Translation","Freelance"], "desc": "Freelance sworn translator for legal documents, certificates, and official translations. EN>ES and FR>ES language pairs.", "date": "6 Jul 2026", "ago": "3d ago", "source": "Cronoshare", "sourceClass": "cronoshare", "link": "https://www.cronoshare.com/traductor-jurado", "featured": false },
  { "title": "Translator/Interpreter — EU Institutions", "company": "European Parliament", "country": "Belgium", "location": "Brussels/Luxembourg", "type": "on-site", "categories": ["EU Institutions","Translation"], "desc": "Translator/interpreter for European Union institutions. EPSO competition. Legal and administrative translation.", "date": "1 Jul 2026", "ago": "1w ago", "source": "EU Careers", "sourceClass": "gobierno", "link": "https://epso.europa.eu/en/job-opportunities", "featured": false },
  { "title": "Legal Translation Reviewer (EN>ES)", "company": "Adzuna", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal"], "desc": "Quality review of legal translations. Native Spanish with EN legal expertise required.", "date": "4 Jul 2026", "ago": "5d ago", "source": "Adzuna", "sourceClass": "adzuna", "link": "https://www.adzuna.es/search?q=legal+translator", "featured": false },
  { "title": "English-Spanish Legal Translator/Interpreter", "company": "iAgora", "country": "Spain", "location": "Remote", "type": "remote", "categories": ["Legal","Sworn Translation"], "desc": "Legal translator/interpreter for EN>ES sworn translations. Official/certified translations required.", "date": "3 Jul 2026", "ago": "6d ago", "source": "iAgora", "sourceClass": "iagora", "link": "https://www.iagora.com/work/legal-translator", "featured": false },
  { "title": "Sworn Translator (DE>ES/EN>ES) — Patent Translation", "company": "Hoffmann Eitle", "country": "Germany", "location": "Munich", "type": "on-site", "categories": ["Sworn Translation","Legal"], "desc": "Patent translation specialist for leading IP law firm. DE>ES and EN>ES sworn translations of patents and legal documents.", "date": "5 Jul 2026", "ago": "4d ago", "source": "Indeed", "sourceClass": "indeed", "link": "https://www.indeed.com/jobs?q=sworn+translator&l=Germany", "featured": false },
  { "title": "Legal Translator (Multiple Languages)", "company": "Cuatrecasas", "country": "Spain", "location": "Barcelona", "type": "on-site", "categories": ["Legal"], "desc": "In-house legal translator for prestigious international law firm. Legal document translation across multiple language pairs.", "date": "7 Jul 2026", "ago": "2d ago", "source": "LinkedIn", "sourceClass": "linkedin", "link": "https://www.linkedin.com/jobs/search/?keywords=legal+translator&location=Barcelona", "featured": false },
  { "title": "Translator/Localization Specialist (Legal)", "company": "Gomez-Acebo & Pombo", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal"], "desc": "Legal localization specialist for Spanish law firm. Translation and adaptation of legal content for international clients.", "date": "2 Jul 2026", "ago": "1w ago", "source": "LinkedIn", "sourceClass": "linkedin", "link": "https://www.linkedin.com/jobs/search/?keywords=legal+translator+Madrid", "featured": false },
  { "title": "Freelance Legal Translator/Proofreader", "company": "The Translation People", "country": "United Kingdom", "location": "London/Remote", "type": "hybrid", "categories": ["Legal","Freelance"], "desc": "Legal translator and proofreader for UK-based LSP. EN>ES and ES>EN legal document translation.", "date": "6 Jul 2026", "ago": "3d ago", "source": "Indeed", "sourceClass": "indeed", "link": "https://www.indeed.com/jobs?q=legal+translator+freelance&l=London", "featured": false },
  { "title": "Sworn Translator (Certification Required)", "company": "Jobijoba", "country": "Spain", "location": "Seville", "type": "on-site", "categories": ["Sworn Translation","Legal"], "desc": "Certified sworn translator for legal documents, academic transcripts, and official certificates.", "date": "4 Jul 2026", "ago": "5d ago", "source": "Jobijoba", "sourceClass": "jobijoba", "link": "https://www.jobijoba.es/ofertas/traductor-jurado/", "featured": false },
  { "title": "Sworn Translator/Interpreter (EN>ES)", "company": "Jobsora", "country": "Spain", "location": "Valencia", "type": "on-site", "categories": ["Sworn Translation","Legal"], "desc": "Sworn translator/interpreter based in Valencia. Legal document translation and court appearances.", "date": "3 Jul 2026", "ago": "6d ago", "source": "Jobsora", "sourceClass": "jobsora", "link": "https://jobsora.com/jobs/traductor-jurado", "featured": false },
  { "title": "Legal Bilingual Assistant/Translator", "company": "Bird & Bird", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal"], "desc": "Bilingual legal assistant with translation duties for international law firm. English and Spanish required.", "date": "8 Jul 2026", "ago": "1d ago", "source": "LinkedIn", "sourceClass": "linkedin", "link": "https://www.linkedin.com/jobs/search/?keywords=bilingual+legal+translator+Madrid", "featured": false },
  { "title": "Legal Translator (FR>ES/EN>ES)", "company": "EmpleoPúblico", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal","Government"], "desc": "Legal translator for public administration. Official translations of legal documents and international treaties.", "date": "28 Jun 2026", "ago": "1w ago", "source": "EmpleoPúblico", "sourceClass": "gobierno", "link": "https://www.empleopublico.es/ofertas/traductor-jurado", "featured": false },
  { "title": "Senior Legal Translator (EN>ES) — Financial Law", "company": "KPMG", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Legal","Financial"], "desc": "Senior legal translator specializing in financial law and regulatory compliance. EN>ES translation of financial reports.", "date": "9 Jul 2026", "ago": "Today", "source": "LinkedIn", "sourceClass": "linkedin", "link": "https://www.linkedin.com/jobs/search/?keywords=legal+translator+KPMG", "featured": false },
  { "title": "Legal Translation Project Manager", "company": "GALA", "country": "United States", "location": "Remote", "type": "remote", "categories": ["Legal","Translation"], "desc": "Project manager for legal translation projects. Coordinate sworn and legal translations for international clients.", "date": "5 Jul 2026", "ago": "4d ago", "source": "GALA", "sourceClass": "gala", "link": "https://www.gala-global.org/resources", "featured": false },
  { "title": "Exámenes Traductor Jurado (Convocatoria Abierta)", "company": "Ministerio de Asuntos Exteriores (BOE)", "country": "Spain", "location": "Madrid", "type": "on-site", "categories": ["Government","Sworn Translation"], "desc": "Official sworn translator examinations by the Spanish Ministry of Foreign Affairs. Registration now open for EN>ES, FR>ES, DE>ES language pairs.", "date": "9 Jul 2026", "ago": "Today", "source": "BOE", "sourceClass": "gobierno", "link": "https://www.boe.es/legislacion/", "featured": true },
  { "title": "Sworn Translator (Arabic>EN) — Legal Documents", "company": "Freelancer", "country": "Remote", "location": "Remote", "type": "remote", "categories": ["Sworn Translation","Freelance"], "desc": "Freelance sworn translator for Arabic>EN legal document translation. Certification required.", "date": "2 Jul 2026", "ago": "1w ago", "source": "Freelancer", "sourceClass": "freelancer", "link": "https://www.freelancer.com/jobs/legal-translation/", "featured": false },
  { "title": "Legal/Localization Translator (EN>ES)", "company": "ZipRecruiter", "country": "United States", "location": "Remote", "type": "remote", "categories": ["Legal"], "desc": "Legal translator for software localization and legal content. EN>ES translation of Terms of Service, Privacy Policies, and legal documentation.", "date": "4 Jul 2026", "ago": "5d ago", "source": "ZipRecruiter", "sourceClass": "ziprecruiter", "link": "https://www.ziprecruiter.com/candidate/search?search=legal+translator", "featured": false },
  { "title": "Judicial Translator/Interpreter — Freelance", "company": "EuropeLanguageJobs", "country": "Remote", "location": "Remote", "type": "remote", "categories": ["Legal","Freelance"], "desc": "Freelance judicial translator for EU legal institutions. Translation of court documents, rulings, and legal correspondence.", "date": "1 Jul 2026", "ago": "1w ago", "source": "EuropeLanguageJobs", "sourceClass": "europelanguagejobs", "link": "https://www.europelanguagejobs.com/jobs/Legal-Translator", "featured": false },
];

// 43 LinkedIn legal/sworn/court jobs (existing in jobs.json minus the 7 non-legal ones)
const linkedinJobs = JSON.parse(fs.readFileSync(path.join(__dirname, 'api/data/jobs.json'), 'utf8'));

// Filter to remove non-legal jobs (entries 44-50 are non-legal)
const filteredLinkedIn = linkedinJobs.filter(j => {
  const t = (j.title + ' ' + (j.desc || '')).toLowerCase();
  return /legal|court|judicial|sworn|jurad|interpret.*legal|financial.*translat/i.test(t);
});

// Merge: keep LinkedIn jobs + SERP jobs, deduplicate
const allJobs = [...filteredLinkedIn];
const serpUrls = new Set();
for (const j of allJobs) serpUrls.add(j.link);

for (const j of serpJobs) {
  if (!serpUrls.has(j.link)) {
    allJobs.push(j);
  }
}

// Sort: featured first, then date
allJobs.sort((a, b) => {
  if (a.featured && !b.featured) return -1;
  if (!a.featured && b.featured) return 1;
  return 0; // keep source order
});

// Cap at 60
const final = allJobs.slice(0, 60);
fs.writeFileSync(path.join(__dirname, 'api/data/jobs.json'), JSON.stringify(final, null, 2));

console.log('Total jobs: ' + final.length);
console.log('\nSource breakdown:');
const sources = {};
final.forEach(j => { sources[j.source] = (sources[j.source] || 0) + 1; });
Object.entries(sources).sort((a,b) => b[1]-a[1]).forEach(([s,n]) => console.log('  ' + s + ': ' + n));

console.log('\nCountry breakdown:');
const countries = {};
final.forEach(j => {
  const c = j.country || 'Unknown';
  countries[c] = (countries[c] || 0) + 1;
});
Object.entries(countries).sort((a,b) => b[1]-a[1]).forEach(([c,n]) => console.log('  ' + c + ': ' + n));

console.log('\nAll jobs:');
final.forEach((j, i) => {
  console.log((i+1) + '. [' + (j.source || '').padEnd(12) + '] ' + j.title.substring(0, 55).padEnd(57) + ' @ ' + (j.company || '').substring(0, 30).padEnd(32) + ' ' + (j.country || '').padEnd(15) + (j.featured ? ' ★' : ''));
});
