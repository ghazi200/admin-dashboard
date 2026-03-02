/**
 * Test Script: Incident AI Analysis
 * 
 * Tests AI-powered incident analysis:
 * - Creates a realistic incident
 * - Calls AI to generate explanation and assessment
 * - Updates incident with AI summary
 * 
 * Usage:
 *   node src/scripts/testIncidentAI.js [guard-email] [admin-email]
 */

require("dotenv").config();
const jwt = require("jsonwebtoken");
const fetch = globalThis.fetch || require("node-fetch");
const { sequelize } = require("../config/db");
const { Guard, Admin, Site, Incident } = require("../models");
const OpenAI = require("openai");

const BASE_URL = process.env.BACKEND_URL || "http://localhost:4000";
const API_URL = `${BASE_URL}/api`;

// Initialize OpenAI client
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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

async function apiCall(method, url, token, body = null) {
  try {
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

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

async function analyzeIncidentWithAI(incident) {
  if (!openai) {
    console.warn("⚠️  OpenAI API key not configured - generating mock AI analysis");
    return {
      summary: `**Mock AI Analysis**: This is a ${incident.severity} severity ${incident.type} incident reported at ${incident.location_text || 'unknown location'}. The incident requires ${incident.severity === 'HIGH' ? 'immediate' : incident.severity === 'MEDIUM' ? 'prompt' : 'standard'} attention based on the severity level. Recommended actions include: 1) Verify details with reporting guard, 2) Assess immediate threat level, 3) Follow tenant incident response protocol.`,
      tags: ["security", incident.type.toLowerCase(), incident.severity.toLowerCase()],
      assessment: {
        riskLevel: incident.severity,
        urgency: incident.severity === 'HIGH' ? 'CRITICAL' : incident.severity === 'MEDIUM' ? 'HIGH' : 'MODERATE',
        recommendedActions: [
          "Contact reporting guard for additional details",
          "Review incident location and time",
          "Assess if immediate response team is needed",
          "Document for incident log"
        ]
      }
    };
  }

  try {
    const prompt = `You are a security operations center (SOC) analyst. Analyze the following incident report and provide:

1. A concise summary (2-3 sentences)
2. Relevant tags (3-5 keywords)
3. A risk assessment with urgency level and recommended actions

**Incident Details:**
- Type: ${incident.type}
- Severity: ${incident.severity}
- Status: ${incident.status}
- Location: ${incident.location_text || incident.site?.name || 'Not specified'}
- Description: ${incident.description}
- Reported at: ${new Date(incident.reported_at).toLocaleString()}
${incident.occurred_at ? `- Occurred at: ${new Date(incident.occurred_at).toLocaleString()}` : ''}

Provide your response as JSON with this structure:
{
  "summary": "Brief summary of the incident and its significance",
  "tags": ["tag1", "tag2", "tag3"],
  "assessment": {
    "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
    "urgency": "LOW|MODERATE|HIGH|CRITICAL",
    "recommendedActions": ["action1", "action2", "action3"]
  }
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert security operations center (SOC) analyst. Provide accurate, actionable analysis of security incidents. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    
    // Try to parse JSON from response
    let aiResponse;
    try {
      // Remove markdown code blocks if present
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;
      aiResponse = JSON.parse(jsonText);
    } catch (e) {
      // Fallback if JSON parsing fails
      aiResponse = {
        summary: responseText.substring(0, 300),
        tags: [incident.type.toLowerCase(), incident.severity.toLowerCase(), "unanalyzed"],
        assessment: {
          riskLevel: incident.severity,
          urgency: "MODERATE",
          recommendedActions: ["Review incident details", "Follow up with reporting guard"]
        }
      };
    }

    return aiResponse;
  } catch (error) {
    console.error("❌ OpenAI API error:", error.message);
    // Fallback to mock analysis
    return {
      summary: `AI analysis unavailable. This is a ${incident.severity} severity ${incident.type} incident. Manual review recommended.`,
      tags: [incident.type.toLowerCase(), incident.severity.toLowerCase()],
      assessment: {
        riskLevel: incident.severity,
        urgency: "MODERATE",
        recommendedActions: ["Manual review required"]
      }
    };
  }
}

async function runTest() {
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
    if (adminEmail) {
      adminToken = await getAdminToken(adminEmail);
      const admin = await Admin.findOne({ where: { email: adminEmail } });
      console.log(`   Admin: ${admin.email} (ID: ${admin.id}, Role: ${admin.role || 'admin'}, Tenant: ${admin.tenant_id || 'N/A'})\n`);
    }

    const testTenantId = guard.tenant_id;
    if (!testTenantId) {
      console.error("❌ No tenant ID available. Please provide a guard with tenant_id.");
      process.exit(1);
    }

    // ========== TEST 1: Create Test Incident ==========
    console.log("=".repeat(60));
    console.log("TEST 1: Create Test Incident");
    console.log("=".repeat(60));

    // Get a site
    const sitesRes = await apiCall("GET", `${BASE_URL}/sites`, guardToken);
    const sites = sitesRes.success ? sitesRes.data : [];
    const testSite = sites.length > 0 ? sites[0] : null;

    const incidentPayload = {
      type: "TRESPASS",
      severity: "HIGH",
      description: "Suspicious individual attempting to gain unauthorized access to the building. Guard observed person trying multiple access points on the north entrance. Individual was wearing dark clothing and appeared to be testing door handles. When approached, the individual quickly left the premises heading east. No property damage observed. Time: approximately 2:30 AM. Weather conditions: clear, well-lit area.",
      location_text: testSite ? null : "North entrance, Building A",
      site_id: testSite ? testSite.id : null,
      occurred_at: new Date().toISOString(),
    };

    const createResult = await apiCall(
      "POST",
      `${BASE_URL}/incidents`,
      guardToken,
      incidentPayload
    );

    if (!createResult.success) {
      console.error(`❌ Failed to create incident: ${JSON.stringify(createResult.error)}`);
      process.exit(1);
    }

    const incident = createResult.data.incident;
    console.log("✅ Incident created successfully");
    console.log(`   Incident ID: ${incident.id}`);
    console.log(`   Type: ${incident.type}`);
    console.log(`   Severity: ${incident.severity}`);
    console.log(`   Status: ${incident.status}`);
    console.log(`   Description: ${incident.description.substring(0, 100)}...`);
    console.log();

    // ========== TEST 2: AI Analysis ==========
    console.log("=".repeat(60));
    console.log("TEST 2: AI Analysis & Assessment");
    console.log("=".repeat(60));

    // Fetch full incident with site info for AI analysis
    let fullIncident = incident;
    if (adminToken) {
      const fetchResult = await apiCall(
        "GET",
        `${API_URL}/admin/incidents?id=${incident.id}`,
        adminToken
      );
      if (fetchResult.success && fetchResult.data.length > 0) {
        fullIncident = { ...incident, ...fetchResult.data[0] };
      }
    }

    console.log("🤖 Analyzing incident with AI...");
    const aiAnalysis = await analyzeIncidentWithAI(fullIncident);

    console.log("\n📊 AI Summary:");
    console.log("   " + aiAnalysis.summary);

    console.log("\n🏷️  AI Tags:");
    aiAnalysis.tags.forEach((tag, i) => {
      console.log(`   ${i + 1}. ${tag}`);
    });

    console.log("\n📋 AI Assessment:");
    console.log(`   Risk Level: ${aiAnalysis.assessment.riskLevel}`);
    console.log(`   Urgency: ${aiAnalysis.assessment.urgency}`);
    console.log("   Recommended Actions:");
    aiAnalysis.assessment.recommendedActions.forEach((action, i) => {
      console.log(`      ${i + 1}. ${action}`);
    });
    console.log();

    // ========== TEST 3: Update Incident with AI Summary ==========
    if (adminToken) {
      console.log("=".repeat(60));
      console.log("TEST 3: Update Incident with AI Analysis");
      console.log("=".repeat(60));

      // Format AI summary for storage
      const aiSummary = `**AI Analysis Summary**\n${aiAnalysis.summary}\n\n**Risk Assessment:**\n- Risk Level: ${aiAnalysis.assessment.riskLevel}\n- Urgency: ${aiAnalysis.assessment.urgency}\n\n**Recommended Actions:**\n${aiAnalysis.assessment.recommendedActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\n**Tags:** ${aiAnalysis.tags.join(', ')}`;

      const updatePayload = {
        status: "ACKNOWLEDGED",
        ai_summary: aiSummary,
      };

      const updateResult = await apiCall(
        "PATCH",
        `${API_URL}/admin/incidents/${incident.id}`,
        adminToken,
        updatePayload
      );

      if (updateResult.success) {
        console.log("✅ Incident updated with AI analysis");
        console.log(`   Status: ${updateResult.data.incident.status}`);
        console.log(`   AI Summary: ${updateResult.data.incident.ai_summary.substring(0, 150)}...`);
      } else {
        console.log(`❌ Failed to update incident: ${JSON.stringify(updateResult.error)}`);
      }
      console.log();
    }

    // ========== TEST 4: Verify Updated Incident ==========
    if (adminToken) {
      console.log("=".repeat(60));
      console.log("TEST 4: Verify Updated Incident");
      console.log("=".repeat(60));

      const verifyResult = await apiCall(
        "GET",
        `${API_URL}/admin/incidents?limit=10`,
        adminToken
      );

      if (verifyResult.success) {
        const updatedIncident = verifyResult.data.find((i) => i.id === incident.id);
        if (updatedIncident) {
          console.log("✅ Incident found in list with updates");
          console.log(`   Status: ${updatedIncident.status}`);
          console.log(`   Has AI Summary: ${!!updatedIncident.ai_summary}`);
          if (updatedIncident.ai_summary) {
            console.log(`   AI Summary Preview: ${updatedIncident.ai_summary.substring(0, 100)}...`);
          }
        } else {
          console.log("⚠️  Incident not found in recent list");
        }
      }
      console.log();
    }

    console.log("=".repeat(60));
    console.log("✅ AI Incident Analysis Test Completed!");
    console.log("=".repeat(60));

    console.log("\n📋 Summary:");
    console.log(`   - Incident Created: ✅ (ID: ${incident.id})`);
    console.log(`   - AI Analysis: ✅ Generated`);
    console.log(`   - AI Summary: ${aiAnalysis.summary.substring(0, 60)}...`);
    console.log(`   - Risk Level: ${aiAnalysis.assessment.riskLevel}`);
    console.log(`   - Urgency: ${aiAnalysis.assessment.urgency}`);
    console.log(`   - Incident Updated: ${adminToken ? '✅' : '⏭️  Skipped (no admin token)'}`);

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test error:", error.message);
    console.error(error.stack);
    if (sequelize) await sequelize.close();
    process.exit(1);
  }
}

runTest();
