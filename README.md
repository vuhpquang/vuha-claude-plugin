# vuha-claude-plugin

Marketplace chứa plugin Claude Code của Vu Ha: **mods** (giao diện và hook viết bằng TypeScript), **skills** và **command hooks**.

## Có gì

### Mods

| Mod | Hiện ở đâu | Làm gì | Lệnh |
| --- | --- | --- | --- |
| [`context-bar`](mods/context-bar) | band trên prompt | Chia context window theo loại (system prompt, tools, MCP tools, agents, memory files, skills, messages, free), có % và mốc auto-compact. Tự cập nhật sau mỗi turn. | `/context-bar` bật/tắt |
| [`agents-panel`](mods/agents-panel) | pane bên cạnh | Liệt kê subagent trong `.claude/agents` và `~/.claude/agents`, kèm model và mô tả. **▶ run** giao task hiện tại cho agent. | `/agents-panel` mở/đóng |
| [`mr-panel`](mods/mr-panel) | pane bên cạnh | MR GitLab đang mở của bạn và MR đang chờ bạn review: trạng thái (ready, conflict, ci failed, …), số comment. **▶ review** nhờ Claude review MR. Tự refresh mỗi 5 phút. | `/mr-panel` mở/đóng |
| [`jira-band`](mods/jira-band) | band trên prompt | Lấy mã Jira từ tên branch (`feature/ABC-123-…`), hiện trạng thái, tiêu đề, assignee; bấm mã để mở ticket. | `/jira-band` bật/tắt |
| [`cost-guard`](mods/cost-guard) | status line | `💸 $1.23 · 5h 42% · 7d 12%`: chi phí session và rate limit. Toast một lần khi vượt ngưỡng. | — |
| [`turn-timer`](mods/turn-timer) | status line | `⏱ 1m15s · 8 tools` chạy trong lúc Claude làm việc, `✓ …` khi xong. Toast khi một turn dài hơn 2 phút. | — |

### `vuha-toolkit` (skills + hooks)

| | Tên | Làm gì |
| --- | --- | --- |
| skill | `/standup [YYYY-MM-DD]` | Báo cáo daily từ commit (mọi repo trong `~/Work/Repos`), MR GitLab và ticket Jira của ngày làm việc trước. |
| skill | `/release-notes [from] [to]` | Gom commit từ tag gần nhất thành release note (tính năng, sửa lỗi, breaking, nội bộ). |
| hook | PostToolUse `Edit\|Write` | Chạy `prettier --write` và `eslint --fix` trên file vừa sửa, **chỉ trong dự án prod** (đường dẫn khớp `/Work/Repos/momo/(mini-app\|library)/`). Lỗi eslint không tự sửa được thì trả về cho Claude sửa tiếp. |
| hook | UserPromptSubmit + Stop | Gửi thông báo macOS (có âm thanh) khi Claude làm xong một turn dài từ 30 giây trở lên. |

## Cài đặt

Gõ trong prompt của Claude Code (terminal). Cài cái nào thì gõ dòng đó:

```
/plugin install context-bar --marketplace vuhpquang/vuha-claude-plugin
/plugin install agents-panel --marketplace vuhpquang/vuha-claude-plugin
/plugin install mr-panel --marketplace vuhpquang/vuha-claude-plugin
/plugin install jira-band --marketplace vuhpquang/vuha-claude-plugin
/plugin install cost-guard --marketplace vuhpquang/vuha-claude-plugin
/plugin install turn-timer --marketplace vuhpquang/vuha-claude-plugin
/plugin install vuha-toolkit --marketplace vuhpquang/vuha-claude-plugin
```

Lần đầu Claude Code hỏi **Add marketplace?** (`github:vuhpquang/vuha-claude-plugin`): bấm `y`, rồi chọn scope (user là mặc định, nhấn Enter). Mod chạy ngay trong session hiện tại.

`vuhpquang/vuha-claude-plugin` là cách viết tắt của repo GitHub. Claude Code clone repo về và đọc `.claude-plugin/marketplace.json` ở thư mục gốc để biết repo có plugin nào và mỗi plugin nằm ở đâu.

Cách khác là thêm marketplace một lần, rồi cài từ CLI hoặc duyệt qua `/plugin`:

```bash
claude plugin marketplace add vuhpquang/vuha-claude-plugin
claude plugin install context-bar@vuha-claude-plugin
```

## Cấu hình

### GitLab (`mr-panel`, `/standup`) và Jira (`jira-band`, `/standup`)

Token được đọc từ biến môi trường, không lưu trong settings:

```bash
# ~/.zshrc
export GITLAB_API_URL="https://gitlab.example.com/api/v4"
export GITLAB_PERSONAL_ACCESS_TOKEN="glpat-..."   # scope read_api
export JIRA_URL="https://jira.example.com"
export JIRA_API_TOKEN="..."                       # Jira Server/DC: personal access token (Bearer)
```

Cũng có thể đặt URL qua `/config` (dòng của plugin) hoặc trong `~/.claude/settings.json`:

```json
{
  "pluginConfigs": {
    "mr-panel":  { "options": { "gitlabApiUrl": "https://gitlab.example.com/api/v4" } },
    "jira-band": { "options": { "jiraUrl": "https://jira.example.com", "jiraUser": "" } },
    "cost-guard": { "options": { "costWarnUsd": 5, "rateWarnPercent": 80 } },
    "turn-timer": { "options": { "longTurnSeconds": 120 } }
  }
}
```

Với Jira Cloud, đặt `jiraUser` là email: plugin sẽ dùng basic auth (`email:token`). Để trống thì token được gửi dạng Bearer, dành cho Jira Server/DC.

GitLab/Jira nội bộ cần VPN. Khi không kết nối được, pane hoặc band sẽ hiện lỗi thay vì dữ liệu.

### `vuha-toolkit`

| Biến môi trường | Mặc định | Dùng cho |
| --- | --- | --- |
| `VUHA_LINT_PATHS` | `/Work/Repos/momo/(mini-app\|library)/` | regex (ERE) đường dẫn được lint khi sửa file |
| `VUHA_NOTIFY_MIN_SECONDS` | `30` | turn ngắn hơn số giây này thì không thông báo |
| `VUHA_STANDUP_ROOTS` | `~/Work/Repos` | các thư mục (ngăn cách bằng `:`) tìm git repo cho `/standup` |
| `VUHA_STANDUP_AUTHORS` | email trong git config | thêm pattern author, ngăn cách bằng `\|` |

Hook lint dùng `prettier` và `eslint` cài trong `node_modules/.bin` của dự án (thư mục gần nhất tính từ file), không cài gì thêm.

## Cập nhật và gỡ

```bash
claude plugin marketplace update vuha-claude-plugin
claude plugin update context-bar@vuha-claude-plugin   # rồi /reload-plugins trong session
claude plugin uninstall context-bar@vuha-claude-plugin
```

## Cấu trúc repo

```
.claude-plugin/marketplace.json     # danh sách mọi plugin trong repo (repo này = marketplace)
mods/<name>/                        # mod: function hooks (TS/TSX)
  .claude-plugin/plugin.json        # name, version, description, "types", "userConfig"
  hooks/hooks.json                  # { "modules": ["./register.tsx"] }
  hooks/register.tsx                # export const register: Register = (on, options) => { ... }
  types/index.d.ts                  # contract của $.state (nếu mod giữ state)
  tests/*.test.ts                   # chạy bằng `claude plugin test`
plugins/vuha-toolkit/               # plugin thường
  .claude-plugin/plugin.json
  skills/<skill>/SKILL.md (+ scripts/)
  hooks/hooks.json                  # command hooks
  hooks/scripts/*.sh
```

## Phát triển

```bash
claude plugin validate .                      # marketplace
claude plugin validate mods/mr-panel          # manifest + hooks module, như engine sẽ đọc
claude plugin test mods/mr-panel              # *.test.ts

# chạy thử từ thư mục (chỉ session này, sửa file là tự hot-reload)
claude --plugin-dir ./mods/mr-panel --plugin-dir ./plugins/vuha-toolkit
```

Hoặc thêm cả repo làm marketplace local. Khi đó plugin đọc thẳng từ thư mục: sửa xong chạy `/reload-plugins`, không cần cài lại:

```bash
claude plugin marketplace add .
claude plugin install mr-panel@vuha-claude-plugin
```

Type-check: sau khi mod được load lần đầu, engine sinh `.claude-plugin/types/` và `tsconfig.json` trong thư mục mod (đã gitignore), rồi chạy `npx tsc -p mods/mr-panel`.

Lưu ý khi viết mod: hàm nào nhận `$` phải khai báo ở top-level của file, vì validator theo dõi các lời gọi `$`. Mỗi band trên prompt nên `await next(e)` rồi đặt kết quả bên dưới tree của mình, để các band khác (`context-bar`, `jira-band`) vẫn hiện được.

### Thêm plugin mới

1. Tạo thư mục trong `mods/` hoặc `plugins/` theo cấu trúc trên.
2. Thêm một entry vào `.claude-plugin/marketplace.json` (`name` trùng với `plugin.json`, `source` là đường dẫn tương đối).
3. `claude plugin validate .`, rồi push.
4. Khi ra bản mới thì tăng `version` trong `plugin.json` để người dùng nhận được qua `claude plugin update`.

> Mods (function hooks) là API early access, có thể thay đổi giữa các bản Claude Code.
