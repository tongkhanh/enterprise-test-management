/**
 * ============================================================
 * MODEL: UserStory (Yêu cầu nghiệp vụ)
 * Phân hệ: Quản lý Yêu cầu & Tài liệu (Requirements & Docs)
 * Collection: user_stories
 * ============================================================
 * Quản lý User Story: Tiêu đề, Mô tả, Acceptance Criteria,
 * Story Points, thuộc Sprint nào, gán cho ai.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const userStorySchema = new Schema(
  {
    title: {
      type: String,
      required: [true, 'Tiêu đề User Story là bắt buộc'],
      trim: true,
      maxlength: [300, 'Tiêu đề không được quá 300 ký tự'],
    },

    description: {
      type: String,
      default: '',
      // Format: "As a [role], I want [feature], so that [benefit]"
    },

    businessValue: { type: String, trim: true, maxlength: 2000, default: '' },
    inScope: { type: [String], default: [] },
    outOfScope: { type: [String], default: [] },
    nonFunctionalRequirements: { type: [String], default: [] },
    risks: { type: [String], default: [] },
    assumptions: { type: [String], default: [] },
    dependencies: { type: [String], default: [] },
    definitionOfReady: { type: [String], default: [] },
    definitionOfDone: { type: [String], default: [] },
    testDataRequirements: { type: [String], default: [] },
    dataRestrictions: { type: [String], default: [] },
    estimatedHours: { type: Number, min: 0, max: 10000, default: 0 },

    // Tiêu chí chấp nhận
    acceptanceCriteria: [
      {
        criteria: { type: String, required: true },
        isCompleted: { type: Boolean, default: false },
      },
    ],

    storyPoints: {
      type: Number,
      default: 0,
      min: [0, 'Story Points không được âm'],
      // Thường dùng dãy Fibonacci: 1, 2, 3, 5, 8, 13, 21
    },

    priority: {
      type: String,
      enum: {
        values: ['Critical', 'High', 'Medium', 'Low'],
        message: 'Độ ưu tiên phải là: Critical, High, Medium, hoặc Low',
      },
      default: 'Medium',
    },

    status: {
      type: String,
      enum: {
        values: ['Backlog', 'Ready', 'InProgress', 'Review', 'Done', 'Cancelled'],
        message: 'Trạng thái không hợp lệ',
      },
      default: 'Backlog',
    },

    // Quy trình Maker-Checker chỉ bắt buộc với bản User Story do AI đề xuất
    // (có aiSuggestion). User Story có sẵn từ nguồn nghiệp vụ đáng tin cậy
    // được dùng trực tiếp; trạng thái này vẫn được lưu để truy vết.
    approvalStatus: {
      type: String,
      enum: ['Draft', 'PendingApproval', 'Approved', 'Rejected'],
      default: 'Draft',
      index: true,
    },
    source: {
      type: String,
      enum: ['Manual', 'AI', 'GitHub', 'ImportedDocument'],
      default: 'Manual',
    },
    reference: { type: String, trim: true, maxlength: 1000, default: "" },
    sourceDocument: {
      fileName: { type: String, default: '' },
      documentType: { type: String, enum: ['', 'Requirement', 'UserStory'], default: '' },
      extractedAt: { type: Date, default: null },
    },
    externalReference: {
      system: { type: String, enum: ['', 'Jira', 'AzureDevOps', 'File', 'Other'], default: '' },
      externalId: { type: String, trim: true, maxlength: 160, default: '' },
      version: { type: String, trim: true, maxlength: 120, default: '' },
      effectiveAt: { type: Date, default: null },
    },
    // A User Story may be imported directly from the customer/PO backlog, or
    // be derived from one or more baselined requirements.  The link is kept
    // even when the story is the original business input.
    parentRequirements: [{ type: Schema.Types.ObjectId, ref: 'Requirement' }],
    businessApprovalStatus: {
      type: String,
      enum: ['NotConfirmed', 'PendingBusinessConfirmation', 'BusinessConfirmed', 'BusinessRejected'],
      default: 'NotConfirmed',
      index: true,
    },
    businessApprovedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    businessApprovedAt: { type: Date, default: null },
    businessDecisionNote: { type: String, default: '' },
    qaTestabilityStatus: {
      type: String,
      enum: ['NotReviewed', 'Testable', 'NeedsClarification'],
      default: 'NotReviewed',
      index: true,
    },
    qaReviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    qaReviewedAt: { type: Date, default: null },
    qaReviewNote: { type: String, default: '' },
    repositorySource: {
      snapshot: { type: Schema.Types.ObjectId, ref: 'RepositorySnapshot', default: null },
      repository: { type: String, default: '' },
      ref: { type: String, default: '' },
      commitSha: { type: String, default: '' },
      pullRequestNumber: { type: Number, default: null },
      files: { type: [String], default: [] },
    },
    aiSuggestion: {
      type: Schema.Types.Mixed,
      default: null,
    },
    reviewNote: { type: String, default: '' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },

    labels: {
      type: [String],
      default: [],
    },
    e2e: {
      systemProfile: { type: Schema.Types.ObjectId, ref: 'SystemProfile', default: null },
      useCase: { type: Schema.Types.ObjectId, ref: 'UseCase', default: null },
      requirements: [{ type: Schema.Types.ObjectId, ref: 'Requirement' }],
      journeyType: { type: String, default: 'E2E' },
      definitionOfDone: { type: [String], default: [] },
      assumptions: { type: [String], default: [] },
      dependencies: { type: [String], default: [] },
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    sprint: {
      type: Schema.Types.ObjectId,
      ref: 'Sprint',
      default: null, // null = chưa đưa vào Sprint nào
    },

    assignee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    collection: 'user_stories',
  }
);

// =============================================
// Indexes
// =============================================
userStorySchema.index({ project: 1, status: 1 });
userStorySchema.index({ sprint: 1 });
userStorySchema.index({ assignee: 1, status: 1 });
userStorySchema.index({ project: 1, priority: 1 });

module.exports = mongoose.model('UserStory', userStorySchema);
