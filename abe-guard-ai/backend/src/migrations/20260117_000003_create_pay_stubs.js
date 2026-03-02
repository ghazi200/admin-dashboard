"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("pay_stubs", {
      id: {
        type: Sequelize.UUID,
        allowNull: false,
        primaryKey: true,
        defaultValue: Sequelize.UUIDV4, // ✅ no pgcrypto dependency
      },

      tenant_id: { type: Sequelize.UUID, allowNull: false },
      guard_id: { type: Sequelize.UUID, allowNull: false },

      pay_period_start: { type: Sequelize.DATEONLY, allowNull: false },
      pay_period_end: { type: Sequelize.DATEONLY, allowNull: false },
      pay_date: { type: Sequelize.DATEONLY, allowNull: false },

      payment_method: { type: Sequelize.STRING, allowNull: false },

      hours_worked: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      gross_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      tax_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      deductions_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      net_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },

      tax_breakdown_json: { type: Sequelize.JSONB, allowNull: true },

      file_url: { type: Sequelize.TEXT, allowNull: false },
      file_name: { type: Sequelize.TEXT, allowNull: true },

      created_by_admin_id: { type: Sequelize.UUID, allowNull: true },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn("NOW"),
      },
    });

    // ✅ Add CHECK constraint for payment_method validation
    await queryInterface.sequelize.query(`
      ALTER TABLE pay_stubs
      DROP CONSTRAINT IF EXISTS pay_stubs_payment_method_check;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_stubs
      ADD CONSTRAINT pay_stubs_payment_method_check
      CHECK (payment_method IN ('DIRECT_DEPOSIT','CHECK'));
    `);

    // ✅ Add foreign key constraints for data integrity
    await queryInterface.sequelize.query(`
      ALTER TABLE pay_stubs
      ADD CONSTRAINT pay_stubs_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_stubs
      ADD CONSTRAINT pay_stubs_guard_id_fkey
      FOREIGN KEY (guard_id) REFERENCES guards(id)
      ON DELETE RESTRICT ON UPDATE CASCADE;
    `);

    // ✅ Add composite index for common queries (tenant + guard + date)
    await queryInterface.addIndex("pay_stubs", [
      "tenant_id",
      "guard_id",
      "pay_date",
    ], {
      name: "pay_stubs_tenant_guard_date_idx"
    });

    // ✅ Add individual indexes for better query performance
    await queryInterface.addIndex("pay_stubs", ["tenant_id"], {
      name: "pay_stubs_tenant_id_idx"
    });

    await queryInterface.addIndex("pay_stubs", ["guard_id"], {
      name: "pay_stubs_guard_id_idx"
    });

    await queryInterface.addIndex("pay_stubs", ["pay_date"], {
      name: "pay_stubs_pay_date_idx"
    });
  },

  async down(queryInterface) {
    // ✅ Drop indexes first
    await queryInterface.removeIndex("pay_stubs", "pay_stubs_pay_date_idx");
    await queryInterface.removeIndex("pay_stubs", "pay_stubs_guard_id_idx");
    await queryInterface.removeIndex("pay_stubs", "pay_stubs_tenant_id_idx");
    await queryInterface.removeIndex("pay_stubs", "pay_stubs_tenant_guard_date_idx");

    // ✅ Drop foreign key constraints
    await queryInterface.sequelize.query(`
      ALTER TABLE pay_stubs
      DROP CONSTRAINT IF EXISTS pay_stubs_guard_id_fkey;
    `);

    await queryInterface.sequelize.query(`
      ALTER TABLE pay_stubs
      DROP CONSTRAINT IF EXISTS pay_stubs_tenant_id_fkey;
    `);

    // ✅ Drop CHECK constraint
    await queryInterface.sequelize.query(`
      ALTER TABLE pay_stubs
      DROP CONSTRAINT IF EXISTS pay_stubs_payment_method_check;
    `);

    // ✅ Finally drop the table
    await queryInterface.dropTable("pay_stubs");
  },
};
