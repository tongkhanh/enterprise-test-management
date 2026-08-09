# Enterprise Test Management System (ETMS) - Backend Models

Hệ thống Quản lý Kiểm thử Cấp Doanh nghiệp sử dụng MERN Stack (MongoDB, Node.js, Express, React). Đây là phần cấu hình kết nối cơ sở dữ liệu MongoDB Atlas và toàn bộ 32 Mongoose Schemas của 8 phân hệ nghiệp vụ chính, được thiết kế theo chuẩn Enterprise.

## 📁 Cấu trúc thư mục dự án

```text
├── config/
│   └── db.js                  # Cấu hình kết nối MongoDB Atlas & Graceful Shutdown
├── models/
│   ├── index.js               # Barrel Export tập trung tất cả 32 models
│   ├── system-security/       # Phân hệ 1: Quản trị & Bảo mật Hệ thống (4 models)
│   ├── workspace-agile/       # Phân hệ 2: Quản lý Đa dự án & Agile (4 models)
│   ├── requirements-docs/     # Phân hệ 3: Quản lý Yêu cầu & Tài liệu (3 models)
│   ├── test-design/           # Phân hệ 4: Thiết kế Kiểm thử (4 models)
│   ├── execution-automation/  # Phân hệ 5: Thực thi & Tích hợp Tự động (4 models)
│   ├── bug-tracking/          # Phân hệ 6: Quản lý Lỗi (3 models)
│   ├── ai-core/               # Phân hệ 7: Lõi Trí Tuệ Nhân Tạo (5 models - Vector Search)
│   └── reports-gamification/  # Phân hệ 8: Báo cáo, Đánh giá & Tiện ích (5 models)
├── .env.example               # File cấu hình biến môi trường mẫu
├── .gitignore                 # Bỏ qua node_modules và file .env bảo mật
├── package.json               # Cấu hình dự án và dependencies (Mongoose, dotenv)
└── verify-models.js           # Script kiểm tra tải các models thành công
```

## 🛠️ Hướng dẫn cài đặt & Chạy thử

### 1. Cài đặt các thư viện phụ thuộc:
```bash
npm install
```

### 2. Cấu hình biến môi trường:
* Copy file `.env.example` thành `.env`:
  ```bash
  cp .env.example .env
  ```
* Mở file `.env` và điền chuỗi kết nối **MongoDB Atlas Connection URI** của bạn (lưu ý thay `<db_password>` bằng mật khẩu Database User thực tế).

### 3. Kiểm tra tính hợp lệ của tất cả 32 Models:
```bash
npm run verify-models
```
Nếu thành công, bạn sẽ thấy thông báo:
`All 32 models loaded successfully! ✅`

---

## 🌟 Phân hệ Lõi Trí Tuệ Nhân Tạo (AI Core) & Vector Search

Dự án này tích hợp tính năng tìm kiếm lỗi trùng lặp và Chatbot hỏi đáp nghiệp vụ RAG sử dụng **MongoDB Atlas Vector Search** (mảng số thực 1536 chiều tương thích với OpenAI Embedding models).

Hai collections lưu trữ vector:
1. `bug_embeddings`: Lưu vector của Bug.
2. `knowledge_bases`: Lưu vector tài liệu dự án để làm cơ sở tri thức cho Chatbot.

### Cấu hình Atlas Vector Search Indexes:
Hãy tạo 2 index trên giao diện MongoDB Atlas Tab **Atlas Search** (Chọn **Atlas Vector Search** -> **JSON Editor**):

#### Index 1: `bug_vector_index` cho collection `bug_embeddings`
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "project"
    }
  ]
}
```

#### Index 2: `knowledge_vector_index` cho collection `knowledge_bases`
```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "project"
    },
    {
      "type": "filter",
      "path": "isActive"
    }
  ]
}
```
