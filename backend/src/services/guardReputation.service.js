/**
 * Guard Reputation Service
 */

async function calculateTrustScore(models, guardId, tenantId) {
  const { GuardReputation } = models;
  const where = { guard_id: guardId };
  if (tenantId) where.tenant_id = tenantId;

  const reviews = await GuardReputation.findAll({
    where,
    order: [["created_at", "DESC"]],
  });

  if (!reviews.length) return 0.5;

  let totalWeight = 0;
  let weightedSum = 0;
  const now = new Date();

  reviews.forEach((review) => {
    const score = parseFloat(review.score != null ? review.score : 0.5);
    const daysAgo = (now - new Date(review.created_at)) / (1000 * 60 * 60 * 24);
    const recencyWeight = Math.max(0.1, 1 - daysAgo / 90);
    const weight = recencyWeight * (review.score != null ? 1.0 : 0.5);
    weightedSum += score * weight;
    totalWeight += weight;
  });

  const aggregateScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  return Math.max(0, Math.min(1, aggregateScore));
}

async function getGuardReputationSummary(models, guardId, tenantId) {
  const { GuardReputation } = models;
  const where = { guard_id: guardId };
  if (tenantId) where.tenant_id = tenantId;

  const reviews = await GuardReputation.findAll({
    where,
    order: [["created_at", "DESC"]],
    limit: 100,
  });

  const trustScore = await calculateTrustScore(models, guardId, tenantId);

  return {
    guardId,
    tenantId,
    trustScore,
    totalReviews: reviews.length,
    reviewsWithScore: reviews.filter((r) => r.score != null).length,
    reviewsWithComments: reviews.filter((r) => r.comment).length,
    latestReview: reviews[0] || null,
    recentReviews: reviews.slice(0, 10),
  };
}

module.exports = {
  calculateTrustScore,
  getGuardReputationSummary,
};
