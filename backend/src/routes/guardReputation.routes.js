/**
 * Guard Reputation routes on unified admin backend.
 */
const express = require("express");
const authAdmin = require("../middleware/authAdmin");
const { requireAccess } = require("../middleware/requireAccess");
const guardReputationService = require("../services/guardReputation.service");

const router = express.Router();

router.use(authAdmin);
router.use(requireAccess("guards:read"));

function resolveTenantId(req) {
  let tenantId =
    req.admin?.tenant_id ||
    req.admin?.tenantId ||
    req.query.tenantId ||
    req.body?.tenantId ||
    null;
  if (!tenantId && req.admin?.role === "super_admin") {
    tenantId = null; // allow all / optional filter
  }
  return tenantId ? String(tenantId).trim() : null;
}

/**
 * GET /api/admin/reputation/guards
 */
router.get("/reputation/guards", async (req, res) => {
  try {
    const models = req.app.locals.models;
    const { Guard } = models;
    const tenantId = resolveTenantId(req);
    const isSuperAdmin = req.admin?.role === "super_admin";

    if (!isSuperAdmin && !tenantId) {
      return res.status(400).json({
        message:
          "Missing tenantId. Your admin account must be assigned to a tenant.",
      });
    }

    const where = { active: true };
    if (tenantId) where.tenant_id = tenantId;

    const guards = await Guard.findAll({
      where,
      order: [["name", "ASC"]],
    });

    const guardsWithReputation = await Promise.all(
      guards.map(async (guard) => {
        const summary = await guardReputationService.getGuardReputationSummary(
          models,
          guard.id,
          guard.tenant_id || tenantId
        );
        const json = guard.toJSON();
        return {
          ...json,
          // UI expects phone/email/name
          reputation: {
            trustScore: summary.trustScore,
            totalReviews: summary.totalReviews,
            latestReview: summary.latestReview,
          },
        };
      })
    );

    guardsWithReputation.sort(
      (a, b) => (b.reputation?.trustScore || 0) - (a.reputation?.trustScore || 0)
    );

    return res.json({
      ok: true,
      guards: guardsWithReputation,
      count: guardsWithReputation.length,
    });
  } catch (error) {
    console.error("List guards with reputation error:", error);
    return res.status(500).json({ message: error.message });
  }
});

/**
 * GET /api/admin/guards/:guardId/reputation
 */
router.get("/guards/:guardId/reputation", async (req, res) => {
  try {
    const guardId = String(req.params.guardId || "").trim();
    if (!guardId) return res.status(400).json({ message: "Missing guardId" });

    const models = req.app.locals.models;
    const { Guard, GuardReputation, Admin } = models;
    const guard = await Guard.findByPk(guardId);
    if (!guard) return res.status(404).json({ message: "Guard not found" });

    const tenantId = resolveTenantId(req) || guard.tenant_id;
    const summary = await guardReputationService.getGuardReputationSummary(
      models,
      guardId,
      tenantId
    );

    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const offset = (page - 1) * limit;

    const where = { guard_id: guardId };
    if (tenantId) where.tenant_id = tenantId;

    const { count, rows: reviews } = await GuardReputation.findAndCountAll({
      where,
      order: [["created_at", "DESC"]],
      limit,
      offset,
    });

    // Attach reviewer emails best-effort
    const adminIds = [
      ...new Set(reviews.map((r) => r.reviewed_by_admin_id).filter(Boolean)),
    ];
    let adminsById = {};
    if (adminIds.length && Admin) {
      const admins = await Admin.findAll({
        where: { id: adminIds },
        attributes: ["id", "name", "email", "role"],
      });
      adminsById = Object.fromEntries(admins.map((a) => [a.id, a.toJSON()]));
    }

    return res.json({
      ok: true,
      summary,
      reviews: reviews.map((r) => ({
        ...r.toJSON(),
        reviewedBy: adminsById[r.reviewed_by_admin_id] || null,
      })),
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
 */
router.post("/guards/:guardId/reputation", requireAccess("guards:write"), async (req, res) => {
  try {
    const guardId = String(req.params.guardId || "").trim();
    if (!guardId) return res.status(400).json({ message: "Missing guardId" });

    const models = req.app.locals.models;
    const { Guard, GuardReputation } = models;
    const guard = await Guard.findByPk(guardId);
    if (!guard) return res.status(404).json({ message: "Guard not found" });

    const tenantId = resolveTenantId(req) || guard.tenant_id || null;
    const adminId = req.admin?.id;
    if (!adminId) return res.status(401).json({ message: "Missing admin ID" });

    let { score, comment, review_type, related_shift_id } = req.body || {};
    if (score !== undefined && score !== null && score !== "") {
      const scoreNum = parseFloat(score);
      if (Number.isNaN(scoreNum) || scoreNum < 0 || scoreNum > 1) {
        return res.status(400).json({ message: "Score must be between 0.0 and 1.0" });
      }
      score = scoreNum;
    } else {
      score = null;
    }

    if (score == null && !(comment && String(comment).trim())) {
      return res.status(400).json({ message: "Either score or comment must be provided" });
    }

    const trustScore = await guardReputationService.calculateTrustScore(
      models,
      guardId,
      tenantId
    );

    const reputation = await GuardReputation.create({
      tenant_id: tenantId,
      guard_id: guardId,
      reviewed_by_admin_id: adminId,
      score,
      comment: comment ? String(comment).trim() : null,
      review_type: review_type || "general",
      related_shift_id: related_shift_id || null,
      trust_score: trustScore,
      created_at: new Date(),
    });

    const calculatedTrustScore = await guardReputationService.calculateTrustScore(
      models,
      guardId,
      tenantId
    );

    return res.json({
      ok: true,
      reputation: reputation.toJSON(),
      calculatedTrustScore,
    });
  } catch (error) {
    console.error("Create guard reputation error:", error);
    return res.status(500).json({ message: error.message });
  }
});

module.exports = router;
