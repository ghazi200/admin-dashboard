/**
 * Migration: Create sites table
 * 
 * Stores site/building information for tenants.
 * Enables structured location tracking for incidents and shifts.
 */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("sites", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4,
      },

      tenant_id: { 
        type: Sequelize.UUID, 
        allowNull: false,
        references: { model: 'tenants', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      name: { 
        type: Sequelize.STRING, 
        allowNull: false 
      }, // "Abe-Guard - Building A"
      
      address_1: { 
        type: Sequelize.STRING, 
        allowNull: true 
      },
      
      address_2: { 
        type: Sequelize.STRING, 
        allowNull: true 
      },
      
      city: { 
        type: Sequelize.STRING, 
        allowNull: true 
      },
      
      state: { 
        type: Sequelize.STRING, 
        allowNull: true 
      },
      
      zip: { 
        type: Sequelize.STRING, 
        allowNull: true 
      },

      lat: { 
        type: Sequelize.DECIMAL(10, 7), 
        allowNull: true 
      },
      
      lng: { 
        type: Sequelize.DECIMAL(10, 7), 
        allowNull: true 
      },

      is_active: { 
        type: Sequelize.BOOLEAN, 
        allowNull: false, 
        defaultValue: true 
      },

      created_at: { 
        type: Sequelize.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.fn("NOW") 
      },
      
      updated_at: { 
        type: Sequelize.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.fn("NOW") 
      },
    });

    // Indexes for performance (multi-tenant queries)
    await queryInterface.addIndex("sites", ["tenant_id", "is_active"], {
      name: "idx_sites_tenant_active"
    });
    
    await queryInterface.addIndex("sites", ["tenant_id", "name"], {
      name: "idx_sites_tenant_name"
    });

    console.log('✅ Created sites table with indexes');
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("sites", "idx_sites_tenant_name");
    await queryInterface.removeIndex("sites", "idx_sites_tenant_active");
    await queryInterface.dropTable("sites");
    console.log('✅ Dropped sites table');
  },
};
