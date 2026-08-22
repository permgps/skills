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
5.  **Checks the state against the contract** — every status, and the language
    of the three fields the panel prints word for word. This runs last, after
    the address, and on purpose: a прогон whose таск carries a word the
    contract does not define is still worth showing, and a stopped дашборд
    helps nobody. It is the only place a real прогон can catch either violation
    at all — `scripts/state/validate.ts` lives in the development repository
    and is not part of what is copied into `.maestro/`.

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
import shlex
import socket
import subprocess
import sys

DIR = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(DIR, 'state.js')
PAGE = os.path.join(DIR, 'dashboard.html')
INDEX = os.path.join(DIR, 'index.html')
SERVE = os.path.join(DIR, 'serve.json')
OPENED = os.path.join(DIR, 'opened.json')

# A session where a window helps nobody, because the window would appear on a
# machine the user is not sitting at. This was prose in `phases/0-preflight.md`;
# it belongs beside the code that opens things.
REMOTE = ('SSH_CONNECTION', 'SSH_TTY', 'CI')

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


def main(argv):
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
