/**
 * Site Model
 * 
 * Represents a physical site/building location for a tenant.
 * Used for structured location tracking in incidents and shifts.
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/db");
const Tenant = require("./Tenant");

const Site = sequelize.define(
  "Site",
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

    name: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },
    
    address_1: { 
      type: DataTypes.STRING, 
      allowNull: true 
    },
    
    address_2: { 
      type: DataTypes.STRING, 
      allowNull: true 
    },
    
    city: { 
      type: DataTypes.STRING, 
      allowNull: true 
    },
    
    state: { 
      type: DataTypes.STRING, 
      allowNull: true 
    },
    
    zip: { 
      type: DataTypes.STRING, 
      allowNull: true 
    },

    lat: { 
      type: DataTypes.DECIMAL(10, 7), 
      allowNull: true 
    },
    
    lng: { 
      type: DataTypes.DECIMAL(10, 7), 
      allowNull: true 
    },

    is_active: { 
      type: DataTypes.BOOLEAN, 
      allowNull: false, 
      defaultValue: true 
    },
  },
  {
    tableName: "sites",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

Site.belongsTo(Tenant, { foreignKey: "tenant_id" });

module.exports = Site;
