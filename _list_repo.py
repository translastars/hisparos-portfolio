import sys, json
data = json.load(sys.stdin)
for f in data:
    print(f'{f["name"]:40s} {f["type"]}')
