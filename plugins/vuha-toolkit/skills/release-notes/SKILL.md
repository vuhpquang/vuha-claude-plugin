---
name: release-notes
description: Turn the commits since the last tag (or between two refs) into user-facing release notes and a changelog entry. Use when the user asks for release notes, a changelog, "viết release note", or what changed since the last release.
argument-hint: "[from-ref] [to-ref]"
---

# Release notes

## 1. Find the range

- `from`: the first argument, else the latest tag reachable from HEAD (`git describe --tags --abbrev=0`), else the root commit.
- `to`: the second argument, else `HEAD`.
- Version: the `version` in `package.json` at `to` when there is one; else the tag name; else ask.

```bash
git log --no-merges --format='%h%x09%an%x09%s' <from>..<to>
git log --merges --format='%h%x09%s' <from>..<to>          # MR titles: "Merge branch ... into ..." / "See merge request group/app!123"
git diff --stat <from>..<to> | tail -1
```

## 2. Sort

Read each commit's subject (conventional commits when the repo uses them; otherwise judge from the subject and, when unclear, `git show --stat <hash>`):

| Section | Takes |
| --- | --- |
| ✨ Tính năng mới / Features | `feat` |
| 🐛 Sửa lỗi / Fixes | `fix` |
| ⚡ Cải thiện / Improvements | `perf`, `refactor` visible to users |
| ⚠️ Breaking changes | `!` after the type, `BREAKING CHANGE:` in the body |
| 🔧 Nội bộ / Internal | `chore`, `ci`, `build`, `test`, `docs`, internal refactors |

Merge several commits about one thing into one bullet. Link Jira keys (`ABC-123`) and MR numbers (`!123`) found in subjects or merge commits.

## 3. Write

```markdown
## <version> — <YYYY-MM-DD>

<one-sentence summary of the release>

### ✨ Tính năng mới
- <user-facing outcome> ([ABC-123], !45)

### 🐛 Sửa lỗi
- ...

### ⚠️ Breaking changes
- <what breaks and how to migrate>

<details><summary>🔧 Nội bộ (n commits)</summary>

- ...
</details>

**Range:** `<from>..<to>` · <n> commits · <files changed summary>
```

Rules:
- Write for users of the app or library, not for the author: say what changed for them, not which file moved.
- Leave out empty sections. Keep internal changes collapsed.
- Use the language the user asked in (Vietnamese by default for this user).
- When the repo has a `CHANGELOG.md`, offer to prepend the entry; do not edit it, tag, or push unless asked.
