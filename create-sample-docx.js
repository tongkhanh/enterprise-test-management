const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');

const doc = new Document({
    sections: [{
        properties: {},
        children: [
            new Paragraph({
                text: "Yêu Cầu Bài Toán (User Story): Quản lý Sản phẩm",
                heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
                children: [
                    new TextRun({ text: "Tiêu đề: ", bold: true }),
                    new TextRun("Là một nhân viên kho, tôi muốn có thể thêm sản phẩm mới vào hệ thống để quản lý hàng hóa dễ dàng hơn."),
                ],
            }),
            new Paragraph({
                text: "Tiêu chí chấp nhận (Acceptance Criteria):",
                heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
                text: "1. AC1: Trang thêm sản phẩm phải có các trường: Tên sản phẩm (bắt buộc), Số lượng (bắt buộc, phải là số lớn hơn 0), và Mô tả (tùy chọn)."
            }),
            new Paragraph({
                text: "2. AC2: Khi nhấn nút 'Lưu', nếu các trường bắt buộc để trống, hệ thống báo lỗi màu đỏ 'Vui lòng điền đủ thông tin'."
            }),
            new Paragraph({
                text: "3. AC3: Khi nhập đúng thông tin và nhấn 'Lưu', hệ thống báo 'Thêm thành công' và chuyển về trang danh sách sản phẩm."
            }),
            new Paragraph({
                text: "Các luồng thay thế (Alternative Flows):",
                heading: HeadingLevel.HEADING_2,
            }),
            new Paragraph({
                text: "- Nếu số lượng nhập vào là chữ cái, hệ thống không cho phép nhập hoặc báo lỗi 'Số lượng phải là số'."
            }),
        ],
    }],
});

Packer.toBuffer(doc).then((buffer) => {
    fs.writeFileSync("sample-user-story.docx", buffer);
    console.log("Đã tạo thành công file sample-user-story.docx !");
});
