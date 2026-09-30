#!/usr/bin/env python3
"""Validate and atomically publish a coherent Maestro state candidate.

    python3 .maestro/sync.py --validate candidate.json
    python3 .maestro/sync.py --project .maestro/state.js
    python3 .maestro/sync.py --publish candidate.json [--expect timestamp]
        [--holder token] [--no-open]

These modes write one JSON result on stdout. Exit 0 means valid/published, 1
means a rejected candidate, and 2 means an unreadable input. `--validate` and
`--project` are read-only. `--publish` checks graph semantics, capture hashes,
relevant input hashes, holder and expected revision before replacing state.js.
It cannot execute checks, invent records, or choose a closure outcome. A rejected
candidate writes a diagnostic envelope, preserving the last valid state and
keeping the dashboard reachable. The envelope is mirrored into the page so a
file snapshot also exposes the failure.

With no mode argument, the historical mirror/server behavior remains available
for old states and for reopening the dashboard. Contract-4/5 candidates are
validated before this compatibility path mirrors them. Server failures do not
invalidate an otherwise coherent snapshot. The helper uses only Python's
standard library, and tests exercise this copied file without opening windows.
"""

import json
import datetime
import hashlib
import os
import re
import shlex
import socket
import subprocess
import sys
import tempfile

CURRENT_CONTRACT_VERSION = 5

DIR = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(DIR, 'state.js')
PAGE = os.path.join(DIR, 'dashboard.html')
INDEX = os.path.join(DIR, 'index.html')
SERVE = os.path.join(DIR, 'serve.json')
OPENED = os.path.join(DIR, 'opened.json')
VALIDATION = os.path.join(DIR, 'validation.js')

# A session where a window helps nobody, because the window would appear on a
# machine the user is not sitting at. This was prose in `phases/0-preflight.md`;
# it belongs beside the code that opens things.
REMOTE = ('SSH_CONNECTION', 'SSH_TTY', 'CI')

# The contract's own value sets, copied here because nothing else present in a
# real прогон holds them. `scripts/validate/state-matches-spec.ts` compares these
# four lists against docs/spec/state-contract.md and scripts/state/contract.ts,
# so a set that drifts here is a finding rather than a silence.
STAGE_STATUSES = ['pending', 'active', 'done', 'failed', 'skipped']
STAGE_IDS = ('preflight', 'manifest', 'briefing', 'spec', 'plan',
             'build', 'review', 'acceptance')
TASK_STATUSES = ['queued', 'running', 'review', 'repair', 'done', 'failed']
REQUIREMENT_STATUSES = ['open', 'in-spec', 'deferred', 'dropped', 'placeholder']
GATE_STATUSES = ['pending', 'passed', 'failed']
LIFECYCLES = ['active', 'closed']
CLOSURE_OUTCOMES = ['completed', 'closed_with_exceptions', 'stopped_incomplete']
CHECK_RESULTS = ['not_run', 'passed', 'failed', 'unavailable', 'stale']
VERIFICATION_RESULTS = ['passed', 'failed', 'incomplete']

CHECKED = [
    ('stages', STAGE_STATUSES),
    ('tasks', TASK_STATUSES),
    ('requirements', REQUIREMENT_STATUSES),
    ('gates', GATE_STATUSES),
]

# The three fields of the state that reach the panel as text. `dashboard.html`
# puts each of them through `textContent` unchanged — there is no vocabulary to
# translate a free line against — so these carry the dial's language while every
# other file a прогон writes stays English. `SKILL.md`, under *Language*, is the
# rule; this is the part of it a program can hold.
#
# The list is short because the boundary is visibility, not shape. `debt` reaches
# the page as three counts, `additions` is not rendered there at all, and a
# требование's `reason` is read out of `report.md` rather than off the screen —
# so English in any of them is the rule rather than a breach of it.
SPOKEN = [
    ('gates', 'findings', True),
    ('tasks', 'title', False),
    ('stages', 'note', False),
]

CYRILLIC = re.compile(u'[\u0400-\u04FF]')
LATIN = re.compile(u'[A-Za-z]')

ASSIGNMENT = 'globalThis.MAESTRO_STATE ='
SNAPSHOT_RE = re.compile(
    r'(/\*\s*maestro:snapshot:start\s*\*/)(.*?)(/\*\s*maestro:snapshot:end\s*\*/)',
    re.DOTALL)
VALIDATION_SNAPSHOT_RE = re.compile(
    r'(/\*\s*maestro:validation:start\s*\*/)(.*?)(/\*\s*maestro:validation:end\s*\*/)',
    re.DOTALL)

DEBUG = os.environ.get('MAESTRO_SYNC_DEBUG') == '1'
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()
LEVELS = {'DEBUG': 10, 'INFO': 20, 'WARN': 30, 'ERROR': 40}


def log(level, check, message, data=None):
    """Structured diagnostics stay on stderr; JSON mode owns stdout."""
    floor = LEVELS.get(LOG_LEVEL, 20)
    if LEVELS[level] < floor:
        return
    suffix = '' if data is None else ' ' + json.dumps(data, sort_keys=True)
    print('%s [sync.%s] %s%s' % (level, check, message, suffix), file=sys.stderr)


def debug(message):
    if DEBUG:
        print('debug: ' + message, file=sys.stderr)
    else:
        log('DEBUG', 'legacy', message)


# What the прогон relays to the user, beside the address. It lives here rather
# than in the phase file because a phase file is read once, minutes before the
# sentence is needed, and twice now it was read and the sentence not said. What
# the orchestrator relays is what this tool printed.
FOLDED = {
    'ru': 'sync: скажите адрес в чате и добавьте, что панель, если она свернулась '
          'в строку, открывается нажатием на неё.',
    'en': 'sync: say the address in the chat, and add that the panel opens on a '
          'press if it landed folded into a row.',
}


# What the прогон says once the page is in front of the user. Said because the
# opening is silent from where the orchestrator sits: a detached process that
# returns nothing looks identical whether a window appeared or not, and the user
# is the only one who can tell the тool it did not.
SHOWN = {
    'ru': 'sync: панель открыта в браузере. Если окно не появилось — откройте адрес выше.',
    'en': 'sync: the panel is open in a browser. If no window appeared, open the address above.',
}

# And what it says instead when it deliberately opened nothing.
AWAY = {
    'ru': 'sync: удалённая сессия — ничего не открываю. Страница здесь: %s',
    'en': 'sync: remote session — opening nothing. The page is at %s',
}


# What the прогон says when the address is not the one it handed out last time.
# Above the address rather than below it: a user who reads the new link first has
# no reason to look further, and the dead tab stays open beside it.
MOVED = {
    'ru': {
        'taken': 'sync: адрес панели сменился. Прежний '
                 '(http://localhost:%d/dashboard.html) больше не отвечает — его '
                 'занял кто-то другой. Откройте новый и скажите его пользователю.',
        'gone': 'sync: адрес панели сменился. Прежний '
                '(http://localhost:%d/dashboard.html) больше не отвечает. '
                'Откройте новый и скажите его пользователю.',
    },
    'en': {
        'taken': 'sync: the panel has a new address. The old one '
                 '(http://localhost:%d/dashboard.html) is dead — something else '
                 'took it. Open the new one and say it to the user.',
        'gone': 'sync: the panel has a new address. The old one '
                '(http://localhost:%d/dashboard.html) is dead. Open the new one '
                'and say it to the user.',
    },
}


def opener():
    """The command this machine hands a url to.

    `MAESTRO_SYNC_OPENER` overrides it, split the way a shell would: the tests
    point it at a script that records the url instead of showing it, so what is
    under test is the decision to open and never a window that really appeared.
    """
    override = os.environ.get('MAESTRO_SYNC_OPENER')
    if override:
        return shlex.split(override)
    if sys.platform == 'darwin':
        return ['open']
    if sys.platform.startswith('win'):
        # `start` is a shell builtin, and its first argument is a window title.
        # The empty string is not decoration: without it the url becomes the
        # title and nothing opens.
        return ['cmd', '/c', 'start', '']
    return ['xdg-open']


def shown():
    """The address this directory's page was already opened on, or None."""
    try:
        with open(OPENED, encoding='utf-8') as handle:
            return json.load(handle).get('url')
    except Exception:
        return None


def open_page(url, force):
    """Put the page in front of the user, once per address.

    Returns what happened, because the caller prints it: 'shown' when a window
    was asked for, 'remote' when this is somebody else's machine, and None when
    there was nothing to do — the same address is already open, or the host
    said it drives its own pane.

    Once per *address* rather than once per directory: a run calls this tool
    dozens of times and must not open dozens of tabs, but an address that moved
    left the user holding a dead one, and that is worth a new window.
    """
    if os.environ.get('MAESTRO_SYNC_NO_OPEN'):
        debug('not opening: MAESTRO_SYNC_NO_OPEN is set')
        return None
    if any(os.environ.get(name) for name in REMOTE):
        debug('not opening: remote session')
        return 'remote'
    if not force and shown() == url:
        debug('not opening: %s is already open' % url)
        return None

    command = opener() + [url]
    try:
        subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)
    except Exception as error:
        # The same principle the server has: a page that could not be opened is
        # one line of output, not a stopped прогон. The address is already
        # printed above, and it is still true.
        debug('opener refused (%r): %s' % (command, error))
        return None

    try:
        with open(OPENED, 'w', encoding='utf-8') as handle:
            json.dump({'url': url}, handle)
    except OSError as error:
        debug('could not record the opened address: %s' % error)
    return 'shown'


def spoken(text):
    """The run's language, or Russian — the same fallback the page makes."""
    try:
        state = json.loads(text)
    except ValueError:
        return 'ru'
    if not isinstance(state, dict):
        return 'ru'
    return 'en' if state.get('language') == 'en' else 'ru'


def literal(source):
    """The object literal out of state.js, exactly as the page would see it."""
    start = source.find(ASSIGNMENT)
    if start == -1:
        raise ValueError('no "%s" assignment' % ASSIGNMENT)
    body = source[start + len(ASSIGNMENT):].strip()
    end = body.rfind('}')
    if end == -1:
        raise ValueError('the assignment carries no object literal')
    return body[:end + 1]


def mirror(text):
    """Write the literal into the page's snapshot block. Returns True if it moved."""
    page = open(PAGE, encoding='utf-8').read()
    if not SNAPSHOT_RE.search(page):
        raise ValueError('dashboard.html has no maestro:snapshot markers')

    body = '\nglobalThis.MAESTRO_SNAPSHOT = %s;\n' % text
    updated = SNAPSHOT_RE.sub(lambda m: m.group(1) + body + m.group(3), page, count=1)
    if updated == page:
        return False
    atomic_text(PAGE, updated)
    return True


def atomic_text(filename, body):
    """Replace one same-directory file without exposing a partial write."""
    descriptor, temporary = tempfile.mkstemp(prefix='.%s.' % os.path.basename(filename),
                                            suffix='.tmp', dir=os.path.dirname(filename))
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, filename)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def place_index():
    """`/` must be the dashboard. A link, never a copy — a copy is a second page that ages."""
    if os.path.lexists(INDEX):
        return False
    try:
        os.symlink('dashboard.html', INDEX)
        return True
    except OSError as error:
        debug('symlink refused (%s); the pane must be pointed at /dashboard.html' % error)
        return False


def recorded():
    """The pid and port the last call wrote down, or (None, None)."""
    try:
        record = json.load(open(SERVE, encoding='utf-8'))
        return int(record['pid']), int(record['port'])
    except Exception:
        return None, None


def command_of(pid):
    """What `ps` says that process is running, or '' when it is gone."""
    if pid is None:
        return ''
    try:
        return subprocess.run(['ps', '-p', str(pid), '-o', 'command='],
                              capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return ''


def ours(command):
    """Whether that command line is a server for *this* directory.

    The directory has to match. A pid file that only says "a server is up" is
    how one project ends up pointed at another project's dashboard.
    """
    return bool(command) and DIR in command and 'http.server' in command


def port_of(command):
    """The port out of a `python -m http.server <port> …` command line."""
    parts = command.split()
    try:
        after = parts.index('http.server') + 1
    except ValueError:
        return None
    try:
        return int(parts[after])
    except (IndexError, ValueError):
        return None


def adopt():
    """A live server for this directory that no file remembers, or None.

    `serve.json` lives inside `.maestro/`, which preflight re-populates at the
    start of every run — so the second run through a directory finds no record,
    raises a second server for it, and hands out a new address in silence:
    `moved_from` is None when nothing was remembered, so not even the
    moved-address line fires. One project ended with two servers listening and
    a user holding the older link.

    This is `ours()` asked of the process table instead of one remembered pid,
    and it runs only when the cheap path found nothing.
    """
    try:
        listing = subprocess.run(['ps', '-A', '-o', 'pid=,command='],
                                 capture_output=True, text=True, timeout=5).stdout
    except Exception as error:
        debug('ps refused: %s' % error)
        return None

    for line in listing.splitlines():
        head, _, command = line.strip().partition(' ')
        if not ours(command):
            continue
        port = port_of(command)
        if port is None:
            continue
        try:
            return int(head), port
        except ValueError:
            continue
    return None


def free(port):
    with socket.socket() as probe:
        try:
            probe.bind(('127.0.0.1', port))
            return True
        except OSError:
            return False


def pick_port(keep):
    """`keep`, when the port already handed to the user is still free to take.

    Preferring it is what makes a copied link survive a server that died: the
    caller establishes whether it is free, because whether it was is also the
    reason the address moved, and that reason has to be said out loud.
    """
    if keep is not None:
        return keep
    with socket.socket() as probe:
        probe.bind(('127.0.0.1', 0))
        return probe.getsockname()[1]


def serve(port, moved_from):
    """Raise a server for this directory, detached, on the loopback only."""
    try:
        process = subprocess.Popen(
            [sys.executable, '-m', 'http.server', str(port),
             '--bind', '127.0.0.1', '--directory', DIR],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True)
    except Exception as error:
        debug('server refused to start: %s' % error)
        return None

    # The port this address replaced, written down rather than only printed: the
    # call that moves the address is not always the call whose output is read.
    record = {'pid': process.pid, 'port': port}
    if moved_from is not None:
        record['previousPort'] = moved_from
    json.dump(record, open(SERVE, 'w', encoding='utf-8'))
    return port


def status_violations(state):
    """Every `<field>[i].status` the contract does not define, in order.

    A missing status counts: the field is required, and an entry without one is
    exactly as uncountable on the page as an entry with the wrong one.
    """
    found = []
    if not isinstance(state, dict):
        return found
    for field, allowed in CHECKED:
        entries = state.get(field)
        if not isinstance(entries, list):
            continue
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            status = entry.get('status')
            if status not in allowed:
                found.append(('%s[%d].status' % (field, index), status, allowed))
    return found


def language_violations(state):
    """Every line the panel prints word for word that is not in the прогон's language.

    Three fields reach the page as text, and a прогон speaking `ru` that writes
    them in English puts two languages on one screen. That is not a theory: a
    прогон on 2026-08-22 carried `"language": "ru"`, Russian таск titles, and
    seventeen English gate findings above them — one orchestrator, one rule,
    and the rule did not decide the case.

    **Only `ru` is checked, and the asymmetry is deliberate.** A Russian line
    contains Cyrillic and an English one does not, so for `ru` the alphabet
    decides it and no heuristic is involved. The mirror is not decidable: an
    English finding quoting the user's own sentence — «Расписание» inside an
    otherwise English line — is correct, and nothing here can tell it from a
    breach. A check that failed the honest case would be worse than none, so
    the `en` half is left to the rule in `SKILL.md`.

    A line with no Latin letter is skipped too. An id, a path or a count has no
    language to be wrong about, and naming one would spend the прогон's
    attention on nothing.
    """
    found = []
    if not isinstance(state, dict) or state.get('language') != 'ru':
        return found
    for field, key, many in SPOKEN:
        entries = state.get(field)
        if not isinstance(entries, list):
            continue
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            value = entry.get(key)
            lines = value if many and isinstance(value, list) else [value]
            for at, line in enumerate(lines):
                if not isinstance(line, str) or not LATIN.search(line):
                    continue
                if CYRILLIC.search(line):
                    continue
                where = '%s[%d].%s' % (field, index, key)
                if many:
                    where += '[%d]' % at
                found.append((where, line))
    return found


def fingerprint_equal(left, right):
    """Compare declared current inputs without depending on JSON key order."""
    if not isinstance(left, dict) or not isinstance(right, dict):
        return False
    names = ('reference', 'build', 'data', 'runtime', 'acceptanceInput')
    return all(left.get(name) == right.get(name) for name in names) and (
        sorted(left.get('relevantPaths', [])) == sorted(right.get('relevantPaths', []))
        and left.get('inputHashes') == right.get('inputHashes'))


def derive_verification(state):
    """The deterministic v4/v5 verdict; no file reads and no invented records."""
    record = state['verification']
    target = record['targetRevision']
    obligations = [item for item in record['obligations'] if item['targetRevision'] == target]
    check_results = {}
    effective = {}
    for check in record['checks']:
        candidates = [item for item in record['executions'] if item['checkId'] == check['id']]
        superseded = {item.get('supersedes') for item in candidates}
        live = [item for item in candidates if item['id'] not in superseded]
        live.sort(key=lambda item: (item['executedAt'], item['id']), reverse=True)
        execution = live[0] if live else None
        effective[check['id']] = execution
        if record['version'] == 2 and check['currentFingerprint']['acceptanceInput'] != record['acceptanceInputDigest']:
            result = 'stale'
        elif execution is None:
            result = 'not_run'
        elif not fingerprint_equal(execution['fingerprint'], check['currentFingerprint']):
            result = 'stale'
        else:
            result = execution['result']
        check_results[check['id']] = result

    obligation_results = {}
    for obligation in obligations:
        required = [check for check in record['checks'] if check['required']
                    and check['id'] in obligation['checkIds']]
        contradicted = any(item['status'] == 'open'
                           and obligation['id'] in item['obligationIds']
                           for item in record['findings'])
        extension = extension_results(record, obligation, effective, check_results)
        if contradicted or 'failed' in extension or any(check_results[check['id']] == 'failed' for check in required):
            result = 'failed'
        elif obligation['discovery'] == 'unresolved' or not required or any(result != 'passed' for result in extension):
            result = 'incomplete'
        elif all(check_results[check['id']] == 'passed' for check in required):
            result = 'passed'
        else:
            result = 'incomplete'
        obligation_results[obligation['id']] = result

    requirement_results = {}
    for requirement in state['requirements']:
        if requirement['status'] in ('dropped', 'deferred'):
            continue
        own = [item for item in obligations if requirement['id'] in item['requirementIds']]
        finding = any(item['status'] == 'open' and requirement['id'] in item['requirementIds']
                      for item in record['findings'])
        reviews = [item for item in record['coverageReviews']
                   if item['requirementId'] == requirement['id']
                   and item['inputDigest'] == record['acceptanceInputDigest']
                   and item['targetRevision'] == target]
        reviews.sort(key=lambda item: item['reviewedAt'], reverse=True)
        review = reviews[0] if reviews else None
        own_results = [obligation_results[item['id']] for item in own]
        if finding or 'failed' in own_results:
            result = 'failed'
        elif not own or review is None or review['status'] != 'complete' or 'incomplete' in own_results:
            result = 'incomplete'
        else:
            result = 'passed'
        requirement_results[requirement['id']] = result

    failed_ids = [key for key, value in requirement_results.items() if value == 'failed']
    incomplete_ids = [key for key, value in requirement_results.items() if value == 'incomplete']
    rounds = [item for item in record['acceptanceRounds']
              if item['targetRevision'] == target
              and item['inputDigest'] == record['acceptanceInputDigest']]
    rounds.sort(key=lambda item: item['performedAt'], reverse=True)
    current_round = rounds[0] if rounds else None
    required_checks = [check for check in record['checks'] if check['required']
                       and any(check['id'] in item['checkIds'] for item in obligations)]
    round_current = current_round is not None
    if round_current:
        round_current = all(ref['id'] in current_round['referenceIds']
                            for ref in record['references']
                            if ref['role'] == 'authoritative_behavior')
        round_current = round_current and all(
            effective[check['id']] is not None
            and effective[check['id']]['id'] in current_round['executionIds']
            and fingerprint_equal(effective[check['id']]['fingerprint'], check['currentFingerprint'])
            for check in required_checks)
        round_current = round_current and all(
            review['id'] in current_round['coverageReviewIds']
            for review in record['coverageReviews']
            if review['inputDigest'] == record['acceptanceInputDigest']
            and review['targetRevision'] == target
            and review['requirementId'] in requirement_results)
        round_current = round_current and all(
            item['id'] in current_round['findingIds']
            for item in record['findings'] if item['status'] == 'open')
    promises_open = any(item['status'] == 'open' for item in record['promisedWork'])
    if failed_ids:
        g4 = 'failed'
    elif (not requirement_results or incomplete_ids or not round_current or promises_open
          or (record['version'] == 2 and (not record.get('scopeBaseline') or not fresh_manifest_audit(record, [item['id'] for item in state['requirements']])))):
        g4 = 'pending'
    else:
        g4 = 'passed'
    result = {'checkResults': check_results, 'obligationResults': obligation_results,
              'requirementResults': requirement_results, 'failedIds': failed_ids,
              'incompleteIds': incomplete_ids, 'g4': g4}
    if round_current:
        result['currentRoundId'] = current_round['id']
    log('DEBUG', 'derive', 'verification derived',
        {'runId': state.get('runId'), 'g4': g4, 'failedIds': failed_ids,
         'incompleteIds': incomplete_ids})
    return result


def derive_scope_progress(state, summary=None):
    """Frozen original expectations, separate from authorized current commitments."""
    record = state.get('verification')
    if summary is None and state.get('contractVersion', 0) >= 4 and record:
        summary = derive_verification(state)
    requirements = state.get('requirements', [])
    current_ids = [item['id'] for item in requirements if item['status'] not in ('deferred', 'dropped')]
    baseline = record.get('scopeBaseline') if record and record['version'] == 2 else None
    original_ids = baseline['requirementIds'] if baseline else []

    def original_pass(identity):
        if not baseline or not summary:
            return False
        planning = next((item for item in requirements if item['id'] == identity), None)
        if not planning or planning['status'] in ('deferred', 'dropped'):
            return False
        if any(item['status'] == 'open' and identity in item['requirementIds'] for item in record['findings']):
            return False
        mappings = [item for item in record['scopeMappings'] if item['originalRequirementId'] == identity
                    and item['targetRevision'] == record['targetRevision']]
        mapping = mappings[-1] if mappings else None
        initial = next((item['targetRevision'] for item in record['manifestAudits']
                        if item['id'] == baseline['auditId']), 1)
        if record['targetRevision'] > initial and not mapping:
            return False
        if mapping and mapping['relation'] == 'withdrawn':
            return False
        current = mapping['currentRequirementIds'] if mapping else [identity]
        if not current or any(summary['requirementResults'].get(item) != 'passed' for item in current):
            return False
        expectation = next((item for item in baseline['expectations'] if item['requirementId'] == identity), None)
        if not expectation or not expectation['clauseIds']:
            return False
        changed = mapping and mapping['relation'] != 'unchanged'
        checks = mapping['originalCheckIds'] if changed else list(dict.fromkeys(
            expectation.get('checkIds', []) + (mapping['originalCheckIds'] if mapping else [])))
        if changed and not checks:
            return False
        return all(summary['checkResults'].get(item) == 'passed' for item in checks)

    def measurement(ids, established, passed):
        return {'status': 'not-established' if not established else 'established' if ids else 'not-applicable',
                'passed': passed, 'total': len(ids), 'requirementIds': ids}

    return {'original': measurement(original_ids, bool(baseline), sum(original_pass(item) for item in original_ids)),
            'current': measurement(current_ids, summary is not None,
                                   sum(summary['requirementResults'].get(item) == 'passed' for item in current_ids) if summary else 0),
            'addedIds': [item['id'] for item in requirements if item['id'] not in original_ids] if baseline else [],
            'deferredIds': [item['id'] for item in requirements if item['status'] == 'deferred'],
            'droppedIds': [item['id'] for item in requirements if item['status'] == 'dropped'],
            'changedIds': list(dict.fromkeys(item['originalRequirementId'] for item in record['scopeMappings']
                            if item['targetRevision'] == record['targetRevision'] and item['relation'] in ('changed', 'split')))
                            if record and record['version'] == 2 else [],
            'exceptionDecisionIds': [item['id'] for item in record['decisions'] if item['kind'] == 'accepted_exception'] if record else []}


def text_digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def oracle_digest(check):
    return text_digest(json.dumps([check['procedure'], check['oracle'], check.get('ignoreMask', [])],
                                  ensure_ascii=False, separators=(',', ':')))


def same_ids(left, right):
    return len(set(left)) == len(left) and len(left) == len(right) and set(left) == set(right)


def fresh_manifest_audit(record, requirement_ids=()):
    sources = record['sourceSnapshots']
    candidates = [audit for audit in record['manifestAudits']
        if audit['targetRevision'] == record['targetRevision']
        and audit['manifestDigest'] == record['manifestDigest']
        and same_ids(audit['sourceIds'], [source['id'] for source in sources])
        and all(audit['sourceDigests'].get(source['id']) == source['sha256'] for source in sources)]
    if not sources or not candidates:
        return False
    audit = candidates[-1]
    if (audit['result'] != 'passed' or not audit['clauseIds'] or audit['findings']
            or not all(audit.get(name, '').strip() for name in ('dispatchId', 'readerId', 'returnId'))):
        return False
    known = {clause['id']: clause for clause in record['sourceClauses']}
    clauses = [known.get(identity) for identity in audit['clauseIds']]
    return (all(clause and clause['sourceId'] in audit['sourceIds']
                and (clause['classification'] == 'context' or clause['requirementIds']) for clause in clauses)
            and all(any(clause and clause['sourceId'] == source['id'] for clause in clauses) for source in sources)
            and all(any(clause and identity in clause['requirementIds'] for clause in clauses) for identity in requirement_ids))


def extension_results(record, obligation, effective, check_results):
    """Control failures do not rewrite the healthy production check result."""
    if record['version'] != 2:
        return []
    results = []
    superseded = {item.get('supersedes') for item in record['negativeControls']}
    required = {check['id'] for check in record['checks'] if check['required']
                and check['id'] in obligation['checkIds']}
    checks = {check['id']: check for check in record['checks']}
    for control in record['negativeControls']:
        if (control['id'] in superseded or control['targetRevision'] != record['targetRevision']
                or control['checkId'] not in required):
            continue
        check = checks.get(control['checkId'])
        if (not check or not fingerprint_equal(control['mainFingerprint'], check['currentFingerprint'])
                or control['oracleDigest'] != oracle_digest(check)):
            results.append('incomplete')
        else:
            results.append(control['result'] if control['result'] in ('passed', 'failed') else 'incomplete')
    for journey in record['journeys']:
        if journey['targetRevision'] != record['targetRevision'] or obligation['id'] not in journey['obligationIds']:
            continue
        statuses = [check_results.get(identity) for identity in journey['checkIds']]
        assertions = [assertion for identity in journey['checkIds']
                      for assertion in (effective.get(identity) or {}).get('assertions', [])]
        if 'failed' in statuses:
            results.append('failed')
        elif not statuses or any(status != 'passed' for status in statuses):
            results.append('incomplete')
        elif any(any(item['name'] == step['assertion'] and item['result'] == 'failed'
                     for item in assertions) for step in journey['steps']):
            results.append('failed')
        elif all(any(item['name'] == step['assertion'] and item['result'] == 'passed'
                     for item in assertions) for step in journey['steps']):
            results.append('passed')
        else:
            results.append('incomplete')
    return results


def validate_extension(state):
    """Version-2 source and completion graph; never executes checks or diagnoses."""
    record = state['verification']
    errors = []

    def add(field, message):
        errors.append({'field': field, 'message': message})
        log('ERROR', 'extension', message, {'field': field})

    def strings(value):
        return isinstance(value, list) and all(isinstance(item, str) for item in value)

    def moment(value):
        if not isinstance(value, str):
            return False
        try:
            datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
            return True
        except ValueError:
            return False

    def fingerprint(value, at):
        if (not isinstance(value, dict)
                or not all(isinstance(value.get(name), str) and value[name]
                           for name in ('reference', 'build', 'data', 'runtime', 'acceptanceInput'))
                or not strings(value.get('relevantPaths')) or not isinstance(value.get('inputHashes'), dict)):
            add(at, 'fingerprint needs identity, paths and input hash map')
            return
        if (len(set(value['relevantPaths'])) != len(value['relevantPaths'])
                or set(value['relevantPaths']) != set(value['inputHashes'])
                or any(not isinstance(hash_value, str) or not re.fullmatch('[a-f0-9]{64}', hash_value)
                       for hash_value in value['inputHashes'].values())):
            add(at, 'input hashes must match unique relevant paths exactly')

    # Validate nested shapes before any typed graph traversal.
    shapes = {
        'sourceSnapshots': ('id origin text sha256 capturedAt', '', 'targetRevision'),
        'sourceClauses': ('id sourceId quote classification', 'requirementIds', 'start end'),
        'manifestAudits': ('id manifestDigest result auditedAt', 'sourceIds clauseIds findings', 'targetRevision'),
        'scopeMappings': ('id originalRequirementId relation', 'currentRequirementIds originalCheckIds', 'targetRevision'),
        'journeys': ('id fixture executionTaskId reset cleanup', 'requirementIds obligationIds checkIds variantIds integrationDependencies', 'targetRevision'),
        'negativeControls': ('id checkId selectionBasis applicability defect expectedAssertion isolationFingerprint oracleDigest result', '', 'targetRevision'),
        'repairAttempts': ('rootFindingId hypothesis diagnosis strategy action', 'evidenceIds followUpCheckIds', ''),
    }
    for name, (string_fields, arrays, counts) in shapes.items():
        rows = record.get(name)
        if not isinstance(rows, list):
            add('verification.' + name, 'collection must be an array')
            continue
        seen = set()
        for index, item in enumerate(rows):
            at = 'verification.%s[%d]' % (name, index)
            if not isinstance(item, dict):
                add(at, 'entry must be an object')
                continue
            for field in string_fields.split():
                if not isinstance(item.get(field), str) or not item[field]:
                    add(at + '.' + field, 'nonempty string is required')
            for field in arrays.split():
                if not strings(item.get(field)):
                    add(at + '.' + field, 'string array is required')
            for field in counts.split():
                if type(item.get(field)) is not int:
                    add(at + '.' + field, 'integer is required')
            for field in ('dispatchId', 'readerId', 'returnId', 'limitation', 'predecessorId',
                          'diagnosisDispatchId', 'diagnosisReturnId', 'novelty', 'exclusionReason',
                          'decisionId', 'findingId', 'supersedes'):
                if field in item and not isinstance(item[field], str):
                    add(at + '.' + field, 'optional field must be a string')
            identity = item.get('id')
            if not isinstance(identity, str) or identity in seen:
                add(at + '.id', 'ID must be unique and a string')
            else:
                seen.add(identity)
            if name == 'manifestAudits' and (not isinstance(item.get('sourceDigests'), dict)
                    or any(not isinstance(value, str) for value in item.get('sourceDigests', {}).values())):
                add(at + '.sourceDigests', 'source digest map is required')
            if name == 'journeys' and (not isinstance(item.get('steps'), list)
                    or any(not isinstance(step, dict) or not all(isinstance(step.get(field), str)
                               and step[field].strip() for field in ('action', 'assertion'))
                           for step in item.get('steps', []))):
                add(at + '.steps', 'ordered steps need actions and assertions')
            if name == 'negativeControls':
                fingerprint(item.get('mainFingerprint'), at + '.mainFingerprint')
                if not isinstance(item.get('runs'), list):
                    add(at + '.runs', 'control runs must be an array')
                    continue
                for run in item['runs']:
                    if not isinstance(run, dict):
                        add(at + '.runs', 'control run must be an object')
                        continue
                    for field in ('id', 'phase', 'result', 'oracleDigest', 'executedAt', 'executor', 'invocation'):
                        if not isinstance(run.get(field), str) or not run[field]:
                            add(at + '.runs.' + field, 'nonempty string is required')
                    if not strings(run.get('evidenceIds')):
                        add(at + '.runs.evidenceIds', 'evidence IDs required')
                    if (not isinstance(run.get('assertions'), list)
                            or any(not isinstance(assertion, dict) or not isinstance(assertion.get('name'), str)
                                   or assertion.get('result') not in ('passed', 'failed')
                                   or not strings(assertion.get('evidenceIds'))
                                   for assertion in run.get('assertions', []))):
                        add(at + '.runs.assertions', 'assertions need name, result and evidence IDs')
                    fingerprint(run.get('fingerprint'), at + '.runs.fingerprint')
    baseline = record.get('scopeBaseline')
    if baseline is not None:
        if not isinstance(baseline, dict):
            add('verification.scopeBaseline', 'baseline must be an object')
        else:
            for field in ('id', 'manifestDigest', 'auditId', 'agreementId', 'agreedAt'):
                if not isinstance(baseline.get(field), str) or not baseline[field]:
                    add('verification.scopeBaseline.' + field, 'nonempty string is required')
            for field in ('sourceIds', 'requirementIds'):
                if not strings(baseline.get(field)):
                    add('verification.scopeBaseline.' + field, 'string array is required')
            if (not isinstance(baseline.get('expectations'), list)
                    or any(not isinstance(item, dict) or not isinstance(item.get('requirementId'), str)
                           or not isinstance(item.get('text'), str) or not item['text']
                           or not strings(item.get('clauseIds')) or not strings(item.get('checkIds'))
                           for item in baseline.get('expectations', []))):
                add('verification.scopeBaseline.expectations', 'original expectations need requirement/text/clauses/checks')
    if not isinstance(record.get('manifestDigest'), str) or not re.fullmatch('[a-f0-9]{64}', record['manifestDigest']):
        add('verification.manifestDigest', 'manifest SHA-256 is required')
    if errors:
        return errors

    known = {name: {item['id']: item for item in record[name]} for name in shapes}
    known.update({name: {item['id']: item for item in record[name]}
                  for name in ('checks', 'obligations', 'evidence', 'findings', 'decisions')})
    known['requirements'] = {item['id']: item for item in state['requirements']}
    known['tasks'] = {item['id']: item for item in state['tasks']}

    def refs(at, values, name):
        if len(set(values)) != len(values):
            add(at, 'linked IDs must be unique')
        for identity in values:
            if identity not in known[name]:
                add(at, 'unknown ID %s' % identity)

    def revision(at, item):
        if not 1 <= item['targetRevision'] <= record['targetRevision']:
            add(at, 'target revision is out of range')

    for source in record['sourceSnapshots']:
        at = 'verification.sourceSnapshots[%s]' % source['id']
        if not re.fullmatch('SRC-[1-9][0-9]*', source['id']) or source['origin'] not in ('initial', 'addition'):
            add(at, 'invalid source identity/origin')
        if source['sha256'] != text_digest(source['text']):
            add(at, 'source SHA-256 must match exact redacted text')
        if not moment(source['capturedAt']):
            add(at, 'timestamp must name a moment')
        revision(at, source)
    if sum(source['origin'] == 'initial' for source in record['sourceSnapshots']) > 1:
        add('verification.sourceSnapshots', 'only one initial source is allowed')
    for clause in record['sourceClauses']:
        at = 'verification.sourceClauses[%s]' % clause['id']
        refs(at, [clause['sourceId']], 'sourceSnapshots')
        refs(at, clause['requirementIds'], 'requirements')
        text = known['sourceSnapshots'].get(clause['sourceId'], {}).get('text', '')
        if (not re.fullmatch('CL-[1-9][0-9]*', clause['id']) or clause['start'] < 0
                or clause['end'] <= clause['start'] or clause['end'] > len(text)
                or text[clause['start']:clause['end']] != clause['quote']):
            add(at, 'clause offsets/quote must match source code points')
        if clause['classification'] not in ('requirement', 'context'):
            add(at, 'unknown clause classification')
        if clause['classification'] == 'context' and (not clause.get('exclusionReason', '').strip() or clause['requirementIds']):
            add(at, 'context requires reason and no R IDs')
    dispatches, returns = set(), set()
    for audit in record['manifestAudits']:
        at = 'verification.manifestAudits[%s]' % audit['id']
        refs(at, audit['sourceIds'], 'sourceSnapshots')
        refs(at, audit['clauseIds'], 'sourceClauses')
        if (not same_ids(list(audit['sourceDigests']), audit['sourceIds'])
                or any(audit['sourceDigests'].get(identity) != known['sourceSnapshots'].get(identity, {}).get('sha256') for identity in audit['sourceIds'])):
            add(at, 'audit source digests must match sources exactly')
        if not re.fullmatch('MA-[1-9][0-9]*', audit['id']) or not re.fullmatch('[a-f0-9]{64}', audit['manifestDigest']):
            add(at, 'invalid audit ID/manifest digest')
        revision(at, audit)
        if audit['result'] not in ('passed', 'failed', 'incomplete'):
            add(at, 'unknown audit result')
        if audit['result'] == 'passed' and (not all(audit.get(name, '').strip() for name in ('dispatchId', 'readerId', 'returnId'))
                or audit['findings'] or not audit['sourceIds'] or not audit['clauseIds']):
            add(at, 'passed audit needs independent returned identity and complete mappings')
        if audit['result'] == 'failed' and not audit['findings']:
            add(at, 'failed audit needs findings')
        if audit['result'] == 'incomplete' and not audit.get('limitation', '').strip():
            add(at, 'incomplete audit needs limitation')
        if any(known['sourceClauses'].get(identity, {}).get('sourceId') not in audit['sourceIds'] for identity in audit['clauseIds']):
            add(at, 'audit clauses must belong to its sources')
        for field, seen in (('dispatchId', dispatches), ('returnId', returns)):
            identity = audit.get(field)
            if identity:
                if identity in seen:
                    add(at, 'audit dispatch/return cannot be reused')
                seen.add(identity)
        if not moment(audit['auditedAt']):
            add(at, 'timestamp must name a moment')
    if baseline is not None:
        at = 'verification.scopeBaseline'
        refs(at, baseline['sourceIds'], 'sourceSnapshots')
        refs(at, baseline['requirementIds'], 'requirements')
        audit = known['manifestAudits'].get(baseline['auditId'])
        if (not audit or audit['result'] != 'passed' or audit['manifestDigest'] != baseline['manifestDigest']
                or not audit.get('dispatchId') or not audit.get('returnId') or not re.fullmatch('AG-[1-9][0-9]*', baseline['agreementId'])):
            add(at, 'baseline needs audited manifest and actual agreement')
        if len(baseline['sourceIds']) != 1 or any(known['sourceSnapshots'].get(identity, {}).get('origin') != 'initial' for identity in baseline['sourceIds']):
            add(at, 'baseline freezes the initial source only')
        if not same_ids([item['requirementId'] for item in baseline['expectations']], baseline['requirementIds']):
            add(at, 'baseline must freeze one expectation per original requirement')
        for expectation in baseline['expectations']:
            refs(at, expectation['clauseIds'], 'sourceClauses')
            refs(at, expectation['checkIds'], 'checks')
            if not expectation['clauseIds'] or any(known['sourceClauses'].get(identity, {}).get('sourceId') not in baseline['sourceIds']
                    or identity not in (audit or {}).get('clauseIds', [])
                    or expectation['requirementId'] not in known['sourceClauses'].get(identity, {}).get('requirementIds', []) for identity in expectation['clauseIds']):
                add(at, 'original expectations need matching initial requirement clauses')
        original = {identity for clause in record['sourceClauses'] if clause['id'] in (audit or {}).get('clauseIds', []) and clause['sourceId'] in baseline['sourceIds'] and clause['classification'] == 'requirement' for identity in clause['requirementIds']}
        if not same_ids(list(original), baseline['requirementIds']):
            add(at, 'baseline cannot omit initial requirements')
        if not moment(baseline['agreedAt']):
            add(at, 'timestamp must name a moment')
    for mapping in record['scopeMappings']:
        at = 'verification.scopeMappings[%s]' % mapping['id']
        if not baseline or mapping['originalRequirementId'] not in baseline['requirementIds']:
            add(at, 'mapping needs original requirement')
        refs(at, mapping['currentRequirementIds'], 'requirements')
        refs(at, mapping['originalCheckIds'], 'checks')
        revision(at, mapping)
        if mapping['relation'] not in ('unchanged', 'changed', 'split', 'withdrawn'):
            add(at, 'unknown scope relation')
        if mapping['relation'] != 'unchanged':
            decision = known['decisions'].get(mapping.get('decisionId'))
            if not decision or decision['kind'] != 'scope_amendment' or decision.get('targetRevision') != mapping['targetRevision']:
                add(at, 'changed scope mapping needs authorized amendment')
        if ((mapping['relation'] == 'withdrawn' and mapping['currentRequirementIds'])
                or (mapping['relation'] != 'withdrawn' and not mapping['currentRequirementIds'])):
            add(at, 'scope mapping current IDs disagree with relation')
    if (state.get('outcome') == 'completed' or any(gate['id'] == 'G1' and gate['status'] == 'passed' for gate in state['gates'])) and (
            not fresh_manifest_audit(record, known['requirements']) or not baseline):
        add('gates[G1].status', 'passing G1 requires fresh independent source audit and frozen agreement')

    for journey in record['journeys']:
        at = 'verification.journeys[%s]' % journey['id']
        if not re.fullmatch('J-[1-9][0-9]*', journey['id']):
            add(at, 'journey ID must use J-N')
        for field, name in (('requirementIds', 'requirements'), ('obligationIds', 'obligations'), ('checkIds', 'checks'), ('integrationDependencies', 'tasks')):
            refs(at, journey[field], name)
        refs(at, [journey['executionTaskId']], 'tasks')
        revision(at, journey)
        if any(not journey[name] for name in ('requirementIds', 'obligationIds', 'checkIds', 'steps')):
            add(at, 'journey requires graph and ordered steps')
        for identity in journey['checkIds']:
            check = known['checks'].get(identity)
            if (not check or not check['required'] or check.get('executionTaskId') != journey['executionTaskId']
                    or not set(journey['obligationIds']).issubset(check['obligationIds'])
                    or not set(journey['integrationDependencies']).issubset(check['integrationDependencies'])):
                add(at, 'journey check needs required matching ownership/links')
            if check:
                positions = [check['procedure'].index(step['action']) if step['action'] in check['procedure'] else -1 for step in journey['steps']]
                if -1 in positions or any(right <= left for left, right in zip(positions, positions[1:])):
                    add(at, 'journey check must execute ordered actions')
        for identity in journey['obligationIds']:
            obligation = known['obligations'].get(identity)
            if obligation and (obligation['targetRevision'] != journey['targetRevision']
                    or not set(journey['requirementIds']).intersection(obligation['requirementIds'])
                    or not set(journey['checkIds']).intersection(obligation['checkIds'])):
                add(at, 'journey obligations need matching requirements/checks/revision')
    run_ids = {item['id'] for item in record['executions']}
    for index, control in enumerate(record['negativeControls']):
        at = 'verification.negativeControls[%s]' % control['id']
        refs(at, [control['checkId']], 'checks')
        revision(at, control)
        if not re.fullmatch('NC-[1-9][0-9]*', control['id']):
            add(at, 'control ID must use NC-N')
        check = known['checks'].get(control['checkId'])
        if not check or not check['required']:
            add(at, 'control needs required check')
        if control['selectionBasis'] not in ('user_condition', 'acceptance_critical', 'severe_defect'):
            add(at, 'control needs critical selection basis')
        if control['result'] not in ('not_run', 'passed', 'failed', 'unavailable'):
            add(at, 'unknown control result')
        if not re.fullmatch('[a-f0-9]{64}', control['isolationFingerprint']) or control['isolationFingerprint'] == control['mainFingerprint']['build']:
            add(at, 'control needs separate disposable identity')
        if not re.fullmatch('[a-f0-9]{64}', control['oracleDigest']):
            add(at, 'control needs oracle SHA-256')
        if control['result'] == 'unavailable' and not control.get('limitation', '').strip():
            add(at, 'unavailable control needs limitation')
        if control.get('supersedes'):
            previous = next((item for item in record['negativeControls'][:index] if item['id'] == control['supersedes']), None)
            if not previous or any(previous[field] != control[field] for field in ('checkId', 'selectionBasis', 'targetRevision', 'applicability', 'defect', 'expectedAssertion')):
                add(at, 'control supersession cannot change selection identity')
            if sum(item.get('supersedes') == control['supersedes'] for item in record['negativeControls']) > 1:
                add(at, 'control supersession cannot fork')
        if control.get('findingId'):
            refs(at, [control['findingId']], 'findings')
        if control['result'] == 'failed':
            finding = known['findings'].get(control.get('findingId'))
            if not finding or control['checkId'] not in finding['checkIds']:
                add(at, 'failed detector needs linked check-quality finding')
        if control['result'] in ('passed', 'failed'):
            if [run['phase'] for run in control['runs']] != ['clean', 'mutated', 'restored']:
                add(at, 'finished control needs ordered clean/mutated/restored runs')
            elif control['result'] == 'passed':
                clean, mutated, restored = control['runs']
                if (clean['result'] != 'passed' or restored['result'] != 'passed' or mutated['result'] != 'failed'
                        or not any(item['name'] == control['expectedAssertion'] and item['result'] == 'failed' for item in mutated['assertions'])):
                    add(at, 'passed control must detect expected assertion between clean/restored passes')
        elif control['result'] == 'not_run' and control['runs']:
            add(at, 'not-run selection cannot claim runs')
        for run in control['runs']:
            if run['id'] in run_ids:
                add(at, 'control run must be separate from production/other runs')
            run_ids.add(run['id'])
            refs(at, run['evidenceIds'], 'evidence')
            if run['phase'] not in ('clean', 'mutated', 'restored') or run['result'] not in ('passed', 'failed'):
                add(at, 'unknown control run phase/result')
            if not run['evidenceIds'] or not run['assertions'] or not moment(run['executedAt']):
                add(at, 'control needs assertions/captures/timestamp')
            if run['oracleDigest'] != control['oracleDigest']:
                add(at, 'control oracle must be unchanged')
            if run['result'] == 'passed' and any(item['result'] == 'failed' for item in run['assertions']):
                add(at, 'passing control contains failed assertion')
            if run['result'] == 'failed' and not any(item['result'] == 'failed' for item in run['assertions']):
                add(at, 'failed control must name failed assertion')
            if run['phase'] != 'mutated' and not fingerprint_equal(run['fingerprint'], control['mainFingerprint']):
                add(at, 'clean/restored copy must match main input identity')
            if run['phase'] == 'mutated' and run['fingerprint']['build'] == control['mainFingerprint']['build']:
                add(at, 'mutated copy needs distinct build identity')
            for assertion in run['assertions']:
                if not assertion['evidenceIds'] or not set(assertion['evidenceIds']).issubset(run['evidenceIds']):
                    add(at, 'assertion evidence must belong to control run')
            for identity in run['evidenceIds']:
                capture = known['evidence'].get(identity)
                if not capture or capture['origin'] != 'execution' or not capture['path'].startswith('evidence/%s/' % run['id']):
                    add(at, 'control capture must use separate run ID')
    if record['repairLimits']['perFinding'] > 2:
        add('verification.repairLimits', 'per-root retry ceiling is two')
    latest = {}
    for attempt in record['repairAttempts']:
        at = 'verification.repairAttempts[%s]' % attempt['id']
        root, seen = attempt['findingId'], set()
        while known['findings'].get(root, {}).get('supersedes'):
            if root in seen:
                add('verification.findings', 'stable finding chain contains cycle')
                break
            seen.add(root)
            root = known['findings'][root]['supersedes']
        if attempt['rootFindingId'] != root:
            add(at, 'attempt must retain stable root')
        refs(at, attempt['evidenceIds'], 'evidence')
        refs(at, attempt['followUpCheckIds'], 'checks')
        if not re.fullmatch('RA-[1-9][0-9]*', attempt['id']) or not attempt['evidenceIds'] or not attempt['followUpCheckIds']:
            add(at, 'repair needs stable ID/evidence/follow-up checks')
        if attempt['strategy'] not in ('minimal_reproduction', 'interface_verification', 'dependency_correction', 'implementation_change', 'independent_executor'):
            add(at, 'unknown strategy')
        predecessor = latest.get(root)
        if attempt.get('predecessorId') != predecessor:
            add(at, 'repair predecessor must be preceding attempt for root')
        if predecessor and (not attempt.get('diagnosisDispatchId', '').strip() or not attempt.get('diagnosisReturnId', '').strip() or attempt.get('novelty') != 'accepted'):
            add(at, 'repeat repair needs returned independent accepted diagnosis')
        if attempt.get('novelty') and attempt['novelty'] not in ('accepted', 'rejected', 'unavailable'):
            add(at, 'unknown novelty')
        latest[root] = attempt['id']
    return errors


def validate_stage_timeline(state, add):
    """Stage clocks share the same handover boundary as the TypeScript reader."""
    stages = state.get('stages')
    if not isinstance(stages, list):
        return

    def moment(value):
        if not isinstance(value, str) or not value:
            return None
        try:
            clock = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
            if clock.tzinfo is None:
                clock = clock.replace(tzinfo=datetime.timezone.utc)
            # JavaScript readers compare Date.parse moments at millisecond precision.
            clock = clock.replace(microsecond=(clock.microsecond // 1000) * 1000)
            return round(clock.timestamp() * 1000)
        except (ValueError, OverflowError):
            return None

    for index, stage in enumerate(stages):
        if not isinstance(stage, dict):
            continue
        at = 'stages[%d]' % index
        status = stage.get('status')
        if stage.get('id') not in STAGE_IDS:
            add(at + '.id', 'unknown stage ID')
        for field in ('startedAt', 'finishedAt', 'note'):
            if field in stage and not isinstance(stage[field], str):
                add(at + '.' + field, 'field must be a string when present')
        started = isinstance(stage.get('startedAt'), str) and bool(stage['startedAt'])
        finished = isinstance(stage.get('finishedAt'), str) and bool(stage['finishedAt'])
        if status == 'skipped' and (not isinstance(stage.get('note'), str) or not stage['note'].strip()):
            add(at + '.note', 'skipped stage needs a reason')
        if status == 'pending':
            if started:
                add(at + '.startedAt', 'pending stage has not begun')
            if finished:
                add(at + '.finishedAt', 'pending stage has not finished')
        else:
            for field, present in (('startedAt', started), ('finishedAt', finished)):
                if present and moment(stage[field]) is None:
                    add(at + '.' + field, 'stage timestamp must name a moment')
        if status in ('active', 'done', 'failed') and not started:
            add(at + '.startedAt', 'started stage needs its opening timestamp')
        if status == 'active' and finished:
            add(at + '.finishedAt', 'active stage cannot carry a closing timestamp')
        if status == 'done' and not finished:
            add(at + '.finishedAt', 'done stage needs its closing timestamp')

    active = {stage['id'] for stage in stages if isinstance(stage, dict)
              and stage.get('status') == 'active' and stage.get('id') in STAGE_IDS}
    if len(active) > 1:
        add('stages', 'only one stage may be active')
    current = next((stage for stage in stages if isinstance(stage, dict)
                    and stage.get('id') == state.get('currentStage')), None)
    if current and current.get('status') == 'pending':
        add('currentStage', 'current stage has not begun')
    previous = None
    for stage_id in STAGE_IDS:
        stage = next((item for item in stages if isinstance(item, dict) and item.get('id') == stage_id), None)
        if stage is None:
            previous = None
            continue
        if stage.get('status') == 'skipped':
            continue
        before, previous = previous, stage
        if before is None:
            continue
        closed, opened = moment(before.get('finishedAt')), moment(stage.get('startedAt'))
        if closed is None and opened is not None:
            add('stages[%s].finishedAt' % before['id'], 'previous stage is still open after the next began')
        elif closed is not None and opened is not None and closed != opened:
            add('stages[%s].startedAt' % stage_id,
                'stage clocks overlap' if opened < closed else 'gap between stage clocks belongs to no stage')


def validate_candidate(state):
    """Pure graph and closure validation equivalent to scripts/state/validate.ts."""
    errors = []

    def add(field, message):
        errors.append({'field': field, 'message': message})
        log('ERROR', 'validate', message, {'field': field})

    if not isinstance(state, dict):
        add('', 'state must be an object')
        return errors, None
    if state.get('contractVersion') not in (4, 5):
        add('contractVersion', 'publication requires contract version 4 or 5')
    for field in ('runId', 'slug', 'startedAt', 'updatedAt'):
        if not isinstance(state.get(field), str) or not state[field]:
            add(field, '%s must be a non-empty string' % field)
    for field in ('finishedAt', 'interruptedAt', 'stopReason'):
        if field in state and not isinstance(state[field], str):
            add(field, '%s must be a string when present' % field)
    if 'heldBy' in state:
        holder = state['heldBy']
        if (not isinstance(holder, dict) or not isinstance(holder.get('token'), str)
                or not holder.get('token') or not isinstance(holder.get('since'), str)):
            add('heldBy', 'heldBy must name a token and since timestamp')
        else:
            try:
                datetime.datetime.fromisoformat(holder['since'].replace('Z', '+00:00'))
            except (TypeError, ValueError):
                add('heldBy.since', 'holder timestamp must name a moment')
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', state.get('slug', '')):
        add('slug', 'contract-4 slug must be a canonical safe path segment')
    if state.get('lifecycle') not in LIFECYCLES:
        add('lifecycle', 'lifecycle must be active or closed')
    if state.get('mode') not in ('full', 'semi', 'interview', 'manual'):
        add('mode', 'unknown mode')
    if state.get('depth') not in ('strict', 'normal', 'deep'):
        add('depth', 'unknown depth')
    if not isinstance(state.get('polish'), bool):
        add('polish', 'polish must be boolean')
    for field, allowed in CHECKED:
        entries = state.get(field)
        if not isinstance(entries, list):
            add(field, '%s must be an array' % field)
            continue
        for index, item in enumerate(entries):
            if not isinstance(item, dict):
                add('%s[%d]' % (field, index), 'entry must be an object')
            elif item.get('status') not in allowed:
                add('%s[%d].status' % (field, index), 'unknown status')
    if state.get('currentStage') not in STAGE_IDS:
        add('currentStage', 'unknown current stage')
    validate_stage_timeline(state, add)
    if not isinstance(state.get('dialChanges'), list):
        add('dialChanges', 'dial changes must be an array')
    if not isinstance(state.get('additions'), list):
        add('additions', 'additions must be an array')
    debt = state.get('debt')
    if not isinstance(debt, dict) or any(not isinstance(debt.get(name), list)
                                         for name in ('placeholders', 'assumptions', 'emptyEnv')):
        add('debt', 'debt needs three arrays')
    for index, item in enumerate(state.get('tasks', []) if isinstance(state.get('tasks'), list) else []):
        if not isinstance(item, dict):
            continue
        at = 'tasks[%d]' % index
        if not isinstance(item.get('id'), str) or not item['id']:
            add(at + '.id', 'task ID is required')
        if not isinstance(item.get('title'), str) or not item['title']:
            add(at + '.title', 'task title is required')
        for name in ('requirementIds', 'blockedBy', 'zone', 'files', 'commits'):
            if not isinstance(item.get(name), list) or any(
                    not isinstance(part, str) for part in item.get(name, [])):
                add(at + '.' + name, 'field must contain strings')
        if not isinstance(item.get('wave'), int) or item['wave'] < 1:
            add(at + '.wave', 'wave must be positive')
        for name in ('retries', 'repairs', 'handoffs'):
            if not isinstance(item.get(name), int) or item[name] < 0:
                add(at + '.' + name, 'counter must be non-negative')
    for index, item in enumerate(state.get('requirements', [])
                                 if isinstance(state.get('requirements'), list) else []):
        if not isinstance(item, dict):
            continue
        at = 'requirements[%d]' % index
        if not isinstance(item.get('id'), str) or not item['id']:
            add(at + '.id', 'requirement ID is required')
        if item.get('status') in ('open', 'deferred', 'dropped', 'placeholder') and not item.get('reason'):
            add(at + '.reason', 'planning status needs a reason')
    for index, item in enumerate(state.get('gates', []) if isinstance(state.get('gates'), list) else []):
        if isinstance(item, dict) and (not isinstance(item.get('findings'), list)
                                       or any(not isinstance(line, str)
                                              for line in item.get('findings', []))):
            add('gates[%d].findings' % index, 'presentation findings must be strings')
    if errors:
        return errors, None
    record = state.get('verification')
    if not isinstance(record, dict):
        add('verification', 'contract 4 requires a verification object')
        return errors, None
    if record.get('version') != (2 if state.get('contractVersion') == 5 else 1):
        add('verification.version', 'contract 4 requires verification 1; contract 5 requires verification 2')
    if not isinstance(record.get('targetRevision'), int) or record['targetRevision'] < 1:
        add('verification.targetRevision', 'target revision must be positive')
    if not isinstance(record.get('acceptanceInputDigest'), str) or not record['acceptanceInputDigest']:
        add('verification.acceptanceInputDigest', 'current acceptance input digest is required')
    shapes = {
        'references': ('id', 'statement', 'role', 'location', 'accessMethod', 'available',
                       'revision', 'conditions', 'approvedDeviationIds'),
        'surfaces': ('id', 'referenceId', 'source', 'inspected', 'variantIds'),
        'obligations': ('id', 'requirementIds', 'referenceIds', 'surfaceIds', 'expectation',
                        'discovery', 'sourceEvidenceIds', 'variantIds', 'checkIds',
                        'implementationTaskIds', 'targetRevision'),
        'checks': ('id', 'obligationIds', 'method', 'target', 'procedure', 'oracle',
                   'oracleEvidenceIds', 'variantIds', 'integrationDependencies',
                   'required', 'currentFingerprint'),
        'executions': ('id', 'checkId', 'result', 'fingerprint', 'invocation', 'tool',
                       'host', 'executor', 'executedAt', 'assertions', 'evidenceIds'),
        'evidence': ('id', 'path', 'sha256', 'mediaType', 'capturedAt', 'origin'),
        'findings': ('id', 'requirementIds', 'obligationIds', 'checkIds', 'evidenceIds',
                     'origin', 'description', 'status'),
        'decisions': ('id', 'kind', 'authorizedBy', 'authorizedAt', 'authorization',
                      'presentedFindingIds', 'presentedObligationIds',
                      'selectedFindingIds', 'selectedObligationIds'),
        'coverageReviews': ('id', 'requirementId', 'targetRevision', 'status',
                            'inspectedSurfaceIds', 'uninspectedSurfaceIds',
                            'reviewer', 'reviewedAt', 'inputDigest'),
        'acceptanceRounds': ('id', 'targetRevision', 'inputDigest', 'referenceIds',
                             'executionIds', 'findingIds', 'coverageReviewIds',
                             'requirementResults', 'g4', 'performedAt'),
        'promisedWork': ('id', 'description', 'status'),
        'repairAttempts': ('id', 'findingId', 'taskId', 'at', 'outcome'),
    }
    string_fields = {
        'references': ('id', 'statement', 'role', 'location', 'accessMethod', 'revision'),
        'surfaces': ('id', 'referenceId', 'source'),
        'obligations': ('id', 'expectation', 'discovery'),
        'checks': ('id', 'method', 'target', 'oracle'),
        'executions': ('id', 'checkId', 'result', 'invocation', 'tool', 'host', 'executor', 'executedAt'),
        'evidence': ('id', 'path', 'sha256', 'mediaType', 'capturedAt', 'origin'),
        'findings': ('id', 'origin', 'description', 'status'),
        'decisions': ('id', 'kind', 'authorizedBy', 'authorizedAt', 'authorization'),
        'coverageReviews': ('id', 'requirementId', 'status', 'reviewer', 'reviewedAt', 'inputDigest'),
        'acceptanceRounds': ('id', 'inputDigest', 'g4', 'performedAt'),
        'promisedWork': ('id', 'description', 'status'),
        'repairAttempts': ('id', 'findingId', 'taskId', 'at', 'outcome'),
    }
    array_fields = {
        'references': ('conditions', 'approvedDeviationIds'),
        'surfaces': ('variantIds',),
        'obligations': ('requirementIds', 'referenceIds', 'surfaceIds', 'sourceEvidenceIds',
                        'variantIds', 'checkIds', 'implementationTaskIds'),
        'checks': ('obligationIds', 'procedure', 'oracleEvidenceIds', 'variantIds',
                   'integrationDependencies'),
        'executions': ('assertions', 'evidenceIds'),
        'findings': ('requirementIds', 'obligationIds', 'checkIds', 'evidenceIds'),
        'decisions': ('presentedFindingIds', 'presentedObligationIds',
                      'selectedFindingIds', 'selectedObligationIds'),
        'coverageReviews': ('inspectedSurfaceIds', 'uninspectedSurfaceIds'),
        'acceptanceRounds': ('referenceIds', 'executionIds', 'findingIds',
                             'coverageReviewIds'),
    }
    for name, fields in shapes.items():
        entries = record.get(name)
        if not isinstance(entries, list):
            add('verification.' + name, 'collection must be an array')
            continue
        seen = set()
        for index, item in enumerate(entries):
            at = 'verification.%s[%d]' % (name, index)
            if not isinstance(item, dict):
                add(at, 'entry must be an object')
                continue
            for field in fields:
                if field not in item or item[field] is None:
                    add(at + '.' + field, 'required field is missing')
            for field in string_fields.get(name, ()):
                if field in item and (not isinstance(item[field], str) or not item[field]):
                    add(at + '.' + field, 'field must be a non-empty string')
            for field in array_fields.get(name, ()):
                if field in item and (not isinstance(item[field], list) or (
                        field != 'assertions' and any(not isinstance(part, str)
                                                      for part in item[field]))):
                    add(at + '.' + field, 'field must be an array of strings')
            if name == 'executions' and isinstance(item.get('assertions'), list):
                for position, assertion in enumerate(item['assertions']):
                    if (not isinstance(assertion, dict)
                            or not isinstance(assertion.get('name'), str)
                            or assertion.get('result') not in ('passed', 'failed')
                            or not isinstance(assertion.get('evidenceIds'), list)):
                        add(at + '.assertions[%d]' % position, 'assertion shape is invalid')
            if name in ('checks', 'executions'):
                fingerprint = item.get('currentFingerprint' if name == 'checks' else 'fingerprint')
                if not isinstance(fingerprint, dict) or any(
                        not isinstance(fingerprint.get(field), str) or not fingerprint[field]
                        for field in ('reference', 'build', 'data', 'runtime', 'acceptanceInput')):
                    add(at + '.fingerprint', 'fingerprint identity is required')
                elif (not isinstance(fingerprint.get('relevantPaths'), list)
                      or not isinstance(fingerprint.get('inputHashes'), dict)):
                    add(at + '.fingerprint', 'fingerprint path hashes are required')
            if name in ('obligations', 'coverageReviews', 'acceptanceRounds') and (
                    not isinstance(item.get('targetRevision'), int)
                    or item['targetRevision'] < 1):
                add(at + '.targetRevision', 'positive target revision is required')
            if name == 'checks' and not isinstance(item.get('required'), bool):
                add(at + '.required', 'required flag must be boolean')
            identity = item.get('id')
            if not isinstance(identity, str) or not identity:
                add(at + '.id', 'ID must be a non-empty string')
            elif identity in seen:
                add(at + '.id', 'duplicate ID %s' % identity)
            seen.add(identity)
    limits = record.get('repairLimits')
    if not isinstance(limits, dict) or any(
            not isinstance(limits.get(name), int) or limits[name] < 1
            for name in ('perFinding', 'total')):
        add('verification.repairLimits', 'finite positive repair limits are required')
    if errors:
        return errors, None

    ids = {name: {item['id'] for item in record[name]} for name in shapes}
    ids['tasks'] = {item.get('id') for item in state['tasks']}
    ids['requirements'] = {item.get('id') for item in state['requirements']}

    def refs(field, values, known):
        if not isinstance(values, list):
            values = [values]
        for value in values:
            if value not in ids[known]:
                add(field, 'unknown ID %s' % value)

    for index, item in enumerate(record['references']):
        at = 'verification.references[%d]' % index
        refs(at + '.approvedDeviationIds', item['approvedDeviationIds'], 'decisions')
        if not item['available'] and not item.get('limitation'):
            add(at + '.limitation', 'unavailable reference needs a limitation')
        if item['role'] not in ('authoritative_behavior', 'visual_reference',
                                'contextual_example', 'other'):
            add(at + '.role', 'unknown reference role')
        if item['role'] == 'other' and not item.get('roleDescription'):
            add(at + '.roleDescription', 'other role needs a description')
    for index, item in enumerate(record['surfaces']):
        at = 'verification.surfaces[%d]' % index
        refs(at + '.referenceId', item['referenceId'], 'references')
        if not item['inspected'] and not item.get('limitation'):
            add(at + '.limitation', 'uninspected surface needs a limitation')

    phase_order = ('preflight', 'manifest', 'briefing', 'spec', 'plan',
                   'build', 'review', 'acceptance')
    current_stage = state.get('currentStage')
    plan_finished = (current_stage in phase_order and phase_order.index(current_stage) > 4
                     or any(item.get('id') == 'plan' and item.get('status') == 'done'
                            for item in state['stages']))
    evidence_by_id = {item['id']: item for item in record['evidence']}
    for index, item in enumerate(record['obligations']):
        at = 'verification.obligations[%d]' % index
        for field, known in (('requirementIds', 'requirements'), ('referenceIds', 'references'),
                             ('surfaceIds', 'surfaces'), ('sourceEvidenceIds', 'evidence'),
                             ('checkIds', 'checks'), ('implementationTaskIds', 'tasks')):
            refs(at + '.' + field, item[field], known)
        if item['discovery'] not in ('observed', 'source_derived', 'unresolved'):
            add(at + '.discovery', 'unknown discovery status')
        if item['discovery'] == 'observed' and (not item['sourceEvidenceIds'] or any(
                evidence_by_id.get(eid, {}).get('origin') != 'reference'
                for eid in item['sourceEvidenceIds'])):
            add(at + '.sourceEvidenceIds', 'observed behavior needs reference-origin evidence')
        if item['targetRevision'] == record['targetRevision'] and plan_finished and not item['checkIds']:
            add(at, 'current obligation needs required checks after planning')
    for index, item in enumerate(record['checks']):
        at = 'verification.checks[%d]' % index
        for field, known in (('obligationIds', 'obligations'), ('oracleEvidenceIds', 'evidence'),
                             ('integrationDependencies', 'tasks')):
            refs(at + '.' + field, item[field], known)
        if item.get('executionTaskId'):
            refs(at + '.executionTaskId', item['executionTaskId'], 'tasks')
        elif plan_finished and item['required']:
            add(at + '.executionTaskId', 'required check needs an execution owner')
        if item.get('supersedes'):
            refs(at + '.supersedes', item['supersedes'], 'checks')
            if not item.get('oracleChangeBasis') and not item.get('basisDecisionId'):
                add(at, 'superseding check needs a recorded basis')
        if item.get('basisDecisionId'):
            refs(at + '.basisDecisionId', item['basisDecisionId'], 'decisions')
        if item.get('ignoreMask') and not item.get('oracleChangeBasis') and not item.get('basisDecisionId'):
            add(at + '.ignoreMask', 'ignore mask needs a recorded basis')
    for index, item in enumerate(record['executions']):
        at = 'verification.executions[%d]' % index
        refs(at + '.checkId', item['checkId'], 'checks')
        refs(at + '.evidenceIds', item['evidenceIds'], 'evidence')
        if item.get('supersedes'):
            refs(at + '.supersedes', item['supersedes'], 'executions')
        if item['result'] not in CHECK_RESULTS:
            add(at + '.result', 'unknown check result')
        if item['result'] == 'passed' and (not item['assertions'] or not item['evidenceIds']
                                           or any(assertion.get('result') == 'failed'
                                                  for assertion in item['assertions'])):
            add(at, 'passed execution needs passing assertions and evidence')
        if item['result'] == 'unavailable' and not item.get('limitation'):
            add(at + '.limitation', 'unavailable check needs a limitation')
        for assertion in item['assertions']:
            refs(at + '.assertions.evidenceIds', assertion.get('evidenceIds', []), 'evidence')
            if any(eid not in item['evidenceIds'] for eid in assertion.get('evidenceIds', [])):
                add(at + '.assertions', 'assertion evidence must belong to its execution')
    for index, item in enumerate(record['evidence']):
        at = 'verification.evidence[%d]' % index
        if item['origin'] not in ('reference', 'execution'):
            add(at + '.origin', 'unknown evidence origin')
        if item['origin'] == 'execution' and any(
                item['id'] in execution['evidenceIds']
                and not item['path'].startswith('evidence/%s/' % execution['id'])
                for execution in record['executions']):
            add(at + '.path', 'execution capture must sit under its execution ID')
    for index, item in enumerate(record['findings']):
        at = 'verification.findings[%d]' % index
        for field, known in (('requirementIds', 'requirements'), ('obligationIds', 'obligations'),
                             ('checkIds', 'checks'), ('evidenceIds', 'evidence')):
            refs(at + '.' + field, item[field], known)
        if item.get('resolutionExecutionId'):
            refs(at + '.resolutionExecutionId', item['resolutionExecutionId'], 'executions')
        if item.get('supersedes'):
            refs(at + '.supersedes', item['supersedes'], 'findings')
        if item['status'] == 'resolved' and not item.get('resolutionExecutionId'):
            add(at, 'resolved finding needs a resolving execution')
    for index, item in enumerate(record['decisions']):
        at = 'verification.decisions[%d]' % index
        for field, known in (('presentedFindingIds', 'findings'),
                             ('presentedObligationIds', 'obligations'),
                             ('selectedFindingIds', 'findings'),
                             ('selectedObligationIds', 'obligations')):
            refs(at + '.' + field, item[field], known)
        if (set(item['selectedFindingIds']) - set(item['presentedFindingIds'])
                or set(item['selectedObligationIds']) - set(item['presentedObligationIds'])):
            add(at, 'exception selection must be within displayed snapshot')
        if item['kind'] == 'scope_amendment' and (
                not item.get('previousTargetRevision') or not item.get('targetRevision')
                or item['targetRevision'] <= item['previousTargetRevision']):
            add(at, 'scope amendment must advance target revision')
    for index, item in enumerate(record['coverageReviews']):
        at = 'verification.coverageReviews[%d]' % index
        refs(at + '.requirementId', item['requirementId'], 'requirements')
        refs(at + '.inspectedSurfaceIds', item['inspectedSurfaceIds'], 'surfaces')
        refs(at + '.uninspectedSurfaceIds', item['uninspectedSurfaceIds'], 'surfaces')
        if item['status'] == 'complete' and item['uninspectedSurfaceIds']:
            add(at, 'complete coverage cannot leave uninspected surfaces')
    for index, item in enumerate(record['acceptanceRounds']):
        at = 'verification.acceptanceRounds[%d]' % index
        for field, known in (('referenceIds', 'references'), ('executionIds', 'executions'),
                             ('findingIds', 'findings'), ('coverageReviewIds', 'coverageReviews')):
            refs(at + '.' + field, item[field], known)
        if item.get('supersedes'):
            refs(at + '.supersedes', item['supersedes'], 'acceptanceRounds')
    for index, item in enumerate(record['promisedWork']):
        at = 'verification.promisedWork[%d]' % index
        if item.get('acceptanceRoundId'):
            refs(at + '.acceptanceRoundId', item['acceptanceRoundId'], 'acceptanceRounds')
        if item.get('authorizationDecisionId'):
            refs(at + '.authorizationDecisionId', item['authorizationDecisionId'], 'decisions')
        if item['status'] == 'cancelled' and not item.get('authorizationDecisionId'):
            add(at, 'cancelled promise needs user authorization')
    repair_counts = {}
    finding_by_id = {item['id']: item for item in record['findings']}
    for index, item in enumerate(record['repairAttempts']):
        at = 'verification.repairAttempts[%d]' % index
        refs(at + '.findingId', item['findingId'], 'findings')
        refs(at + '.taskId', item['taskId'], 'tasks')
        root = item['findingId']
        seen = set()
        while root in finding_by_id and finding_by_id[root].get('supersedes') and root not in seen:
            seen.add(root)
            root = finding_by_id[root]['supersedes']
        repair_counts[root] = repair_counts.get(root, 0) + 1
    if len(record['repairAttempts']) > limits['total']:
        add('verification.repairAttempts', 'overall repair budget was exceeded')
    for root, count in repair_counts.items():
        if count > limits['perFinding']:
            add('verification.repairAttempts', 'repair budget exceeded for stable failure %s' % root)
    if errors:
        return errors, None

    if record['version'] == 2:
        errors.extend(validate_extension(state))
        if errors:
            return errors, None

    summary = derive_verification(state)
    round_id = summary.get('currentRoundId')
    current_round = next((item for item in record['acceptanceRounds'] if item['id'] == round_id), None)
    if current_round:
        if current_round['requirementResults'] != summary['requirementResults']:
            add('verification.acceptanceRounds', 'stored requirement results disagree with derived results')
        if current_round['g4'] != summary['g4']:
            add('verification.acceptanceRounds', 'stored G4 disagrees with derived G4')
    g4 = next((item for item in state['gates'] if item.get('id') == 'G4'), None)
    if (record['acceptanceRounds'] or state['lifecycle'] == 'closed') and (
            g4 is None or g4.get('status') != summary['g4']):
        add('gates[G4].status', 'G4 must be %s from verification records' % summary['g4'])
    if state['lifecycle'] == 'active':
        if 'outcome' in state or 'finishedAt' in state:
            add('lifecycle', 'active state cannot have outcome or finishedAt')
    else:
        if not state.get('finishedAt'):
            add('finishedAt', 'closed state needs closure timestamp')
        if state.get('outcome') not in CLOSURE_OUTCOMES:
            add('outcome', 'closed state needs a known outcome')
        if any(item['status'] == 'open' for item in record['promisedWork']):
            add('verification.promisedWork', 'open promised work blocks closure')
        if state.get('outcome') == 'completed' and summary['g4'] != 'passed':
            add('outcome', 'completed requires verified passing G4')
        if state.get('outcome') == 'stopped_incomplete' and not state.get('stopReason'):
            add('stopReason', 'stopped incomplete run needs a reason')
        if state.get('outcome') == 'closed_with_exceptions':
            decisions = [item for item in record['decisions'] if item['kind'] == 'accepted_exception']
            accepted_findings = set().union(*(set(item['selectedFindingIds']) for item in decisions))
            accepted_obligations = set().union(*(set(item['selectedObligationIds']) for item in decisions))
            open_findings = {item['id'] for item in record['findings'] if item['status'] == 'open'}
            gaps = {key for key, result in summary['obligationResults'].items() if result != 'passed'}
            if (not decisions or not (open_findings or gaps)
                    or open_findings - accepted_findings or gaps - accepted_obligations):
                add('outcome', 'exception closure needs bounded acceptance of every gap')
    return errors, summary


def sha256_file(filename):
    digest = hashlib.sha256()
    with open(filename, 'rb') as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def safe_file(root, relative, field, errors):
    """Resolve after symlinks and insist on a regular file inside its root."""
    if (not isinstance(relative, str) or not relative or os.path.isabs(relative)
            or '..' in re.split(r'[/\\]', relative)):
        errors.append({'field': field, 'message': 'path must be relative and confined'})
        return None
    root_real = os.path.realpath(root)
    target = os.path.realpath(os.path.join(root, relative))
    if not target.startswith(root_real + os.sep):
        errors.append({'field': field, 'message': 'path escapes its declared root'})
        return None
    if not os.path.isfile(target):
        errors.append({'field': field, 'message': 'declared file is missing or unreadable'})
        return None
    return target


def validate_files(state):
    """Validate immutable capture hashes and current relevant project files."""
    record = state['verification']
    errors = []
    run_dir = os.path.join(DIR, state['slug'])
    evidence_root = os.path.join(run_dir, 'evidence')
    project_root = os.path.dirname(DIR)
    if record['evidence']:
        if (not os.path.realpath(run_dir).startswith(os.path.realpath(project_root) + os.sep)
                or not os.path.realpath(evidence_root).startswith(
                    os.path.realpath(run_dir) + os.sep)):
            return [{'field': 'verification.evidence',
                     'message': 'evidence root escapes the project run'}]
    if record['version'] == 2:
        field = 'verification.manifestDigest'
        filename = safe_file(run_dir, 'manifest.md', field, errors)
        if filename and sha256_file(filename) != record['manifestDigest']:
            errors.append({'field': field, 'message': 'manifest changed; source audit is stale'})
    for index, item in enumerate(record['evidence']):
        field = 'verification.evidence[%d].path' % index
        relative = item['path']
        if not isinstance(relative, str) or not re.fullmatch(r'evidence/[A-Za-z0-9_-]+/.+', relative):
            errors.append({'field': field, 'message': 'capture path must use evidence/<execution-id>/...'})
            continue
        expected = item['sha256']
        if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
            errors.append({'field': field, 'message': 'SHA-256 must be lowercase hex'})
            continue
        filename = safe_file(evidence_root, relative[len('evidence/'):], field, errors)
        if filename:
            try:
                actual = sha256_file(filename)
            except OSError:
                actual = None
            if actual != expected:
                errors.append({'field': field, 'message': 'capture SHA-256 does not match artifact'})

    def check_inputs(fingerprint, at):
        if not isinstance(fingerprint, dict):
            errors.append({'field': at, 'message': 'fingerprint must be an object'})
            return
        paths = fingerprint.get('relevantPaths')
        hashes = fingerprint.get('inputHashes')
        if not isinstance(paths, list) or not isinstance(hashes, dict):
            errors.append({'field': at, 'message': 'relevant paths and input hashes are required'})
            return
        if len(paths) != len(set(paths)) or set(paths) != set(hashes):
            errors.append({'field': at, 'message': 'input hashes must match unique relevant paths'})
        for relative in paths:
            field = '%s.inputHashes[%s]' % (at, json.dumps(relative))
            expected = hashes.get(relative)
            if not isinstance(expected, str) or not re.fullmatch(r'[a-f0-9]{64}', expected):
                errors.append({'field': field, 'message': 'declared SHA-256 is missing or malformed'})
                continue
            filename = safe_file(project_root, relative, field, errors)
            if filename:
                try:
                    actual = sha256_file(filename)
                except OSError:
                    actual = None
                if actual != expected:
                    errors.append({'field': field, 'message': 'relevant input changed; evidence is stale'})
                    log('WARN', 'fingerprint', 'relevant input changed', {'field': field})

    for index, check in enumerate(record['checks']):
        check_inputs(check['currentFingerprint'],
                     'verification.checks[%d].currentFingerprint' % index)
    for index, execution in enumerate(record['executions']):
        if any(check['id'] == execution['checkId']
               and fingerprint_equal(check['currentFingerprint'], execution['fingerprint'])
               for check in record['checks']):
            check_inputs(execution['fingerprint'],
                         'verification.executions[%d].fingerprint' % index)
    if errors:
        log('ERROR', 'evidence', 'candidate evidence failed integrity',
            {'runId': state.get('runId'), 'violations': len(errors)})
    return errors


def validate_transition(previous, candidate):
    """Published evidence and decisions are append-only, with explicit scope revisions."""
    if not isinstance(previous, dict) or previous.get('contractVersion', 0) < 4:
        return []
    old = previous.get('verification')
    new = candidate.get('verification')
    if not isinstance(old, dict) or not isinstance(new, dict):
        return []
    errors = []
    planning_open = (previous.get('lifecycle') == 'active'
                     and previous.get('currentStage') in ('preflight', 'manifest', 'briefing', 'spec', 'plan')
                     and not any(stage.get('id') == 'plan' and stage.get('status') == 'done' for stage in previous.get('stages', []))
                     and not any(gate.get('id') == 'G3' and gate.get('status') == 'passed' for gate in previous.get('gates', [])))
    names = ('references', 'surfaces', 'obligations', 'checks', 'executions',
             'evidence', 'decisions', 'acceptanceRounds', 'repairAttempts')
    for name in names:
        current = {item['id']: item for item in new[name]}
        for item in old[name]:
            successor = current.get(item['id'])
            before = dict(item)
            after = dict(successor) if successor else None
            if name == 'checks':
                before.pop('currentFingerprint', None)
                if after:
                    after.pop('currentFingerprint', None)
                if planning_open and not any(execution['checkId'] == item['id'] for execution in old['executions']):
                    fields = (["executionTaskId"] if 'executionTaskId' not in item else [])
                    fields += (["integrationDependencies"] if not item['integrationDependencies'] else [])
                    for field in fields:
                        before.pop(field, None)
                        if after is not None:
                            after.pop(field, None)
            if name == 'obligations' and planning_open and not any(
                    execution['checkId'] == check['id'] and item['id'] in check['obligationIds']
                    for execution in old['executions'] for check in old['checks']):
                for field in ('implementationTaskIds', 'checkIds'):
                    if not item[field]:
                        before.pop(field, None)
                        if after is not None:
                            after.pop(field, None)
            if after != before:
                errors.append({'field': 'verification.%s[%s]' % (name, item['id']),
                               'message': 'published record must remain immutable'})
    if old.get('version') == 2:
        if new.get('version') != 2 or candidate.get('contractVersion') != 5:
            errors.append({'field': 'verification.version', 'message': 'published safeguards cannot be downgraded'})
        else:
            for name in ('sourceSnapshots', 'sourceClauses', 'manifestAudits', 'scopeMappings', 'journeys', 'negativeControls'):
                if new[name][:len(old[name])] != old[name]:
                    errors.append({'field': 'verification.' + name, 'message': 'source/completion history must remain append-only'})
            if old.get('scopeBaseline') and old['scopeBaseline'] != new.get('scopeBaseline'):
                errors.append({'field': 'verification.scopeBaseline', 'message': 'original baseline is frozen'})
            if any(new['repairLimits'][name] > old['repairLimits'][name] for name in ('perFinding', 'total')):
                errors.append({'field': 'verification.repairLimits', 'message': 'stable budgets cannot increase'})
    if new['targetRevision'] < old['targetRevision']:
        errors.append({'field': 'verification.targetRevision',
                       'message': 'target revision cannot decrease'})
    if new['targetRevision'] > old['targetRevision'] and not any(
            item['kind'] == 'scope_amendment'
            and item.get('previousTargetRevision') == old['targetRevision']
            and item.get('targetRevision') == new['targetRevision']
            for item in new['decisions']):
        errors.append({'field': 'verification.targetRevision',
                       'message': 'target revision change needs scope amendment'})
    return errors


def load_candidate(filename):
    """Candidate JSON or the generated state assignment; never evaluate JavaScript."""
    with open(filename, encoding='utf-8') as handle:
        source = handle.read()
    if ASSIGNMENT in source:
        source = literal(source)
    return json.loads(source)


def validation_envelope(status, candidate, errors=None, previous=None):
    """The page reads this alongside state.js and suppresses stale green success."""
    envelope = {
        'status': status,
        'candidateRevision': candidate.get('updatedAt') if isinstance(candidate, dict) else None,
        'candidateRunId': candidate.get('runId') if isinstance(candidate, dict) else None,
        'lastValidRevision': previous.get('updatedAt') if isinstance(previous, dict) else None,
        'violations': errors or [],
    }
    body = json.dumps(envelope, ensure_ascii=False, sort_keys=True)
    atomic_text(VALIDATION, 'globalThis.MAESTRO_VALIDATION = %s;\n' % body)
    if os.path.exists(PAGE):
        page = open(PAGE, encoding='utf-8').read()
        if VALIDATION_SNAPSHOT_RE.search(page):
            updated = VALIDATION_SNAPSHOT_RE.sub(
                lambda match: match.group(1) + '\nglobalThis.MAESTRO_VALIDATION_SNAPSHOT = '
                + body + ';\n' + match.group(3), page, count=1)
            atomic_text(PAGE, updated)


def viewer_address(no_open=False):
    """Keep an owned viewer reachable even when the first candidate is invalid."""
    if not os.path.exists(PAGE):
        return None
    place_index()
    pid, remembered = recorded()
    if ours(command_of(pid)):
        port = remembered
    else:
        adopted = adopt()
        if adopted:
            port = adopted[1]
        else:
            held = remembered is not None and not free(remembered)
            chosen = pick_port(remembered if remembered is not None and not held else None)
            port = serve(chosen, remembered if held else None)
    url = 'file://' + PAGE if port is None else 'http://localhost:%d/dashboard.html' % port
    if not no_open:
        open_page(url, False)
    return url


def emit_json(result):
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


def candidate_mode(argv):
    """Read-only validate/project, or validate and atomically publish a candidate."""
    action = argv[0]
    if len(argv) < 2:
        emit_json({'status': 'unreadable', 'reason': 'candidate path is required'})
        return 2
    filename = argv[1]
    try:
        candidate = load_candidate(filename)
    except (OSError, ValueError) as error:
        log('ERROR', action, 'candidate could not be read', {'path': filename})
        emit_json({'status': 'unreadable', 'reason': str(error)})
        return 2

    if action == '--project' and isinstance(candidate, dict) and candidate.get('contractVersion', 0) < 4:
        old_g4 = next((item.get('status') for item in candidate.get('gates', [])
                       if isinstance(item, dict) and item.get('id') == 'G4'), 'historical')
        log('WARN', 'project', 'legacy verification is not established',
            {'runId': candidate.get('runId'), 'contractVersion': candidate.get('contractVersion')})
        emit_json({'status': 'legacy', 'verificationEstablished': False,
                   'notice': 'verification not established', 'g4': old_g4,
                   'scopeProgress': derive_scope_progress(candidate), 'completionSafeguards': 'not-established'})
        return 0

    try:
        errors, summary = validate_candidate(candidate)
        if not errors:
            errors.extend(validate_files(candidate))
    except (TypeError, KeyError, AttributeError, ValueError) as error:
        log('ERROR', action, 'candidate shape is invalid', {'kind': type(error).__name__})
        errors, summary = ([{'field': 'verification',
                             'message': 'candidate contains malformed nested records'}], None)
    if action == '--validate':
        emit_json({'status': 'valid' if not errors else 'invalid',
                   'violations': errors, 'projection': summary if not errors else None})
        return 0 if not errors else 1
    if action == '--project':
        if errors:
            emit_json({'status': 'invalid', 'violations': errors})
            return 1
        emit_json({'status': 'current', 'summary': summary,
                   'scopeProgress': derive_scope_progress(candidate, summary),
                   'completionSafeguards': 'established' if candidate['verification']['version'] == 2
                   and candidate['verification'].get('scopeBaseline') and fresh_manifest_audit(candidate['verification'], [item['id'] for item in candidate['requirements']]) else 'not-established',
                   'lifecycle': candidate['lifecycle'], 'outcome': candidate.get('outcome'),
                   'verificationEstablished': candidate['lifecycle'] == 'closed'
                   and candidate.get('outcome') == 'completed' and summary['g4'] == 'passed'})
        return 0

    no_open = '--no-open' in argv
    previous = None
    if os.path.exists(STATE):
        try:
            previous = load_candidate(STATE)
            if not isinstance(previous, dict):
                errors.append({'field': 'state.js', 'message': 'existing state is not an object'})
                previous = None
        except (OSError, ValueError):
            errors.append({'field': 'state.js', 'message': 'existing state cannot be read; recover explicitly'})
    expected = None
    if '--expect' in argv:
        offset = argv.index('--expect') + 1
        expected = argv[offset] if offset < len(argv) else None
    holder = None
    if '--holder' in argv:
        offset = argv.index('--holder') + 1
        holder = argv[offset] if offset < len(argv) else None
    if previous is not None:
        if expected is None or previous.get('updatedAt') != expected:
            errors.append({'field': 'updatedAt', 'message': 'stale or missing expected revision'})
        prior_holder = previous.get('heldBy')
        if isinstance(prior_holder, dict) and prior_holder.get('token') != holder:
            errors.append({'field': 'heldBy', 'message': 'holder token does not match prior snapshot'})
        if not errors:
            errors.extend(validate_transition(previous, candidate))
    elif expected is not None:
        errors.append({'field': 'updatedAt', 'message': 'expected revision has no state to match'})
    candidate_holder = candidate.get('heldBy') if isinstance(candidate, dict) else None
    if isinstance(candidate_holder, dict) and candidate_holder.get('token') != holder:
        errors.append({'field': 'heldBy', 'message': 'holder token does not match candidate'})

    if errors:
        validation_envelope('invalid', candidate, errors, previous)
        url = viewer_address(no_open)
        log('ERROR', 'publish', 'candidate rejected before publication',
            {'violations': len(errors), 'candidateRevision': candidate.get('updatedAt')
             if isinstance(candidate, dict) else None})
        emit_json({'status': 'rejected', 'violations': errors, 'url': url})
        return 1

    body = '// Written by Maestro. Contract: docs/spec/state-contract.md\n'
    body += ASSIGNMENT + ' ' + json.dumps(candidate, ensure_ascii=False, indent=2) + ';\n'
    atomic_text(STATE, body)
    validation_envelope('valid', candidate, [], candidate)
    if os.path.exists(PAGE):
        mirror(json.dumps(candidate, ensure_ascii=False))
    url = viewer_address(no_open)
    log('INFO', 'publish', 'candidate published',
        {'runId': candidate['runId'], 'revision': candidate['updatedAt'], 'g4': summary['g4']})
    emit_json({'status': 'published', 'revision': candidate['updatedAt'],
               'path': STATE, 'url': url, 'projection': summary})
    return 0


def main(argv):
    if argv and argv[0] in ('--validate', '--project', '--publish'):
        return candidate_mode(argv)
    # Two flags, and both exist because the run needs a way back. `--reopen`
    # is what a user saying "the panel is gone" turns into; `--no-open` is for
    # the host that has a preview pane of its own and drives it itself, which
    # must not also get a browser window — two pages is the one thing
    # `references/hosts.md` forbids outright.
    reopen = '--reopen' in argv
    if '--no-open' in argv:
        os.environ['MAESTRO_SYNC_NO_OPEN'] = '1'

    if not os.path.exists(STATE):
        print('sync: no state.js beside this script — nothing to mirror yet')
        return 2

    source = open(STATE, encoding='utf-8').read()
    try:
        text = literal(source)
    except ValueError as error:
        print('sync: %s — the page reads this file, so the прогон is now invisible' % error)
        return 1

    try:
        candidate = json.loads(text)
    except ValueError:
        candidate = None
    if isinstance(candidate, dict) and isinstance(candidate.get('contractVersion'), int) and candidate['contractVersion'] >= 4:
        try:
            violations, _summary = validate_candidate(candidate)
            if not violations:
                violations.extend(validate_files(candidate))
        except (TypeError, KeyError, AttributeError, ValueError):
            violations = [{'field': 'verification',
                           'message': 'candidate contains malformed nested records'}]
        if violations:
            validation_envelope('invalid', candidate, violations)
            url = viewer_address('--no-open' in argv)
            print('sync: verified-contract state rejected before mirroring; diagnostic at %s' % url)
            return 1
        validation_envelope('valid', candidate, [], candidate)

    mirrored = mirror(text)
    linked = place_index()

    pid, remembered = recorded()
    command = command_of(pid)
    reused = ours(command)
    held = None
    moved_from = None

    taken = None if reused else adopt()

    if reused:
        port, why = remembered, 'the recorded server is still this directory\'s'
    elif taken is not None:
        # A live server for this directory that serve.json had forgotten. Taking
        # it keeps the address the user already has and leaves one server
        # listening instead of two.
        pid, port = taken
        why = 'adopted a live server this directory had forgotten'
        try:
            with open(SERVE, 'w', encoding='utf-8') as handle:
                json.dump({'pid': pid, 'port': port}, handle)
        except OSError as error:
            debug('could not record the adopted server: %s' % error)
        reused = True
    else:
        held = (not free(remembered)) if remembered is not None else None
        chosen = pick_port(remembered if held is False else None)
        why = ('the remembered port was free' if held is False
               else 'the remembered port is held by something else' if held
               else 'nothing was remembered')
        if remembered is not None and chosen != remembered:
            moved_from = remembered
        port = serve(chosen, moved_from)

    language = spoken(text)
    if port is None:
        print('sync: no server — open %s directly; it shows the snapshot and will not tick' % PAGE)
        url = 'file://' + PAGE
    else:
        if moved_from is not None:
            print(MOVED[language]['taken' if held else 'gone'] % moved_from)
        url = 'http://localhost:%d/dashboard.html' % port
        print(url)
    print(FOLDED[language])

    # And then open it, rather than describing how somebody else should. This
    # step used to live in `phases/0-preflight.md` as prose addressed to the
    # orchestrator, which made the most visible part of a прогон depend on
    # whether a model went looking for a preview tool. It is a step now.
    opening = open_page(url, reopen)
    if opening == 'shown':
        print(SHOWN[language])
    elif opening == 'remote':
        print(AWAY[language] % url)

    debug('mirrored=%s linked=%s remembered=%s held=%s holder=%r chosen=%s why=%s moved_from=%s '
          'reused=%s adopted=%s opening=%s reopen=%s'
          % (mirrored, linked, remembered, held, command[:120], port, why, moved_from,
             reused, taken, opening, reopen))

    # Last, and deliberately after the address: the page works either way, and
    # this is about the tool that reads the run when it is over.
    try:
        state = json.loads(text)
    except ValueError as error:
        print('sync: state.js is valid JavaScript but not valid JSON (%s).' % error)
        print('      The dashboard renders it; scripts/metrics/measure.ts cannot read it.')
        print('      Quote every key and use JSON values — the writer emits JSON.stringify output.')
        return 1

    # Both reports are printed before either exit: a прогон that called this
    # once should not have to call it again to learn the second thing wrong.
    failed = False

    offenders = status_violations(state)
    if offenders:
        failed = True
        for path, found, allowed in offenders:
            print('sync: %s is %s — the contract allows %s'
                  % (path, json.dumps(found, ensure_ascii=False), ', '.join(allowed)))
        print('      The page cannot count a status it cannot name: it shows such an')
        print('      entry as written, and the entry counts towards no progress at all.')

    unspoken = language_violations(state)
    if unspoken:
        failed = True
        for path, line in unspoken:
            print('sync: %s has no Russian in it — this прогон speaks ru'
                  % path)
            print('      %s' % json.dumps(line[:100], ensure_ascii=False))
        print('      The panel prints these three fields word for word, so they carry the')
        print('      dial\'s language: gates[].findings, tasks[].title, stages[].note.')
        print('      Every other file the прогон writes stays English.')

    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
