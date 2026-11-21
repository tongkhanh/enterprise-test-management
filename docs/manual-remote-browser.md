# Manual remote browser

Manual executions open a split workspace: existing ETMS steps, data, QA results,
evidence and Bug Log on the left; an interactive remote Chromium browser on the
right. The target is a top-level page in that browser, not an iframe. Its
`X-Frame-Options` and CSP `frame-ancestors` headers remain unchanged.

## Startup

Use the existing Compose environment and Atlas configuration:

```powershell
docker compose -f docker-compose.yml up -d --build
```

Compose builds `etms-app:local` and `etms-manual-browser:local`. The
`manual-browser-image` initializer exits successfully after preparing the image;
this is expected. The internal `manual-browser-broker` must become healthy before
the API starts. No browser/Playwright installation is needed on testers' machines.

The broker signing secret comes from the existing `JWT_SECRET`. It is never
passed to a browser-session container or the browser UI. The broker has no public
port. The API has no Docker socket; only the broker manages browser containers.
Standalone host `npm start` requires a reachable broker configuration and is not
the supported default for this feature; use Compose.

## Manual flow

1. Use an approved Execution Plan and a Manual Run with a valid runtime URL.
2. Click **Bắt đầu Manual Test** on the selected execution.
3. Log in to the target within the right pane. This browser has its own cookies;
   it does not inherit the tester's local browser login.
4. Perform the steps. Ordinary mouse/keyboard, scrolling, navigation, popups and
   JavaScript dialogs are supported. For IME/Unicode text, select the target field
   and use **Nhập tiếng Việt / dán văn bản**, or explicitly paste onto the canvas.
5. Save the actual result, per-step results and QA verdict using the existing
   controls. Saving does not navigate or restart the target browser.
6. **Chụp evidence** attaches a screenshot to that Test Execution. Existing
   evidence uploads and downloads remain available.
7. **Thu gọn** closes the viewer while retaining the server-side session for
   reconnect. **Kết thúc phiên** or **Kết thúc & quay lại Test Run** destroys it.

Disconnected viewers can reconnect without losing browser state while the
session is alive. A browser refresh can reopen the same execution's server-side
session; only saved QA form values are guaranteed to survive a full refresh.

## Isolation and lifetime

- One session per tester/execution; a tester may have one active execution
  browser at a time. The broker caps the installation at four sessions.
- Each browser has a separate, non-root container, read-only filesystem, writable
  temporary cache/profile, no host mounts, dropped capabilities, CPU/memory/PID
  limits, and no application database/provider/SMTP credentials.
- Browser containers use a separate network. Only the broker joins that network
  and the application network. Neither VNC nor CDP ports are published.
- API routes enforce current authentication, project access, execution mode and
  plan approval. Streams use the existing Authorization header, not URL tokens.
  Long-lived viewers are periodically rechecked for session/project revocation.
- The broker accepts short-lived, operation/body-bound signed API requests. Each
  browser runtime uses a separate random internal token.
- Idle sessions end after 15 minutes without input/capture, with a two-hour hard
  limit. Runtime and broker cleanup both enforce limits; broker restart cleans
  its orphaned browser containers. Login state is not saved after session end.
- Navigation and network requests use the existing Web Analyzer URL policy.
  Private staging needs the existing `WEB_ANALYZER_ALLOW_PRIVATE` setting; this
  implementation does not enable it globally. Metadata addresses remain blocked.

## Boundaries

Manual input uses a persistent WebSocket after a one-use, 30-second ticket is
issued by the authenticated execution API. The ticket is sent as a subprotocol,
never as a URL or browser login JWT. Session, permissions, plan approval and
execution mode are checked at connection and every 30 seconds. Each bounded
input batch is acknowledged; uncertain input is never replayed automatically.
If WebSockets are unavailable, the existing authenticated HTTP control path
remains available. Vite proxies WebSocket upgrades during development.

Frames use a reduced JPEG stream, cache the latest image for reconnection and
send a periodic cached frame for static pages. Loading/error states survive a
viewer reconnect. Cold starts wait up to 45 seconds; dead browser containers
are replaced when reconnecting. New unsaved step results start as **Chưa kiểm
thử**, while existing recorded results retain their values.

This version supports desktop Chromium at a 1440x900 viewport, live interaction
and screenshot evidence. Resizing the panes scales the display, not the target
viewport. Video recording, target-site file upload/download, bidirectional
clipboard sync, browser extensions and OS-native dialogs are outside this first
version. Existing ETMS evidence uploads still work.

Iframe restrictions are supported by opening the target normally in the remote
browser. CAPTCHA, MFA, bot/datacenter restrictions, unavailable websites and
certificate errors still require normal handling; this feature does not bypass
them. Browser startup/capture never automatically marks a Test Case Passed.

## Verification

```powershell
npm test
npm run check
npm --prefix frontend run build
node frontend/check-workflow-retest.mjs
$env:TEST_MONGODB_URI='mongodb://127.0.0.1:27017/etms_test'
$env:TEST_BROWSER='true'
npm run test:integration
docker compose -f docker-compose.yml exec -T manual-browser-broker node manual-browser/smoke.js --isolated
```

API tests use isolated databases; the Docker smoke test uses a disposable fixture
that sends `X-Frame-Options: DENY` and `frame-ancestors 'none'`, synthetic identities
and no Atlas records. `--isolated` permits the private fixture only in a temporary
test broker process and does not change the running broker's policy.

For acceptance, open two users' sessions, check separate logins, save QA results
without a browser restart, capture/reopen evidence, reconnect after a display
disconnect, and verify explicit end/idle cleanup removes the session container.
