"""Generate deterministic-source codec fixtures with an external FFmpeg encoder.

Run deliberately when adding fixtures, not while evaluating the product.
The checked-in manifest records the encoder, exact commands and byte hashes.
"""
import hashlib
import json
import math
import os
from pathlib import Path
import struct
import subprocess
import wave

target = Path('audit/fixtures/audio-1.0.2')
target.mkdir(parents=True, exist_ok=True)
encoder = os.environ.get('AKARI_FFMPEG', 'ffmpeg')
source = target / 'tone.wav'
with wave.open(str(source), 'wb') as output:
    output.setparams((2, 2, 48000, 0, 'NONE', 'not compressed'))
    output.writeframes(b''.join(struct.pack('<hh',
        round(7000 * math.sin(2 * math.pi * 440 * i / 48000)),
        round(5000 * math.sin(2 * math.pi * 660 * i / 48000))) for i in range(12000)))

formats = [
    ('tone.mp3', ['-c:a', 'libmp3lame', '-b:a', '128k']),
    ('tone.m4a', ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '128k']),
    ('mono.m4a', ['-ac', '1', '-ar', '44100', '-c:a', 'aac', '-profile:a', 'aac_low', '-movflags', '+faststart']),
    ('tone.flac', ['-c:a', 'flac']),
    ('mono.flac', ['-ac', '1', '-ar', '8000', '-c:a', 'flac']),
    ('tone.ogg', ['-c:a', 'libopus', '-b:a', '64k']),
    ('mono.opus', ['-ac', '1', '-c:a', 'libopus', '-b:a', '32k']),
    ('unsupported-alac.m4a', ['-c:a', 'alac']),
    ('unsupported-vorbis.ogg', ['-c:a', 'libvorbis']),
    ('unsupported-adts.aac', ['-c:a', 'aac', '-profile:a', 'aac_low', '-f', 'adts']),
    ('overrate.flac', ['-ar', '96000', '-c:a', 'flac']),
]
commands = {}
for filename, options in formats:
    args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
            '-metadata', 'title=AKARI_PRIVATE_METADATA_102',
            '-metadata', 'artist=AKARI_PRIVATE_METADATA_102', *options, str(target / filename)]
    subprocess.run([encoder, *args], check=True)
    commands[filename] = args
files = {p.name: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
         for p in sorted(target.iterdir()) if p.is_file() and p.name != 'manifest.json'}
manifest = {'schema': 'akari-audio-fixtures-v1', 'source': 'Generated stereo PCM, 48000 Hz, 0.25 s; left 440 Hz, right 660 Hz.',
            'encoder': subprocess.check_output([encoder, '-version'], text=True).splitlines()[0],
            'commands': commands, 'files': files}
(target / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Generated', len(files), 'audio fixtures')
