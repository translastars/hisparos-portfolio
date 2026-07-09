#!/usr/bin/env python3
"""
Hisparos — AI Terminology Extraction System
=============================================
Extracts bilingual terminology from TMX (Translation Memory eXchange) files
using NLP and AI, providing a searchable JSON API for the Term DB frontend.

Usage:
  python terminology_extractor.py --tmx path/to/file.tmx --output terms.json
  python terminology_extractor.py --serve  (runs API server)
  python terminology_extractor.py --tmx-dir ./tmx_files/ --output terms.json

Requirements:
  pip install lxml spacy scikit-learn
  python -m spacy download en_core_web_sm
  python -m spacy download es_core_news_sm
"""

import argparse
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

# Try imports with graceful fallbacks
try:
    from lxml import etree
    HAS_LXML = True
except ImportError:
    HAS_LXML = False
    import xml.etree.ElementTree as ET

try:
    import spacy
    HAS_SPACY = True
except ImportError:
    HAS_SPACY = False

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False


class TMXTermExtractor:
    """
    Extracts terminology from TMX bilingual translation memories.
    """
    
    # Domain categories for classification
    DOMAINS = {
        'legal': ['contract', 'agreement', 'clause', 'party', 'whereas', 'hereby', 
                   'thereof', 'indemnify', 'arbitration', 'jurisdiction', 'statute',
                   'regulation', 'compliance', 'obligation', 'liability', 'plaintiff',
                   'defendant', 'court', 'judgment', 'appeal', 'witness', 'testimony',
                   'ley', 'contrato', 'acuerdo', 'cláusula', 'parte', 'demandante',
                   'demandado', 'tribunal', 'sentencia', 'recurso', 'testigo',
                   'jurisdicción', 'indemnización', 'arbitraje', 'cumplimiento'],
                   
        'financial': ['payment', 'invoice', 'tax', 'revenue', 'audit', 'asset',
                       'liability', 'equity', 'dividend', 'interest', 'loan',
                       'mortgage', 'credit', 'debt', 'balance', 'statement',
                       'pago', 'factura', 'impuesto', 'auditoría', 'activo',
                       'pasivo', 'patrimonio', 'dividendo', 'interés', 'préstamo',
                       'hipoteca', 'crédito', 'deuda', 'saldo'],
                       
        'immigration': ['visa', 'passport', 'residence', 'citizen', 'permit',
                         'application', 'sponsor', 'asylum', 'deportation',
                         'naturalization', 'embassy', 'consulate', 'visado',
                         'pasaporte', 'residencia', 'ciudadano', 'permiso',
                         'solicitud', 'patrocinador', 'asilo', 'deportación',
                         'naturalización', 'embajada', 'consulado'],
                         
        'corporate': ['company', 'corporation', 'shareholder', 'board', 'director',
                       'merger', 'acquisition', 'subsidiary', 'incorporation',
                       'memorandum', 'articles', 'bylaws', 'empresa', 'corporación',
                       'accionista', 'consejo', 'director', 'fusión', 'adquisición',
                       'filial', 'constitución', 'estatutos'],
                       
        'academic': ['degree', 'transcript', 'diploma', 'certificate', 'university',
                      'college', 'course', 'credit', 'grade', 'enrollment',
                      'título', 'expediente', 'diploma', 'certificado', 'universidad',
                      'facultad', 'curso', 'crédito', 'nota', 'matrícula']
    }
    
    def __init__(self, spacy_model_en='en_core_web_sm', spacy_model_es='es_core_news_sm'):
        self.nlp_en = None
        self.nlp_es = None
        if HAS_SPACY:
            try:
                self.nlp_en = spacy.load(spacy_model_en)
                self.nlp_es = spacy.load(spacy_model_es)
            except OSError:
                print("Warning: spaCy models not found. Run: python -m spacy download en_core_web_sm es_core_news_sm",
                      file=sys.stderr)
    
    def parse_tmx(self, tmx_path):
        """Parse a TMX file and extract translation units."""
        tuvs = []
        
        if HAS_LXML:
            tree = etree.parse(tmx_path)
            root = tree.getroot()
            ns = {'xml': 'http://www.w3.org/XML/1998/namespace'}
            
            for tu in root.iter('tu'):
                source = ''
                target = ''
                for tuv in tu.iter('tuv'):
                    lang = tuv.get('{http://www.w3.org/XML/1998/namespace}lang', '')
                    seg_text = ''
                    for seg in tuv.iter('seg'):
                        seg_text = ''.join(seg.itertext()).strip()
                    
                    if 'en' in lang.lower():
                        source = seg_text
                    elif 'es' in lang.lower():
                        target = seg_text
                    elif not source:
                        source = seg_text
                    elif not target:
                        target = seg_text
                
                if source and target:
                    tuvs.append({'source': source, 'target': target, 'source_lang': 'en', 'target_lang': 'es'})
        else:
            root = ET.parse(tmx_path).getroot()
            for tu in root.iter('tu'):
                source = ''
                target = ''
                for tuv in tu.iter('tuv'):
                    lang = tuv.get('{http://www.w3.org/XML/1998/namespace}lang', '')
                    seg_text = ''.join(tuv.itertext()).strip() if hasattr(tuv, 'itertext') else tuv.text or ''
                    
                    if 'en' in lang.lower():
                        source = seg_text
                    elif 'es' in lang.lower():
                        target = seg_text
                
                if source and target:
                    tuvs.append({'source': source, 'target': target})
        
        print(f"  Parsed {len(tuvs)} translation units from {tmx_path}", file=sys.stderr)
        return tuvs
    
    def extract_terms_from_text(self, text, lang='en'):
        """Extract meaningful terms from text using spaCy."""
        terms = []
        if lang == 'en' and self.nlp_en:
            doc = self.nlp_en(text)
        elif lang == 'es' and self.nlp_es:
            doc = self.nlp_es(text)
        else:
            return terms
        
        # Extract noun chunks (key phrases)
        for chunk in doc.noun_chunks:
            term = chunk.text.strip().lower()
            if len(term) > 2 and len(term) < 100:
                terms.append(term)
        
        # Extract proper nouns
        for ent in doc.ents:
            if ent.label_ in ['ORG', 'LAW', 'GPE', 'MONEY', 'DATE', 'NORP', 'PRODUCT']:
                term = ent.text.strip()
                if len(term) > 1 and len(term) < 100:
                    terms.append(term)
        
        return list(set(terms))
    
    def classify_domain(self, source, target):
        """Classify the domain of a translation pair."""
        text = (source + ' ' + target).lower()
        scores = {}
        
        for domain, keywords in self.DOMAINS.items():
            score = sum(1 for kw in keywords if kw in text)
            if score > 0:
                scores[domain] = score
        
        if not scores:
            return 'general'
        return max(scores, key=scores.get)
    
    def extract_terminology(self, tuvs, min_freq=2):
        """Extract terminology pairs from translation units."""
        source_terms = defaultdict(lambda: {'translations': Counter(), 'domains': Counter(), 'examples': [], 'freq': 0})
        
        # First pass: extract terms from all units
        all_source_texts = []
        for tuv in tuvs:
            all_source_texts.append(tuv.get('source', ''))
        
        # Count term frequency
        for tuv in tuvs:
            source = tuv.get('source', '')
            target = tuv.get('target', '')
            
            # Classify domain
            domain = self.classify_domain(source, target)
            
            # Extract key terms using NLP
            terms = self.extract_terms_from_text(source, 'en')
            
            for term in terms:
                entry = source_terms[term]
                entry['translations'][target] += 1
                entry['domains'][domain] += 1
                entry['freq'] += 1
                if len(entry['examples']) < 3:
                    entry['examples'].append({
                        'source': source[:150],
                        'target': target[:150]
                    })
        
        # Use TF-IDF for importance scoring if sklearn available
        if HAS_SKLEARN and len(all_source_texts) > 1:
            try:
                vectorizer = TfidfVectorizer(max_features=1000, stop_words='english')
                tfidf_matrix = vectorizer.fit_transform(all_source_texts)
                feature_names = vectorizer.get_feature_names_out()
                
                # Use TF-IDF scores to boost importance
                scores = tfidf_matrix.sum(axis=0).tolist()[0]
                for i, feature in enumerate(feature_names):
                    if feature in source_terms:
                        source_terms[feature]['importance'] = float(scores[i])
            except Exception as e:
                print(f"  TF-IDF note: {e}", file=sys.stderr)
        
        # Build final terminology list
        terminology = []
        for term, data in source_terms.items():
            if data['freq'] < min_freq:
                continue
            
            best_translation = data['translations'].most_common(1)[0][0] if data['translations'] else ''
            primary_domain = data['domains'].most_common(1)[0][0] if data['domains'] else 'general'
            
            entry = {
                'term': term,
                'translation': best_translation.strip(),
                'domain': primary_domain,
                'frequency': data['freq'],
                'alternatives': [t for t, _ in data['translations'].most_common(3)][1:],
                'examples': data['examples'],
                'importance': data.get('importance', data['freq'])
            }
            terminology.append(entry)
        
        # Sort by importance/frequency
        terminology.sort(key=lambda x: -(x.get('importance', 0) or x['frequency']))
        
        return terminology
    
    def process_tmx_file(self, tmx_path, min_freq=2):
        """Process a single TMX file and return terminology."""
        print(f"Processing: {tmx_path}", file=sys.stderr)
        tuvs = self.parse_tmx(tmx_path)
        if not tuvs:
            print(f"  No translation units found in {tmx_path}", file=sys.stderr)
            return []
        
        terms = self.extract_terminology(tuvs, min_freq)
        print(f"  Extracted {len(terms)} terms", file=sys.stderr)
        return terms
    
    def process_directory(self, tmx_dir, min_freq=2):
        """Process all TMX files in a directory."""
        all_terms = []
        tmx_files = list(Path(tmx_dir).glob('**/*.tmx'))
        
        if not tmx_files:
            print(f"No .tmx files found in {tmx_dir}", file=sys.stderr)
            return []
        
        print(f"Found {len(tmx_files)} TMX files in {tmx_dir}", file=sys.stderr)
        
        for tmx_file in tmx_files:
            terms = self.process_tmx_file(str(tmx_file), min_freq)
            all_terms.extend(terms)
        
        return all_terms


# ========== API Server ==========

def run_api_server(terms_file='terms.json', host='0.0.0.0', port=8080):
    """Run a simple HTTP API server for the terminology database."""
    try:
        from http.server import HTTPServer, BaseHTTPRequestHandler
        from urllib.parse import urlparse, parse_qs
        
        with open(terms_file, 'r', encoding='utf-8') as f:
            terms = json.load(f)
        
        print(f"Loaded {len(terms)} terms from {terms_file}", file=sys.stderr)
        
        class TermAPIHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urlparse(self.path)
                params = parse_qs(parsed.query)
                
                if parsed.path == '/api/terms':
                    # Search/filter terms
                    query = params.get('q', [''])[0].lower()
                    domain = params.get('domain', [''])[0]
                    lang_pair = params.get('pair', ['en-es'])[0]
                    page = int(params.get('page', ['1'])[0])
                    limit = int(params.get('limit', ['50'])[0])
                    
                    results = terms
                    
                    if query:
                        results = [t for t in results 
                                   if query in t['term'].lower() or query in t['translation'].lower()]
                    
                    if domain:
                        results = [t for t in results if t['domain'] == domain]
                    
                    # Pagination
                    total = len(results)
                    start = (page - 1) * limit
                    end = start + limit
                    page_results = results[start:end]
                    
                    response = {
                        'total': total,
                        'page': page,
                        'limit': limit,
                        'results': page_results,
                        'domains': list(set(t['domain'] for t in terms))
                    }
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(response).encode('utf-8'))
                
                elif parsed.path == '/api/stats':
                    stats = {
                        'total_terms': len(terms),
                        'domains': dict(Counter(t['domain'] for t in terms)),
                        'top_terms': sorted(terms, key=lambda x: -x['frequency'])[:20]
                    }
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(stats).encode('utf-8'))
                
                elif parsed.path == '/':
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html')
                    self.end_headers()
                    html = '<html><head><title>Hisparos Term API</title></head><body>'
                    html += '<h1>Hisparos Terminology API</h1>'
                    html += f'<p>{len(terms)} terms indexed</p>'
                    html += '<ul><li><a href="/api/terms">All terms</a></li>'
                    html += '<li><a href="/api/stats">Statistics</a></li>'
                    html += '<li><code>/api/terms?q=contract&domain=legal</code></li></ul></body></html>'
                    self.wfile.write(html.encode('utf-8'))
                else:
                    self.send_response(404)
                    self.end_headers()
            
            def log_message(self, format, *args):
                pass  # Suppress logs
        
        server = HTTPServer((host, port), TermAPIHandler)
        print(f"Terminology API running on http://{host}:{port}", file=sys.stderr)
        print(f"  Endpoints:", file=sys.stderr)
        print(f"    GET /api/terms?q=<query>&domain=<domain>&page=<n>&limit=<n>", file=sys.stderr)
        print(f"    GET /api/stats", file=sys.stderr)
        print(f"  Press Ctrl+C to stop", file=sys.stderr)
        server.serve_forever()
        
    except ImportError:
        print("http.server not available. Use alternative server.", file=sys.stderr)
    except FileNotFoundError:
        print(f"Terms file '{terms_file}' not found. Run extraction first.", file=sys.stderr)
    except KeyboardInterrupt:
        print("\nServer stopped.", file=sys.stderr)


# ========== Main ==========

def main():
    parser = argparse.ArgumentParser(description='Hisparos AI Terminology Extractor')
    parser.add_argument('--tmx', help='Path to a single TMX file')
    parser.add_argument('--tmx-dir', help='Directory containing TMX files')
    parser.add_argument('--output', default='terms.json', help='Output JSON file')
    parser.add_argument('--min-freq', type=int, default=2, help='Minimum term frequency')
    parser.add_argument('--serve', action='store_true', help='Run API server')
    parser.add_argument('--port', type=int, default=8080, help='API server port')
    parser.add_argument('--demo', action='store_true', help='Generate demo data for testing')
    
    args = parser.parse_args()
    
    if args.demo:
        print("Generating demo terminology data...", file=sys.stderr)
        generate_demo_terms(args.output)
        print(f"Demo data saved to {args.output}", file=sys.stderr)
        return
    
    if args.serve:
        run_api_server(args.output, port=args.port)
        return
    
    extractor = TMXTermExtractor()
    
    if args.tmx:
        terms = extractor.process_tmx_file(args.tmx, args.min_freq)
    elif args.tmx_dir:
        terms = extractor.process_directory(args.tmx_dir, args.min_freq)
    else:
        print("No input provided. Use --tmx, --tmx-dir, or --demo", file=sys.stderr)
        parser.print_help()
        sys.exit(1)
    
    if terms:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(terms, f, ensure_ascii=False, indent=2)
        print(f"\nSaved {len(terms)} terms to {args.output}", file=sys.stderr)
        
        # Print summary
        domains = Counter(t['domain'] for t in terms)
        print(f"\nDomain distribution:", file=sys.stderr)
        for domain, count in domains.most_common():
            print(f"  {domain}: {count}", file=sys.stderr)
    else:
        print("No terms extracted.", file=sys.stderr)


def generate_demo_terms(output_path='terms.json'):
    """Generate demo terminology data for testing the frontend."""
    demo_terms = [
        {"term": "power of attorney", "translation": "poder notarial", "domain": "legal", "frequency": 45, "examples": [{"source": "I hereby grant power of attorney to...", "target": "Por la presente otorgo poder notarial a..."}]},
        {"term": "sworn translation", "translation": "traducción jurada", "domain": "legal", "frequency": 89, "examples": [{"source": "The sworn translation must be notarized.", "target": "La traducción jurada debe ser notarizada."}]},
        {"term": "certified copy", "translation": "copia compulsada", "domain": "legal", "frequency": 67, "examples": [{"source": "Please submit a certified copy of the document.", "target": "Por favor, presente una copia compulsada del documento."}]},
        {"term": "entry clearance", "translation": "autorización de entrada", "domain": "immigration", "frequency": 34, "examples": [{"source": "Entry clearance must be obtained prior to travel.", "target": "La autorización de entrada debe obtenerse antes del viaje."}]},
        {"term": "residence permit", "translation": "permiso de residencia", "domain": "immigration", "frequency": 78, "examples": [{"source": "Application for a residence permit was submitted.", "target": "Se presentó la solicitud de permiso de residencia."}]},
        {"term": "limited liability company", "translation": "sociedad de responsabilidad limitada", "domain": "corporate", "frequency": 56, "examples": [{"source": "The limited liability company was incorporated in 2020.", "target": "La sociedad de responsabilidad limitada se constituyó en 2020."}]},
        {"term": "income tax return", "translation": "declaración de la renta", "domain": "financial", "frequency": 43, "examples": [{"source": "The income tax return must be filed by June 30.", "target": "La declaración de la renta debe presentarse antes del 30 de junio."}]},
        {"term": "marriage certificate", "translation": "certificado de matrimonio", "domain": "legal", "frequency": 92, "examples": [{"source": "An apostilled marriage certificate is required.", "target": "Se requiere un certificado de matrimonio apostillado."}]},
        {"term": "birth certificate", "translation": "certificado de nacimiento", "domain": "legal", "frequency": 95, "examples": [{"source": "Submit the original birth certificate with translation.", "target": "Presente el certificado de nacimiento original con traducción."}]},
        {"term": "apostille", "translation": "apostilla", "domain": "legal", "frequency": 71, "examples": [{"source": "The document requires an apostille under the Hague Convention.", "target": "El documento requiere apostilla según el Convenio de La Haya."}]},
        {"term": "criminal record certificate", "translation": "certificado de antecedentes penales", "domain": "legal", "frequency": 48, "examples": [{"source": "A criminal record certificate is required for the visa application.", "target": "Se requiere un certificado de antecedentes penales para la solicitud de visado."}]},
        {"term": "articles of association", "translation": "estatutos sociales", "domain": "corporate", "frequency": 38, "examples": [{"source": "The articles of association were amended by shareholders.", "target": "Los estatutos sociales fueron modificados por los accionistas."}]},
        {"term": "share capital", "translation": "capital social", "domain": "financial", "frequency": 35, "examples": [{"source": "The share capital amounts to €100,000.", "target": "El capital social asciende a 100.000 euros."}]},
        {"term": "court ruling", "translation": "sentencia judicial", "domain": "legal", "frequency": 42, "examples": [{"source": "The court ruling was delivered on 15 March 2024.", "target": "La sentencia judicial se dictó el 15 de marzo de 2024."}]},
        {"term": "student visa", "translation": "visado de estudiante", "domain": "immigration", "frequency": 53, "examples": [{"source": "The student visa is valid for the duration of the course.", "target": "El visado de estudiante es válido durante la duración del curso."}]},
        {"term": "non-disclosure agreement", "translation": "acuerdo de confidencialidad", "domain": "corporate", "frequency": 44, "examples": [{"source": "Both parties signed a non-disclosure agreement.", "target": "Ambas partes firmaron un acuerdo de confidencialidad."}]},
        {"term": "subject to", "translation": "sujeto a", "domain": "legal", "frequency": 88, "examples": [{"source": "Subject to the terms and conditions herein.", "target": "Sujeto a los términos y condiciones aquí establecidos."}]},
        {"term": "notary public", "translation": "notario público", "domain": "legal", "frequency": 41, "examples": [{"source": "The document was signed before a notary public.", "target": "El documento se firmó ante notario público."}]},
        {"term": "work permit", "translation": "permiso de trabajo", "domain": "immigration", "frequency": 62, "examples": [{"source": "Application for a work permit is in process.", "target": "La solicitud de permiso de trabajo está en trámite."}]},
        {"term": "commercial register", "translation": "registro mercantil", "domain": "corporate", "frequency": 33, "examples": [{"source": "The company is registered in the Commercial Register.", "target": "La empresa está inscrita en el Registro Mercantil."}]},
    ]
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(demo_terms, f, ensure_ascii=False, indent=2)
    
    print(f"  Generated {len(demo_terms)} demo terms", file=sys.stderr)


if __name__ == '__main__':
    main()
