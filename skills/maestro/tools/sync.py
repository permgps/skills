#!/usr/bin/env python3
"""Mirror the run state into the dashboard, and keep it reachable.

Run it after every write to `state.js`:

    python3 .maestro/sync.py

It does five things, in this order, and reports what it did:

1.  **Checks that `state.js` parses as JSON.** The page is happy with any valid
    JavaScript, so a hand-written object literal with bare keys renders exactly
    as well as a strict one — and then `scripts/metrics/measure.ts`, which goes
    through `JSON.parse`, cannot read the прогон at all. The dashboard is the
    forgiving consumer and the metrics tool is the strict one; without this
    check the difference surfaces after the run, when the file is finished and
    nothing can be re-measured.
2.  **Copies the state into the page's snapshot.** The copy is the same text
    under a different name, so the snapshot cannot say something the file does
    not — it is equal to the file or older than it, never in disagreement.
3.  **Puts `index.html` beside the page**, because a viewer can be handed an
    origin with no path, and a directory listing is what it shows otherwise.
4.  **Raises a static server** over this directory, bound to the loopback
    interface, if one is not already answering for it — and prints the address,
    with a line above it when that address has moved since the last call. A
    moved address is the one thing here a user cannot recover from on their own:
    the link they were handed is dead, and nothing else in the прогон says so.
5.  **Checks every status against the contract.** This runs last, after the
    address, and on purpose: a прогон whose таск carries a word the contract
    does not define is still worth showing, and a stopped дашборд helps nobody.
    It is the only place a real прогон can catch the violation at all —
    `scripts/state/validate.ts` lives in the development repository and is not
    part of what is copied into `.maestro/`.

Failing to raise a server is not an error. The page carries its snapshot, so a
run without a server shows the truth and stops ticking; that is worth one line
of output, not a stopped прогон.

Almost nothing in this file is checked by `npm run check`: `bundle-integrity.ts`
walks `.md` and this is the only executable in the bundle. The four status sets
below are the exception — `scripts/validate/state-matches-spec.ts` compares them
with the specification, because a copy nothing reads goes stale in silence.
Everything else here still breaks quietly, so change it with that in mind.
"""

import json
import os
import re
import socket
import subprocess
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(DIR, 'state.js')
PAGE = os.path.join(DIR, 'dashboard.html')
INDEX = os.path.join(DIR, 'index.html')
SERVE = os.path.join(DIR, 'serve.json')

# The contract's own value sets, copied here because nothing else present in a
# real прогон holds them. `scripts/validate/state-matches-spec.ts` compares these
# four lists against docs/spec/state-contract.md and scripts/state/contract.ts,
# so a set that drifts here is a finding rather than a silence.
STAGE_STATUSES = ['pending', 'active', 'done', 'failed', 'skipped']
TASK_STATUSES = ['queued', 'running', 'review', 'repair', 'done', 'failed']
REQUIREMENT_STATUSES = ['open', 'in-spec', 'deferred', 'dropped', 'placeholder']
GATE_STATUSES = ['pending', 'passed', 'failed']

CHECKED = [
    ('stages', STAGE_STATUSES),
    ('tasks', TASK_STATUSES),
    ('requirements', REQUIREMENT_STATUSES),
    ('gates', GATE_STATUSES),
]

ASSIGNMENT = 'globalThis.MAESTRO_STATE ='
SNAPSHOT_RE = re.compile(
    r'(/\*\s*maestro:snapshot:start\s*\*/)(.*?)(/\*\s*maestro:snapshot:end\s*\*/)',
    re.DOTALL)

DEBUG = os.environ.get('MAESTRO_SYNC_DEBUG') == '1'


def debug(message):
    if DEBUG:
        print('debug: ' + message, file=sys.stderr)


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
    open(PAGE, 'w', encoding='utf-8').write(updated)
    return True


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


def main():
    if not os.path.exists(STATE):
        print('sync: no state.js beside this script — nothing to mirror yet')
        return 2

    source = open(STATE, encoding='utf-8').read()
    try:
        text = literal(source)
    except ValueError as error:
        print('sync: %s — the page reads this file, so the прогон is now invisible' % error)
        return 1

    mirrored = mirror(text)
    linked = place_index()

    pid, remembered = recorded()
    command = command_of(pid)
    reused = ours(command)
    held = None
    moved_from = None

    if reused:
        port, why = remembered, 'the recorded server is still this directory\'s'
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
    else:
        if moved_from is not None:
            print(MOVED[language]['taken' if held else 'gone'] % moved_from)
        print('http://localhost:%d/dashboard.html' % port)
    print(FOLDED[language])
    debug('mirrored=%s linked=%s remembered=%s held=%s holder=%r chosen=%s why=%s moved_from=%s reused=%s'
          % (mirrored, linked, remembered, held, command[:120], port, why, moved_from, reused))

    # Last, and deliberately after the address: the page works either way, and
    # this is about the tool that reads the run when it is over.
    try:
        state = json.loads(text)
    except ValueError as error:
        print('sync: state.js is valid JavaScript but not valid JSON (%s).' % error)
        print('      The dashboard renders it; scripts/metrics/measure.ts cannot read it.')
        print('      Quote every key and use JSON values — the writer emits JSON.stringify output.')
        return 1

    offenders = status_violations(state)
    if offenders:
        for path, found, allowed in offenders:
            print('sync: %s is %s — the contract allows %s'
                  % (path, json.dumps(found, ensure_ascii=False), ', '.join(allowed)))
        print('      The page cannot count a status it cannot name: it shows such an')
        print('      entry as written, and the entry counts towards no progress at all.')
        return 1

    return 0


if __name__ == '__main__':
    sys.exit(main())
