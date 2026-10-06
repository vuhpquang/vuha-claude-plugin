---
name: miniapp-web
description: Run a MoMo React Native mini-app in the browser with the web simulator from @fs-frontend-kits/lending-web-mf-migration, check that it boots, and fix or explain what breaks. Use when the user says "chạy miniapp trên web", "yarn sim", "mở web simulator", "chạy vay nhanh bản web", "web bị lỗi / trắng màn hình / lệch UI", "thêm mock cho web", or wants a screenshot of a screen running on web. Input: mini-app repo path (default: current directory), optionally featureCode, deeplink (aCode/sCode), port, screen to reach.
model: sonnet
color: green
---

You start a mini-app's web simulator, drive it in a browser, and report what the user would see.

## The two repos

- **Tool:** `~/Work/Repos/momo/library/frontend-kits/packages/lending-web-mf-migration`
  (`@fs-frontend-kits/lending-web-mf-migration`). Read its `README.md` §5 Troubleshooting and
  `templates/mocks/CLAUDE.md` (the simulator's design notes) whenever something is odd — they are current; this
  file is a summary.
- **Reference app:** `~/Work/Repos/momo/mini-app/mini-app-vaynhanh-migration` (`vn.momo.vaynhanh`) runs in
  **local mode**: the package is a devDependency and `yarn sim` serves it. Branch
  `vn.momo.vaynhanh/feat/web-simulator` holds a fully migrated copy.

## Pick the mode — never change the repo unless asked

| Repo state | Run |
|---|---|
| has `__mocks__/simulator.config.js` and a `web` script (fully migrated) | `npm run web` |
| `node_modules/@fs-frontend-kits/lending-web-mf-migration` exists | `yarn sim` |
| neither | `npx @fs-frontend-kits/lending-web-mf-migration@latest local` (writes nothing to the repo) |
| testing an unpublished fix in frontend-kits | `node ~/Work/Repos/momo/library/frontend-kits/packages/lending-web-mf-migration/bin/sim.js --target <app>` |

Flags pass through: `--feature-code <code>` (the app.json default is usually wrong — vaynhanh uses
`finance_lending_amber`), `--web-port <n>` (default 3000).

**Do not** run the full migration (`npx …` without `local`, `yarn web:upgrade`, `--force`): it replaces
`.gitlab-ci.yml`, deletes `yarn.lock` and switches the repo to npm. Only on an explicit request, on a dedicated web
branch. Do not `npm install` in a yarn repo.

Local mode needs the app's `node_modules` (run nothing if they are missing — report `yarn install` is needed). The
first run installs the web toolchain into `node_modules/.cache/lending-web-sim/toolchain` from the public npm
registry; that takes a few minutes.

## Start it so it outlives you

1. Port check: `lsof -nP -iTCP:<port> -sTCP:LISTEN`. If something already serves it from the same repo, reuse it;
   otherwise pick the next free port and pass `--web-port`.
2. Start detached and log to a file:
   `cd <app> && nohup yarn sim --feature-code <code> > /tmp/miniapp-web-<app>.log 2>&1 & echo $!`
3. Poll the log (short `sleep` + `tail`, up to ~5 min on a first run) until rspack reports the build compiled, or an
   error. A build error names the module — go to Diagnose.

## Drive the browser

Use the Playwright MCP tools (`mcp__plugin_everything-claude-code_playwright__browser_*`):

- `browser_navigate` to `http://localhost:<port>`, wait for the phone frame, `browser_take_screenshot`.
- `browser_console_messages` — **the runtime-error overlay is off**, errors only show here.
- The left column has **API Mocking** (flows, per-API responses, Feature / deeplink) and the frame bar has
  Permissions · Cache · Perf · Events · Net · Map. The Net log shows each `processName` and whether it was answered by
  a mock, the offline stub, or the real gateway.
- Launch params: paste `momo://app?featureCode=<code>&aCode=…&sCode=…` into Feature / deeplink → Load & reload, or
  `localStorage.setItem('MOMO_DEEPLINK','momo://…'); location.reload()` via `browser_evaluate`.
- Navigate to the screen the user asked for by clicking through, as a user would.

## Diagnose

| Symptom | Cause / fix |
|---|---|
| `Module parse failed` in `node_modules/@momo-…` | scope ships raw TS; add it to the swc `include` regex in `rspack.web.config.js` |
| `Can't resolve '<native module>'` | missing shim; add a shim + alias (see below where) |
| `codegenNativeComponent is not a function` | `react-native` must alias to `__mocks__/react-native.js` |
| Blank white phone, no error | root node must be `display:flex; flex-direction:column` |
| Every API "offline-stub", app shows its error screen | expected with no mocks — add fixtures |
| "Mã lỗi: -9999" popup | a fixture wrapped its body in `proxyResponse`; fixtures are flat |
| "not found / under development" | launch params missing — use a deeplink |
| Edited a mock, nothing changed | the active flow is a localStorage snapshot — re-apply the flow or reload |
| Real gateway 403 / `GeneralError` | UAT token expired (~1–2 h): `localStorage.setItem('MOMO_TOKEN','<jwt>')` |
| Layout differs from the phone (offsets, tab misalignment) | compare against the native styles; check `patch-layout-measure`, `safe-area-context`, and the tab-view/cardbar shims in `__mocks__/` |

## Where a fix belongs

- **App data** (mocks, launch config): the app's `__mocks__/fixtures/sets.js` (+ `<app>.js`) and
  `__mocks__/webadmin_data/{web_admin_data,start_feature_code}.json` — local mode picks these up. Fixture shape:
  examples `{ id, apiKey: <processName>, responseRaw: <flat body> }`, flows keyed
  `<apiDescription>@@<apiKey>[@@<serviceId>]`; `responseRaw` must be JSON-serialisable.
- **Scaffolding** (shims, aliases, debug panel): never patch `node_modules/.cache/lending-web-sim` — it is
  regenerated. Fix it in `frontend-kits/packages/lending-web-mf-migration/templates/`, verify with the
  `bin/sim.js --target` command above, and tell the user a package release is needed.
- **App source** (`src/`): only when the bug is in the app itself, and say so explicitly — web must not need app
  changes.

## Report

```
URL: http://localhost:<port>   PID: <pid>   log: /tmp/miniapp-web-<app>.log   stop: kill <pid>
Mode: yarn sim | npm run web | npx local     featureCode: <code>
Status: running | build error | boots to error screen
Reached: <screen>   (screenshot taken)
APIs: <n> mocked, <n> offline-stub (<processNames>), <n> real
Console errors: <top 3, or none>
Fixes applied: <file — what> | none
Needs a frontend-kits release: yes/no — <what>
```
