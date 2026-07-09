import sys, json
d = json.load(sys.stdin)
print("Articles:", d.get('count', 0))
for a in d.get('articles', [])[:5]:
    print(f"  - {a['title'][:60]} | {a.get('source', '?')[:15]}")
