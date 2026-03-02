// src/components/OvertimeOfferAlert.jsx
import React, { useState, useEffect } from "react";
import { getOvertimeOffers, acceptOvertimeOffer, declineOvertimeOffer } from "../services/guardApi";
import "./OvertimeOfferAlert.css";

/**
 * OvertimeOfferAlert Component
 * Displays and handles overtime offers from admins
 */
const OvertimeOfferAlert = () => {
  const [offers, setOffers] = useState([]);
  const [selectedOffer, setSelectedOffer] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const loadOffers = React.useCallback(async () => {
    try {
      console.log("🔍 Loading overtime offers...");
      const response = await getOvertimeOffers();
      console.log("✅ Overtime offers response:", response);
      const offersData = response.data?.data || response.data || [];
      const pendingOffers = offersData.filter(
        (o) => o.status === "pending" && (!o.expires_at || new Date(o.expires_at) > new Date())
      );
      console.log(`✅ Found ${pendingOffers.length} pending offers`);
      setOffers(pendingOffers);
      
      // Auto-show modal for first pending offer
      if (pendingOffers.length > 0 && !showModal) {
        setSelectedOffer(pendingOffers[0]);
        setShowModal(true);
      }
    } catch (err) {
      // Only log if it's not a 404 (404 means no offers, which is fine)
      if (err.response?.status !== 404) {
        console.error("❌ Error loading overtime offers:", err);
        console.error("   Status:", err.response?.status);
        console.error("   Message:", err.response?.data?.message || err.message);
      }
    }
  }, [showModal]);

  useEffect(() => {
    loadOffers();

    // Check for offers every 30 seconds
    const interval = setInterval(loadOffers, 30000);

    // Listen for socket events
    const handleOffer = (data) => {
      console.log("📨 Overtime offer received:", data);
      loadOffers();
      setSelectedOffer(data);
      setShowModal(true);
    };

    // Note: Socket.IO connection would be set up elsewhere
    // For now, we'll rely on polling
    if (window.socket) {
      window.socket.on("overtime_offer", handleOffer);
      return () => {
        clearInterval(interval);
        if (window.socket) {
          window.socket.off("overtime_offer", handleOffer);
        }
      };
    }

    return () => clearInterval(interval);
  }, [loadOffers]);


  const handleAccept = async () => {
    if (!selectedOffer) return;

    try {
      await acceptOvertimeOffer(selectedOffer.id);
      setShowModal(false);
      setSelectedOffer(null);
      loadOffers();
      // Show success message
      alert("✅ Overtime offer accepted! Your shift has been extended.");
    } catch (err) {
      console.error("Error accepting offer:", err);
      alert("❌ Failed to accept offer: " + (err.response?.data?.message || err.message));
    }
  };

  const handleDecline = async () => {
    if (!selectedOffer) return;

    try {
      await declineOvertimeOffer(selectedOffer.id);
      setShowModal(false);
      setSelectedOffer(null);
      loadOffers();
    } catch (err) {
      console.error("Error declining offer:", err);
      alert("❌ Failed to decline offer: " + (err.response?.data?.message || err.message));
    }
  };

  if (offers.length === 0 || !showModal || !selectedOffer) return null;

  // Parse timestamps - these are stored as UTC but represent local time moments
  // When admin selected "11:00 PM EST", it was stored as "4:00 AM UTC" (EST is UTC-5)
  // We need to display them as the local time they represent
  const proposedEnd = new Date(selectedOffer.proposed_end_time);
  const currentEnd = new Date(selectedOffer.current_end_time);
  const extensionHours = parseFloat(selectedOffer.extension_hours) || 0;
  
  // Format times - convert UTC timestamp to local time for display
  // The timestamp is stored as UTC in the database
  // We need to convert it to the user's local timezone for display
  const formatTime = (date) => {
    if (!date || isNaN(date.getTime())) return "—";
    
    // 🔧 FIX: Force EST/EDT timezone for consistent display
    // All times should display in EST regardless of user's browser timezone
    const timeString = date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York", // Force EST/EDT
    });
    
    return timeString;
  };

  return (
    <>
      {/* Modal Overlay */}
      <div className="overtime-offer-overlay" onClick={() => setShowModal(false)} />
      
      {/* Modal */}
      <div className="overtime-offer-modal">
        <div className="overtime-offer-header">
          <span className="overtime-offer-icon">🎯</span>
          <h3>Overtime Opportunity</h3>
          <button className="overtime-offer-close" onClick={() => setShowModal(false)}>×</button>
        </div>

        <div className="overtime-offer-content">
          <p className="overtime-offer-intro">
            You've been offered <strong>{extensionHours} hours</strong> of overtime.
          </p>

          <div className="overtime-offer-details">
            <div className="overtime-offer-detail">
              <span className="label">Current End:</span>
              <span className="value">{formatTime(currentEnd)}</span>
            </div>
            <div className="overtime-offer-detail">
              <span className="label">Proposed End:</span>
              <span className="value">{formatTime(proposedEnd)}</span>
            </div>
            {selectedOffer.reason && (
              <div className="overtime-offer-reason">
                <span className="label">Reason:</span>
                <span className="value">{selectedOffer.reason}</span>
              </div>
            )}
          </div>

          {selectedOffer.expires_at && (
            <div className="overtime-offer-expiry">
              ⏰ Offer expires: {new Date(selectedOffer.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}

          <div className="overtime-offer-actions">
            <button className="overtime-offer-btn decline" onClick={handleDecline}>
              Decline
            </button>
            <button className="overtime-offer-btn accept" onClick={handleAccept}>
              Accept
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default OvertimeOfferAlert;
