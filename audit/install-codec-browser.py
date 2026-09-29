"""Install an isolated, version-pinned official Chrome for Testing for codec GA."""
import os
from pathlib import Path
import platform
import sys
import urllib.request
import zipfile

version = '140.0.7339.207'
host = {'Windows': 'win64', 'Linux': 'linux64'}[platform.system()]
root = Path(sys.argv[1]).resolve()
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
print(executable)
if os.environ.get('GITHUB_ENV'):
    with open(os.environ['GITHUB_ENV'], 'a', encoding='utf-8') as env:
        env.write(f'AKARI_CODEC_BROWSER={executable}\n')
