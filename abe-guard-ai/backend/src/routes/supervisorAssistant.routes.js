/**
 * Supervisor Assistant Routes
 * 
 * Endpoints:
 * POST /api/supervisor/ask - Q&A with RAG
 * POST /api/supervisor/schedule - AI Scheduling Copilot
 */

const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const { retrieveSupervisorData } = require("../services/supervisorRag.service");
const { generateSchedulingProposal } = require("../services/schedulingCopilot.service");
const OpenAI = require("openai");

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// All routes require admin authentication
router.use(auth);
router.use(requireRole(["admin"]));

/**
 * POST /api/supervisor/ask
 * Q&A with RAG-based context retrieval
 */
router.post("/ask", async (req, res) => {
  try {
    const question = String(req.body.question || "").trim();
    if (!question) {
      return res.status(400).json({ message: "Missing question" });
    }

    // ⚠️ MULTI-TENANT: tenant_id MUST be in JWT token for proper tenant isolation
    // Get tenant ID from JWT token (check multiple possible locations)
    let tenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
    
    // If not in req object, decode JWT token directly
    if (!tenantId) {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        try {
          const jwt = require("jsonwebtoken");
          const decoded = jwt.decode(token); // decode without verification (already verified by auth middleware)
          tenantId = decoded?.tenant_id || decoded?.tenantId || null;
        } catch (e) {
          // Ignore decode errors
        }
      }
    }
    
    // ⚠️ For multi-tenant builds, tenant_id MUST be provided (no fallback)
    // This ensures proper tenant isolation and security
    if (!tenantId) {
      return res.status(400).json({ 
        message: "Missing tenantId in JWT token. For multi-tenant support, tenant_id must be included in the admin JWT token payload.",
        code: "MISSING_TENANT_ID",
        hint: "Ensure the admin-dashboard backend includes tenant_id when issuing JWT tokens."
      });
    }
    
    // Ensure tenantId is a string (UUID must be string, not integer)
    tenantId = String(tenantId).trim();

    const models = req.app.locals.models;

    // Retrieve relevant data using RAG
    const ragChunks = await retrieveSupervisorData({
      models,
      tenantId,
      query: question,
    });

    // Build context for AI
    const context = {
      question,
      tenantId,
      relevantData: ragChunks.map((chunk) => chunk.content).join("\n\n"),
      chunks: ragChunks.map((chunk) => ({
        type: chunk.type,
        content: chunk.content,
        metadata: chunk.metadata,
      })),
    };

    // Call OpenAI for answer
    let answer = "";
    let citations = [];

    if (process.env.OPENAI_API_KEY && openai) {
      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content: `You are an AI supervisor assistant for a security company. Answer questions about guards, shifts, locations, and scheduling based on the provided context.

Rules:
- Be concise and factual
- Reference specific data from the context when available
- If the context doesn't have enough information, say so
- Use percentages, counts, and dates from the context
- Format answers clearly with bullet points or numbered lists when appropriate`,
            },
            {
              role: "user",
              content: `Question: ${question}\n\nRelevant Context:\n${context.relevantData}\n\nAnswer the question based on the context above.`,
            },
          ],
        });

        answer = response.choices[0].message.content.trim();

        // Extract citations
        citations = ragChunks.map((chunk) => ({
          type: chunk.type,
          metadata: chunk.metadata,
        }));
      } catch (aiError) {
        // Only log if it's not a missing API key (expected in some setups)
        if (aiError.code !== 'invalid_api_key') {
          console.error("OpenAI error:", aiError);
        }
        // Fallback to basic answer
        answer = buildFallbackAnswer(question, ragChunks);
      }
    } else {
      // Fallback if OpenAI not configured
      answer = buildFallbackAnswer(question, ragChunks);
    }

    return res.json({
      ok: true,
      question,
      answer,
      citations,
      context: {
        chunkCount: ragChunks.length,
        chunkTypes: [...new Set(ragChunks.map((c) => c.type))],
      },
    });
  } catch (error) {
    console.error("Supervisor ask error:", error);
    return res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/supervisor/schedule
 * AI Scheduling Copilot - propose assignments
 */
router.post("/schedule", async (req, res) => {
  try {
    const request = String(req.body.request || "").trim();
    if (!request) {
      return res.status(400).json({ message: "Missing scheduling request" });
    }

    // ⚠️ MULTI-TENANT: tenant_id MUST be in JWT token for proper tenant isolation
    // Get tenant ID from JWT token (check multiple possible locations)
    let tenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
    
    // If not in req object, decode JWT token directly
    if (!tenantId) {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        try {
          const jwt = require("jsonwebtoken");
          const decoded = jwt.decode(token); // decode without verification (already verified by auth middleware)
          tenantId = decoded?.tenant_id || decoded?.tenantId || null;
        } catch (e) {
          // Ignore decode errors
        }
      }
    }
    
    // ⚠️ For multi-tenant builds, tenant_id MUST be provided (no fallback)
    // This ensures proper tenant isolation and security
    if (!tenantId) {
      return res.status(400).json({ 
        message: "Missing tenantId in JWT token. For multi-tenant support, tenant_id must be included in the admin JWT token payload.",
        code: "MISSING_TENANT_ID",
        hint: "Ensure the admin-dashboard backend includes tenant_id when issuing JWT tokens."
      });
    }
    
    // Ensure tenantId is a string (UUID must be string, not integer)
    tenantId = String(tenantId).trim();

    const models = req.app.locals.models;

    // Generate scheduling proposal
    const proposal = await generateSchedulingProposal({
      models,
      tenantId,
      request,
    });

    return res.json({
      ok: true,
      request,
      proposal,
    });
  } catch (error) {
    console.error("Supervisor schedule error:", error);
    return res.status(500).json({ message: error.message });
  }
});

/**
 * Helper: Build fallback answer when OpenAI is not available
 */
function buildFallbackAnswer(question, chunks) {
  if (chunks.length === 0) {
    return "I don't have enough data to answer this question. Please ensure your shifts, guards, and callouts are properly recorded.";
  }

  const questionLower = question.toLowerCase();
  if (questionLower.includes("who") || questionLower.includes("reliable")) {
    // Extract guard data
    const guardChunks = chunks.filter((c) => c.type === "guard");
    if (guardChunks.length > 0) {
      const topGuard = guardChunks[0];
      return `Based on the available data, ${topGuard.metadata.name} appears to be a strong candidate with a reliability score of ${Math.round((topGuard.metadata.reliability_score || 0.8) * 100)}% and ${topGuard.metadata.total_shifts} completed shifts.`;
    }
  }

  if (questionLower.includes("hard to fill") || questionLower.includes("difficult")) {
    const shiftChunks = chunks.filter((c) => c.type === "shift" && c.metadata.difficulty === "HIGH");
    if (shiftChunks.length > 0) {
      const shift = shiftChunks[0];
      return `The shift on ${shift.metadata.shift_date} at ${shift.metadata.location} was difficult to fill. It required ${shift.metadata.calloutCount} callouts and was open for ${shift.metadata.hoursOpen.toFixed(1)} hours.`;
    }
  }

  return `Based on the available data, I found ${chunks.length} relevant information chunks. Review the context for details.`;
}

module.exports = router;
