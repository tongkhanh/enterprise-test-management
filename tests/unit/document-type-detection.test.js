const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AiGenerationLog = require('../../models/ai-core/AiGenerationLog');
const { detectBusinessDocumentType, splitDetailedUseCaseSections, parseDetailedUseCaseSection, extractUseCaseSharedContext, splitDetailedRequirementSections, splitDetailedUserStorySections, parseDetailedUserStorySection } = require('../../services/documentExtractionService');

const useCase = (code, name) => `${code} ${name}
Trường
Nội dung
Tác nhân
Customer
Tiền điều kiện
Đã đăng nhập.
Luồng chính
Gửi yêu cầu; hệ thống lưu dữ liệu.
Luồng thay thế / lỗi
Dữ liệu sai thì từ chối.
Hậu điều kiện
Dữ liệu được lưu.
Bằng chứng mã nguồn
api/action.php`;

test('structured Use Case documents are not classified as Requirements', () => {
  const source = `${useCase('UC-FR-01', 'Đặt đơn')}\n\n${useCase('UC-FR-02', 'Theo dõi đơn')}`;
  const detected = detectBusinessDocumentType(source);
  assert.equal(detected.type, 'UseCase');
  assert.equal(detected.confidence, 'High');
  assert.equal(detected.evidence.useCaseCodes, 2);
});

test('detailed Use Case splitter ignores catalog rows and keeps complete specifications', () => {
  const source = `3. Danh mục use case
UC-FR-01 Đặt đơn
UC-FR-02 Theo dõi đơn
4. Đặc tả chi tiết
${useCase('UC-FR-01', 'Đặt đơn')}
${useCase('UC-FR-02', 'Theo dõi đơn')}`;
  const sections = splitDetailedUseCaseSections(source);
  assert.equal(sections.length, 2);
  assert.match(sections[0], /Tác nhân[\s\S]*Luồng chính[\s\S]*Hậu điều kiện/);
  assert.match(sections[1], /^UC-FR-02/);
});

test('structured Use Case parsing preserves source evidence without relying on AI', () => {
  const parsed = parseDetailedUseCaseSection(useCase('UC-FR-01', 'Đặt đơn'));
  assert.equal(parsed.code, 'UC-FR-01');
  assert.equal(parsed.actor, 'Customer');
  assert.deepEqual(parsed.dependencies, ['api/action.php']);
  assert.deepEqual(parsed.preconditions, ['Đã đăng nhập.']);
  assert.match(parsed.mainFlowSource, /hệ thống lưu dữ liệu/);
});

test('shared Use Case context retains global rules while excluding detailed cases', () => {
  const source = `1. Phạm vi\nVai trò Customer.\n4. Đặc tả chi tiết\n${useCase('UC-FR-01', 'Đặt đơn')}\n5. Quy tắc dữ liệu và trạng thái\nOrder chỉ nhận Pending hoặc Delivered.`;
  const context = extractUseCaseSharedContext(source);
  assert.match(context, /Vai trò Customer/);
  assert.match(context, /Order chỉ nhận Pending hoặc Delivered/);
  assert.doesNotMatch(context, /UC-FR-01 Đặt đơn/);
  const [section] = splitDetailedUseCaseSections(source);
  const parsed = parseDetailedUseCaseSection(section);
  assert.deepEqual(parsed.dependencies, ['api/action.php']);
});

test('detailed Requirement splitter ignores overview matrix rows', () => {
  const source = `BR-01 Overview only
BR-02 Overview only
3. Đặc tả chi tiết
BR-01 Đặt món
Loại
Functional
Mô tả
Mô tả 1
Mục tiêu nghiệp vụ
Mục tiêu 1
Actor / Stakeholder
Customer
Trong phạm vi
Checkout
Quy tắc nghiệp vụ và ràng buộc
Phải đăng nhập
Acceptance Criteria có thể kiểm chứng
Given x When y Then z
BR-02 Thanh toán
Loại
Functional
Mô tả
Mô tả 2
Mục tiêu nghiệp vụ
Mục tiêu 2
Actor / Stakeholder
Customer
Trong phạm vi
COD
Quy tắc nghiệp vụ và ràng buộc
Không lưu CVV
Acceptance Criteria có thể kiểm chứng
Given a When b Then c`;
  const sections = splitDetailedRequirementSections(source);
  assert.equal(sections.length, 2);
  assert.match(sections[0], /^BR-01 Đặt món/);
  assert.match(sections[1], /^BR-02 Thanh toán/);
});

test('structured User Story extraction ignores catalog rows and preserves all detailed fields', () => {
  const story = (id, title) => `${id} ${title}
As a Customer, I want đặt món, so that nhận được món ăn.
Mã User Story
${id}
Ưu tiên
High
Story Points
5 - đã ước lượng
Giờ ước tính
8
Giá trị nghiệp vụ
Tăng tỷ lệ hoàn tất đơn
Tags
Customer, Order
Trong phạm vi
Checkout
Ngoài phạm vi
Thanh toán ngoài
Acceptance Criteria
Given giỏ hợp lệ When xác nhận Then tạo đơn
Business Rules
Một giỏ chỉ có món của một nhà hàng
Yêu cầu phi chức năng có bằng chứng
Phản hồi dưới 3 giây
Rủi ro và điểm cần xác nhận
Gateway chưa tích hợp
Giả định
Khách đã đăng nhập
Phụ thuộc
Cart API
Definition of Ready
API đã rõ
Definition of Done
AC đã kiểm thử
Dữ liệu kiểm thử cần có
Giỏ hợp lệ
Dữ liệu không được sử dụng
Thẻ thật
Bằng chứng mã nguồn
api/cart-action.php`;
  const source = `3 Danh mục User Story
US-FR-01
Đặt món
${story('US-FR-01', 'Đặt món')}
${story('US-FR-02', 'Theo dõi đơn')}`;
  const sections = splitDetailedUserStorySections(source);
  assert.equal(sections.length, 2);
  const parsed = parseDetailedUserStorySection(sections[0]);
  assert.equal(parsed.externalId, 'US-FR-01');
  assert.equal(parsed.title, 'Đặt món');
  assert.equal(parsed.storyPoints, 5);
  assert.equal(parsed.estimatedHours, 8);
  assert.deepEqual(parsed.labels, ['Customer', 'Order']);
  assert.deepEqual(parsed.businessRules, ['Một giỏ chỉ có món của một nhà hàng']);
  assert.deepEqual(parsed.sourceEvidence, ['api/cart-action.php']);
  assert.deepEqual(parsed.acceptanceCriteria, ['Given giỏ hợp lệ When xác nhận Then tạo đơn']);
});

test('AI generation log accepts structured User Story document extraction', () => {
  const id = new mongoose.Types.ObjectId();
  const log = new AiGenerationLog({
    promptUsed: 'deterministic extraction', inputData: {}, outputData: {}, status: 'Success',
    featureUsed: 'ExtractUserStoriesFromDocument', user: id, project: id,
    tokensUsed: { input: 0, output: 0, total: 0 }, latencyMs: 1,
  });
  assert.equal(log.validateSync(), undefined);
});
