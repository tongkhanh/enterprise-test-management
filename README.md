# Enterprise Test Management System

Ứng dụng web hoàn chỉnh cho quy trình kiểm thử E2E từ System Profile hoặc GitHub System Specification đến phê duyệt, Docker environment, multi-engine automation, unified evidence, AI Root Cause và triage.

## React AI Core Studio

Giao diện React mới cho AI Core & Web Analyzer nằm tại `frontend/` và được phục vụ ở `http://localhost:5000/studio/` sau khi build. Khi phát triển, `npm run dev` chạy đồng thời backend và Vite; mở `http://localhost:5173/studio/` để sử dụng HMR.

```text
frontend/
├── src/
│   ├── api/                     Axios client, JWT interceptors và API modules
│   ├── components/
│   │   ├── layout/              Sidebar, Header và Dashboard shell
│   │   └── ui/                  Button, Input, Card, Badge, Dialog, Skeleton
│   ├── features/ai-generator/   Analyzer form, inventory, AI generation, review cards
│   ├── pages/                   Login và các route cấp ứng dụng
│   ├── store/                   Zustand authentication state
│   ├── App.jsx                  React Router và auth guard
│   └── styles.css               Tailwind theme và animation
├── vite.config.js               Build vào public/studio
└── tailwind.config.js           SaaS dashboard design tokens
```

Stack frontend: React 19, Vite, Tailwind CSS, Radix/shadcn-style components, Zustand, TanStack Query, Axios và React Router.

## Khởi chạy

```powershell
npm install
Copy-Item .env.example .env
npm run check
npm start
```

Khi phát triển, chỉ chạy một lần `npm run dev`. Nodemon tự khởi động lại backend mỗi khi code thay đổi; file giao diện được trình duyệt tải lại ngay khi refresh.

Mở `http://localhost:5000`. Tài khoản đăng ký đầu tiên tự nhận vai trò `Admin`; các tài khoản tiếp theo nhận `Guest`. Giao diện lưu JWT trong Local Storage và tự gắn header `Authorization: Bearer ...` vào mỗi request.

Các biến bắt buộc để chạy chức năng nền tảng là `MONGODB_URI` và `JWT_SECRET`. AI Core mặc định dùng Gemini 3.5 Flash Free Tier qua Interactions API và cần `GEMINI_API_KEY`; `OPENAI_API_KEY` không còn bắt buộc. Gửi báo cáo cần cấu hình SMTP. Webhook CI/CD sẽ kiểm tra header `x-webhook-secret` khi `AUTOMATION_WEBHOOK_SECRET` được đặt.

## Cấu trúc

```text
config/          Kết nối MongoDB Atlas
models/          50 schema của 8 phân hệ
middleware/      JWT/session, RBAC, audit và xử lý lỗi
controllers/     Logic HTTP cho 8 phân hệ
services/        AI/vector search, email, KPI, report scheduler
routes/          REST endpoints dưới /api/v1
public/          AI Test Studio 7 bước và các trang quản trị nâng cao
utils/           AppError, phân trang và truy vấn dùng chung
scripts/         Kiểm tra khả năng nạp toàn bộ dự án
```

## Nhóm API chính

- `/api/v1/auth`: đăng ký, đăng nhập, hồ sơ, session, user, role, audit log.
- `/api/v1/workspaces`, `/projects`, `/sprints`, `/releases`: workspace và Agile.
- `/api/v1/user-stories`, `/comments`, `/design-mockups`: yêu cầu và tài liệu.
- `/api/v1/test-suites`, `/test-cases`, `/shared-test-data`, `/review-requests`: thiết kế và maker-checker.
- `/api/v1/test-plans`, `/test-runs`, `/test-executions`: thực thi thủ công.
- `/api/v1/automation/webhook`: nhận kết quả Selenium/Cypress/Playwright từ CI/CD.
- `/api/v1/automation/run-test-case/:testCaseId`: xếp hàng và chạy Test Case bằng Playwright.
- `/api/v1/automation/jobs/:id`: tiến độ, step result, diagnostics và evidence của job.
- `/api/v1/test-environments`: môi trường Static URL hoặc GitHub + Docker.
- `/api/v1/automation-scripts`: sinh/tải script Playwright, Selenium, Cypress, WebdriverIO và Robot Framework.
- `/api/v1/ai/analyze-root-cause/:automationResultId`: root cause có khả năng cao nhất.
- `/api/v1/automation-results/:id/triage`: Tester xác nhận Product Bug/Test Script/Test Data/Environment.
- `/api/v1/bugs`, `/bugs/:id/retests`: bug lifecycle, history và retest.
- `/api/v1/ai`: sinh test case, gợi ý severity, tìm trùng, knowledge base và RAG chatbot.
- `/api/v1/reports`, `/notifications`, `/dashboards`, `/scheduled-reports`, `/risk-assessments`, `/leaderboard`: báo cáo, risk và KPI.

Mọi list API hỗ trợ `page`, `limit` và các filter thể hiện trên giao diện. Response thành công có dạng `{ "success": true, "data": ... }`; lỗi có dạng `{ "success": false, "error": "..." }`.

## MongoDB Atlas Vector Search

Tạo index `bug_vector_index` trên collection `bug_embeddings`:

```json
{"fields":[
  {"type":"vector","path":"embedding","numDimensions":1536,"similarity":"cosine"},
  {"type":"filter","path":"project"},
  {"type":"filter","path":"bug"}
]}
```

Tạo index `knowledge_vector_index` trên collection `knowledge_bases`:

```json
{"fields":[
  {"type":"vector","path":"embedding","numDimensions":1536,"similarity":"cosine"},
  {"type":"filter","path":"project"},
  {"type":"filter","path":"isActive"}
]}
```

Nếu Atlas index chưa tồn tại, môi trường phát triển tự fallback sang cosine similarity trong Node.js (tối đa 500 bản ghi) để giao diện vẫn kiểm thử được. Production nên dùng Atlas index để bảo đảm hiệu năng.

## Kiểm tra

```powershell
npm run verify-models
npm run check
npm run check:web-analyzer
npm run check:automation
npm run check:workflow
npm run check:studio
npm run check:ai-provider
npm run check:approval-batch
npm audit
```

`npm run check` nạp toàn bộ controller, middleware, route, service và xác nhận đủ các tài nguyên UI mà không cần ghi dữ liệu vào database.

## Automation Lab và Docker

Mở menu **Automation Lab** sau khi đăng nhập:

1. Chọn Project và tạo môi trường `URL có sẵn` để kiểm tra staging/local app.
2. Hoặc tạo GitHub integration trong Settings, chọn repository + branch và tạo môi trường `GitHub + Docker`.
3. Repository đích phải có `Dockerfile`, ứng dụng trong container phải lắng nghe trên port đã chọn.
4. Chọn Automated Test Case và sinh script Playwright, Selenium, Cypress, WebdriverIO hoặc Robot Framework.

Nhánh GitHub + Docker cần Git và Docker Desktop đang chạy trên máy backend. Docker được gọi trực tiếp, container bị giới hạn CPU/RAM/PID và chỉ publish port trên `127.0.0.1`. Để đóng gói chính ETMS:

```powershell
docker compose up --build
```

Compose mount Docker socket để ETMS có thể dựng container ứng dụng đích. Đây là quyền mạnh; chỉ cấp cho worker ETMS đáng tin cậy và không public API quản trị ra Internet nếu chưa có reverse proxy/allowlist.

### Worker architecture

Production dùng ba queue/worker độc lập:

```text
GitHub Push/PR → etms-environment → Environment Worker → Docker/Compose → Health Check
Automation Run → etms-automation → Automation Worker → Playwright/Selenium/Cypress/WebdriverIO/Robot
Jira outbound → etms-integration → Integration Worker → retry/backoff
```

`docker compose up --build` tự chạy Redis, API và cả ba worker. Khi phát triển không có Redis, API dùng fallback trong process cho Environment/Automation/Integration. Muốn chạy worker riêng trên máy:

```powershell
$env:REDIS_URL="redis://127.0.0.1:6379"
npm run workers
```

GitHub webhook:

```text
POST /api/v1/webhooks/github/:integrationId
```

Đăng ký event `push` và `pull_request`, content type JSON, secret chính là webhook secret hiển thị một lần trong Settings. Jira inbound dùng:

```text
POST /api/v1/webhooks/jira/:integrationId
Header: x-etms-webhook-secret
```

Mỗi environment có lịch sử `EnvironmentBuild`, secret mã hóa, expiry/cleanup, container log, health state và snapshot Web Analyzer. `autoRetest` sẽ tạo Automation Run mới sau khi build từ Push/PR thành công.

Khi phát triển nên dùng `npm run dev` để có hot reload thay vì build lại sau mỗi lần đổi code.

## E2E Design Center

Trang **E2E Design Center** (`/studio/ai-generator`) không còn sinh Test Case theo một URL/trang. URL tĩnh chỉ là Test Environment để chạy hành trình. Có hai đầu vào dùng chung một flow sau đó:

1. **System Profile → E2E**: QA/BA khai báo Base URL, allowed hosts, role, secret reference, test data, endpoint seed/cleanup cùng-origin và các Use Case nghiệp vụ.
2. **GitHub → E2E**: chọn kết nối GitHub, repository, branch/commit/PR ref và các file source/tài liệu được phép gửi AI. Analyzer tạo System Map có module, route, API, role, entity/state, integration, risk và bằng chứng file.

Sau khi System Profile/System Map có trạng thái Ready: AI đề xuất hoặc QA tạo **Use Case**; QA Manager duyệt Use Case; AI tạo **User Story E2E**; QA Manager duyệt User Story; AI tạo Test Case theo Happy path, Alternate, Negative, Permission, Recovery và Integration. Test Case được duyệt tiếp tục đi qua Test Plan, Kanban, DSL, multi-engine runner, evidence, RCA, Jira, retest và report như các module sẵn có.

Các endpoint E2E chính:

```text
GET/POST  /api/v1/system-profiles
PATCH     /api/v1/system-profiles/:id
POST      /api/v1/system-profiles/github-analyze
POST      /api/v1/system-profiles/:profileId/suggest-use-cases
GET/POST  /api/v1/use-cases
PATCH     /api/v1/use-cases/:id
PATCH     /api/v1/use-cases/:id/decision
POST      /api/v1/use-cases/:id/generate-story
POST      /api/v1/use-cases/:id/generate-test-cases
```

`seedUrl` và `cleanupUrl` của System Profile là tùy chọn. Automation Runner chỉ gọi các endpoint `POST` đó nếu chúng cùng origin với Target URL và gửi body `{ testData }` cùng header `x-etms-e2e: true`; ứng dụng đích phải tự xác thực header này, tạo/xóa dữ liệu được gắn nhãn E2E và không được thao tác dữ liệu production.

## Playwright Web Analyzer

Hai endpoint mới yêu cầu đồng thời User Story và URL:

```text
POST /api/v1/ai/analyze-web-page
POST /api/v1/ai/generate-web-test-cases
```

Analyzer chỉ quan sát trang: tiêu đề, heading, form, input, button, link, locator gợi ý, console error, HTTP error và screenshot. Nó không click hoặc submit form. Test Case sinh từ hai nguồn được lưu `Draft`, `Automated`, có `targetUrl`, `storyCoverage`, test data và DSL action/locator.

Mặc định URL mạng riêng và localhost bị chặn để chống SSRF. Nên cấu hình allowlist cho staging:

```dotenv
WEB_ANALYZER_ALLOWED_HOSTS=staging.example.com,*.qa.example.com
```

Chỉ khi kiểm thử web nội bộ trên máy phát triển mới dùng:

```dotenv
WEB_ANALYZER_ALLOW_PRIVATE=true
```

Trên Windows, Analyzer tự tìm Google Chrome hoặc Microsoft Edge. Ở máy chủ Linux/CI, cài Chromium của Playwright hoặc đặt đường dẫn rõ ràng bằng `WEB_ANALYZER_BROWSER_EXECUTABLE`. Screenshot được bảo vệ bởi JWT và tự xóa sau thời gian cấu hình trong `WEB_ANALYZER_ARTIFACT_TTL_HOURS` (mặc định 24 giờ).

## Luồng AI Test Studio

1. Người dùng chọn Project, User Story, Test Suite và nhập URL bắt buộc.
2. Playwright kiểm tra URL, khám phá DOM/accessibility/form/button/link/network và chụp screenshot.
3. AI hợp nhất hai nguồn để sinh Test Case `Automated` dạng DSL an toàn; Tester chỉnh sửa và lưu.
4. Tester gửi QA Lead; kết quả duyệt chuyển Test Case sang `Approved` hoặc `Rejected`.
5. Tester chọn một hoặc nhiều Test Case `Approved`; hệ thống tạo một Test Plan, một Test Run và một Test Execution cho mỗi case.
6. Playwright xếp hàng toàn bộ Test Run, chạy DSL từng step và lưu screenshot, trace, DOM, console, network cùng HTTP errors.
7. Nếu Failed/Error, AI chọn một root cause có khả năng cao nhất cùng confidence, evidence, severity và priority.
8. Tester xác nhận để tạo/liên kết Product Bug, tạo Jira Issue, hoặc đưa Test Script/Test Data/Environment về nhánh sửa và chạy lại.

Để AI sinh Test Case, phân tích Root Cause, tìm Bug trùng và chạy RAG, tạo Gemini API key trong Google AI Studio rồi cấu hình backend:

```dotenv
AI_PROVIDER=GoogleAI
AI_MODEL=gemini-3.5-flash
GEMINI_API_KEY=your-secret-key
AI_EMBEDDING_PROVIDER=GoogleAI
AI_EMBEDDING_MODEL=gemini-embedding-001
AI_EMBEDDING_DIMENSIONS=1536
```

Không đưa `GEMINI_API_KEY` vào `frontend/`, source code hoặc Git. Free Tier có quota giới hạn; khi nhận HTTP 429, chờ quota phục hồi rồi thử lại. Automation Runner vẫn chạy các Test Case đã có mà không cần AI API key.

Để nhánh Product Bug tạo issue thật trên Jira Cloud, cấu hình `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN` và `JIRA_PROJECT_KEY`. Jira Issue được tạo qua REST API v3; screenshot, DOM và trace còn hiệu lực sẽ được đính kèm. Nếu chưa cấu hình, giao diện vẫn cho phép tạo Bug nội bộ.

## Automation Operations và monitoring

Trang `/studio/automation-operations` quản lý CSV/JSON dataset mã hóa, `$secret:NAME`, fixture setup/teardown, lịch regression, browser/device/viewport matrix, flaky score/quarantine/retry, traceability và failed-job retry.

```powershell
npm run monitoring:setup
$env:GRAFANA_ADMIN_PASSWORD="mat-khau-grafana-rieng"
docker compose -f docker-compose.yml -f docker-compose.observability.yml --profile monitoring up --build
```

Grafana chạy tại `http://localhost:3001`, Prometheus tại `http://localhost:9090`. Token metrics nằm trong Docker secret và không được commit. Runner Docker mặc định chạy Linux; hệ thống từ chối Windows/macOS hoặc browser version cố định nếu chưa có remote runner/image tương ứng.

```powershell
npm test
$env:TEST_MONGODB_URI="mongodb://127.0.0.1:27019/etms_test"
npm run test:integration
```

GitHub Actions chạy structure check, unit test, frontend build, API/RBAC/webhook integration và browser smoke test khi push/pull request.
## Collaboration model (Workspace / Project / Team)

ETMS now follows a Linear-style hierarchy: a Workspace is the top-level collaboration boundary, Projects are delivery/test contexts, and Teams are workspace-level groups that can be linked to multiple Projects. A Team link does not grant Project access; ProjectMembership/ProjectInvitation remains the explicit access boundary. Project pages expose the complete testing workflow (requirements, AI generation, approvals, cycles/board, automation, bugs and reports) and show the Teams and membership summary used by that workflow.

For an existing database, back up MongoDB and run the one-time relation migration from the project root:

```bash
npm run migrate:linear-collaboration
```

The migration removes the legacy single-project Team index, fills `workspace`/`projects` from existing `project` links, and adds the Team reference to each Project. It intentionally does not grant new Project permissions to Team members.
