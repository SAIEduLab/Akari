from pathlib import Path
import copy, hashlib, json, re, subprocess, sys
import yaml

workflow = Path('.github/workflows/akari-audit.yml')
document = yaml.load(workflow.read_text(encoding='utf-8'), Loader=yaml.BaseLoader)

def verify(doc):
    assert 'Akari_1_0_0' in doc['on']['push']['branches'], 'candidate push trigger'
    assert 'audit/**' in doc['on']['push']['branches'], 'audit branch push trigger'
    assert 'feat/**' in doc['on']['push']['branches'], 'feature branch push trigger'
    assert 'fixed-1.0.2' in doc['jobs']['selftest']['name'], 'completed checkpoint job label'
    static_scripts = '\n'.join(s.get('run', '') for s in doc['jobs']['static']['steps'])
    assert 'node audit/tests/completed-baseline-negative.mjs || status=1' in static_scripts, 'completed baseline negative gate'
    assert 'node audit/tests/checkpoint-101-negative.mjs || status=1' in static_scripts, '1.0.1 checkpoint negative gate'
    assert 'node audit/tests/checkpoint-102-negative.mjs || status=1' in static_scripts, '1.0.2 completed checkpoint negative gate'
    assert 'node audit/tests/historical-source-negative.mjs || status=1' in static_scripts, 'offline provenance negative gate'
    assert 'GIT_ALTERNATE_OBJECT_DIRECTORIES' not in str(doc), 'external Git object dependency'
    assert 'Akari2' not in str(doc), 'old repository dependency'
    for event in ['push', 'pull_request']:
        assert 'index.html' in doc['on'][event]['paths'], 'public entrance must trigger audit'
    assert set(doc['jobs']) == {'static', 'selftest', 'full-browser-gate', 'audio-codecs', 'aggregate'}
    jobs = doc['jobs']
    assert jobs['selftest']['needs'] == ['static']
    assert jobs['full-browser-gate']['needs'] == ['static']
    for name in ['selftest','full-browser-gate']:
        assert 'always()' in jobs[name]['if']
        assert "needs.static.result != 'success'" in jobs[name]['if']
    assert jobs['aggregate']['needs'] == ['static', 'selftest', 'full-browser-gate', 'audio-codecs']
    codec = jobs['audio-codecs']
    assert codec['needs'] == ['static']
    assert codec['env'] == {'GIT_CONFIG_COUNT':'1','GIT_CONFIG_KEY_0':'core.autocrlf','GIT_CONFIG_VALUE_0':'false'}, 'both platforms must execute exact Git bytes'
    assert 'always()' in codec['if'] and "needs.static.result != 'success'" in codec['if']
    assert codec['strategy']['fail-fast'] == 'false'
    assert codec['strategy']['matrix']['include'] == [{'os':'ubuntu-latest','platform':'linux'},{'os':'windows-latest','platform':'win32'}]
    codec_scripts = '\n'.join(s.get('run','') for s in codec['steps'])
    assert 'playwright@1.55.0' in codec_scripts
    assert 'audit/install-codec-browser.py' in codec_scripts
    codec_execution = next(s['run'] for s in codec['steps'] if 'node audit/tests/audio-codecs-102.mjs' in s.get('run',''))
    assert 'node audit/run-fixed-audio.mjs' in codec_execution, 'fixed 1.0.2 audio execution required'
    assert codec_execution.count('|| status=1') == 2 and 'exit "$status"' in codec_execution, 'both candidate and fixed audio must execute on failure'
    assert 'node audit/tests/release-102-negative.mjs || status=1' in static_scripts
    for step in codec['steps']:
        if 'node audit/tests/audio-codecs-102.mjs' in step.get('run','') or 'seal ' in step.get('run',''):
            assert step['if'] == 'always()' and 'continue-on-error' not in step
    assert 'always()' in jobs['aggregate']['if']
    assert jobs['full-browser-gate']['strategy']['matrix']['group'] == ['session', 'ui', 'limits', 'schemas', 'extra']
    expected = {
        'static': ['audit/tests/static-contract.py', 'audit/tests/workflow-preflight.py', 'audit/tests/externalization-static.mjs', 'audit/tests/evidence-negative.mjs', 'audit/tests/ci-regression.mjs', 'audit/tests/execution-continuity.mjs', 'audit/tests/dom-render-regression.cjs', 'seal static'],
        'selftest': ['audit/run-local-gate.mjs', 'seal selftest'],
        'full-browser-gate': ['audit/browser/run-full-browser-audit.mjs', 'audit/tests/manual-docs.mjs', 'seal "full-browser-'],
        'audio-codecs': ['audit/tests/audio-codecs-102.mjs', 'seal "audio-codecs-'],
        'aggregate': ['audit/verify-evidence.mjs aggregate'],
    }
    for name, job in jobs.items():
        assert job['runs-on'] == ('${{ matrix.os }}' if name == 'audio-codecs' else 'ubuntu-latest')
        assert 'continue-on-error' not in job
        for step in job['steps']:
            assert 'continue-on-error' not in step
        checkout = [s for s in job['steps'] if s.get('uses', '').startswith('actions/checkout@')]
        assert len(checkout) == 1 and checkout[0]['with']['fetch-depth'] == '0'
        assert checkout[0]['with']['ref'] == "${{ github.event_name == 'pull_request' && github.event.pull_request.head.sha || github.sha }}"
        assert job['steps'][0] is checkout[0], name + ': checkout must be first'
        assert 'repository' not in checkout[0]['with'], name + ': checkout must use this repository'
        scripts = '\n'.join(s.get('run', '') for s in job['steps'])
        assert not re.search(r'\bgit\s+(?:clone|fetch|pull)\b', scripts), name + ': external Git fetch is unnecessary'
        for command in expected[name]:
            assert command in scripts, name + ': missing runner/validator ' + command
        for ref in re.findall(r'(audit/[A-Za-z0-9_./-]+\.(?:mjs|cjs|py))', scripts):
            assert Path(ref).is_file(), 'missing script ' + ref
        uploads = [s for s in job['steps'] if s.get('uses', '').startswith('actions/upload-artifact@')]
        assert len(uploads) == 1
        assert uploads[0]['if'] == 'always()'
        assert uploads[0]['with']['retention-days'] == '3'
        assert uploads[0]['with']['if-no-files-found'] == 'error'
        assert uploads[0]['with']['include-hidden-files'] == 'true', 'snapshot includes .github and other tracked dotfiles'
        assert '${{ github.run_id }}-${{ github.run_attempt }}' in uploads[0]['with']['name']
    for name in ['selftest', 'full-browser-gate']:
        steps = jobs[name]['steps']
        scripts = '\n'.join(s.get('run', '') for s in steps)
        assert 'playwright@1.55.0' in scripts, 'pinned Playwright required'
        assert 'playwright" install --with-deps --no-shell chromium' in scripts, 'matching browser install required'
        assert 'chromium.executablePath()' in scripts, 'matching executable required'
        assert 'command -v google-chrome' not in scripts, 'system browser fallback forbidden'
        probe = [i for i, step in enumerate(steps) if 'node audit/tests/browser-environment.mjs' in step.get('run', '')]
        runner = [i for i, step in enumerate(steps) if any(x in step.get('run', '') for x in ['node audit/run-local-gate.mjs', 'node audit/browser/run-full-browser-audit.mjs'])]
        assert len(probe) == len(runner) == 1 and probe[0] < runner[0], 'environment checked before product'
        assert 'continue-on-error' not in steps[probe[0]] and steps[probe[0]]['if'] == 'always()'
        assert steps[runner[0]]['if'] == 'always()'
    browser_scripts = '\n'.join(s.get('run','') for s in jobs['full-browser-gate']['steps'])
    assert 'fonts-noto-cjk xvfb xauth' in browser_scripts, 'headed gesture prerequisites'
    group_step = next(s for s in jobs['full-browser-gate']['steps'] if 'node audit/browser/run-full-browser-audit.mjs' in s.get('run',''))
    assert 'node audit/tests/manual-docs.mjs' in group_step['run']
    assert group_step['run'].count('|| status=1') == 2 and 'exit "$status"' in group_step['run']
    assert 'cp audit-evidence/browser-environment.json audit-evidence/selftest/browser-environment.json' in '\n'.join(s.get('run','') for s in jobs['selftest']['steps'])
    downloads = [s for s in jobs['aggregate']['steps'] if s.get('uses', '').startswith('actions/download-artifact@')]
    assert len(downloads) == 1 and downloads[0]['with']['pattern'] == 'akari-*-${{ github.run_id }}-${{ github.run_attempt }}'
    assert doc['permissions'] == {'contents': 'read'}

verify(document)
subprocess.run(['node', 'audit/build-audit-inventory.mjs', '--check'], check=True)
subprocess.run(['node', 'audit/verify-reviewed-inputs.mjs'], check=True)
bad = copy.deepcopy(document); bad['on']['push']['branches'].remove('Akari_1_0_0')
bad_dependency = copy.deepcopy(document); bad_dependency['jobs']['aggregate']['needs'].pop()
bad_retention = copy.deepcopy(document); bad_retention['jobs']['selftest']['steps'][-1]['with']['retention-days'] = '90'
bad_validator = copy.deepcopy(document); bad_validator['jobs']['aggregate']['steps'][-2]['run'] = 'true'
bad_hidden = copy.deepcopy(document); bad_hidden['jobs']['full-browser-gate']['steps'][-1]['with']['include-hidden-files'] = 'false'
bad_browser = copy.deepcopy(document)
for step in bad_browser['jobs']['selftest']['steps']:
    if 'playwright" install' in step.get('run', ''):
        step['run'] = step['run'].replace('playwright" install', 'missing-browser-install')
bad_probe = copy.deepcopy(document)
bad_probe['jobs']['full-browser-gate']['steps'] = [s for s in bad_probe['jobs']['full-browser-gate']['steps'] if 'node audit/tests/browser-environment.mjs' not in s.get('run', '')]
bad_skips = copy.deepcopy(document); bad_skips['jobs']['full-browser-gate']['needs'].append('selftest')
bad_early = copy.deepcopy(document); bad_early['jobs']['selftest']['if'] = bad_early['jobs']['selftest']['if'].replace('always() && ', '')
bad_display = copy.deepcopy(document)
for step in bad_display['jobs']['full-browser-gate']['steps']:
    if 'xvfb xauth' in step.get('run',''):
        step['run'] = step['run'].replace(' xvfb xauth','')
bad_checkpoint_trigger = copy.deepcopy(document); bad_checkpoint_trigger['on']['push']['branches'].remove('audit/**')
bad_checkpoint_name = copy.deepcopy(document); bad_checkpoint_name['jobs']['selftest']['name'] = 'stale baseline'
bad_checkpoint_gate = copy.deepcopy(document)
for step in bad_checkpoint_gate['jobs']['static']['steps']:
    step['run'] = step.get('run', '').replace('node audit/tests/completed-baseline-negative.mjs || status=1', '')
bad_provenance = copy.deepcopy(document); bad_provenance['jobs']['static']['steps'].insert(1, {'run': 'git clone https://example.invalid/old.git old'})
bad_alternates = copy.deepcopy(document); bad_alternates['env'] = {'GIT_ALTERNATE_OBJECT_DIRECTORIES': '/external/objects'}
bad_archive_gate = copy.deepcopy(document)
for step in bad_archive_gate['jobs']['static']['steps']:
    step['run'] = step.get('run', '').replace('node audit/tests/historical-source-negative.mjs || status=1', '')
bad_checkpoint101_gate = copy.deepcopy(document)
for step in bad_checkpoint101_gate['jobs']['static']['steps']:
    step['run'] = step.get('run', '').replace('node audit/tests/checkpoint-101-negative.mjs || status=1', '')
bad_audio_dependency = copy.deepcopy(document); bad_audio_dependency['jobs']['aggregate']['needs'].remove('audio-codecs')
bad_audio_platform = copy.deepcopy(document); bad_audio_platform['jobs']['audio-codecs']['strategy']['matrix']['include'].pop()
bad_audio_skip = copy.deepcopy(document); bad_audio_skip['jobs']['audio-codecs']['if'] = 'false'
bad_audio_soft = copy.deepcopy(document); bad_audio_soft['jobs']['audio-codecs']['continue-on-error'] = 'true'
bad_feature_trigger = copy.deepcopy(document); bad_feature_trigger['on']['push']['branches'].remove('feat/**')
bad_checkpoint102_gate = copy.deepcopy(document)
for step in bad_checkpoint102_gate['jobs']['static']['steps']:
    step['run'] = step.get('run', '').replace('node audit/tests/checkpoint-102-negative.mjs || status=1', '')
bad_fixed_audio = copy.deepcopy(document)
bad_audio_early = copy.deepcopy(document)
for step in bad_fixed_audio['jobs']['audio-codecs']['steps']:
    step['run'] = step.get('run', '').replace('node audit/run-fixed-audio.mjs', 'missing-fixed-audio')
for step in bad_audio_early['jobs']['audio-codecs']['steps']:
    step['run'] = step.get('run', '').replace('|| status=1', '')
for invalid in [bad_checkpoint102_gate, bad_fixed_audio, bad_audio_early, bad_audio_dependency, bad_audio_platform, bad_audio_skip, bad_audio_soft, bad_feature_trigger, bad_checkpoint_trigger, bad_checkpoint_name, bad_checkpoint_gate, bad_display, bad, bad_dependency, bad_retention, bad_validator, bad_hidden, bad_browser, bad_probe, bad_skips, bad_early, bad_provenance, bad_alternates, bad_archive_gate, bad_checkpoint101_gate]:
    try:
        verify(invalid)
    except AssertionError:
        pass
    else:
        raise AssertionError('invalid workflow accepted')

manifest = json.loads(Path('audit/browser/browser-audit-manifest.json').read_text(encoding='utf-8'))
contract = json.loads(Path('audit/manifests/browser-results.json').read_text(encoding='utf-8'))
assert len(contract['entries']) == 27
for group, tasks in manifest['groups'].items():
    assert sorted(tasks) == sorted(e['task'] for e in contract['entries'] if e['group'] == group)
    for task in tasks:
        assert Path('audit/browser/legacy/' + task.split(':')[0] + '.cjs').is_file()
for entry in contract['entries']:
    assert entry['keys'] and len(entry['keys']) == len(set(entry['keys']))
checked = []
for file in sorted(Path('audit').rglob('*')):
    if file.is_file() and file.suffix in {'.mjs', '.cjs', '.js'}:
        subprocess.run(['node', '--check', str(file)], check=True, capture_output=True)
        checked.append(str(file).replace('\\', '/'))
    if file.is_file() and file.suffix == '.py':
        compile(file.read_text(encoding='utf-8'), str(file), 'exec')
    if file.suffix == '.cjs':
        source = file.read_text(encoding='utf-8')
        assert not re.search(r'require\([^\n]*\.akari09-validation', source)
        assert 'STANDARD_TAKUDON09' not in source
output = Path(sys.argv[1])
assert not output.exists(), 'new evidence path required'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps({'status': 'PASS', 'workflowSha256': hashlib.sha256(workflow.read_bytes()).hexdigest(),
    'jobs': list(document['jobs']), 'browserTasks': 27, 'negativeCases': 25, 'syntaxChecked': checked}, indent=2) + '\n', encoding='utf-8')
print('Workflow preflight: PASS; 25 negative cases; 27 browser tasks; ' + str(len(checked)) + ' JavaScript files')
