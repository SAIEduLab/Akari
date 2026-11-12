"""Install an isolated official Chrome for Testing, for codec and browser GA: the release a CI run's plan chose (the
newest Stable one when the run began, audit/lib/ci-lanes.mjs), or the newest Stable release when none is given.
  python audit/install-codec-browser.py <directory> [<release>] [--media]"""
import os
from pathlib import Path
import platform
import re
import sys
import urllib.request
import zipfile

given = [argument for argument in sys.argv[2:] if argument != '--media']
if len(given) > 1:
    raise RuntimeError('One release at most: ' + ' '.join(given)[:80])
if given:
    version = given[0]
else:
    # The Chrome for Testing site answers which version is the newest Stable one whose downloads are all published.
    stable = 'https://googlechromelabs.github.io/chrome-for-testing/LATEST_RELEASE_STABLE'
    with urllib.request.urlopen(stable, timeout=60) as response:
        version = response.read().decode('ascii').strip()
if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+', version):
    raise RuntimeError('The Stable version is not a release number: ' + version[:40])
host = {'Windows': 'win64', 'Linux': 'linux64'}[platform.system()]
root = Path(sys.argv[1]).resolve() / version
root.mkdir(parents=True, exist_ok=True)
executable = root / ('chrome-' + host) / ('chrome.exe' if host == 'win64' else 'chrome')
if not executable.exists():
    archive = root / ('chrome-' + host + '.zip')
    url = f'https://storage.googleapis.com/chrome-for-testing-public/{version}/{host}/chrome-{host}.zip'
    urllib.request.urlretrieve(url, archive)
    with zipfile.ZipFile(archive) as package:
        for item in package.infolist():
            destination = (root / item.filename).resolve()
            if not destination.is_relative_to(root):
                raise RuntimeError('Browser archive contains an unsafe path')
        package.extractall(root)
        if host == 'linux64':
            for item in package.infolist():
                mode = item.external_attr >> 16
                if mode and not item.is_dir():
                    (root / item.filename).chmod(mode & 0o777)
print('Chrome for Testing', version)
print(executable)
if os.environ.get('GITHUB_ENV'):
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as env:
        env.write(f'AKARI_CODEC_BROWSER={executable}\n')
        env.write(f'AKARI_BROWSER={executable}\n')
        if '--media' in sys.argv[2:]:
            import imageio_ffmpeg
            env.write(f'AKARI_FFMPEG={imageio_ffmpeg.get_ffmpeg_exe()}\n')
