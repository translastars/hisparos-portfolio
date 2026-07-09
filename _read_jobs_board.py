import sys, json, base64, os

def get_file(name):
    result = json.loads(os.popen(f'gh api repos/translastars/jobs-board/contents/{name}').read())
    if isinstance(result, list):
        return None  # it's a directory
    return base64.b64decode(result['content']).decode('utf-8')

def list_dir(name):
    result = json.loads(os.popen(f'gh api repos/translastars/jobs-board/contents/{name}').read())
    for f in result:
        print(f'{f["name"]:40s} {f["type"]:6s} {f.get("size", 0)}')

# List scrapers
print("=== scrapers/ ===")
list_dir('scrapers')

print("\n=== scripts/ ===")
list_dir('scripts')

print("\n=== api/ ===")
list_dir('api')

# Read key files
for fn in ['api/index.js', 'api/package.json', 'package.json', 'vercel.json', 'scrapers/scrape_linkedin.js', 'scrapers/scrape_indeed.js']:
    content = get_file(fn)
    if content:
        lines = content.split('\n')
        print(f'\n{"="*50}')
        print(f'=== {fn} ({len(lines)} lines) ===')
        print(f'{"="*50}')
        for line in lines[:80]:
            print(line)
        if len(lines) > 80:
            print(f'... ({len(lines)-80} more lines)')
