/**
 * ============================================================
 * MODEL: Release (Phiên bản phát hành)
 * Phân hệ: Quản lý Đa dự án & Agile (Workspace & Agile)
 * Collection: releases
 * ============================================================
 * Quản lý các phiên bản phần mềm:
 * VD: Bản v1.0.0, Trạng thái Alpha/Beta/Production, Ngày Release.
 * ============================================================
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

const releaseSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Tên Release là bắt buộc'],
      trim: true,
    },

    // Số phiên bản theo Semantic Versioning
    version: {
      type: String,
      required: [true, 'Số phiên bản là bắt buộc'],
      trim: true,
      // VD: "v1.0.0", "v2.1.0-beta"
    },

    description: {
      type: String,
      trim: true,
      default: '',
    },

    status: {
      type: String,
      enum: {
        values: ['Draft', 'Alpha', 'Beta', 'RC', 'Production'],
        message: 'Trạng thái phải là: Draft, Alpha, Beta, RC, hoặc Production',
      },
      default: 'Draft',
    },

    releaseDate: {
      type: Date,
      default: null, // Ngày dự kiến phát hành
    },

    actualReleaseDate: {
      type: Date,
      default: null, // Ngày phát hành thực tế
    },

    releaseNotes: {
      type: String,
      default: '', // Ghi chú phát hành (changelog)
    },

    // -------------------------------------------
    // Liên kết (References)
    // -------------------------------------------
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Dự án là bắt buộc'],
    },

    sprints: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Sprint',
      },
    ],

    manager: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null, // Release Manager
    },
  },
  {
    timestamps: true,
    collection: 'releases',
  }
);

// =============================================
// Indexes
// =============================================
releaseSchema.index({ project: 1, version: 1 }, { unique: true });
releaseSchema.index({ project: 1, status: 1 });

module.exports = mongoose.model('Release', releaseSchema);
