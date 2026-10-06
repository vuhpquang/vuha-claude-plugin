---
name: standup
description: Write a daily standup report from yesterday's commits, GitLab merge requests and Jira tickets. Use when the user asks for a standup, daily report, "báo cáo daily", "hôm qua làm gì", or /standup.
argument-hint: "[YYYY-MM-DD]"
---

# Standup

Build a short standup report for the previous working day (Friday when today is Monday), or for the date given in the arguments.

## 1. Gather (run these in parallel)

**Commits**: run the bundled script; it searches every git repo under `VUHA_STANDUP_ROOTS` (default `~/Work/Repos`) for commits by the user's git emails:

```bash
"${CLAUDE_PLUGIN_ROOT}/skills/standup/scripts/collect-commits.sh" [YYYY-MM-DD]
```

**Merge requests**: when `GITLAB_API_URL` and a token (`GITLAB_PERSONAL_ACCESS_TOKEN` or `GITLAB_TOKEN`) are set, fetch the MRs the user created or reviewed that changed since that day (`updated_after=<day>T00:00:00Z`):

```bash
curl -s -H "PRIVATE-TOKEN: ${GITLAB_PERSONAL_ACCESS_TOKEN:-$GITLAB_TOKEN}" \
  "$GITLAB_API_URL/merge_requests?scope=created_by_me&updated_after=<day>T00:00:00Z&per_page=50" \
  | jq -r '.[] | "- !\(.iid) [\(.state)] \(.title) — \(.references.full)"'
```

Repeat with `scope=all&reviewer_username=<user>` for reviews (`/user` gives the username).

**Jira**: when a Jira MCP tool is connected (a `search_jira_issues`-style tool), search with JQL
`assignee = currentUser() AND updated >= "<day>" ORDER BY updated DESC`. Otherwise, when `JIRA_URL` and `JIRA_API_TOKEN` are set, call `$JIRA_URL/rest/api/2/search?jql=...&fields=summary,status` with `Authorization: Bearer $JIRA_API_TOKEN`.

A source that is not configured or not reachable (VPN off) is skipped. Say which ones were skipped in one line at the end; never stop because of one.

## 2. Write

Group the work by ticket: match commits and MRs to Jira keys (`ABC-123`) in branch names, commit messages and MR titles. Keep the user's language (Vietnamese by default):

```markdown
**Daily <dd/MM>**

**Hôm qua**
- [ABC-123] <what was done, in outcome words, not commit-by-commit> — MR !45 (merged / chờ review)
- Review MR !52 (<project>)

**Hôm nay**
- <next steps inferred from open MRs and in-progress tickets; mark guesses with "(?)">

**Blockers**
- <anything waiting on others: MRs waiting for review, tickets blocked>, or "Không có"
```

Rules:
- One bullet per ticket or theme, not per commit; drop noise (merge commits, lint fixes, version bumps).
- Never invent work. "Hôm nay" comes from open MRs and in-progress tickets only.
- Print the report in a copy-ready block. Do not post it anywhere unless the user asks.
