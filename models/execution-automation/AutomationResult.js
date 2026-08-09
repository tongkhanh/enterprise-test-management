/**
 * ============================================================
 * MODEL: AutomationResult (Kết quả Automation Test)
 * Phân hệ: Thực thi & Tích hợp Tự động (Execution & Automation)
 * Collection: automation_results
 * ============================================================
 * Nhận và lưu trữ kết quả từ các tool Automation (Selenium,
 * Cypress, Playwright) thông qua Webhook CI/CD.
 * Payload JSON từ CI/CD pipeline được lưu nguyên vẹn.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const automationResultSchema = new Schema(
  {
    suiteName: {
      type: String,
      required: [true, 'Tên Automation Suite là bắt buộc'],
      trim: true,
    },

    framework: {
      type: String,
      enum: {
        values: ['Selenium', 'Cypress', 'Playwright', 'Jest', 'Mocha', 'Robot', 'Other'],
        message: 'Framework phải là: Selenium, Cypress, Playwright, Jest, Mocha, Robot, hoặc Other',
      },
      required: [true, 'Framework là bắt buộc'],
    },

    status: {
      type: String,
      enum: {
        values: ['Passed', 'Failed', 'Error'],
        message: 'Trạng thái phải là: Passed, Failed, hoặc Error',
      },
      required: true,
    },

    // Thời gian chạy (giây)
    duration: {
      type: Number,
      default: 0,
      min: 0,
    },

    // -------------------------------------------
    // Thống kê kết quả
    // -------------------------------------------
    totalTests: {
      type: Number,
      default: 0,
      min: 0,
    },

    passed: {
      type: Number,
      default: 0,
      min: 0,
    },

    failed: {
      type: Number,
      default: 0,
      min: 0,
    },

    skipped: {
      type: Number,
      default: 0,
      min: 0,
    },

    // -------------------------------------------
    // CI/CD Metadata
    // -------------------------------------------
    buildNumber: {
      type: String,
      default: null,
    },

    pipelineUrl: {
      type: String,
      default: null, // Link tới CI/CD pipeline (Jenkins, GitHub Actions, GitLab CI)
    },

    triggeredBy: {
      type: String,
      enum: {
        values: ['CI_CD', 'Manual', 'Webhook', 'Scheduled'],
        message: 'Nguồn kích hoạt phải là: CI_CD, Manual, Webhook, hoặc Scheduled',
      },
      default: 'CI_CD',
    },

    // Payload JSON gốc từ CI/CD (lưu nguyên vẹn)
    payload: {
      type: Schema.Types.Mixed,
      default: null,
    },

    // Log lỗi chi tiết
    errorLogs: {
      type: String,
      default: null,
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    testRun: {
      type: Schema.Types.ObjectId,
      ref: 'TestRun',
      default: null,
    },

    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },
  },
  {
    timestamps: true,
    collection: 'automation_results',
  }
);

// =============================================
// Indexes
// =============================================
automationResultSchema.index({ project: 1, createdAt: -1 });
automationResultSchema.index({ testRun: 1 });
automationResultSchema.index({ framework: 1, status: 1 });
automationResultSchema.index({ buildNumber: 1 });

module.exports = mongoose.model('AutomationResult', automationResultSchema);
