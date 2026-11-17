"""Make a new SHELOOPS release in one step.

Usage (from the sheloops folder):
    python release.py 1.1.0 "Added glitter CD cases" "Fixed the mixer meter"

What it does:
  - sets the new version and date in version.json
  - moves the old notes into "history"
  - writes your notes as the "What's new" list people will see
  - bumps the version in sw.js so installed apps pick up the new files
Then commit and push to GitHub. Everyone gets a "new version" notice.
"""
import json, re, sys, datetime, pathlib

root = pathlib.Path(__file__).parent
if len(sys.argv) < 3:
    print(__doc__); sys.exit(1)
new, notes = sys.argv[1], sys.argv[2:]
if not re.fullmatch(r"\d+\.\d+\.\d+", new):
    sys.exit('Version must look like 1.2.0')

vf = root / 'version.json'
v = json.loads(vf.read_text(encoding='utf-8'))
old = tuple(int(x) for x in v['version'].split('.'))
if tuple(int(x) for x in new.split('.')) <= old:
    sys.exit(f"New version must be higher than {v['version']}")
v.setdefault('history', []).insert(0, {'version': v['version'], 'date': v['date'], 'notes': v['notes']})
v['version'], v['date'], v['notes'] = new, datetime.date.today().isoformat(), notes
v['files'] = ['index.html', 'style.css'] + sorted('js/' + f.name for f in (root / 'js').glob('*.js'))
vf.write_text(json.dumps(v, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

sw = root / 'sw.js'
s = sw.read_text(encoding='utf-8')
s = re.sub(r"const VERSION = '[^']*';", f"const VERSION = '{new}';", s, count=1)
sw.write_text(s, encoding='utf-8')
print(f'SHELOOPS {new} ready. Now commit and push it to GitHub.')
