const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({
                text: "Yêu Cầu Bài Toán (User Story): Đăng nhập hệ thống E-Learning CTU",
                heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Là một ", bold: true }),
                    new TextRun("Sinh viên hoặc Giảng viên,"),
                ],
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Tôi muốn ", bold: true }),
                    new TextRun("có thể đăng nhập vào hệ thống học trực tuyến elearning.ctu.edu.vn,"),
                ],
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Để ", bold: true }),
                    new TextRun("tôi có thể xem các khóa học, tải tài liệu và nộp bài tập."),
                ],
            }),
            new Paragraph({
                text: "",
            }),
            new Paragraph({
                text: "Tiêu chí chấp nhận (Acceptance Criteria):",
                heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
                text: "1. AC1 (Đăng nhập thành công): Người dùng nhập đúng 'Tên đăng nhập' và 'Mật khẩu' của tài khoản trường cấp, sau đó nhấn nút 'Đăng nhập'. Hệ thống chuyển hướng người dùng vào trang Dashboard (Nhà của tôi) hiển thị danh sách khóa học."
            }),
            new Paragraph({
                text: "2. AC2 (Sai thông tin): Người dùng nhập sai tên đăng nhập hoặc mật khẩu. Hệ thống phải hiển thị dòng thông báo lỗi màu đỏ 'Tên đăng nhập hoặc mật khẩu sai. Vui lòng thử lại'."
            }),
            new Paragraph({
                text: "3. AC3 (Để trống thông tin): Nếu người dùng không nhập gì mà nhấn thẳng nút Đăng nhập, hệ thống yêu cầu bắt buộc phải nhập dữ liệu."
            }),
            new Paragraph({
                text: "4. AC4 (Đăng nhập qua Office 365): Trang đăng nhập phải có nút cho phép đăng nhập bằng tài khoản Microsoft (CTU email). Khi nhấn vào, hệ thống chuyển hướng sang cổng đăng nhập của Microsoft."
            }),
            new Paragraph({
                text: "",
            }),
            new Paragraph({
                text: "Luồng thay thế (Alternative Flows):",
                heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
                text: "- Nếu người dùng quên mật khẩu, họ có thể nhấn vào liên kết 'Quên mật khẩu' để được chuyển sang trang khôi phục tài khoản."
            }),
        ],
    }],
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("ctu-elearning-user-story.docx", buffer);
    console.log("Đã tạo thành công file ctu-elearning-user-story.docx !");
});
