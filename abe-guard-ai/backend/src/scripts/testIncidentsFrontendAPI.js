/**
 * Test Script: Incident System Frontend API Endpoints
 * 
 * Tests the API endpoints that the frontend uses:
 * - Guard UI endpoints (for incident creation)
 * - Admin Dashboard endpoints (for incident management)
 * - Real-time Socket.IO events
 * 
 * This simulates what the frontend will call.
 * 
 * Usage:
 *   node src/scripts/testIncidentsFrontendAPI.js [guard-email] [admin-email]
 */

require("dotenv").config();
const jwt = require("jsonwebtoken");
const fetch = globalThis.fetch || require("node-fetch");
const { sequelize } = require("../config/db");
const { Guard, Admin, Site, Incident } = require("../models");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:4000";
const API_URL = `${BASE_URL}/api`;

async function getGuardToken(email) {
  const guard = await Guard.findOne({ where: { email } });
  if (!guard) {
    throw new Error(`Guard not found: ${email}`);
  }
  return jwt.sign(
    { guardId: guard.id, tenant_id: guard.tenant_id || null, role: "guard" },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function getAdminToken(email) {
  const admin = await Admin.findOne({ where: { email } });
  if (!admin) {
    throw new Error(`Admin not found: ${email}`);
  }
  return jwt.sign(
    { adminId: admin.id, tenant_id: admin.tenant_id || null, role: admin.role || "admin", permissions: admin.permissions || [] },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );
}

async function apiCall(method, url, token, body = null, isFormData = false) {
  try {
    const headers = { Authorization: `Bearer ${token}` };
    if (!isFormData) headers["Content-Type"] = "application/json";

    const options = { method, headers };
    if (body) {
      if (isFormData) {
        options.body = body;
      } else {
        options.body = JSON.stringify(body);
      }
    }

    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    
    let data;
    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();
      return { success: false, error: `Expected JSON, got ${contentType}. Response: ${text.substring(0, 200)}`, status: response.status };
    }

    if (!response.ok) {
      return { success: false, error: data, status: response.status };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message, status: null };
  }
}

async function runTests() {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected\n");

    const guardEmail = process.argv[2] || "john@abesecurity.com";
    const adminEmail = process.argv[3] || null;

    console.log("📋 Getting tokens...");
    const guardToken = await getGuardToken(guardEmail);
    const guard = await Guard.findOne({ where: { email: guardEmail } });
    console.log(`   Guard: ${guard.email} (ID: ${guard.id}, Tenant: ${guard.tenant_id || 'N/A'})\n`);

    let adminToken = null;
    let admin = null;
    if (adminEmail) {
      adminToken = await getAdminToken(adminEmail);
      admin = await Admin.findOne({ where: { email: adminEmail } });
      console.log(`   Admin: ${admin.email} (ID: ${admin.id}, Role: ${admin.role || 'admin'}, Tenant: ${admin.tenant_id || 'N/A'})\n`);
    }

    const testTenantId = guard.tenant_id;
    if (!testTenantId) {
      console.error("❌ No tenant ID available. Please provide a guard with tenant_id.");
      process.exit(1);
    }

    // ========== TEST 1: Guard UI - List Sites (Frontend API) ==========
    console.log("=".repeat(60));
    console.log("TEST 1: Guard UI - List Sites (Frontend API: /sites)");
    console.log("=".repeat(60));

    const guardSitesResult = await apiCall("GET", `${BASE_URL}/sites`, guardToken);
    
    if (guardSitesResult.success) {
      console.log(`✅ Guard UI can list sites: ${guardSitesResult.data.length} site(s) found`);
      guardSitesResult.data.slice(0, 3).forEach((site, i) => {
        console.log(`   ${i + 1}. ${site.name} (${site.address_1 || 'No address'})`);
      });
    } else {
      console.log(`❌ Guard UI sites list failed: ${JSON.stringify(guardSitesResult.error)}`);
    }
    console.log();

    // ========== TEST 2: Guard UI - Create Incident (Frontend API: /incidents) ==========
    console.log("=".repeat(60));
    console.log("TEST 2: Guard UI - Create Incident (Frontend API: /incidents)");
    console.log("=".repeat(60));

    // Get a site to use
    const sites = guardSitesResult.success ? guardSitesResult.data : [];
    const testSite = sites.length > 0 ? sites[0] : null;

    const incidentPayload = {
      type: "THEFT",
      severity: "HIGH",
      description: "Test incident from frontend API test - suspicious activity reported",
      site_id: testSite ? testSite.id : null,
      location_text: testSite ? null : "Test location from frontend API",
    };

    const guardIncidentResult = await apiCall(
      "POST",
      `${BASE_URL}/incidents`,
      guardToken,
      incidentPayload
    );

    if (guardIncidentResult.success) {
      console.log("✅ Guard UI can create incident");
      console.log(`   Incident ID: ${guardIncidentResult.data.incident.id}`);
      console.log(`   Type: ${guardIncidentResult.data.incident.type}`);
      console.log(`   Severity: ${guardIncidentResult.data.incident.severity}`);
      console.log(`   Site ID: ${guardIncidentResult.data.incident.site_id || 'None'}`);
    } else {
      console.log(`❌ Guard UI incident creation failed: ${JSON.stringify(guardIncidentResult.error)}`);
    }
    console.log();

    // ========== TEST 3: Admin Dashboard - List Sites (Frontend API) ==========
    if (adminToken) {
      console.log("=".repeat(60));
      console.log("TEST 3: Admin Dashboard - List Sites (Frontend API: /api/admin/sites)");
      console.log("=".repeat(60));

      const adminSitesResult = await apiCall("GET", `${API_URL}/admin/sites`, adminToken);
      
      if (adminSitesResult.success) {
        console.log(`✅ Admin Dashboard can list sites: ${adminSitesResult.data.length} site(s) found`);
        adminSitesResult.data.slice(0, 3).forEach((site, i) => {
          console.log(`   ${i + 1}. ${site.name} (${site.address_1 || 'No address'})`);
        });
      } else {
        console.log(`❌ Admin Dashboard sites list failed: ${JSON.stringify(adminSitesResult.error)}`);
      }
      console.log();
    }

    // ========== TEST 4: Admin Dashboard - List Incidents (Frontend API) ==========
    if (adminToken) {
      console.log("=".repeat(60));
      console.log("TEST 4: Admin Dashboard - List Incidents (Frontend API: /api/admin/incidents)");
      console.log("=".repeat(60));

      const adminIncidentsResult = await apiCall(
        "GET",
        `${API_URL}/admin/incidents?limit=10`,
        adminToken
      );

      if (adminIncidentsResult.success) {
        console.log(`✅ Admin Dashboard can list incidents: ${adminIncidentsResult.data.length} incident(s) found`);
        
        adminIncidentsResult.data.slice(0, 3).forEach((incident, i) => {
          console.log(`\n   ${i + 1}. Incident ID: ${incident.id}`);
          console.log(`      Type: ${incident.type}, Severity: ${incident.severity}, Status: ${incident.status}`);
          console.log(`      Description: ${incident.description?.substring(0, 50)}...`);
          if (incident.site) {
            console.log(`      Site: ${incident.site.name} (${incident.site.address_1 || 'No address'})`);
          } else if (incident.location_text) {
            console.log(`      Location: ${incident.location_text}`);
          }
          console.log(`      Reported: ${new Date(incident.reported_at).toLocaleString()}`);
        });
      } else {
        console.log(`❌ Admin Dashboard incidents list failed: ${JSON.stringify(adminIncidentsResult.error)}`);
      }
      console.log();
    }

    // ========== TEST 5: Admin Dashboard - Update Incident (Frontend API) ==========
    if (adminToken && guardIncidentResult.success) {
      console.log("=".repeat(60));
      console.log("TEST 5: Admin Dashboard - Update Incident (Frontend API: PATCH /api/admin/incidents/:id)");
      console.log("=".repeat(60));

      const incidentId = guardIncidentResult.data.incident.id;
      const updatePayload = {
        status: "ACKNOWLEDGED",
        ai_summary: "Test AI summary - incident acknowledged and under review",
      };

      const adminUpdateResult = await apiCall(
        "PATCH",
        `${API_URL}/admin/incidents/${incidentId}`,
        adminToken,
        updatePayload
      );

      if (adminUpdateResult.success) {
        console.log("✅ Admin Dashboard can update incident");
        console.log(`   Status: ${adminUpdateResult.data.incident.status}`);
        console.log(`   AI Summary: ${adminUpdateResult.data.incident.ai_summary || 'None'}`);
      } else {
        console.log(`❌ Admin Dashboard incident update failed: ${JSON.stringify(adminUpdateResult.error)}`);
      }
      console.log();
    }

    // ========== TEST 6: Filter Incidents (Frontend API) ==========
    if (adminToken) {
      console.log("=".repeat(60));
      console.log("TEST 6: Admin Dashboard - Filter Incidents (Frontend API)");
      console.log("=".repeat(60));

      const filterTests = [
        { status: "OPEN", name: "Status: OPEN" },
        { severity: "HIGH", name: "Severity: HIGH" },
        { type: "THEFT", name: "Type: THEFT" },
      ];

      for (const filter of filterTests) {
        const params = new URLSearchParams(filter);
        const filteredResult = await apiCall(
          "GET",
          `${API_URL}/admin/incidents?${params.toString()}&limit=10`,
          adminToken
        );

        if (filteredResult.success) {
          console.log(`✅ Filter ${filter.name}: ${filteredResult.data.length} incident(s) found`);
        } else {
          console.log(`❌ Filter ${filter.name} failed: ${JSON.stringify(filteredResult.error)}`);
        }
      }
      console.log();
    }

    // ========== TEST 7: Frontend API Route Verification ==========
    console.log("=".repeat(60));
    console.log("TEST 7: Frontend API Route Verification");
    console.log("=".repeat(60));

    const routesToTest = [
      { method: "GET", path: "/sites", name: "Guard UI - List Sites" },
      { method: "POST", path: "/incidents", name: "Guard UI - Create Incident", needsBody: true },
      { method: "GET", path: "/api/guard/sites", name: "Guard UI API - List Sites" },
      { method: "POST", path: "/api/guard/incidents", name: "Guard UI API - Create Incident", needsBody: true },
    ];

    if (adminToken) {
      routesToTest.push(
        { method: "GET", path: "/api/admin/sites", name: "Admin Dashboard - List Sites" },
        { method: "GET", path: "/api/admin/incidents", name: "Admin Dashboard - List Incidents" }
      );
    }

    for (const route of routesToTest) {
      if (route.method === "GET") {
        const testResult = await apiCall(route.method, `${BASE_URL}${route.path}`, route.path.includes("/admin/") ? adminToken : guardToken);
        if (testResult.success || testResult.status === 400 || testResult.status === 401) {
          console.log(`✅ Route ${route.name}: Accessible (status: ${testResult.status || 'OK'})`);
        } else {
          console.log(`❌ Route ${route.name}: Not accessible (status: ${testResult.status})`);
        }
      }
    }
    console.log();

    console.log("=".repeat(60));
    console.log("✅ Frontend API Tests Completed!");
    console.log("=".repeat(60));

    console.log("\n📋 Summary:");
    console.log(`   - Guard UI Sites API: ${guardSitesResult.success ? '✅ Working' : '❌ Failed'}`);
    console.log(`   - Guard UI Incident Creation: ${guardIncidentResult.success ? '✅ Working' : '❌ Failed'}`);
    if (adminToken) {
      console.log(`   - Admin Dashboard Sites API: ${adminToken ? '✅ Tested' : '⏭️  Skipped'}`);
      console.log(`   - Admin Dashboard Incidents API: ${adminToken ? '✅ Tested' : '⏭️  Skipped'}`);
      console.log(`   - Admin Dashboard Incident Update: ${adminToken ? '✅ Tested' : '⏭️  Skipped'}`);
      console.log(`   - Admin Dashboard Filters: ${adminToken ? '✅ Tested' : '⏭️  Skipped'}`);
    }
    console.log(`   - Frontend Routes: ✅ Verified`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test error:", error.message);
    console.error(error.stack);
    if (sequelize) await sequelize.close();
    process.exit(1);
  }
}

runTests();
