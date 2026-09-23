from pathlib import Path
from html.parser import HTMLParser
import hashlib, json, os, re, subprocess, sys
output = Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)

head = os.environ["HEAD_SHA"]
base = os.environ.get("BASE_SHA", "")
if os.environ["EVENT_NAME"] == "workflow_dispatch":
    p = subprocess.run(["git", "rev-parse", "HEAD^"], text=True, capture_output=True)
    base = p.stdout.strip() if p.returncode == 0 else ""
if not base or set(base) == {"0"}:
    changed = subprocess.check_output(
        ["git", "show", "--pretty=", "--name-only", head], text=True
    ).splitlines()
else:
    changed = subprocess.check_output(
        ["git", "diff", "--name-only", base, head], text=True
    ).splitlines()
changed = sorted({p for p in changed if p})
force_full = os.environ.get("FORCE_FULL", "false").lower() == "true" or not base or set(base) == {"0"} or os.environ.get("GITHUB_REF_NAME") == "Akari_1_0_0"
product_impact = any(
    p in {"Akari.html", "LANGUAGE.md", "AUDIT.md"} for p in changed
)
selftest_required = (
    force_full
    or product_impact
    or any(
        p.startswith("audit/") or p.startswith(".github/workflows/")
        for p in changed
    )
)
full_browser_required = selftest_required
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
    f.write(
        "selftest_required="
        + ("true" if selftest_required else "false")
        + "\n"
    )
    f.write(
        "full_browser_required="
        + ("true" if full_browser_required else "false")
        + "\n"
    )

required = [
    "Akari.html", "LANGUAGE.md", "AUDIT.md", "LICENSE", "README.md",
    "audit/README.md", "audit/run-headless-selftest.mjs",
    "audit/fixtures/0.8/manifest.json",
    "audit/fixtures/0.8/Akari.html", "audit/fixtures/0.8/LANGUAGE.md",
    "audit/fixtures/0.8/AUDIT.md", "audit/fixtures/0.8/akari-audit.yml",
]
missing = [p for p in required if not Path(p).is_file()]
if missing:
    raise SystemExit("missing audit inputs: " + ", ".join(missing))

html = Path("Akari.html").read_text(encoding="utf-8")
audit = Path("AUDIT.md").read_text(encoding="utf-8")

d09 = re.findall(r"^### (D09-[A-Z0-9-]+)\s+—", audit, re.M)
if len(d09) != 28 or len(set(d09)) != 28:
    raise SystemExit("D09 requirement count is not 28")
phases = [int(x) for x in re.findall(r"^## フェーズ (\d+) —", audit, re.M)]
if phases != list(range(1, 17)):
    raise SystemExit("audit phases are not exactly 1..16")

marker = "<!-- audit-inventory: 257 rows; 74 command rows; 22+5 sensors; 32 target-event pairs; 38 limits -->"
if marker not in audit:
    raise SystemExit("audit inventory marker missing or changed")
a = audit.find("## 1.0.0 能力台帳 — 現行実装")
b = audit.find("<!-- audit-inventory:")
inventory = audit[a:b]
cats = {
    "command","ast","comment","branch","slot","expression","operator",
    "builtin","state","sensor","event","scope","runtime","save",
    "product","editor","limit",
}
rows = []
for line in inventory.splitlines():
    if not line.startswith("|"):
        continue
    cells = [x.strip() for x in line.split("|")[1:-1]]
    if cells and cells[0].split(":", 1)[0] in cats:
        rows.append(cells)
if len(rows) != 257:
    raise SystemExit(f"capability inventory row count: {len(rows)}")
ids = [r[0] for r in rows]
if len(ids) != len(set(ids)):
    raise SystemExit("duplicate capability ids")
counts = {}
for cid in ids:
    k = cid.split(":", 1)[0]
    counts[k] = counts.get(k, 0) + 1
for k, n in {"command":74,"state":22,"sensor":5,"event":32,"limit":38}.items():
    if counts.get(k) != n:
        raise SystemExit(f"inventory count mismatch for {k}: {counts.get(k)}")

if "audit-inventory:" in html or "D09-AUDIT-REQUIREMENTS" in html:
    raise SystemExit("audit-only metadata leaked into Akari.html")
if any(x in html for x in ["runReleaseTests", "selfTestReport", "data-selftest-failed"]):
    raise SystemExit("embedded audit remains in product")
for needle in [
    "appVersion: '1.0.0'", "runtimeVersion: '1.0.0'",
    "languageVersion: '1.0.0'", "programFormatVersion: 3",
    "projectFormatVersion: 3",
]:
    if needle not in html:
        raise SystemExit("version marker missing: " + needle)

lm = re.search(r"const LIMITS = \{(.*?)\n\s*\};", html, re.S)
if not lm:
    raise SystemExit("LIMITS object missing")
source_limits = re.findall(r"^\s*([A-Za-z][A-Za-z0-9]*):", lm.group(1), re.M)
audit_limits = sorted(r[0].split(":",1)[1] for r in rows if r[0].startswith("limit:"))
if len(source_limits) != 38 or sorted(source_limits) != audit_limits:
    raise SystemExit("LIMITS and 38-row audit inventory disagree")

class Resources(HTMLParser):
    def __init__(self):
        super().__init__(); self.external = []
    def handle_starttag(self, tag, attrs):
        key = {"script":"src","link":"href","img":"src","audio":"src",
               "video":"src","source":"src","iframe":"src"}.get(tag)
        value = dict(attrs).get(key) if key else None
        if value and not value.startswith(("data:","blob:","#")):
            self.external.append((tag, value))
resources = Resources(); resources.feed(html)
if resources.external:
    raise SystemExit("external resource dependency: " + repr(resources.external[:5]))
for api in ["fetch(", "XMLHttpRequest", "new WebSocket("]:
    if api in html:
        raise SystemExit("network API present in product: " + api)
if "SPDX-License-Identifier: Apache-2.0" not in html:
    raise SystemExit("SPDX marker missing")

start = html.index("<script>") + len("<script>")
end = html.rindex("</script>")
(output / "akari.js").write_text(html[start:end], encoding="utf-8")

fixture = Path("audit/fixtures/0.8")
manifest = json.loads((fixture / "manifest.json").read_text(encoding="utf-8"))
if manifest.get("sourceCommit") != "ec43018d5ba546d5aa9df9c2799b18260a3ab2d7":
    raise SystemExit("fixed 0.8 provenance commit mismatch")
def git_blob(data):
    return hashlib.sha1(f"blob {len(data)}".encode() + bytes([0]) + data).hexdigest()
fixture_hashes = {}
for name, meta in manifest["files"].items():
    local = (fixture / name).read_bytes()
    data = subprocess.check_output(['git', 'show', 'HEAD:audit/fixtures/0.8/' + name])
    if len(data) != meta["bytes"] or git_blob(data) != meta["gitBlobSha1"]:
        raise SystemExit("fixed 0.8 fixture provenance mismatch: " + name)
    if local not in (data, data.replace(b'\n', b'\r\n')):
        raise SystemExit('fixed fixture differs beyond Git checkout EOL conversion: ' + name)
    fixture_hashes[name] = {
        "bytes": len(data), "gitBlobSha1": git_blob(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "executedWorktreeBytes": len(local), "worktreeSha256": hashlib.sha256(local).hexdigest(),
    }

evidence = {
    "base": base, "head": head, "changedFiles": changed,
    "selftestRequired": selftest_required,
    "fullBrowserRequired": full_browser_required,
    "d09Count": len(d09), "phases": phases,
    "inventoryRows": len(rows), "inventoryCounts": counts,
    "limits": source_limits, "baselineFixture": fixture_hashes,
}
(output / "static.json").write_text(
    json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print("GA-STATIC: PASS")
