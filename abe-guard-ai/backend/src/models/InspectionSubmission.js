/**
 * InspectionSubmission Model
 * 
 * Stores guard submissions for inspection requests,
 * including photos, metadata, and optional AI verification results.
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Guard = require("./Guard");
const InspectionRequest = require("./InspectionRequest");

const InspectionSubmission = sequelize.define(
  "InspectionSubmission",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    request_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: InspectionRequest, key: "id" },
    },

    tenant_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Tenant, key: "id" },
    },

    guard_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: Guard, key: "id" },
    },

    submitted_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    photos_json: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: "[{ url, hash_sha256, filename, size, mime }]",
    },

    comment: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    meta_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: "{ device, ip, location: { lat, lng } }",
    },

    // Optional AI verification fields (Phase 3)
    ai_verdict: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "VALID | SUSPICIOUS | POOR_QUALITY",
    },

    ai_confidence: {
      type: DataTypes.DECIMAL(3, 2),
      allowNull: true,
      validate: {
        min: 0.00,
        max: 1.00,
      },
    },

    ai_notes: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: "{ faceDetected, qualityScore, challengeCodeFound }",
    },
  },
  {
    tableName: "inspection_submissions",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Associations are defined in models/index.js

module.exports = InspectionSubmission;
