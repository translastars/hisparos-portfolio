import sys, json, base64, os

def get_file(name):
    result = json.loads(os.popen(f'gh api repos/translastars/jobs-board/contents/{name}').read())
    if isinstance(result, list):
        return None
    return base64.b64decode(result['content']).decode('utf-8')

for fn in ['scrapers/indeed.js', 'scrapers/linkedin.js', 'scrapers/index.js', 'scrapers/fraud_filter.js']:
    try:
        content = get_file(fn)
        lines = content.split('\n')
        print(f'\n{"="*60}')
        print(f'  {fn}  ({len(lines)} lines)')
        print(f'{"="*60}')
        for line in lines[:120]:
            print(line)
        if len(lines) > 120:
            print(f'... ({len(lines)-120} more lines)')
        print()
    except Exception as e:
        print(f'\n=== {fn} === ERROR: {e}')
