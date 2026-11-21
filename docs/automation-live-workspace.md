# Automation execution workspace

The Test Run keeps separate Manual and Automation executions. In an Automation
execution, readiness checks cover the approved plan/case, Ready environment,
current approved script, dataset/secret bindings, fixture ownership and an
already-running job. Use Automation Lab to generate/edit, Validate, and send the
script through its existing QA approval. Readiness never approves a script.

**Chạy script đã duyệt** opens a split workspace: QA controls and evidence on the
left, the actual runner browser and progress on the right. **Quay lại Test Run**
only closes the viewer; the runner continues. **Theo dõi runner & lịch sử** reopens
it. Retest creates a new AutomationRun; prior runs and retry attempts remain
selectable. This does not switch the execution to Manual.

## Runner

Docker Compose builds `etms-playwright-runner:local` from the same pinned
Playwright dependency as ETMS. It contains the test package and browsers, so a
run no longer performs npm installation. Build/start with the explicit Compose
file (the development override has a different purpose):

```powershell
docker compose -f docker-compose.yml build api manual-browser-image playwright-runner-image
docker compose -f docker-compose.yml up -d
```

The exact legacy Playwright default profile is upgraded when a new run requests
the default. User-customized profiles are preserved. Chromium on the managed
profile has a read-only live view; Firefox/WebKit and custom profiles still run
and collect evidence without promising a browser stream.

The reporter observes the runner's own Chromium over loopback CDP inside that
runner container. No debugging port is published and the viewer has no input
endpoint. Approved script contents and code hashes are not modified. Browser
frames and a bounded progress journal are written under the existing shared
storage volume, per run/attempt, then exposed through authenticated project
routes. Input values and full assertion messages are excluded from the progress
journal; browser frames can naturally show the target's visible data.

## Outcomes and evidence

- Passed: test and assertions finished successfully.
- Failed: an assertion did not match. QA still identifies the cause before
  creating a Product Bug.
- Error: setup, action, timeout, script or runner failure. The execution becomes
  Blocked unless QA already provided an explicit verdict.
- Skipped: no test was executed successfully or unsuccessfully.

Screenshots/video/trace retain the existing Playwright failure policy. Full
redacted runner logs and collected evidence remain downloadable in Test Run.
The live pane shows progress events and individual assertion outcomes; it is
not a raw console mirror. Existing QA verdict overrides remain separate from
the runner outcome.

## Verification

The browser integration test executes real Playwright tests for Passed, Failed
and Error, verifies JPEG output, and checks progress does not contain filled test
values. API integration checks readiness, run ownership, history and the stream.
The UI harness verifies readiness gates and the read-only workspace with
synthetic APIs. Tests use local isolated databases, never Atlas.
