#!/usr/bin/env python3
"""Prints what you asked Claude Code on one day, grouped by project, with each session's last answer.
Usage: collect-sessions.py [YYYY-MM-DD]   (default: today)
Env:   VUHA_DEVLOG_CLAUDE_DIRS  colon-separated Claude config dirs (default ~/.claude:~/.claude-work:~/.claude-personal)
"""
import json, os, sys, glob
from datetime import datetime, date

day = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today()
start = datetime.combine(day, datetime.min.time()).timestamp()
dirs = os.environ.get("VUHA_DEVLOG_CLAUDE_DIRS", "~/.claude:~/.claude-work:~/.claude-personal").split(":")


def local_day(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone().date()
    except (AttributeError, ValueError):
        return None


def text_of(content):
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


def clip(s, n):
    s = " ".join(s.split())
    return s if len(s) <= n else s[: n - 1] + "…"


projects = {}  # cwd -> list of (time, session, prompt)
answers = {}   # session -> last assistant text
seen = set()
for d in dirs:
    for path in glob.glob(os.path.join(os.path.expanduser(d), "projects", "*", "*.jsonl")):
        if os.path.getmtime(path) < start:
            continue
        session = os.path.basename(path)[:8]
        with open(path, errors="replace") as f:
            for line in f:
                try:
                    rec = json.loads(line)
                except ValueError:
                    continue
                if rec.get("isSidechain") or rec.get("isMeta") or local_day(rec.get("timestamp")) != day:
                    continue
                text = text_of((rec.get("message") or {}).get("content")).strip()
                if not text:
                    continue
                if rec.get("type") == "assistant":
                    answers[session] = text
                elif rec.get("type") == "user":
                    # Skip harness noise (caveats, reminders, hook output); keep slash commands by name
                    if text.startswith("<command-name>"):
                        text = text.split("</command-name>")[0].removeprefix("<command-name>")
                        if text in ("/clear", "/compact", "/exit", "/model", "/resume"):
                            continue
                    elif text.startswith("<") or text.startswith("Base directory for this skill") or "devlog" in text[:200].lower():
                        continue
                    key = (session, text[:200])
                    if key in seen:
                        continue
                    seen.add(key)
                    t = datetime.fromisoformat(rec["timestamp"].replace("Z", "+00:00")).astimezone()
                    projects.setdefault(rec.get("cwd") or "?", []).append((t.strftime("%H:%M"), session, text))

print(f"# Claude Code sessions on {day}")
if not projects:
    print("\n(no sessions)")
home = os.path.expanduser("~")
for cwd, prompts in sorted(projects.items(), key=lambda kv: kv[1][0][0]):
    prompts.sort()
    print(f"\n## {os.path.basename(cwd) or cwd}  ({cwd.replace(home, '~')})")
    for t, s, p in prompts[:40]:
        print(f"- {t} [{s}] {clip(p, 300)}")
    if len(prompts) > 40:
        print(f"- … {len(prompts) - 40} more prompts")
    for s in dict.fromkeys(s for _, s, _ in prompts):
        if s in answers:
            print(f"  > [{s}] last answer: {clip(answers[s], 400)}")
