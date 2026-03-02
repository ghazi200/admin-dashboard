// backend/src/models/PolicyChunk.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");

const PolicyChunk = sequelize.define(
  "PolicyChunk",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    tenant_id: { type: DataTypes.UUID, allowNull: false },
    site_id: { type: DataTypes.UUID, allowNull: true },

    document_id: { type: DataTypes.UUID, allowNull: false },

    chunk_index: { type: DataTypes.INTEGER, allowNull: false },

    section_title: { type: DataTypes.STRING(255), allowNull: true },
    page_start: { type: DataTypes.INTEGER, allowNull: true },
    page_end: { type: DataTypes.INTEGER, allowNull: true },

    content: { type: DataTypes.TEXT, allowNull: false },

    embedding_json: { type: DataTypes.JSONB, allowNull: true },

    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "policy_chunks",
    timestamps: false,
  }
);

module.exports = PolicyChunk;
