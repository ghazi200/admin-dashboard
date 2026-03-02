# 📋 Incident System: Adjustments for Multi-Tenant + Super Admin Architecture

## Overview

This document outlines the adjustments needed to the incident system spec to align with your architecture:
- **Tenant Admins/Supervisors**: Scoped to their tenant only
- **Super Admin**: Cross-tenant access (can see all tenants)
- **Sites/Locations**: Tenants can have multiple sites/buildings (incidents and shifts reference sites)

---

## 🏗️ Architecture Requirements

### Access Control Levels

1. **Tenant Admin** (`role: "admin"`)
   - Scoped to: Their own tenant (`req.admin.tenant_id`)
   - Can access: Only their tenant's incidents
   - Real-time: Receives events only for their tenant

2. **Super Admin** (`role: "super_admin"`)
   - Scoped to: All tenants
   - Can access: Any tenant's incidents (or all at once)
   - Real-time: Receives events from all tenants

3. **Guards**
   - Scoped to: Their own tenant (`req.user.tenant_id`)
   - Can create: Incidents for their tenant only

---

## 🔧 Critical Adjustments to Original Spec

### 1. Middleware & Request Object Structure

#### ✅ Your Codebase Uses:
```javascript
// Guard routes:
const guardAuth = require("../middleware/guardAuth");
// Sets: req.user.guardId, req.user.tenant_id

// Admin routes:
const adminAuth = require("../middleware/auth");  // NOT "authAdmin"
// Sets: req.admin.id, req.admin.role, req.admin.tenant_id
// Also: req.user = req.admin (for compatibility)
```

#### ❌ Original Spec Assumed:
```javascript
// Wrong: authGuard (should be guardAuth)
const authGuard = require("../middleware/authGuard");

// Wrong: req.guard (should be req.user)
req.guard.id, req.guard.tenant_id
```

#### ✅ Corrected Implementation:
```javascript
// Guard routes:
const guardAuth = require("../middleware/guardAuth");
router.use(guardAuth);

// In route handler:
const guardId = req.user?.guardId || req.user?.id;
const tenantId = req.user?.tenant_id;

// Admin routes:
const adminAuth = require("../middleware/auth");
router.use(adminAuth);

// In route handler:
const adminId = req.admin?.id;
const tenantId = req.admin?.tenant_id;
const isSuperAdmin = req.admin?.role === "super_admin";
```

---

### 2. Socket.IO Access Pattern

#### ✅ Your Codebase Uses:
```javascript
// Access Socket.IO in routes:
const io = req.app.get("io");  // NOT req.app.locals.io
```

#### ❌ Original Spec Assumed:
```javascript
const io = req.app.locals.io;  // Wrong
```

#### ✅ Corrected Implementation:
```javascript
// In route handlers:
const io = req.app.get("io");
if (io) {
  // Emit events
}
```

---

### 3. Socket.IO Rooms: Tenant Isolation + Super Admin

#### Current State (server.js):
- Global "admins" room only
- No tenant-specific rooms
- No super admin room

#### Required Changes:

**3a. Update Socket.IO Connection Handler (server.js)**

```javascript
// Add to server.js after line 65 (after join_guard handler):

// ✅ Admin joins tenant-specific room
socket.on("join-admin-tenant", ({ tenantId }) => {
  if (!tenantId) {
    console.warn("⚠️ join-admin-tenant: Missing tenantId");
    return;
  }
  
  // Join tenant-specific admin room
  socket.join(`admins:${tenantId}`);
  console.log(`✅ socket joined tenant room: admins:${tenantId}`, socket.id);
  
  // Super admin also joins global super_admin room
  // Note: Need to check admin role from JWT/auth payload
  // For now, we'll check on connect or emit a separate event
});

// ✅ Separate handler for super admin room join
socket.on("join-super-admin", () => {
  // Only allow if verified super admin (check auth token/role)
  socket.join("super_admin");
  console.log("✅ socket joined super_admin room", socket.id);
});
```

**3b. Update Incident Event Emission**

```javascript
// In guardIncidents.routes.js (when guard creates incident):

// Emit to tenant-specific admin room (tenant admins see it)
io.to(`admins:${tenantId}`).emit("incidents:new", {
  id: incident.id,
  tenant_id: tenantId,
  // ... other fields
});

// ALSO emit to super_admin room (super admins see all incidents)
io.to("super_admin").emit("incidents:new", {
  id: incident.id,
  tenant_id: tenantId,
  // ... other fields
});
```

**3c. Update Admin Dashboard Socket Connection**

```javascript
// In admin-dashboard/src/realtime/socket.js

socket.on("connect", () => {
  console.log("✅ Admin realtime socket connected:", socket.id);
  
  // Join global admin room (keep for backward compatibility)
  socket.emit("join_admin");
  
  // Extract tenantId from admin token or localStorage
  const adminToken = localStorage.getItem("adminToken");
  if (adminToken) {
    try {
      const decoded = jwt_decode(adminToken); // or parse from token
      const tenantId = decoded.tenant_id;
      const role = decoded.role;
      
      if (tenantId) {
        // Join tenant-specific room
        socket.emit("join-admin-tenant", { tenantId });
      }
      
      // If super admin, also join super_admin room
      if (role === "super_admin") {
        socket.emit("join-super-admin");
      }
    } catch (e) {
      console.warn("⚠️ Could not extract tenantId from token");
    }
  }
});
```

---

### 4. API Routes: Tenant Isolation + Super Admin Access

#### 4a. GET /api/admin/incidents (List Incidents)

**Tenant Admin Behavior:**
- Must only see their tenant's incidents
- `tenantId` should be auto-set from `req.admin.tenant_id`
- Query parameter `tenantId` should be ignored (security)

**Super Admin Behavior:**
- Can see all incidents if no `tenantId` specified
- Can filter by specific tenant if `tenantId` provided
- Should have a way to see all tenants

**Implementation:**

```javascript
// In adminIncidents.routes.js

router.get("/", async (req, res) => {
  try {
    const { Incident } = req.app.locals.models;
    
    const isSuperAdmin = req.admin?.role === "super_admin";
    
    // Tenant admin: Use their tenant_id (enforced)
    // Super admin: Can use query tenantId OR see all
    let tenantId;
    
    if (isSuperAdmin) {
      // Super admin can specify tenantId in query, or see all
      tenantId = req.query?.tenantId || null;
    } else {
      // Tenant admin restricted to their own tenant
      tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
      
      // Security: Ignore query tenantId for tenant admins
      // (Prevent tenant admins from accessing other tenants)
    }
    
    const { status, severity, type } = req.query;
    const limit = Math.min(Number(req.query.limit || 50), 200);
    
    const where = {};
    // Only filter by tenant if specified (super admin can see all)
    if (tenantId) {
      where.tenant_id = tenantId;
    }
    
    if (status) where.status = String(status).trim().toUpperCase();
    if (severity) where.severity = String(severity).trim().toUpperCase();
    if (type) where.type = String(type).trim().toUpperCase();
    
    const rows = await Incident.findAll({
      where,
      order: [["reported_at", "DESC"]],
      limit,
    });
    
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
```

#### 4b. PATCH /api/admin/incidents/:id (Update Incident)

**Tenant Admin Behavior:**
- Can only update incidents from their tenant
- `tenantId` check enforced in WHERE clause

**Super Admin Behavior:**
- Can update incidents from any tenant
- Should validate tenantId exists in incident

**Implementation:**

```javascript
router.patch("/:id", async (req, res) => {
  try {
    const { Incident } = req.app.locals.models;
    
    const isSuperAdmin = req.admin?.role === "super_admin";
    
    // Build WHERE clause based on admin role
    const where = { id: req.params.id };
    
    if (!isSuperAdmin) {
      // Tenant admin: Can only update their tenant's incidents
      const tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
      
      where.tenant_id = tenantId;
    }
    // Super admin: No tenant restriction (can update any incident)
    
    const incident = await Incident.findOne({ where });
    
    if (!incident) {
      return res.status(404).json({ message: "Incident not found" });
    }
    
    const patch = {};
    if (req.body.status) patch.status = String(req.body.status).trim().toUpperCase();
    if (typeof req.body.ai_summary === "string") patch.ai_summary = req.body.ai_summary;
    
    await incident.update(patch);
    
    // Emit update event
    const io = req.app.get("io");
    if (io) {
      // Emit to tenant room
      io.to(`admins:${incident.tenant_id}`).emit("incidents:updated", {
        id: incident.id,
        ...patch
      });
      
      // Also emit to super_admin room
      io.to("super_admin").emit("incidents:updated", {
        id: incident.id,
        tenant_id: incident.tenant_id,
        ...patch
      });
    }
    
    return res.json({ ok: true, incident });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
```

---

### 5. Guard Routes: Tenant Isolation

#### POST /api/guard/incidents (Create Incident)

**Guard Behavior:**
- Can only create incidents for their own tenant
- `tenant_id` auto-set from `req.user.tenant_id`

**Implementation:**

```javascript
// In guardIncidents.routes.js

router.post("/", upload.array("files", 5), async (req, res) => {
  try {
    const { Incident } = req.app.locals.models;
    
    // ✅ Guard's tenant_id from auth middleware
    const tenantId = req.user?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ 
        message: "Guard missing tenant_id. Guard must be assigned to a tenant." 
      });
    }
    
    const guardId = req.user?.guardId || req.user?.id;
    
    if (!guardId) {
      return res.status(401).json({ message: "Guard ID not found in token" });
    }
    
    const {
      type,
      severity,
      description,
      location_text = null,
      occurred_at = null,
      shift_id = null,
    } = req.body;
    
    if (!type || !severity || !description) {
      return res.status(400).json({ 
        message: "Missing required fields: type, severity, description" 
      });
    }
    
    const attachments = (req.files || []).map((f) => ({
      file_name: f.originalname,
      mime: f.mimetype,
      size: f.size,
      url: `/uploads/incidents/${f.filename}`,
    }));
    
    const incident = await Incident.create({
      tenant_id: tenantId,  // ✅ Enforced from guard's auth token
      guard_id: guardId,
      shift_id: shift_id || null,
      type: String(type).trim().toUpperCase(),
      severity: String(severity).trim().toUpperCase(),
      status: "OPEN",
      occurred_at: occurred_at ? new Date(occurred_at) : new Date(),
      reported_at: new Date(),
      location_text,
      description,
      attachments_json: attachments.length ? attachments : null,
    });
    
    // 🔔 Real-time: Emit to BOTH tenant room AND super_admin room
    const io = req.app.get("io");
    if (io) {
      const incidentPayload = {
        id: incident.id,
        tenant_id: tenantId,
        guard_id: incident.guard_id,
        shift_id: incident.shift_id,
        type: incident.type,
        severity: incident.severity,
        status: incident.status,
        reported_at: incident.reported_at,
        location_text: incident.location_text,
        description: incident.description,
      };
      
      // Emit to tenant-specific admin room (tenant admins see it)
      io.to(`admins:${tenantId}`).emit("incidents:new", incidentPayload);
      
      // ALSO emit to super_admin room (super admin sees all incidents)
      io.to("super_admin").emit("incidents:new", incidentPayload);
    }
    
    return res.json({ ok: true, incident });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
```

---

### 6. Auth Middleware Enhancements

#### Update adminAuth middleware (src/middleware/auth.js)

Ensure it properly sets `isSuperAdmin` flag:

```javascript
// In src/middleware/auth.js (around line 22-29)

req.admin = {
  id: adminId,
  role: decoded.role || "admin",
  permissions: decoded.permissions || [],
  tenant_id: decoded.tenant_id || null,
  isSuperAdmin: (decoded.role || "admin") === "super_admin",  // ✅ Add this
};

req.user = req.admin; // Also set as user for compatibility
req.user.tenant_id = decoded.tenant_id || null;
```

---

### 7. File Upload Configuration

#### Reuse existing pattern from src/config/uploads.js

```javascript
// src/config/incidentUploads.js

const path = require("path");
const fs = require("fs");

const INCIDENT_UPLOAD_ROOT = path.join(process.cwd(), "uploads", "incidents");
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB (or match paystubs: 10MB)

function ensureIncidentUploadDir() {
  if (!fs.existsSync(INCIDENT_UPLOAD_ROOT)) {
    fs.mkdirSync(INCIDENT_UPLOAD_ROOT, { recursive: true });
  }
}

// Auto-create directory on module load
ensureIncidentUploadDir();

module.exports = { 
  INCIDENT_UPLOAD_ROOT, 
  ensureIncidentUploadDir, 
  MAX_UPLOAD_BYTES 
};
```

**Note:** `/uploads` static mount already exists in `app.js:67`

---

### 8. Model Registration

#### Update src/models/index.js

```javascript
// Add Incident model import
const Incident = require("./Incident");

// Add associations
Tenant.hasMany(Incident, { foreignKey: "tenant_id" });
Guard.hasMany(Incident, { foreignKey: "guard_id" });
Shift.hasMany(Incident, { foreignKey: "shift_id" });

Incident.belongsTo(Tenant, { foreignKey: "tenant_id" });
Incident.belongsTo(Guard, { foreignKey: "guard_id" });
Incident.belongsTo(Shift, { foreignKey: "shift_id" });

// Export Incident
module.exports = {
  // ... existing exports
  Incident,
};
```

---

### 9. Route Mounting

#### Update src/app.js

```javascript
// Add after line 103 (after guard reputation routes):

// ✅ Guard incidents routes (no /api prefix for guard UI compatibility)
app.use("/incidents", require("./routes/guardIncidents.routes"));  // Guard UI expects no /api
app.use("/api/guard/incidents", require("./routes/guardIncidents.routes"));  // Also mount with /api for consistency

// ✅ Admin incidents routes
app.use("/api/admin/incidents", require("./routes/adminIncidents.routes"));
```

**Note:** Guard UI routes (lines 71-74) show NO `/api` prefix, so mount both patterns.

---

### 10. Admin Dashboard: Super Admin UI Considerations

#### Incident List Component

```javascript
// In admin-dashboard/src/pages/Incidents.jsx

// Add tenant filter for super admin
const [selectedTenantId, setSelectedTenantId] = useState(null);

// If super admin, show tenant dropdown
{isSuperAdmin && (
  <select value={selectedTenantId || ""} onChange={(e) => setSelectedTenantId(e.target.value)}>
    <option value="">All Tenants</option>
    {/* Populate with tenant list */}
  </select>
)}

// Fetch incidents with tenant filter
const res = await listIncidents(
  isSuperAdmin ? selectedTenantId : tenantId,  // Super admin can filter, tenant admin locked
  { limit: 50 }
);
```

---

## 🔒 Security Considerations

### 1. Tenant Isolation Enforcement

**Critical:** Always validate tenant_id in WHERE clauses for tenant admins:

```javascript
// ✅ CORRECT: Enforced at database level
const where = { 
  id: req.params.id,
  tenant_id: req.admin.tenant_id  // Prevents cross-tenant access
};

// ❌ WRONG: No tenant_id check (security risk)
const where = { id: req.params.id };
```

### 2. Super Admin Access Control

**Recommendation:** Add middleware to verify super admin role:

```javascript
// src/middleware/requireSuperAdmin.js

module.exports = function requireSuperAdmin(req, res, next) {
  if (req.admin?.role !== "super_admin") {
    return res.status(403).json({ 
      message: "Super admin access required" 
    });
  }
  next();
};
```

### 3. Guard Tenant Assignment

**Enforcement:** Guards can only create incidents for their own tenant (from JWT token, not request body).

---

## 📊 Database Considerations

### Indexes for Multi-Tenant Queries

The migration already includes good indexes:
```sql
-- ✅ Good: Composite index for tenant + date
CREATE INDEX ON incidents (tenant_id, reported_at);

-- ✅ Good: Composite index for tenant + status
CREATE INDEX ON incidents (tenant_id, status);

-- ✅ Good: Composite index for tenant + severity
CREATE INDEX ON incidents (tenant_id, severity);
```

**For Super Admin queries (all tenants):**
- Consider adding index on `reported_at` alone if super admin frequently queries all tenants
- Index on `status` alone might help super admin filter globally
- But these can be added later if needed (premature optimization)

---

## 🏢 Sites/Locations Support: Multi-Site Per Tenant

### Overview

**Requirement**: Tenants can have multiple sites/buildings. Incidents should reference specific sites instead of just free-text location.

**Current State**:
- Shifts have `location_lat`, `location_lng` (for geofencing)
- No `site_id` on shifts
- No `sites` table exists

**Target State**:
- `sites` table with tenant_id, name, address, coordinates
- `incidents.site_id` references a site
- `shifts.site_id` (optional, for auto-selection)
- Guards can select site when reporting incident
- Admin sees site name + address with incidents

---

### 1. Migration: Create Sites Table

#### 📁 `src/migrations/20260119_000002_create_sites.js`

```javascript
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

      name: { type: Sequelize.STRING, allowNull: false }, // "Abe-Guard - Building A"
      address_1: { type: Sequelize.STRING, allowNull: true },
      address_2: { type: Sequelize.STRING, allowNull: true },
      city: { type: Sequelize.STRING, allowNull: true },
      state: { type: Sequelize.STRING, allowNull: true },
      zip: { type: Sequelize.STRING, allowNull: true },

      lat: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
      lng: { type: Sequelize.DECIMAL(10, 7), allowNull: true },

      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn("NOW") },
    });

    await queryInterface.addIndex("sites", ["tenant_id", "is_active"]);
    await queryInterface.addIndex("sites", ["tenant_id", "name"]);
    console.log('✅ Created sites table with indexes');
  },

  async down(queryInterface) {
    await queryInterface.dropTable("sites");
    console.log('✅ Dropped sites table');
  },
};
```

---

### 2. Migration: Add site_id to Incidents

#### 📁 `src/migrations/20260119_000003_add_site_id_to_incidents.js`

```javascript
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("incidents");
    
    if (!tableDescription.site_id) {
      await queryInterface.addColumn("incidents", "site_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'sites', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('✅ Added site_id column to incidents table');
    } else {
      console.log('⚠️  site_id column already exists in incidents table');
    }

    // Composite index for site-based queries
    try {
      await queryInterface.addIndex("incidents", ["tenant_id", "site_id", "reported_at"], {
        name: "idx_incidents_tenant_site_reported"
      });
      console.log('✅ Created index idx_incidents_tenant_site_reported');
    } catch (error) {
      if (error.name !== 'SequelizeDatabaseError' || !error.message.includes('already exists')) {
        throw error;
      }
      console.log('⚠️  Index idx_incidents_tenant_site_reported already exists');
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeIndex("incidents", "idx_incidents_tenant_site_reported");
    } catch (error) {
      console.log('⚠️  Index idx_incidents_tenant_site_reported does not exist');
    }
    
    const tableDescription = await queryInterface.describeTable("incidents");
    if (tableDescription.site_id) {
      await queryInterface.removeColumn("incidents", "site_id");
      console.log('✅ Removed site_id column from incidents table');
    }
  },
};
```

---

### 3. Migration: Add site_id to Shifts (Optional - For Auto-Selection)

#### 📁 `src/migrations/20260119_000004_add_site_id_to_shifts.js`

```javascript
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("shifts");
    
    if (!tableDescription.site_id) {
      await queryInterface.addColumn("shifts", "site_id", {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'sites', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
      console.log('✅ Added site_id column to shifts table');
    } else {
      console.log('⚠️  site_id column already exists in shifts table');
    }
  },

  async down(queryInterface) {
    const tableDescription = await queryInterface.describeTable("shifts");
    if (tableDescription.site_id) {
      await queryInterface.removeColumn("shifts", "site_id");
      console.log('✅ Removed site_id column from shifts table');
    }
  },
};
```

**Note**: This allows guards to auto-select site from their active shift when reporting incidents.

---

### 4. Model: Site

#### 📁 `src/models/Site.js`

```javascript
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

    name: { type: DataTypes.STRING, allowNull: false },
    address_1: { type: DataTypes.STRING, allowNull: true },
    address_2: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    state: { type: DataTypes.STRING, allowNull: true },
    zip: { type: DataTypes.STRING, allowNull: true },

    lat: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
    lng: { type: DataTypes.DECIMAL(10, 7), allowNull: true },

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
```

---

### 5. Update Incident Model

#### 📁 `src/models/Incident.js` (add field)

```javascript
// Add to Incident model fields:
site_id: { 
  type: DataTypes.UUID, 
  allowNull: true,
  references: { model: Site, key: "id" }
},
```

---

### 6. Update Shift Model

#### 📁 `src/models/Shift.js` (add field)

```javascript
// Add to Shift model fields (if you want auto-selection):
site_id: { 
  type: DataTypes.UUID, 
  allowNull: true,
  references: { model: Site, key: "id" }
},
```

---

### 7. Routes: List Sites (Admin + Guard)

#### 📁 `src/routes/adminSites.routes.js`

```javascript
const express = require("express");
const adminAuth = require("../middleware/auth"); // ✅ Use 'auth' not 'authAdmin'

const router = express.Router();
router.use(adminAuth);

/**
 * GET /api/admin/sites?tenantId=...
 * Returns sites for tenant (or all for super admin)
 */
router.get("/", async (req, res) => {
  try {
    const { Site } = req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";

    let tenantId;
    if (isSuperAdmin) {
      // Super admin can specify tenantId or see all
      tenantId = req.query?.tenantId || null;
    } else {
      // Tenant admin restricted to their tenant
      tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
    }

    const where = { is_active: true };
    if (tenantId) {
      where.tenant_id = tenantId;
    }

    const rows = await Site.findAll({
      where,
      order: [["name", "ASC"]],
    });

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
```

#### 📁 `src/routes/guardSites.routes.js`

```javascript
const express = require("express");
const guardAuth = require("../middleware/guardAuth"); // ✅ Use 'guardAuth' not 'authGuard'

const router = express.Router();
router.use(guardAuth);

/**
 * GET /api/guard/sites (or /sites for guard UI)
 * Returns active sites for guard's tenant
 */
router.get("/", async (req, res) => {
  try {
    const { Site } = req.app.locals.models;
    
    // ✅ Use req.user (not req.guard)
    const tenantId = req.user?.tenant_id;
    
    if (!tenantId) {
      return res.status(400).json({ 
        message: "Guard missing tenant_id. Guard must be assigned to a tenant." 
      });
    }

    const rows = await Site.findAll({
      where: { tenant_id: tenantId, is_active: true },
      order: [["name", "ASC"]],
    });

    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
```

---

### 8. Update Guard Incident Creation (Accept site_id)

#### Update: `src/routes/guardIncidents.routes.js`

**In POST handler, add site_id validation and storage:**

```javascript
// In the POST "/" handler, after tenantId check:

const {
  type,
  severity,
  description,
  location_text = null,  // Keep for backward compatibility
  occurred_at = null,
  shift_id = null,
  site_id = null,  // ✅ NEW: Accept site_id
} = req.body;

// ✅ Optional validation: ensure site belongs to guard's tenant
if (site_id) {
  const { Site } = req.app.locals.models;
  const site = await Site.findOne({ 
    where: { 
      id: site_id, 
      tenant_id: tenantId, 
      is_active: true 
    } 
  });
  
  if (!site) {
    return res.status(400).json({ 
      message: "Invalid site_id. Site must belong to your tenant and be active." 
    });
  }
}

// ✅ If shift_id provided, auto-select site from shift (if shift has site_id)
let finalSiteId = site_id;
if (!finalSiteId && shift_id) {
  const { Shift } = req.app.locals.models;
  const shift = await Shift.findByPk(shift_id);
  if (shift && shift.site_id) {
    finalSiteId = shift.site_id;
  }
}

// When creating Incident:
const incident = await Incident.create({
  tenant_id: tenantId,
  guard_id: guardId,
  shift_id: shift_id || null,
  site_id: finalSiteId || null,  // ✅ Store site_id
  type: String(type).trim().toUpperCase(),
  severity: String(severity).trim().toUpperCase(),
  status: "OPEN",
  occurred_at: occurred_at ? new Date(occurred_at) : new Date(),
  reported_at: new Date(),
  location_text,  // Keep for backward compatibility (legacy data)
  description,
  attachments_json: attachments.length ? attachments : null,
});

// ✅ Include site_id in socket event payload
const io = req.app.get("io");
if (io) {
  const incidentPayload = {
    id: incident.id,
    tenant_id: tenantId,
    guard_id: incident.guard_id,
    shift_id: incident.shift_id,
    site_id: incident.site_id,  // ✅ Include site_id
    type: incident.type,
    severity: incident.severity,
    status: incident.status,
    reported_at: incident.reported_at,
    location_text: incident.location_text,
    description: incident.description,
  };
  
  io.to(`admins:${tenantId}`).emit("incidents:new", incidentPayload);
  io.to("super_admin").emit("incidents:new", incidentPayload);
}
```

---

### 9. Update Admin Incidents List (Include Site Info)

#### Update: `src/routes/adminIncidents.routes.js`

**Replace GET "/" handler with site-enriched version:**

```javascript
router.get("/", async (req, res) => {
  try {
    const { Incident, Site } = req.app.locals.models;

    const isSuperAdmin = req.admin?.role === "super_admin";

    let tenantId;
    if (isSuperAdmin) {
      tenantId = req.query?.tenantId || null;
    } else {
      tenantId = req.admin?.tenant_id || req.user?.tenant_id;
      
      if (!tenantId) {
        return res.status(400).json({ 
          message: "Missing tenantId. Tenant admin must be assigned to a tenant." 
        });
      }
    }

    const { status, severity, type, siteId } = req.query;
    const limit = Math.min(Number(req.query.limit || 50), 200);

    const where = {};
    if (tenantId) where.tenant_id = tenantId;
    if (status) where.status = String(status).trim().toUpperCase();
    if (severity) where.severity = String(severity).trim().toUpperCase();
    if (type) where.type = String(type).trim().toUpperCase();
    if (siteId) where.site_id = siteId;  // ✅ Filter by site

    const incidents = await Incident.findAll({
      where,
      order: [["reported_at", "DESC"]],
      limit,
    });

    // ✅ Attach site info to incidents
    const siteIds = Array.from(new Set(incidents.map((i) => i.site_id).filter(Boolean)));
    let sitesById = {};
    
    if (siteIds.length) {
      const siteWhere = { id: siteIds };
      if (tenantId) siteWhere.tenant_id = tenantId; // Ensure tenant isolation for site query
      
      const sites = await Site.findAll({ where: siteWhere });
      sitesById = Object.fromEntries(sites.map((s) => [s.id, s]));
    }

    // ✅ Enrich incidents with site data
    const out = incidents.map((i) => {
      const site = i.site_id ? sitesById[i.site_id] : null;
      return {
        ...i.toJSON(),
        site: site
          ? {
              id: site.id,
              name: site.name,
              address_1: site.address_1,
              address_2: site.address_2,
              city: site.city,
              state: site.state,
              zip: site.zip,
              lat: site.lat ? parseFloat(site.lat) : null,
              lng: site.lng ? parseFloat(site.lng) : null,
            }
          : null,
      };
    });

    return res.json(out);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
});
```

---

### 10. Update Model Associations

#### Update: `src/models/index.js`

```javascript
// Add Site model import
const Site = require("./Site");

// Add associations
Tenant.hasMany(Site, { foreignKey: "tenant_id" });
Site.belongsTo(Tenant, { foreignKey: "tenant_id" });

// Incident associations (already added)
Incident.belongsTo(Site, { foreignKey: "site_id" });
Site.hasMany(Incident, { foreignKey: "site_id" });

// Shift associations (if you add site_id to shifts)
Shift.belongsTo(Site, { foreignKey: "site_id" });
Site.hasMany(Shift, { foreignKey: "site_id" });

// Export Site
module.exports = {
  // ... existing exports
  Site,
  Incident,
};
```

---

### 11. Route Mounting

#### Update: `src/app.js`

```javascript
// Add after incident routes (around line 103-104):

// ✅ Guard sites routes (no /api prefix for guard UI compatibility)
app.use("/sites", require("./routes/guardSites.routes"));  // Guard UI expects no /api
app.use("/api/guard/sites", require("./routes/guardSites.routes"));  // Also mount with /api

// ✅ Admin sites routes
app.use("/api/admin/sites", require("./routes/adminSites.routes"));
```

---

### 12. Guard UI: Site Selection

#### Update Guard API Service

```javascript
// In guard-ui/src/services/guardApi.js (add):

export const listSites = () =>
  apiClient.get("/sites");  // Uses /sites (no /api prefix)
```

#### Update Guard Incident Report Component

```javascript
// In guard-ui/src/pages/IncidentReport.jsx

import { listSites } from "../services/guardApi";

// Add state:
const [siteId, setSiteId] = useState("");
const [sites, setSites] = useState([]);

// Load sites on mount:
useEffect(() => {
  (async () => {
    try {
      const res = await listSites();
      setSites(res?.data || []);
      
      // ✅ Optional: Auto-select site from active shift
      // If guard has active shift with site_id, set it here
    } catch (e) {
      console.error("Failed to load sites:", e);
    }
  })();
}, []);

// Add site dropdown in form:
<div style={{ marginBottom: 8 }}>
  <label>Site (optional): </label>
  <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
    <option value="">Select a site...</option>
    {sites.map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}
      </option>
    ))}
  </select>
</div>

// Include site_id in FormData:
fd.append("site_id", siteId);
```

---

### 13. Admin Dashboard: Display Site Info

#### Update Admin Incidents Component

```javascript
// In admin-dashboard/src/pages/Incidents.jsx

// Display site info in incident list:
<div key={r.id} style={{ border: "1px solid #ddd", padding: 10, marginBottom: 10 }}>
  <div><b>{r.severity}</b> • {r.type} • {r.status}</div>
  <div style={{ fontSize: 12, opacity: 0.8 }}>
    {r.reported_at ? new Date(r.reported_at).toLocaleString() : ""}
  </div>
  
  {/* ✅ Display site info if available */}
  {r.site ? (
    <div>📍 {r.site.name}
      {r.site.address_1 && `, ${r.site.address_1}`}
      {r.site.city && `, ${r.site.city}`}
      {r.site.state && ` ${r.site.state}`}
    </div>
  ) : r.location_text ? (
    <div>📍 {r.location_text}</div>  {/* Fallback to legacy location_text */}
  ) : null}
  
  <div style={{ marginTop: 6 }}>{r.description}</div>
</div>

// ✅ Optional: Add site filter dropdown (for super admin or tenant admin)
const [selectedSiteId, setSelectedSiteId] = useState("");

// Fetch sites for filter dropdown:
useEffect(() => {
  (async () => {
    try {
      const res = await listSites(tenantId);  // Implement listSites API call
      setSites(res?.data || []);
    } catch (e) {
      // Handle error
    }
  })();
}, [tenantId]);

// Add site filter:
{isSuperAdmin && sites.length > 0 && (
  <select 
    value={selectedSiteId} 
    onChange={(e) => setSelectedSiteId(e.target.value)}
  >
    <option value="">All Sites</option>
    {sites.map((s) => (
      <option key={s.id} value={s.id}>{s.name}</option>
    ))}
  </select>
)}

// Include siteId in fetch params:
const res = await listIncidents(tenantId, { 
  limit: 50,
  siteId: selectedSiteId || undefined 
});
```

---

### 14. Real-Time Events: Include Site Info

#### Optional Enhancement: Emit Full Site Object

**Current approach**: Emit `site_id` only, frontend resolves from cache

**Enhanced approach**: Emit full site object in event (heavier payload but better UX)

```javascript
// In guardIncidents.routes.js (when emitting):

// Fetch site info if site_id exists
let siteInfo = null;
if (incident.site_id) {
  const { Site } = req.app.locals.models;
  const site = await Site.findByPk(incident.site_id);
  if (site) {
    siteInfo = {
      id: site.id,
      name: site.name,
      address_1: site.address_1,
      city: site.city,
      state: site.state,
    };
  }
}

const incidentPayload = {
  // ... existing fields
  site_id: incident.site_id,
  site: siteInfo,  // ✅ Include site object for immediate display
};
```

---

## 🎯 Sites Implementation Summary

### Key Benefits

1. **Structured Location Data**: Sites have addresses, coordinates, proper names
2. **Auto-Selection**: Guards can auto-select site from active shift
3. **Better Filtering**: Admins can filter incidents by site
4. **Better Display**: Admin dashboard shows site name + address
5. **Future-Proof**: Enables site-based reporting, analytics, geofencing

### Migration Order

1. Create `sites` table
2. Add `site_id` to `incidents` table
3. (Optional) Add `site_id` to `shifts` table
4. Populate sites data (admin creates sites)
5. Guards start selecting sites when reporting incidents

### Backward Compatibility

- `location_text` field remains (for legacy incidents without site_id)
- New incidents can use `site_id` OR `location_text` (both optional)
- Admin dashboard displays site info if available, falls back to `location_text`

---

## ✅ Implementation Checklist

### Sites Support Checklist

- [ ] Create sites migration (20260119_000002_create_sites.js)
- [ ] Create add site_id to incidents migration (20260119_000003_add_site_id_to_incidents.js)
- [ ] (Optional) Create add site_id to shifts migration (20260119_000004_add_site_id_to_shifts.js)
- [ ] Create Site model (src/models/Site.js)
- [ ] Update Incident model with site_id field
- [ ] (Optional) Update Shift model with site_id field
- [ ] Create adminSites.routes.js (list sites for admin)
- [ ] Create guardSites.routes.js (list sites for guard)
- [ ] Update guardIncidents.routes.js (accept and validate site_id)
- [ ] Update adminIncidents.routes.js (include site info in response)
- [ ] Add Site to models/index.js with associations
- [ ] Mount site routes in app.js
- [ ] Update guard UI IncidentReport.jsx (add site dropdown)
- [ ] Update admin UI Incidents.jsx (display site info + filter)
- [ ] Test site selection in guard UI
- [ ] Test site filtering in admin UI
- [ ] Test tenant isolation (guards/admins only see their tenant's sites)

---

## ✅ Updated Implementation Checklist

- [ ] Update Socket.IO connection handler (server.js) - add tenant room joins
- [ ] Update Socket.IO event emission - emit to both tenant and super_admin rooms
- [ ] Update adminIncidents.routes.js - add super admin access logic
- [ ] Update guardIncidents.routes.js - use req.user instead of req.guard
- [ ] Update auth middleware - add isSuperAdmin flag
- [ ] Create incidentUploads.js config (reuse uploads pattern)
- [ ] Add Incident model to models/index.js with associations
- [ ] Mount routes in app.js
- [ ] Update admin dashboard socket.js - join tenant and super_admin rooms
- [ ] Update admin dashboard Incidents.jsx - add tenant filter for super admin
- [ ] Test tenant isolation (tenant admin can't see other tenants)
- [ ] Test super admin access (can see all tenants)

---

## 🎯 Summary of Key Changes

1. **Socket.IO Rooms**: Use `admins:${tenantId}` for tenant admins, `super_admin` for super admin
2. **Request Objects**: Use `req.user` (guards), `req.admin` (admins)
3. **Middleware**: Use `guardAuth` (not `authGuard`), `auth` (not `authAdmin`)
4. **Socket Access**: Use `req.app.get("io")` (not `req.app.locals.io`)
5. **Tenant Isolation**: Always check `req.admin.tenant_id` for tenant admins
6. **Super Admin**: Can omit `tenantId` filter to see all, or specify to filter
7. **Event Emission**: Emit to both tenant room AND super_admin room
8. **Route Mounting**: Guard routes should support both `/incidents` and `/api/guard/incidents`

---

**Ready for implementation when you give the go-ahead!** 🚀
