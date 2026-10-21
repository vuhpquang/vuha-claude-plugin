#!/usr/bin/env python3
"""Prints the commits you authored on one day, grouped by repository.

A commit belongs to the day it was written (author date), so a rebase or cherry-pick
the next day does not count it twice. Worktrees of one repo are read once.
Usage: collect-commits.py [YYYY-MM-DD]        (default: today)
       collect-commits.py --sig YYYY-MM-DD    one line per day since then: "<day> <commits> <fingerprint>"
Env:   VUHA_STANDUP_ROOTS    colon-separated folders to search for git repos (default ~/Work/Repos)
       VUHA_STANDUP_AUTHORS  extra author patterns, '|'-separated (your git emails are always included)
"""
import glob, hashlib, os, subprocess, sys
from datetime import date, datetime


def git(*args, cwd=None):
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, errors="replace")
    return r.stdout.strip() if r.returncode == 0 else ""


sig_mode = len(sys.argv) > 2 and sys.argv[1] == "--sig"
since = sys.argv[2] if sig_mode else (sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat())

authors = [a for a in [git("config", "--global", "user.email"), os.environ.get("VUHA_STANDUP_AUTHORS", "")] if a]
roots = os.environ.get("VUHA_STANDUP_ROOTS", os.path.expanduser("~/Work/Repos")).split(":")

since_ts = datetime.fromisoformat(since).timestamp()


def touched_since(common):
    """True when the repo moved since `since`: any commit, checkout, rebase or fetch rewrites one of these."""
    paths = [os.path.join(common, f) for f in ("logs/HEAD", "FETCH_HEAD", "ORIG_HEAD", "packed-refs")]
    paths += glob.glob(os.path.join(common, "worktrees", "*", "logs", "HEAD"))
    for dirpath, _, files in os.walk(os.path.join(common, "logs", "refs")):
        paths += [os.path.join(dirpath, f) for f in files]
    return any(os.path.exists(p) and os.path.getmtime(p) >= since_ts for p in paths)


repos, seen_dirs = [], set()
for root in roots:
    for dirpath, dirnames, filenames in os.walk(root):
        depth = dirpath[len(root):].count(os.sep)
        if ".git" in dirnames or ".git" in filenames:
            common = os.path.realpath(os.path.join(dirpath, git("rev-parse", "--git-common-dir", cwd=dirpath) or ".git"))
            if common not in seen_dirs:
                seen_dirs.add(common)
                if touched_since(common):
                    repos.append(dirpath)
            dirnames[:] = []
        elif depth >= 3 or os.path.basename(dirpath) == "node_modules":
            dirnames[:] = []
        else:
            dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "node_modules"]

days = {}  # day -> repo -> [lines]
hashes = {}  # day -> set of full hashes
seen = set()
for repo in repos:
    pattern = "|".join(authors + [e for e in [git("config", "user.email", cwd=repo)] if e])
    if not pattern:
        continue
    # Committer date >= author date, so --since on committer date never misses a commit written on/after `since`
    log = git("log", "--all", "--no-merges", "--extended-regexp", f"--author={pattern}", f"--since={since} 00:00",
              "--format=%H%x09%h%x09%ad%x09%s", "--date=format:%Y-%m-%d %H:%M", cwd=repo)
    for line in log.splitlines():
        full, short, when, subject = line.split("\t", 3)
        day = when[:10]
        if full in seen or day < since or (not sig_mode and day != since):
            continue
        seen.add(full)
        label = f"{os.path.basename(repo)}  ({git('branch', '--show-current', cwd=repo)})"
        days.setdefault(day, {}).setdefault(label, []).append(f"- {short} {subject} ({when[11:]})")
        hashes.setdefault(day, set()).add(full)

if sig_mode:
    for day in sorted(hashes):
        print(day, len(hashes[day]), hashlib.sha1("\n".join(sorted(hashes[day])).encode()).hexdigest()[:12])
else:
    print(f"# Commits on {since}")
    for label, lines in days.get(since, {}).items():
        print(f"\n## {label}")
        print("\n".join(sorted(lines, key=lambda l: l.rsplit("(", 1)[-1], reverse=True)))
