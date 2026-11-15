"""
Bundle the built app and all its data into one HTML file that opens with a
double-click (no Node, no server). Run after `npm run build`:
    python3 scripts/make_standalone.py
Output: SkyRewind.html in the project root.
"""
import base64, json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "web" / "dist"
html = (DIST / "index.html").read_text(encoding="utf-8")

mime = {".json": "application/json", ".bin": "application/octet-stream", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg"}
data = {}
for f in sorted((DIST / "data").iterdir()):
    b64 = base64.b64encode(f.read_bytes()).decode()
    data[f"/data/{f.name}"] = f"data:{mime[f.suffix]};base64,{b64}"

def inline_js(m):
    js = (DIST / m.group(1).lstrip("/")).read_text(encoding="utf-8").replace("</script", "<\\/script")
    return f'<script type="module">\n{js}\n</script>'

def inline_css(m):
    css = (DIST / m.group(1).lstrip("/")).read_text(encoding="utf-8")
    return f"<style>\n{css}\n</style>"

html = re.sub(r'<script type="module" crossorigin src="([^"]+)"></script>', inline_js, html)
html = re.sub(r'<link rel="stylesheet" crossorigin href="([^"]+)">', inline_css, html)
boot = f"<script>window.__SKY_DATA__ = {json.dumps(data)};</script>"
html = html.replace("<head>", "<head>\n" + boot, 1)
assert 'src="/assets' not in html and 'href="/assets' not in html, "an asset was not inlined"
out = ROOT / "SkyRewind.html"
out.write_text(html, encoding="utf-8")
print(f"wrote {out} ({out.stat().st_size/1e6:.1f} MB)")

# Web-page variant: the publishing host supplies <!doctype>, <html>, <head> and <body>,
# so emit only their contents.
head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
head = re.sub(r'<meta charset="UTF-8" />|<meta name="viewport"[^>]*/>', "", head)
web = ROOT / "SkyRewind.web.html"
# the host reads the <title> from the first 8 KB, so small tags go ahead of the embedded data
small = "".join(re.findall(r"<title>.*?</title>|<meta [^>]*/>|<link [^>]*/>", head))
rest = re.sub(r"<title>.*?</title>|<meta [^>]*/>|<link [^>]*/>", "", head)
web.write_text(small + "\n" + rest.strip() + "\n" + body.strip() + "\n", encoding="utf-8")
print(f"wrote {web}")
