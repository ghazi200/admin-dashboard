/**
 * Incident Model
 * 
 * Stores incident reports from guards with tenant isolation,
 * severity tracking, and optional AI processing fields.
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");
const Guard = require("./Guard");
const Shift = require("./Shift");
const Site = require("./Site");

const Incident = sequelize.define(
  "Incident",
  {
    id: { 
      type: DataTypes.UUID, 
      defaultValue: DataTypes.UUIDV4, 
      primaryKey: true 
    },

    tenant_id: { 
      type: DataTypes.UUID, 
      allowNull: false,
      references: { model: Tenant, key: "id" }
    },
    
    guard_id: { 
      type: DataTypes.UUID, 
      allowNull: false,
      references: { model: Guard, key: "id" }
    },
    
    shift_id: { 
      type: DataTypes.UUID, 
      allowNull: true,
      references: { model: Shift, key: "id" }
    },
    
    site_id: { 
      type: DataTypes.UUID, 
      allowNull: true,
      references: { model: Site, key: "id" }
    },

    type: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },
    
    severity: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },
    
    status: { 
      type: DataTypes.STRING, 
      allowNull: false, 
      defaultValue: "OPEN" 
    },

    occurred_at: { 
      type: DataTypes.DATE, 
      allowNull: false, 
      defaultValue: DataTypes.NOW 
    },
    
    reported_at: { 
      type: DataTypes.DATE, 
      allowNull: false, 
      defaultValue: DataTypes.NOW 
    },

    location_text: { 
      type: DataTypes.TEXT, 
      allowNull: true 
    }, // Legacy/free-text location (backward compatibility)
    
    description: { 
      type: DataTypes.TEXT, 
      allowNull: false 
    },

    // Optional AI outputs later
    ai_summary: { 
      type: DataTypes.TEXT, 
      allowNull: true 
    },
    
    ai_tags_json: { 
      type: DataTypes.JSONB, 
      allowNull: true 
    },

    // Attachments (stored URLs)
    attachments_json: { 
      type: DataTypes.JSONB, 
      allowNull: true 
    },
  },
  {
    tableName: "incidents",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

// Associations
Incident.belongsTo(Tenant, { foreignKey: "tenant_id" });
Incident.belongsTo(Guard, { foreignKey: "guard_id" });
Incident.belongsTo(Shift, { foreignKey: "shift_id" });
Incident.belongsTo(Site, { foreignKey: "site_id" });

module.exports = Incident;
