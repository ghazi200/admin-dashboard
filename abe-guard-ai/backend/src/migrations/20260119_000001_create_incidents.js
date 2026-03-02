/**
 * Migration: Create incidents table
 * 
 * Stores incident reports from guards with tenant isolation,
 * severity tracking, and optional AI processing fields.
 */

"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("incidents", {
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
      
      guard_id: { 
        type: Sequelize.UUID, 
        allowNull: false,
        references: { model: 'guards', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      
      shift_id: { 
        type: Sequelize.UUID, 
        allowNull: true,
        references: { model: 'shifts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      type: { 
        type: Sequelize.STRING, 
        allowNull: false 
      }, // e.g. THEFT, TRESPASS, MEDICAL, OTHER
      
      severity: { 
        type: Sequelize.STRING, 
        allowNull: false 
      }, // LOW, MEDIUM, HIGH, CRITICAL
      
      status: { 
        type: Sequelize.STRING, 
        allowNull: false, 
        defaultValue: "OPEN" 
      }, // OPEN, ACKNOWLEDGED, RESOLVED

      occurred_at: { 
        type: Sequelize.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.fn("NOW") 
      },
      
      reported_at: { 
        type: Sequelize.DATE, 
        allowNull: false, 
        defaultValue: Sequelize.fn("NOW") 
      },

      location_text: { 
        type: Sequelize.TEXT, 
        allowNull: true 
      }, // Legacy/free-text location (backward compatibility)
      
      description: { 
        type: Sequelize.TEXT, 
        allowNull: false 
      },

      // Optional AI outputs later
      ai_summary: { 
        type: Sequelize.TEXT, 
        allowNull: true 
      },
      
      ai_tags_json: { 
        type: Sequelize.JSONB, 
        allowNull: true 
      },

      // Attachments (stored URLs)
      attachments_json: { 
        type: Sequelize.JSONB, 
        allowNull: true 
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
    await queryInterface.addIndex("incidents", ["tenant_id", "reported_at"], {
      name: "idx_incidents_tenant_reported"
    });
    
    await queryInterface.addIndex("incidents", ["tenant_id", "status"], {
      name: "idx_incidents_tenant_status"
    });
    
    await queryInterface.addIndex("incidents", ["tenant_id", "severity"], {
      name: "idx_incidents_tenant_severity"
    });
    
    await queryInterface.addIndex("incidents", ["guard_id"], {
      name: "idx_incidents_guard_id"
    });

    console.log('✅ Created incidents table with indexes');
  },

  async down(queryInterface) {
    await queryInterface.removeIndex("incidents", "idx_incidents_guard_id");
    await queryInterface.removeIndex("incidents", "idx_incidents_tenant_severity");
    await queryInterface.removeIndex("incidents", "idx_incidents_tenant_status");
    await queryInterface.removeIndex("incidents", "idx_incidents_tenant_reported");
    await queryInterface.dropTable("incidents");
    console.log('✅ Dropped incidents table');
  },
};
