# ĐỀ CƯƠNG CHI TIẾT ĐỀ TÀI LUẬN VĂN TỐT NGHIỆP

**Môn học:** MÔ TẢ ĐỀ TÀI LUẬN VĂN NGÀNH CNTT CLC (Mã HP: CT553H)  
**Sinh viên thực hiện:** Tống Khánh Linh (MSSV: B2205993)  

---

## TÊN ĐỀ TÀI:
**Tiếng Việt:** XÂY DỰNG HỆ THỐNG QUẢN LÝ KIỂM THỬ DOANH NGHIỆP (ENTERPRISE TEST MANAGEMENT) TÍCH HỢP TRÍ TUỆ NHÂN TẠO VÀ TỰ ĐỘNG HÓA KIỂM THỬ TRÊN NỀN TẢNG MERN STACK.  
**Tiếng Anh:** AI-integrated Enterprise Test Management System with Playwright Automation using MERN Stack.  

---

## 1. MÔ TẢ ĐỀ TÀI

### 1.1. Đặt vấn đề và Lý do chọn đề tài
Trong quy trình phát triển phần mềm hiện đại, đảm bảo chất lượng (QA/QC) đóng vai trò then chốt. Tuy nhiên, việc quản lý kiểm thử theo phương pháp thủ công hoặc dùng các công cụ rời rạc thường dẫn đến sự thiếu đồng bộ, mất nhiều thời gian trong việc thiết kế Test Case, thực thi kiểm thử và truy vết lỗi (bug). Hơn nữa, quá trình phân tích nguyên nhân gốc rễ (Root Cause Analysis) khi test tự động bị fail đòi hỏi nhiều kinh nghiệm và công sức từ tester.

Nhằm giải quyết các vấn đề trên, đề tài hướng đến việc xây dựng một hệ thống quản lý kiểm thử toàn diện dành cho doanh nghiệp (Enterprise Test Management System). Ứng dụng quản lý toàn bộ vòng đời kiểm thử từ khâu tiếp nhận yêu cầu (User Story), thiết kế kịch bản, phê duyệt (Maker-Checker), cho đến thực thi tự động, thu thập bằng chứng (evidence) và quản lý lỗi. Điểm đột phá của hệ thống là việc ứng dụng Trí tuệ nhân tạo (AI - LLM) và Playwright nhằm tự động hóa các tác vụ lặp đi lặp lại như: sinh Test Case từ tài liệu và URL, phân tích nguyên nhân lỗi (Root Cause) và hỗ trợ tìm kiếm tri thức với RAG (Retrieval-Augmented Generation).

### 1.2. Mục tiêu của đề tài
Xây dựng một hệ thống Web hoàn chỉnh với kiến trúc Frontend/Backend phân tách rõ ràng, hỗ trợ RBAC (Role-Based Access Control) và tích hợp sâu AI. Cụ thể, các mục tiêu chức năng dành cho các vai trò trong hệ thống:

#### A. Đối với Nhân sự phân tích yêu cầu (BA/PO):
- **Quản lý dự án Agile:** Tạo và quản lý Workspace, Project, Sprint, Release.
- **Quản lý yêu cầu:** Tạo và chỉnh sửa User Story, đính kèm Design Mockups, bình luận và thảo luận trực tiếp trên yêu cầu để làm rõ nghiệp vụ.

#### B. Đối với Kỹ sư kiểm thử (Tester/QA):
- **Thiết kế kịch bản kiểm thử (Test Design):** Tạo Test Suite, Test Case, quản lý dữ liệu kiểm thử dùng chung (Shared Test Data). Gửi yêu cầu phê duyệt Test Case lên cấp quản lý (QA Lead).
- **Thực thi kiểm thử (Test Execution):** Nhóm các Test Case thành Test Plan/Test Run. Hỗ trợ thực thi thủ công (Manual) và tự động (Automation) thông qua nền tảng Playwright tích hợp.
- **AI Test Studio (Tính năng đột phá):** 
  - Đưa URL và User Story vào hệ thống, AI cùng Playwright Web Analyzer sẽ tự động khám phá DOM của trang, phân tích và sinh ra các Test Case (Automated) dưới dạng DSL (Domain-Specific Language) an toàn.
  - **Triage & Root Cause Analysis:** Khi một Automation Test bị lỗi, hệ thống AI tự động phân tích DOM, Console, Network và Trace để dự đoán nguyên nhân gốc rễ (Root Cause), gợi ý độ nghiêm trọng (Severity/Priority) giúp Tester phân loại lỗi (Product Bug, Test Script, hay Environment) dễ dàng.
- **Quản lý Lỗi (Bug Tracking):** Theo dõi vòng đời của Bug, lịch sử cập nhật, tạo yêu cầu kiểm thử lại (Retest).

#### C. Đối với Quản lý chất lượng (QA Lead/Manager):
- **Duyệt kịch bản:** Thực hiện quy trình Maker-Checker (Approved/Rejected) đối với các kịch bản kiểm thử do Tester đệ trình.
- **Theo dõi rủi ro và Hiệu suất:** Đánh giá Risk Assessments, xem Leaderboard hiệu suất của đội ngũ.
- **Báo cáo tổng quan:** Xem các Dashboard thống kê, thiết lập lịch gửi báo cáo tự động qua Email (Scheduled Reports).

#### D. Đối với Quản trị viên (Admin):
- Quản lý toàn bộ tài khoản người dùng, phân quyền hệ thống.
- Cấu hình các kết nối ngoại vi: Webhook CI/CD, tích hợp Jira API (để đồng bộ Bug), cấu hình kết nối AI Provider (Google Gemini).
- Theo dõi hệ thống qua Audit Log, quản lý cơ sở tri thức (Knowledge Base) phục vụ AI RAG.

---

## 2. CHỨC NĂNG HỆ THỐNG CHI TIẾT

### 2.1. Phân hệ Quản lý Dự án & Yêu cầu
- Đăng nhập/Đăng ký, xác thực qua JWT, quản lý phiên làm việc.
- Quản lý Workspaces, Projects, Sprints, Releases theo chuẩn Agile.
- Quản lý User Stories, đính kèm mockup giao diện, hệ thống bình luận đa luồng.

### 2.2. Phân hệ Quản lý Kiểm thử Cốt lõi (Core Testing)
- Tổ chức kiểm thử theo mô hình hình cây: Test Suites -> Test Cases.
- Workflow phê duyệt Test Case (Review Requests).
- Quản lý Test Plans, Test Runs và ghi nhận kết quả Test Executions (Pass, Fail, Blocked, Skipped).
- Quản lý kho dữ liệu kiểm thử dùng chung (Shared Test Data).

### 2.3. Phân hệ Tự động hóa & Tích hợp (Automation & CI/CD)
- Tích hợp Engine Playwright để thực thi các Test Case tự động.
- Ghi nhận đầy đủ bằng chứng (Evidence) cho mỗi bước: Screenshot, Trace, DOM, Console, HTTP errors.
- Nhận kết quả kiểm thử tự động từ các hệ thống CI/CD bên ngoài thông qua Webhook.

### 2.4. Phân hệ Trí tuệ nhân tạo (AI Core Studio)
- **AI Web Analyzer:** Phân tích cấu trúc web tĩnh thông qua Playwright để hỗ trợ sinh test.
- **Test Case Generation:** Sinh tự động Test Case từ tài liệu yêu cầu (User Story) và phân tích giao diện UI (URL).
- **AI Root Cause Analysis:** Tự động chẩn đoán lỗi của Automation Job bằng việc tổng hợp trace logs.
- **AI Triage & Bug Deduplication:** Hỗ trợ phân loại nguyên nhân lỗi và phát hiện các bug trùng lặp.
- **Chatbot RAG (Knowledge Base):** Hỏi đáp nội bộ về quy trình, kiến thức của dự án sử dụng công nghệ tìm kiếm vector (Vector Search).

### 2.5. Phân hệ Quản lý Lỗi & Báo cáo
- Quản lý Bug lifecycle, đồng bộ 2 chiều tạo Issue trực tiếp lên Jira Cloud.
- Dashboard báo cáo tiến độ kiểm thử, chất lượng phần mềm theo Sprint/Release.
- Hệ thống gửi báo cáo tiến độ tự động qua Email.
- Chấm điểm và xếp hạng tester (Leaderboard), theo dõi KPI.

---

## 3. CÔNG NGHỆ VÀ NGÔN NGỮ LẬP TRÌNH

### 3.1. Frontend (Giao diện người dùng Web)
- **Framework/Library:** React 19, Vite.
- **UI Components & Styling:** Tailwind CSS, Radix/shadcn-style (thiết kế dạng SaaS Dashboard).
- **Quản lý trạng thái (State Management):** Zustand, TanStack Query (React Query).
- **Điều hướng & Giao tiếp:** React Router, Axios.

### 3.2. Backend (Máy chủ và Cơ sở dữ liệu)
- **Môi trường & Framework:** NodeJS & ExpressJS (cấu trúc gồm 8 phân hệ, 32 Models).
- **Cơ sở dữ liệu:** MongoDB Atlas.
- **ORM:** Mongoose.
- **Bảo mật và Xác thực:** JWT (JSON Web Tokens), Role-Based Access Control (RBAC).

### 3.3. Trí tuệ nhân tạo (AI & Machine Learning)
- **AI Provider/Model:** Google Gemini API (gemini-3.5-flash) cho các tính năng sinh kịch bản và phân tích lỗi.
- **Vector Search (RAG):** MongoDB Atlas Vector Search kết hợp text embeddings (gemini-embedding-001) với không gian 1536 chiều để xây dựng Knowledge Base Chatbot và tìm lỗi trùng.

### 3.4. Kiểm thử Tự động & Dịch vụ hỗ trợ (DevOps/Third-party)
- **Công cụ Automation Core:** Playwright (khám phá DOM, chụp màn hình, thực thi DSL Test).
- **Quản lý mã nguồn:** Git & GitHub.
- **Tích hợp bên thứ 3:** Jira API (đồng bộ Bug), cấu hình SMTP (Gửi thư báo cáo).
- **Tích hợp CI/CD:** Hệ thống Webhook để lắng nghe kết quả từ Selenium/Cypress/Playwright của đối tác/pipeline.
