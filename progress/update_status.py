#!/usr/bin/env python3
"""StickWIX build dashboard data (progress.html).

Reads the checklist (.local/specs/001-stickwix-engine/tasks.md), git history and
progress/shots/*.png|jpg, plus progress/notes.json written by the agent, and
writes progress/status.js (`window.STATUS = {...}`) so the page works from file://.

The build timer only counts time the agent is actually working. Working time is
accumulated in progress/clock.json by this script: each refresh adds the time
since the previous refresh (capped, so gaps while the updater was not running
never count) but only while notes.json says `"working": true` AND something in
the worktree changed within IDLE_SEC. So the clock pauses when the agent says
it stopped, when it goes quiet, or when the updater itself is not running.

Usage:
  update_status.py                  refresh once
  update_status.py --loop 5         refresh every 5 s (lightweight)
  update_status.py work "doing X"   agent is working; sets the "Now" line
  update_status.py idle             agent stopped working (timer pauses)
  update_status.py note "text"      add a note (newest first, max 8)
  update_status.py start T019 ...   mark tasks in progress  ([~])
  update_status.py tick T019 ...    mark tasks done         ([x])
  update_status.py block T138 why   mark a task blocked     ([blocked: why])
  update_status.py finish           all done; freezes the timer as total
"""
import fcntl, json, os, re, subprocess, sys, time
from contextlib import contextmanager
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TASKS = ROOT / ".local" / "specs" / "001-stickwix-engine" / "tasks.md"
NOTES = HERE / "notes.json"
CLOCK = HERE / "clock.json"
SHOTS = HERE / "shots"
OUT = HERE / "status.js"
IDLE_SEC = 30 * 60        # safety net: no file activity this long = agent forgot `idle` (review rounds are quiet)
GRACE_SEC = 60            # thinking time still credited after the last file change
MAX_TICK = 20             # never count more than this between two refreshes
PRIOR_MIN = 12.0          # minutes per task until a real pace is measured
FINISH_MIN = 40           # review rounds + delivery after the last box is ticked
WATCH = ["src", "tests", "scripts", "public", "progress/notes.json", "progress/shots",
         "package.json", "README.md"]
SKIP_DIRS = {"node_modules", "dist", ".git", "test-results", "playwright-report"}

PHASE_RE = re.compile(r"^## (.+)$")
TASK_RE = re.compile(r"^- \[([^\]]*)\] (T\d{3})\s+(.*)$")


def load_json(p, default):
    """Missing file -> default. A file that exists but cannot be parsed raises,
    so a bad read can never silently reset the working-time clock."""
    if not p.exists():
        return default
    return json.loads(p.read_text())


def save_json(p, data):
    tmp = p.with_name(f"{p.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, indent=1))
    tmp.replace(p)


@contextmanager
def locked():
    """Serialises the --loop updater and CLI calls (they share clock/notes/tasks)."""
    with open(HERE / ".lock", "w") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def parse_tasks():
    phases, cur = [], None
    if not TASKS.exists():
        return phases
    for line in TASKS.read_text().splitlines():
        m = PHASE_RE.match(line)
        if m:
            cur = {"name": m.group(1).strip(), "items": []}
            phases.append(cur)
            continue
        m = TASK_RE.match(line)
        if m and cur is not None:
            mark = m.group(1).strip()
            low = mark.lower()
            state = "done" if low == "x" else "active" if low == "~" else \
                "blocked" if low.startswith("blocked") else "open"
            name = re.sub(r"`([^`]*)`", r"\1", m.group(3))
            name = re.sub(r"^(\[P\]\s*)?(\[US\d\]\s*)?", "", name)
            story = re.search(r"\[(US\d)\]", m.group(3))
            cur["items"].append({"id": m.group(2), "state": state, "name": name.rstrip(". ")[:160],
                                 "story": story.group(1) if story else "",
                                 "why": mark.split(":", 1)[1].strip() if ":" in mark else ""})
    return [p for p in phases if p["items"]]


def set_marks(ids, mark):
    text = TASKS.read_text().splitlines(keepends=True)
    want = set(ids)
    hit = set()
    for i, line in enumerate(text):
        m = TASK_RE.match(line.rstrip("\n"))
        if m and m.group(2) in want:
            text[i] = re.sub(r"^- \[[^\]]*\]", f"- [{mark}]", line, count=1)
            hit.add(m.group(2))
    TASKS.write_text("".join(text))
    missing = want - hit
    if missing:
        print("unknown task ids:", " ".join(sorted(missing)), file=sys.stderr)


def git(*args):
    try:
        return subprocess.run(["git", "-C", str(ROOT), *args], capture_output=True,
                              text=True, timeout=5).stdout.strip()
    except Exception:
        return ""


def git_log():
    rows = []
    for line in git("log", "-30", "--format=%h\x1f%ct\x1f%s").splitlines():
        parts = line.split("\x1f", 2)
        if len(parts) == 3:
            rows.append({"hash": parts[0], "time": int(parts[1]), "msg": parts[2]})
    return rows


def newest_mtime(path):
    best = 0.0
    if not path.exists():
        return best
    if path.is_file():
        return path.stat().st_mtime
    for dirpath, dirnames, filenames in os.walk(path):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for f in filenames:
            try:
                best = max(best, os.stat(os.path.join(dirpath, f)).st_mtime)
            except OSError:
                pass
    return best


def last_activity():
    best = max([newest_mtime(ROOT / w) for w in WATCH] + [newest_mtime(TASKS)])
    gitdir = git("rev-parse", "--absolute-git-dir")
    for f in ("index", "logs/HEAD"):
        p = Path(gitdir) / f if gitdir else None
        if p and p.exists():
            best = max(best, p.stat().st_mtime)
    return best


def advance_clock(notes, now):
    """Adds working time since the previous refresh; returns (clock, active).

    Time is credited live while the agent is working. If it then goes quiet for
    IDLE_SEC, the quiet tail beyond GRACE_SEC after its last file activity is
    taken back off, so forgetting `idle` never inflates the total.
    """
    clock = load_json(CLOCK, {"worked": 0.0, "last": now, "sessions": 0, "was_active": False})
    act = last_activity()
    flagged = bool(notes.get("working")) and not notes.get("finished")
    active = flagged and now - act < IDLE_SEC
    dt = min(max(0.0, now - clock.get("last", now)), MAX_TICK)
    if active and clock.get("was_active"):
        clock["worked"] += dt
    if active and not clock.get("was_active"):
        clock["sessions"] = clock.get("sessions", 0) + 1
    if clock.get("was_active") and flagged and not active:
        tail = min(now - (act + GRACE_SEC), IDLE_SEC - GRACE_SEC)
        clock["worked"] = max(0.0, clock["worked"] - max(0.0, tail))
    clock["last"] = now
    clock["was_active"] = active
    clock["last_activity"] = act
    save_json(CLOCK, clock)
    return clock, active


def shots():
    if not SHOTS.exists():
        return []
    files = [p for p in SHOTS.iterdir() if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return [{"src": f"progress/shots/{p.name}?v={int(p.stat().st_mtime)}",
             "caption": re.sub(r"^\d+[-_]", "", p.stem).replace("_", " ").replace("-", " "),
             "time": int(p.stat().st_mtime)} for p in files[:9]]


def estimate(items, worked_min):
    done = sum(i["state"] == "done" for i in items)
    left_items = sum(i["state"] in ("open", "active") for i in items)
    per = PRIOR_MIN
    if done >= 3 and worked_min > 1:
        w = min(1.0, done / 15)
        per = (worked_min / done) * w + PRIOR_MIN * (1 - w)
    left = left_items * per + (FINISH_MIN if left_items else 0)
    return {"per_task_min": round(per, 1), "left_min": round(left, 1)}


def build():
    now = time.time()
    notes = load_json(NOTES, {})
    if "started" not in notes:
        notes["started"] = int(now)
        save_json(NOTES, notes)
    clock, active = advance_clock(notes, now)
    phases = parse_tasks()
    items = [i for p in phases for i in p["items"]]
    data = {
        "updated": int(now),
        "started": int(notes["started"]),
        "finished": notes.get("finished"),
        "working": active,
        "worked_sec": round(clock["worked"], 1),
        "sessions": clock.get("sessions", 0),
        "last_activity": int(clock.get("last_activity", 0)),
        "idle_sec": IDLE_SEC,
        "current": notes.get("current", ""),
        "notes": notes.get("notes", []),
        "done": sum(i["state"] == "done" for i in items),
        "blocked": sum(i["state"] == "blocked" for i in items),
        "total": len(items),
        "estimate": estimate(items, clock["worked"] / 60),
        "phases": phases,
        "commits": git_log(),
        "branch": git("branch", "--show-current"),
        "shots": shots(),
    }
    tmp = OUT.with_suffix(".tmp")
    tmp.write_text("window.STATUS = " + json.dumps(data) + ";\nwindow.renderStatus && window.renderStatus();\n")
    tmp.replace(OUT)


def cli(argv):
    notes = load_json(NOTES, {})
    cmd, rest = argv[0], argv[1:]
    if cmd == "work":
        notes["working"] = True
        notes.pop("finished", None)
        if rest:
            notes["current"] = " ".join(rest)
    elif cmd == "idle":
        notes["working"] = False
    elif cmd == "note":
        notes["notes"] = ([" ".join(rest)] + notes.get("notes", []))[:8]
    elif cmd in ("start", "tick"):
        set_marks(rest, "~" if cmd == "start" else "x")
        notes["working"] = True
    elif cmd == "block":
        set_marks(rest[:1], "blocked: " + " ".join(rest[1:]) if rest[1:] else "blocked")
    elif cmd == "finish":
        notes["working"] = False
        notes["finished"] = int(time.time())
    else:
        sys.exit(__doc__)
    # Close the running interval before the flag flips so it is counted exactly once.
    if cmd in ("idle", "finish"):
        build()
    save_json(NOTES, notes)
    build()


if __name__ == "__main__":
    args = sys.argv[1:]
    if len(args) == 2 and args[0] == "--loop":
        every = float(args[1])
        print(f"progress updater running every {every:g}s", flush=True)
        while True:
            try:
                with locked():
                    build()
            except Exception as e:  # keep the loop alive; the page shows the last good data
                print("update failed:", e, file=sys.stderr)
            time.sleep(every)
    elif args:
        with locked():
            cli(args)
    else:
        with locked():
            build()
