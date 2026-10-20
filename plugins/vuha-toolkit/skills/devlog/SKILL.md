---
name: devlog
description: Write today's dev log into the Obsidian vault (Dev Logs folder) from the day's commits and Claude Code sessions. Use when the user asks for a devlog, "viết devlog", "nhật ký dev", "hôm nay làm gì", or /devlog. Also run every day at 17:30 by the launchd job com.vuha.devlog.
argument-hint: "[YYYY-MM-DD] | install | uninstall"
---

# Dev log

One Markdown note per day in the Obsidian vault, written in Vietnamese, readable at a glance.

- Vault folder: `VUHA_DEVLOG_DIR` (default `~/Library/CloudStorage/OneDrive-Personal/obsidian-notes/Dev Logs`)
- Day: the date in the arguments, or today.

When the argument is `install` or `uninstall`, run `"${CLAUDE_PLUGIN_ROOT}/skills/devlog/scripts/schedule.sh" install|uninstall`, show its output and stop.

## 1. Gather (run in parallel)

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/devlog/scripts/collect-commits.sh" <day>
python3 -I "${CLAUDE_PLUGIN_ROOT}/skills/devlog/scripts/collect-sessions.py" <day>
```

- Commits: every repo under `~/Work/Repos`, deduplicated across worktrees.
- Sessions: what the user asked Claude Code that day (all config dirs), per project, plus each session's last answer. This is the main source for work that left no commit (reviews, investigations, pipelines, setup).

Optional, skip silently when not available: Jira tickets updated that day (a `search_jira_issues`-style MCP tool, JQL `assignee = currentUser() AND updated >= "<day>"`) to get ticket titles and status.

If both sources are empty (weekend, day off), write nothing and say so in one line.

## 2. Write

Path: `<Dev Logs>/<YYYY>/<MM>/<YYYY-MM-DD>.md` (create folders). If the note already exists, rewrite it but keep the `## ✍️ Ghi chú riêng` section verbatim: that one belongs to the user.

Also make sure `<Dev Logs>/Dev Logs.base` exists; if not, copy `${CLAUDE_PLUGIN_ROOT}/skills/devlog/assets/Dev Logs.base` there (it gives a table of all days in Obsidian).

Template:

```markdown
---
date: 2026-10-20
weekday: Thứ Ba
tags: [devlog]
projects: [fs-kits, mini-app-vaynhanh]
tickets: [FM-7645, FM-7684]
commits: 42
summary:
  - "Ví trả sau chuyển sang FSDivkitBaseScreen"
  - "Sửa pipeline fsuiauto"
  - "Review MR !278 miniapp-platform"
---

# 🗓️ Thứ Ba, 20/10/2026

← [[2026-10-19]] · [[2026-10-21]] →

## 📌 Summary
- Ví trả sau chuyển sang FSDivkitBaseScreen
- Sửa pipeline fsuiauto
- Review MR !278 miniapp-platform

## 🎯 Điểm nhấn
- 3–5 kết quả quan trọng nhất, viết theo kết quả ("Ví trả sau dùng FSDivkitBaseScreen cho 3 màn DUX"), không theo commit.

## 🧩 Theo project

### fs-kits
- Việc đã làm, gom theo ticket/chủ đề, mỗi bullet một ý. Ticket ghi dạng `FM-7645`.
- Version publish: `6.3.0-vaynhanh-register-dynamic-ui.4`

> [!info]- Commits (12)
> - `c9f3275` docs(dynamic-ui): FSDivkitBaseScreen doc … · 16:15

## 🔍 Review & điều tra
- MR đã review, pipeline đã debug, câu hỏi đã tìm hiểu (từ các session không có commit).

## 💡 Học được
- Điều rút ra trong ngày (bug lạ, cách làm hay). Bỏ mục nếu không có gì thật sự đáng ghi.

## ⏭️ Còn dở / Ngày mai
- [ ] Việc còn mở: MR chờ review, chưa commit, chưa push, pipeline đang chạy.

## ✍️ Ghi chú riêng
```

Rules:
- `## 📌 Summary` is the first section: 4–8 bullets covering everything done that day, one line each (≤ 10 words), verb first, plain words a non-dev could follow; ticket key only when it helps. The frontmatter `summary` list holds exactly the same bullets, so the `Dev Logs.base` table shows them too.
- Never invent work; everything comes from the gathered data. Guesses about "ngày mai" are marked `(?)`.
- Group by outcome, not by commit; drop noise (`chore: update`, version bumps go in one line, merge commits).
- Commits sit in a folded callout (`> [!info]-`) per project so the note stays short; short hashes, time at the end.
- Skip any section that would be empty, except `Ghi chú riêng`.
- Prev/next links use the previous and next calendar day; Obsidian resolves them by file name.
- Leave out secrets, tokens and customer data if they appear in prompts.

## 3. Report

Print the note's path and the Summary bullets. Nothing else.
