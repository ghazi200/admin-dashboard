const bcrypt = require("bcryptjs");
const { getTenantWhere, ensureTenantId } = require("../utils/tenantFilter");
const { validatePassword } = require("../utils/passwordPolicy");

exports.listAdmins = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    
    // ✅ Tenant isolation: Filter by tenant (admins/supervisors only see their tenant's users)
    const tenantWhere = getTenantWhere(req.admin);
    const whereClause = tenantWhere ? { ...tenantWhere } : {};

    const rows = await Admin.findAll({
      where: whereClause,
      attributes: ["id", "name", "email", "role", "permissions", "createdAt", "tenant_id"],
      order: [["id", "ASC"]],
    });
    return res.json({ data: rows });
  } catch (e) {
    return res.status(500).json({ message: "Failed to load users", error: e.message });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const { name, email, password, role, permissions } = req.body;
    const currentAdmin = req.admin; // Current user making the request

    if (!email || !email.includes("@")) {
      return res.status(400).json({ message: "Valid email is required" });
    }
    const pwdCheck = validatePassword(password);
    if (!pwdCheck.valid) {
      return res.status(400).json({ message: pwdCheck.message || "Password does not meet policy" });
    }

    const validRole = role && ["admin", "supervisor", "user"].includes(role) ? role : "supervisor";
    const requestedPermissions = Array.isArray(permissions) ? permissions : [];

    // ✅ HIERARCHICAL PERMISSION SYSTEM:
    // - Super Admin: Can create users with ANY permissions
    // - Admin: Can create supervisors with only permissions they have
    // - Admin: Cannot create other Admins (only Super Admin can)
    // - Supervisor: Cannot create users

    let validPermissions = [];
    let filteredOut = [];

    if (currentAdmin.role !== "super_admin") {
      if (currentAdmin.role === "admin") {
        // Admins can only create supervisors
        if (validRole === "admin") {
          return res.status(403).json({
            message: "Only Super Admin can create Admin users"
          });
        }

        if (validRole === "supervisor") {
          // Admin can only grant permissions they have
          const currentAdminPermissions = Array.isArray(currentAdmin.permissions) 
            ? currentAdmin.permissions 
            : [];
          
          // Filter to only include permissions the Admin has
          validPermissions = requestedPermissions.filter(
            perm => currentAdminPermissions.includes(perm)
          );

          // Track permissions that were filtered out
          filteredOut = requestedPermissions.filter(
            perm => !currentAdminPermissions.includes(perm)
          );
          if (filteredOut.length > 0) {
            console.warn(`Admin ${currentAdmin.email} tried to grant permissions they don't have: ${filteredOut.join(", ")}`);
          }
        }
      } else {
        // Supervisors cannot create users
        return res.status(403).json({
          message: "You don't have permission to create users"
        });
      }
    } else {
      // Super Admin can grant any permissions
      validPermissions = requestedPermissions;
    }

    const existing = await Admin.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // ✅ Tenant isolation: Auto-set tenant_id from admin's tenant (unless super_admin)
    const tenantData = ensureTenantId(req.admin, { tenant_id: req.body.tenant_id || null });
    const tenant_id = tenantData.tenant_id;

    const hash = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      name: (name || "").trim() || email.split("@")[0],
      email: email.toLowerCase().trim(),
      password: hash,
      role: validRole,
      permissions: validPermissions,
      tenant_id, // ✅ Include tenant_id for multi-tenant support
    });
    const sequelize = req.app.locals.models?.sequelize;
    if (sequelize) {
      const { addToHistory } = require("../utils/passwordHistory");
      await addToHistory(sequelize, admin.id, hash);
    }

    return res.status(201).json({
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || [],
      warning: filteredOut && filteredOut.length > 0 
        ? `Some permissions were not granted (you don't have them): ${filteredOut.join(", ")}`
        : undefined
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to create user", error: e.message });
  }
};

exports.setPermissions = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const id = Number(req.params.id);
    const { permissions } = req.body;
    const currentAdmin = req.admin; // Current user making the request

    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: "permissions must be an array of strings" });
    }

    const targetAdmin = await Admin.findByPk(id);
    if (!targetAdmin) return res.status(404).json({ message: "User not found" });

    // ✅ HIERARCHICAL PERMISSION SYSTEM:
    // - Super Admin: Can grant ANY permissions (bypass check)
    // - Admin: Can ONLY grant permissions they themselves have
    // - Supervisor: Cannot grant permissions (should not reach here, but check anyway)

    if (currentAdmin.role !== "super_admin") {
      // For non-super-admins, validate they can only grant permissions they have
      if (currentAdmin.role === "admin") {
        // Admin can grant permissions to supervisors, but only what they have
        if (targetAdmin.role === "supervisor") {
          const currentAdminPermissions = Array.isArray(currentAdmin.permissions) 
            ? currentAdmin.permissions 
            : [];
          
          // Check if trying to grant a permission the Admin doesn't have
          const invalidPermissions = permissions.filter(
            perm => !currentAdminPermissions.includes(perm)
          );

          if (invalidPermissions.length > 0) {
            return res.status(403).json({
              message: `You cannot grant permissions you don't have: ${invalidPermissions.join(", ")}`,
              invalidPermissions,
              yourPermissions: currentAdminPermissions
            });
          }
        } else if (targetAdmin.role === "admin") {
          // Admins cannot grant permissions to other Admins (only Super Admin can)
          return res.status(403).json({
            message: "Only Super Admin can grant permissions to Admins"
          });
        }
      } else {
        // Supervisors cannot grant permissions
        return res.status(403).json({
          message: "You don't have permission to grant permissions to others"
        });
      }
    }
    // Super Admin bypasses all checks - can grant any permissions

    targetAdmin.permissions = permissions;
    await targetAdmin.save();

    return res.json({
      id: targetAdmin.id,
      email: targetAdmin.email,
      role: targetAdmin.role,
      permissions: targetAdmin.permissions || [],
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to update permissions", error: e.message });
  }
};

exports.setRole = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const id = Number(req.params.id);
    const { role } = req.body;

    if (!["admin", "supervisor", "user"].includes(role)) {
      return res.status(400).json({ message: "role must be admin, supervisor, or user" });
    }

    const admin = await Admin.findByPk(id);
    if (!admin) return res.status(404).json({ message: "User not found" });

    admin.role = role;
    await admin.save();

    return res.json({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || [],
    });
  } catch (e) {
    return res.status(500).json({ message: "Failed to update role", error: e.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { Admin } = req.app.locals.models;
    const id = Number(req.params.id);
    const currentAdminId = req.admin?.id;

    console.log("🗑️ Delete user request:", { id, currentAdminId, type: typeof id });

    // Prevent deleting yourself
    if (id === currentAdminId) {
      console.log("❌ Cannot delete own account");
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const admin = await Admin.findByPk(id);
    if (!admin) {
      console.log("❌ User not found:", id);
      return res.status(404).json({ message: "User not found" });
    }

    const email = admin.email;
    console.log("✅ Deleting user:", { id, email });
    
    await admin.destroy();
    
    console.log("✅ User deleted successfully:", { id, email });

    return res.json({
      success: true,
      message: `User ${email} has been deleted`,
      deletedId: id,
    });
  } catch (e) {
    console.error("❌ Delete user error:", e);
    return res.status(500).json({ message: "Failed to delete user", error: e.message });
  }
};
