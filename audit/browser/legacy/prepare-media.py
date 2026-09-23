"""Build actual image/audio inputs for the browser audit, not product assets.

Requires Pillow, ffmpeg, and Node.js. Generated files stay outside Git tracking.
The environment manifest records the exact fixture hashes and tool versions.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import os

import PIL
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
MEDIA = Path(__file__).resolve().parent / "media"


def run(*args: str) -> str:
    return subprocess.check_output(args, cwd=ROOT, text=True, stderr=subprocess.STDOUT)


def main() -> None:
    MEDIA.mkdir(exist_ok=True)
    for suffix in ("png", "jpg", "webp"):
        Image.new("RGB", (32, 24), (27, 146, 88)).save(MEDIA / ("picture." + suffix))
    run("node", "-e", "require('fs').writeFileSync('audit/browser/legacy/media/tone.wav',"
        "require('./audit/browser/legacy/media-fixtures.cjs').wav({seconds:0.4}))")
    run(os.environ.get("AKARI_FFMPEG", "ffmpeg"), "-y", "-v", "error", "-f", "lavfi", "-i",
        "anullsrc=r=44100:cl=mono", "-t", "0.4", "-codec:a", "libmp3lame",
        str(MEDIA / "silence.mp3"))
    files = []
    for name in ("picture.png", "picture.jpg", "picture.webp", "tone.wav", "silence.mp3"):
        data = (MEDIA / name).read_bytes()
        if not data:
            raise RuntimeError("Empty fixture: " + name)
        files.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    report = {"python": sys.version, "pillow": PIL.__version__,
              "ffmpeg": run(os.environ.get("AKARI_FFMPEG", "ffmpeg"), "-version").splitlines()[0], "files": files}
    (MEDIA / "fixture-manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
