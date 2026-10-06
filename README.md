# vuha-claude-plugin

Marketplace chứa plugin Claude Code của Vu Ha.

## Cấu trúc

```
.claude-plugin/marketplace.json   # liệt kê mọi plugin trong repo
mods/<name>/                      # mods: function hooks (TS) — pane, band, status line, toast, chặn/sửa tool call
  .claude-plugin/plugin.json
  hooks/hooks.json                # { "modules": ["./register.ts"] }
  hooks/register.ts
plugins/vuha-toolkit/             # plugin thường
  skills/<skill>/SKILL.md
  commands/<cmd>.md
  hooks/hooks.json                # command hooks (SessionStart, PreToolUse, ...)
```

## Cài đặt

```
/plugin install vuha-toolkit --marketplace vuhpquang/vuha-claude-plugin
/plugin install hello-mod --marketplace vuhpquang/vuha-claude-plugin
```

## Phát triển

```bash
claude plugin validate mods/hello-mod
claude plugin test mods/hello-mod        # chạy *.test.ts
claude --plugin-dir ./mods/hello-mod --plugin-dir ./plugins/vuha-toolkit
```

Hoặc add cả repo làm marketplace local (sửa file rồi `/reload-plugins`, không cần reinstall):

```bash
claude plugin marketplace add .
```
