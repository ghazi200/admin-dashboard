/**
 * Guard Reputation Routes
 * 
 * Endpoints for admins/supervisors to manage guard reputation scores and comments
 */

const express = require("express");
const auth = require("../middleware/auth");
const requireRole = require("../middleware/requireRole");
const guardReputationService = require("../services/guardReputation.service");
const { Op } = require("sequelize");

const router = express.Router();

// All routes require admin authentication
router.use(auth);
router.use(requireRole(["admin"]));

/**
 * GET /api/admin/guards/:guardId/reputation
 * Get guard's reputation summary and recent reviews
 */
router.get("/guards/:guardId/reputation", async (req, res) => {
  try {
    const guardId = String(req.params.guardId || "").trim();
    if (!guardId) {
      return res.status(400).json({ message: "Missing guardId" });
    }

    // Get tenant ID from admin JWT
    let tenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
    if (!tenantId) {
      // Decode JWT if not in req
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        try {
          const jwt = require("jsonwebtoken");
          const decoded = jwt.decode(token);
          tenantId = decoded?.tenant_id || decoded?.tenantId || null;
        } catch (e) {}
      }
    }

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId in JWT token" });
    }
    tenantId = String(tenantId).trim();

    const models = req.app.locals.models;
    const { GuardReputation } = models;

    // Get reputation summary
    const summary = await guardReputationService.getGuardReputationSummary(models, guardId, tenantId);

    // Get all reviews (with pagination)
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const offset = (page - 1) * limit;

    const { count, rows: reviews } = await GuardReputation.findAndCountAll({
      where: {
        guard_id: guardId,
        tenant_id: tenantId,
      },
      order: [["created_at", "DESC"]],
      limit,
      offset,
      include: [
        {
          model: models.Admin,
          as: "reviewedBy",
          attributes: ["id", "name", "email", "role"],
        },
        {
          model: models.Shift,
          as: "relatedShift",
          attributes: ["id", "shift_date", "shift_start", "shift_end", "location"],
          required: false,
        },
      ],
    });

    return res.json({
      ok: true,
      summary,
      reviews: reviews.map(r => r.toJSON()),
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error("Get guard reputation error:", error);
    return res.status(500).json({ message: error.message });
  }
});

/**
 * POST /api/admin/guards/:guardId/reputation
 * Add a new reputation review/score/comment
 */
router.post("/guards/:guardId/reputation", async (req, res) => {
  try {
    const guardId = String(req.params.guardId || "").trim();
    if (!guardId) {
      return res.status(400).json({ message: "Missing guardId" });
    }

    // Get tenant ID from admin JWT
    let tenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
    if (!tenantId) {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        try {
          const jwt = require("jsonwebtoken");
          const decoded = jwt.decode(token);
          tenantId = decoded?.tenant_id || decoded?.tenantId || null;
        } catch (e) {}
      }
    }

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId in JWT token" });
    }
    tenantId = String(tenantId).trim();

    const adminId = req.admin?.id || req.user?.id;
    if (!adminId) {
      return res.status(401).json({ message: "Missing admin ID" });
    }

    const { score, comment, review_type, related_shift_id } = req.body;

    // Validate score if provided (0.0 to 1.0)
    if (score !== undefined && score !== null) {
      const scoreNum = parseFloat(score);
      if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 1) {
        return res.status(400).json({ message: "Score must be between 0.0 and 1.0" });
      }
    }

    // At least one of score or comment must be provided
    if (score === undefined && score === null && (!comment || !comment.trim())) {
      return res.status(400).json({ message: "Either score or comment must be provided" });
    }

    const models = req.app.locals.models;
    const { GuardReputation } = models;

    // Create reputation entry
    const reputation = await GuardReputation.create({
      tenant_id: tenantId,
      guard_id: guardId,
      reviewed_by_admin_id: adminId,
      score: score !== undefined && score !== null ? parseFloat(score) : null,
      comment: comment ? String(comment).trim() : null,
      review_type: review_type || 'general',
      related_shift_id: related_shift_id || null,
      trust_score: 0.5, // Will be recalculated
    });

    // Recalculate and update aggregate trust score
    const newTrustScore = await guardReputationService.calculateTrustScore(models, guardId, tenantId);

    // Update all recent entries with the new aggregate (optional - for display)
    // For now, we'll just return the calculated score

    return res.json({
      ok: true,
      reputation: reputation.toJSON(),
      calculatedTrustScore: newTrustScore,
    });
  } catch (error) {
    console.error("Create guard reputation error:", error);
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/admin/reputation/guards
 * List all guards with their reputation scores (summary view)
 */
router.get("/reputation/guards", async (req, res) => {
  try {
    // Get tenant ID from admin JWT
    let tenantId = req.admin?.tenant_id || req.admin?.tenantId || req.user?.tenant_id || req.user?.tenantId;
    if (!tenantId) {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (token) {
        try {
          const jwt = require("jsonwebtoken");
          const decoded = jwt.decode(token);
          tenantId = decoded?.tenant_id || decoded?.tenantId || null;
        } catch (e) {}
      }
    }

    if (!tenantId) {
      return res.status(400).json({ message: "Missing tenantId in JWT token" });
    }
    tenantId = String(tenantId).trim();

    const models = req.app.locals.models;
    const { Guard, GuardReputation } = models;

    // Get all guards for this tenant
    const guards = await Guard.findAll({
      where: {
        tenant_id: tenantId,
        is_active: true,
      },
      order: [["name", "ASC"]],
    });

    // Get reputation summary for each guard
    const guardsWithReputation = await Promise.all(
      guards.map(async (guard) => {
        const summary = await guardReputationService.getGuardReputationSummary(models, guard.id, tenantId);
        return {
          ...guard.toJSON(),
          reputation: {
            trustScore: summary.trustScore,
            totalReviews: summary.totalReviews,
            latestReview: summary.latestReview,
          },
        };
      })
    );

    // Sort by trust score (highest first)
    guardsWithReputation.sort((a, b) => b.reputation.trustScore - a.reputation.trustScore);

    return res.json({
      ok: true,
      guards: guardsWithReputation,
    });
  } catch (error) {
    console.error("List guards with reputation error:", error);
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
