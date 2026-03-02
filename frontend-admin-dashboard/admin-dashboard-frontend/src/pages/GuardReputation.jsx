import React, { useEffect, useState } from "react";
import Card from "../components/Card";
import Modal from "../components/Modal";
import {
  listGuardsWithReputation,
  getGuardReputation,
  addGuardReputation,
} from "../services/api";

export default function GuardReputation() {
  const [guards, setGuards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedGuard, setSelectedGuard] = useState(null);
  const [reputationDetail, setReputationDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add review modal state
  const [addReviewModalOpen, setAddReviewModalOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    score: "",
    comment: "",
    review_type: "general",
  });

  useEffect(() => {
    loadGuards();
  }, []);

  async function loadGuards() {
    setLoading(true);
    setError("");
    try {
      console.log("🔄 [GuardReputation] Loading guards with reputation...");
      const res = await listGuardsWithReputation();
      console.log("✅ [GuardReputation] API Response:", res);
      console.log("✅ [GuardReputation] Response data:", res.data);
      console.log("✅ [GuardReputation] Response guards:", res.data?.guards);
      
      const guardsData = res.data?.guards || [];
      console.log("📊 [GuardReputation] Loaded guards count:", guardsData.length);
      
      if (guardsData.length > 0) {
        console.log("👤 [GuardReputation] First guard sample:", {
          id: guardsData[0].id,
          name: guardsData[0].name,
          email: guardsData[0].email,
          phone: guardsData[0].phone,
          hasReputation: !!guardsData[0].reputation,
          reputation: guardsData[0].reputation,
        });
      } else {
        console.warn("⚠️ [GuardReputation] No guards returned from API");
      }
      
      setGuards(guardsData);
    } catch (err) {
      console.error("❌ [GuardReputation] Error loading guards:", err);
      console.error("❌ [GuardReputation] Error response:", err?.response);
      console.error("❌ [GuardReputation] Error status:", err?.response?.status);
      console.error("❌ [GuardReputation] Error data:", err?.response?.data);
      console.error("❌ [GuardReputation] Error message:", err?.response?.data?.message);
      const errorMessage = err?.response?.data?.message || err.message || "Failed to load guards";
      console.error("❌ [GuardReputation] Displaying error:", errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function loadGuardDetail(guardId) {
    setSelectedGuard(guardId);
    setDetailLoading(true);
    try {
      const res = await getGuardReputation(guardId);
      setReputationDetail(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load reputation details");
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAddReview() {
    if (!selectedGuard) return;

    if (!reviewForm.score && !reviewForm.comment?.trim()) {
      setError("Either score or comment must be provided");
      return;
    }

    try {
      await addGuardReputation(selectedGuard, reviewForm);
      setAddReviewModalOpen(false);
      setReviewForm({ score: "", comment: "", review_type: "general" });
      
      // Reload guards and detail
      await loadGuards();
      if (selectedGuard) {
        await loadGuardDetail(selectedGuard);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to add review");
    }
  }

  function openAddReviewModal(guardId) {
    setSelectedGuard(guardId);
    setAddReviewModalOpen(true);
  }

  function formatDate(dateString) {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString() + " " + new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getTrustScoreColor(score) {
    if (score >= 0.8) return "#22c55e"; // Green
    if (score >= 0.6) return "#eab308"; // Yellow
    return "#ef4444"; // Red
  }

  return (
    <div className="page">
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2>Guard Reputation & Trust Scores</h2>
          <button className="btnPrimary" onClick={loadGuards} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <p className="muted">Internal reputation scores and comments used for ranking and premium shift assignment.</p>

        {error && (
          <div className="error" style={{ marginBottom: 16, padding: 12, borderRadius: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: error.includes("Missing tenantId") ? 8 : 0 }}>
              {error}
            </div>
            {error.includes("Missing tenantId") && (
              <div style={{ fontSize: 13, marginTop: 8, padding: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4 }}>
                <strong>💡 Solution:</strong> Please log out and log back in to get a new JWT token with tenant_id.
                <br />
                <small>Your admin account has tenant_id assigned, but your current session token doesn't include it.</small>
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40 }}>Loading guards...</div>
        ) : (
          <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
            {guards.map((guard) => (
              <div
                key={guard.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  border: "1px solid #e0e0e0",
                  backgroundColor: "#fafafa",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.border = "1px solid #667eea";
                  e.currentTarget.style.backgroundColor = "#f8f9ff";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.border = "1px solid #e0e0e0";
                  e.currentTarget.style.backgroundColor = "#fafafa";
                }}
                onClick={() => loadGuardDetail(guard.id)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                      {guard.name || guard.email || `Guard ${guard.id ? String(guard.id).substring(0, 8) : 'Unknown'}`}
                    </div>
                    <div style={{ fontSize: 13, color: "#666", marginBottom: 2 }}>
                      📧 {guard.email || "No email"}
                    </div>
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 2 }}>
                      📞 {guard.phone || "No phone"}
                    </div>
                    <div style={{ fontSize: 11, color: "#aaa", marginTop: 4, fontFamily: "monospace" }}>
                      ID: {guard.id ? String(guard.id).substring(0, 8) + "..." : "Unknown"}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>Trust Score</div>
                      <div
                        style={{
                          fontSize: 24,
                          fontWeight: 700,
                          color: getTrustScoreColor(guard.reputation?.trustScore || 0.5),
                        }}
                      >
                        {Math.round((guard.reputation?.trustScore || 0.5) * 100)}%
                      </div>
                      <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                        {guard.reputation?.totalReviews || 0} review{guard.reputation?.totalReviews !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <button
                      className="btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openAddReviewModal(guard.id);
                      }}
                      style={{ padding: "8px 16px", color: "#000000", fontWeight: 700 }}
                    >
                      Add Review
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {guards.length === 0 && !loading && (
              <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
                No guards found
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Guard Detail Modal */}
      {selectedGuard && !addReviewModalOpen && (
        <Modal
          onClose={() => {
            setSelectedGuard(null);
            setReputationDetail(null);
          }}
          title={`Reputation Details - ${guards.find(g => g.id === selectedGuard)?.name || guards.find(g => g.id === selectedGuard)?.email || "Guard"}`}
        >
          {detailLoading ? (
            <div style={{ textAlign: "center", padding: 40 }}>Loading details...</div>
          ) : reputationDetail ? (
            <div>
              {/* Summary */}
              <div
                style={{
                  padding: 16,
                  borderRadius: 8,
                  backgroundColor: "#e8f4f8",
                  border: "2px solid #4a90e2",
                  marginBottom: 20,
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#000000", marginBottom: 4, fontWeight: 600 }}>Trust Score</div>
                    <div style={{ fontSize: 32, fontWeight: 700, color: getTrustScoreColor(reputationDetail.summary?.trustScore || 0.5) }}>
                      {Math.round((reputationDetail.summary?.trustScore || 0.5) * 100)}%
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#000000", marginBottom: 4, fontWeight: 600 }}>Total Reviews</div>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#000000" }}>{reputationDetail.summary?.totalReviews || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#000000", marginBottom: 4, fontWeight: 600 }}>With Scores</div>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#000000" }}>{reputationDetail.summary?.reviewsWithScore || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: "#000000", marginBottom: 4, fontWeight: 600 }}>With Comments</div>
                    <div style={{ fontSize: 24, fontWeight: 600, color: "#000000" }}>{reputationDetail.summary?.reviewsWithComments || 0}</div>
                  </div>
                </div>
              </div>

              {/* Reviews List */}
              <div>
                <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 18, color: "#000000" }}>Recent Reviews</div>
                {reputationDetail.reviews && reputationDetail.reviews.length > 0 ? (
                  <div style={{ display: "grid", gap: 12 }}>
                    {reputationDetail.reviews.map((review) => (
                      <div
                        key={review.id}
                        style={{
                          padding: 12,
                          borderRadius: 6,
                          border: "1px solid #ddd",
                          backgroundColor: "white",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "#000000" }}>
                              {review.reviewedBy?.name || "Admin"}
                              <span style={{ fontSize: 12, color: "#333333", marginLeft: 8 }}>
                                ({review.review_type || "general"})
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: "#000000", marginTop: 2 }}>
                              {formatDate(review.created_at)}
                            </div>
                          </div>
                          {review.score !== null && review.score !== undefined && (
                            <div
                              style={{
                                fontSize: 20,
                                fontWeight: 700,
                                color: getTrustScoreColor(review.score),
                              }}
                            >
                              {Math.round(review.score * 100)}%
                            </div>
                          )}
                        </div>
                        {review.comment && (
                          <div style={{ fontSize: 13, color: "#000000", marginTop: 8, whiteSpace: "pre-wrap" }}>
                            {review.comment}
                          </div>
                        )}
                        {review.relatedShift && (
                          <div style={{ fontSize: 11, color: "#333333", marginTop: 8, fontStyle: "italic" }}>
                            Related to shift: {review.relatedShift.shift_date} at {review.relatedShift.location}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: 40, color: "#666" }}>
                    No reviews yet
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: 40 }}>No details available</div>
          )}
        </Modal>
      )}

      {/* Add Review Modal */}
      {addReviewModalOpen && (
        <Modal
          onClose={() => {
            setAddReviewModalOpen(false);
            setReviewForm({ score: "", comment: "", review_type: "general" });
          }}
          title="Add Reputation Review"
        >
        {(() => {
          const guard = guards.find(g => g.id === selectedGuard);
          if (!guard) return null;
          return (
            <div style={{ marginBottom: 20, padding: 12, backgroundColor: "#f0f4ff", borderRadius: 8, border: "2px solid #667eea" }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: "#000000" }}>
                Rating Guard:
              </div>
              <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: "#000000" }}>
                {guard.name || guard.email || `Guard ${guard.id ? String(guard.id).substring(0, 8) : 'Unknown'}`}
              </div>
              <div style={{ fontSize: 13, color: "#000000", marginBottom: 2 }}>
                📧 {guard.email || "No email"}
              </div>
              <div style={{ fontSize: 13, color: "#000000", marginBottom: 2 }}>
                📞 {guard.phone || "No phone"}
              </div>
              <div style={{ fontSize: 11, color: "#333333", marginTop: 4, fontFamily: "monospace" }}>
                ID: {guard.id ? String(guard.id) : "Unknown"}
              </div>
            </div>
          );
        })()}
        
        <div style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#000000" }}>Score (0.0 to 1.0)</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              placeholder="0.0 - 1.0 (optional)"
              value={reviewForm.score}
              onChange={(e) => setReviewForm({ ...reviewForm, score: e.target.value })}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", color: "#000000" }}
            />
            <div style={{ fontSize: 12, color: "#333333", marginTop: 4 }}>
              Score from 0.0 (low) to 1.0 (high). Optional if providing comment.
            </div>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#000000" }}>Review Type</label>
            <select
              value={reviewForm.review_type}
              onChange={(e) => setReviewForm({ ...reviewForm, review_type: e.target.value })}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", color: "#000000" }}
            >
              <option value="general">General</option>
              <option value="shift_performance">Shift Performance</option>
              <option value="incident_followup">Incident Follow-up</option>
              <option value="premium_shift">Premium Shift</option>
              <option value="training">Training</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600, color: "#000000" }}>Comment</label>
            <textarea
              placeholder="Add notes or comments about this guard (optional)"
              value={reviewForm.comment}
              onChange={(e) => setReviewForm({ ...reviewForm, comment: e.target.value })}
              rows={4}
              style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ccc", resize: "vertical", color: "#000000" }}
            />
            <div style={{ fontSize: 12, color: "#333333", marginTop: 4 }}>
              Optional comment. Either score or comment must be provided.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button
              className="btn"
              onClick={() => {
                setAddReviewModalOpen(false);
                setReviewForm({ score: "", comment: "", review_type: "general" });
              }}
              style={{ color: "#000000", fontWeight: 700 }}
            >
              Cancel
            </button>
            <button
              className="btnPrimary"
              onClick={handleAddReview}
              disabled={!reviewForm.score && !reviewForm.comment?.trim()}
              style={{ color: "#000000", fontWeight: 700 }}
            >
              Submit Review
            </button>
          </div>
        </div>
        </Modal>
      )}
    </div>
  );
}
