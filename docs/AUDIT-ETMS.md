# ETMS Audit — Giai đoạn 0

Ngày audit: 2026-08-13

| # | Yêu cầu | Trạng thái trước Giai đoạn 1 | Bằng chứng / khoảng trống |
|---|---|---|---|
| 1 | Welcome Page, Dashboard và các trang chính | Một phần | Dashboard, Bug Tracking, Gamification, Settings đã có dữ liệu thật; chưa có Welcome Page công khai và Dashboard chưa tách Draft/NeedsReview. |
| 2 | Upload PDF/DOC/DOCX và kết hợp AI + URL | Đã hoàn thành Giai đoạn 2 | Có upload giới hạn 10 MB, kiểm tra chữ ký tệp, kho file riêng, metadata MongoDB, trích xuất `pdf-parse`/`mammoth`/`word-extractor`, preview UI và Document Context được chọn để gửi cùng User Story + Web Analyzer sang Gemini. |
| 3 | Workspace, Project, Team, Invitation, Sprint | Đã hoàn thành Giai đoạn 2 | Workspace/Project/Team/Membership/Invitation đã có API/UI; Sprint có alias Cycle, giao diện planning, Label và Project Activity lưu MongoDB. |
| 4 | Kanban Board theo Cycle | Chưa có | Chưa có Board Item, cột workflow, position/reorder API hoặc drag-and-drop UI. Thực hiện ở Giai đoạn 3. |
| 5 | Chống Admin/người gửi tự duyệt | Một phần, còn lỗi backend | UI Generator chủ yếu chỉ hiện nút cho reviewer, nhưng controller vẫn cho Admin bypass và chưa chặn `requestedBy === reviewer`. Thực hiện cùng Approval transaction ở Giai đoạn 3. |
| 6 | Trạng thái duyệt bền vững sau reload | Một phần | ReviewRequest và TestCase được lưu MongoDB, nhưng chưa có transaction, Board Item và invalidate toàn bộ query; context Generator chưa persist. Giai đoạn 3. |
| 7 | Luồng sau khi QA duyệt | Một phần | Test Plan/Test Run, Playwright runner, evidence và RCA backend đã có. Chưa nối Approved → Backlog → Cycle/Board → Run trên UI. Giai đoạn 3–4. |
| 8 | Tách quyền Tester/QA và invite giống Linear | Đạt Giai đoạn 1–2 | Global RBAC và ProjectMembership đã có; invite email token một lần đã có. API User Story Document, Cycle, Label và Activity đã kiểm tra quyền theo Project; tiếp tục áp dụng cho Board ở Giai đoạn 3. |
| 9 | Dashboard, Bug Tracking, Gamification, Settings | Đã có bản hoạt động | Các trang dùng API thật, hỗ trợ dark/light và responsive; tiếp tục bổ sung theo từng module. |
| 10 | Integrations, execution logs và AI root cause | Một phần | Playwright evidence và Gemini RCA backend đã có; IntegrationConnection mới lưu cấu hình, chưa có provider adapter/test/log. Hoàn thiện adapter trong Giai đoạn 1. |
| 11 | Export Excel/PDF/CSV/JUnit | Chưa đạt | Chỉ có scheduled report gửi CSV tóm tắt; chưa có export stream theo Project và định dạng yêu cầu. Giai đoạn 4. |

## Phạm vi hoàn thiện trong Giai đoạn 1

- Welcome Page công khai, Login và redirect Dashboard rõ ràng.
- Dashboard bổ sung Draft/NeedsReview/Approved và Test Run gần nhất.
- Hoàn thiện vòng đời lời mời bằng resend token an toàn.
- Provider adapter cho Jira/GitHub/Linear, test connection, sync log và rotate webhook secret.
- Giữ credential mã hóa và không bao giờ trả access token về frontend.
- Kiểm thử invitation, membership, integration encryption và provider adapter.

## Các quyết định kiến trúc

- MongoDB tiếp tục là nguồn dữ liệu nghiệp vụ duy nhất; Zustand chỉ giữ theme và lựa chọn giao diện.
- Email invitation và external integration là hai luồng độc lập.
- ProjectMembership là nguồn quyền theo Project; global Role chỉ là quyền nền của workspace.
- Integration provider dùng adapter interface để có thể thêm Cypress/Postman/CI ở giai đoạn sau.
- Các thay đổi Approval + Board phải thực hiện idempotent/transaction trong Giai đoạn 3, không vá rời rạc trong Giai đoạn 1.
