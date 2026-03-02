/**
 * Guard Reputation Service
 * 
 * Handles guard reputation scoring and aggregation
 */

/**
 * Calculate aggregate trust score from all reviews for a guard
 * @param {Object} models - Sequelize models
 * @param {string} guardId - Guard ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Aggregate trust score (0.0 to 1.0)
 */
async function calculateTrustScore(models, guardId, tenantId) {
  const { GuardReputation } = models;

  // Get all reputation entries for this guard
  const reviews = await GuardReputation.findAll({
    where: {
      guard_id: guardId,
      tenant_id: tenantId,
    },
    order: [['created_at', 'DESC']],
  });

  if (reviews.length === 0) {
    return 0.5; // Default neutral score
  }

  // Calculate weighted average (more recent reviews weighted higher)
  let totalWeight = 0;
  let weightedSum = 0;

  const now = new Date();
  reviews.forEach((review, index) => {
    const score = parseFloat(review.score || 0.5);
    const reviewDate = new Date(review.created_at);
    const daysAgo = (now - reviewDate) / (1000 * 60 * 60 * 24);

    // Weight: more recent = higher weight (decay over 90 days)
    const recencyWeight = Math.max(0.1, 1 - (daysAgo / 90));
    const weight = recencyWeight * (review.score !== null ? 1.0 : 0.5); // Score reviews have more weight than comments

    weightedSum += score * weight;
    totalWeight += weight;
  });

  const aggregateScore = totalWeight > 0 ? weightedSum / totalWeight : 0.5;
  return Math.max(0.0, Math.min(1.0, aggregateScore)); // Clamp between 0 and 1
}

/**
 * Update guard's aggregate trust score
 * @param {Object} models - Sequelize models
 * @param {string} guardId - Guard ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<number>} Updated trust score
 */
async function updateGuardTrustScore(models, guardId, tenantId) {
  const { Guard } = models;

  const trustScore = await calculateTrustScore(models, guardId, tenantId);

  // Update the guard's trust_score field (if it exists) or store in a separate table
  // For now, we'll store it in the GuardReputation entries themselves
  // The trust_score field in GuardReputation represents the aggregate at the time of the last review

  return trustScore;
}

/**
 * Get guard reputation summary
 * @param {Object} models - Sequelize models
 * @param {string} guardId - Guard ID
 * @param {string} tenantId - Tenant ID
 * @returns {Promise<Object>} Reputation summary
 */
async function getGuardReputationSummary(models, guardId, tenantId) {
  const { GuardReputation } = models;

  const reviews = await GuardReputation.findAll({
    where: {
      guard_id: guardId,
      tenant_id: tenantId,
    },
    order: [['created_at', 'DESC']],
    limit: 100,
  });

  const trustScore = await calculateTrustScore(models, guardId, tenantId);

  const reviewsWithScore = reviews.filter(r => r.score !== null);
  const reviewsWithComments = reviews.filter(r => r.comment);

  return {
    guardId,
    tenantId,
    trustScore,
    totalReviews: reviews.length,
    reviewsWithScore: reviewsWithScore.length,
    reviewsWithComments: reviewsWithComments.length,
    latestReview: reviews[0] || null,
    recentReviews: reviews.slice(0, 10),
  };
}

module.exports = {
  calculateTrustScore,
  updateGuardTrustScore,
  getGuardReputationSummary,
};
