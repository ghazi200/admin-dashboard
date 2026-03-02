// src/components/OvertimeOfferModal.jsx
import React, { useState, useEffect, useRef } from "react";
import { createOvertimeOffer } from "../services/api";
import Modal from "./Modal";

/**
 * OvertimeOfferModal Component
 * Allows admin to offer overtime to a guard
 */
export default function OvertimeOfferModal({ guard, onClose, onSuccess }) {
  // Safety check - if no guard, don't render
  if (!guard) {
    return null;
  }

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    proposedEndTime: "",
    extensionHours: "",
    reason: "",
  });

  // Calculate current end time from shift
  // Handle both field name formats (shiftEnd/shift_end, shiftDate/shift_date)
  const shiftEnd = guard?.shiftEnd || guard?.shift_end;
  const shiftDate = guard?.shiftDate || guard?.shift_date;
  
  // FIXED: Create date in EST timezone, not browser timezone
  // shiftEnd is TIME type (HH:MM:SS), shiftDate is DATE type (YYYY-MM-DD)
  // We need to combine them and create a date representing EST time
  const currentEndTime = shiftEnd && shiftDate
    ? (() => {
        try {
          // Parse the date components
          const dateStr = String(shiftDate).split('T')[0]; // Remove time if present
          const timeStr = String(shiftEnd).split('.')[0]; // Remove milliseconds if present
          const dateParts = dateStr.split('-');
          const timeParts = timeStr.split(':');
          
          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed
          const day = parseInt(dateParts[2], 10);
          const hours = parseInt(timeParts[0], 10);
          const minutes = parseInt(timeParts[1] || '0', 10);
          const seconds = parseInt(timeParts[2] || '0', 10);
          
          // FIXED: Create date in EST timezone by using a date formatter
          // We'll create it as if it's EST, then convert to UTC for storage
          // EST is UTC-5, so we add 5 hours to get UTC
          const utcHours = hours + 5;
          let utcDay = day;
          let utcMonth = month;
          let utcYear = year;
          
          // Handle rollover
          if (utcHours >= 24) {
            const extraDays = Math.floor(utcHours / 24);
            utcDay += extraDays;
            const utcHoursAdjusted = utcHours % 24;
            
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            if (utcDay > daysInMonth) {
              utcDay = utcDay - daysInMonth;
              utcMonth += 1;
              if (utcMonth >= 12) {
                utcMonth = 0;
                utcYear += 1;
              }
            }
            
            // Create UTC date, then convert to local for display
            const utcDate = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHoursAdjusted, minutes, seconds));
            // Convert to EST for display (this will show the correct local time)
            return utcDate;
          } else {
            const utcDate = new Date(Date.UTC(year, month, day, utcHours, minutes, seconds));
            return utcDate;
          }
        } catch (error) {
          console.error('Error constructing currentEndTime:', error, { shiftDate, shiftEnd });
          return null;
        }
      })()
    : null;

  // Track if we've initialized the form
  const isInitialized = useRef(false);
  
  // Set default proposed end time (1 hour after current end time) - only once on mount
  // FIXED: Convert UTC time to EST for display in datetime-local input
  useEffect(() => {
    if (currentEndTime && !isInitialized.current) {
      // currentEndTime is now a UTC Date object representing EST time
      // Add 1 hour in UTC
      const defaultEnd = new Date(currentEndTime);
      defaultEnd.setUTCHours(defaultEnd.getUTCHours() + 1);
      
      // FIXED: Convert UTC to EST for display in datetime-local input
      // Use Intl.DateTimeFormat to get EST components correctly
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(defaultEnd);
      const year = parts.find(p => p.type === 'year').value;
      const month = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      const hours = parts.find(p => p.type === 'hour').value;
      const minutes = parts.find(p => p.type === 'minute').value;
      
      const defaultProposedTime = `${year}-${month}-${day}T${hours}:${minutes}`;
      const defaultExtensionHours = "1.0";
      
      setFormData(prev => ({
        ...prev,
        proposedEndTime: defaultProposedTime,
        extensionHours: defaultExtensionHours,
      }));
      
      isInitialized.current = true;
    }
  }, [currentEndTime]);

  // Calculate extension hours when proposed end time changes (only if changed by user, not by handleExtensionHoursChange)
  // Use a ref to track if the change came from extension hours input
  const isUpdatingFromExtension = useRef(false);
  const lastProposedTime = useRef("");
  
  useEffect(() => {
    // Skip if the update came from extension hours input
    if (isUpdatingFromExtension.current) {
      isUpdatingFromExtension.current = false;
      return;
    }
    
    // Skip if this is the same value we already processed
    if (formData.proposedEndTime === lastProposedTime.current) {
      return;
    }
    
    if (formData.proposedEndTime && currentEndTime) {
      // FIXED: Parse proposedEndTime as EST and convert to UTC for comparison
      const [datePart, timePart] = formData.proposedEndTime.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hours, minutes] = timePart.split(':').map(Number);
      
      // Convert EST to UTC
      const utcHours = hours + 5;
      let utcDay = day;
      let utcMonth = month - 1;
      let utcYear = year;
      
      let proposedUTC;
      if (utcHours >= 24) {
        const extraDays = Math.floor(utcHours / 24);
        utcDay += extraDays;
        const utcHoursAdjusted = utcHours % 24;
        const daysInMonth = new Date(year, month, 0).getDate();
        if (utcDay > daysInMonth) {
          utcDay = utcDay - daysInMonth;
          utcMonth += 1;
          if (utcMonth >= 12) {
            utcMonth = 0;
            utcYear += 1;
          }
        }
        proposedUTC = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHoursAdjusted, minutes, 0));
      } else {
        proposedUTC = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHours, minutes, 0));
      }
      
      const diffHours = (proposedUTC - currentEndTime) / (1000 * 60 * 60);
      
      // Only update if the calculated value is different to avoid loops
      const currentExtension = parseFloat(formData.extensionHours) || 0;
      if (diffHours > 0 && Math.abs(currentExtension - diffHours) > 0.01) {
        setFormData(prev => ({
          ...prev,
          extensionHours: diffHours.toFixed(1),
        }));
      }
      
      lastProposedTime.current = formData.proposedEndTime;
    }
  }, [formData.proposedEndTime, currentEndTime, formData.extensionHours]);

  // Calculate proposed end time when extension hours changes
  // FIXED: Work with UTC times and convert to EST for display
  const handleExtensionHoursChange = (e) => {
    const hours = parseFloat(e.target.value) || 0;
    
    // Set flag to prevent useEffect from recalculating
    isUpdatingFromExtension.current = true;
    
    if (hours > 0 && currentEndTime) {
      // Add hours to UTC time
      const proposedUTC = new Date(currentEndTime);
      proposedUTC.setUTCHours(proposedUTC.getUTCHours() + hours);
      
      // FIXED: Convert UTC to EST for display in datetime-local input
      // Use Intl.DateTimeFormat to get EST components correctly
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      
      const parts = formatter.formatToParts(proposedUTC);
      const year = parts.find(p => p.type === 'year').value;
      const month = parts.find(p => p.type === 'month').value;
      const day = parts.find(p => p.type === 'day').value;
      const hoursStr = parts.find(p => p.type === 'hour').value;
      const minutesStr = parts.find(p => p.type === 'minute').value;
      
      setFormData(prev => ({
        ...prev,
        extensionHours: hours > 0 ? hours.toFixed(1) : "",
        proposedEndTime: `${year}-${month}-${day}T${hoursStr}:${minutesStr}`,
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        extensionHours: hours > 0 ? hours.toFixed(1) : "",
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Handle both field name formats (guardId/guard_id, shiftId/shift_id)
    const guardId = guard?.guardId || guard?.guard_id;
    const shiftId = guard?.shiftId || guard?.shift_id;

    if (!guardId || !shiftId) {
      console.error("Missing guard data:", { guard, guardId, shiftId });
      setError("Missing guard or shift information. Please refresh the page and try again.");
      setLoading(false);
      return;
    }

    if (!formData.proposedEndTime) {
      setError("Please specify a proposed end time");
      setLoading(false);
      return;
    }

    // FIXED: proposedEndTime from datetime-local is in browser's local timezone
    // We need to interpret it as EST and convert to UTC
    // Parse the datetime-local string to get year, month, day, hours, minutes
    const [datePart, timePart] = formData.proposedEndTime.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hours, minutes] = timePart.split(':').map(Number);
    
    // Treat these as EST time and convert to UTC (EST is UTC-5)
    const utcHours = hours + 5;
    let utcDay = day;
    let utcMonth = month - 1; // JavaScript months are 0-indexed
    let utcYear = year;
    
    // Handle rollover
    let proposedEnd;
    if (utcHours >= 24) {
      const extraDays = Math.floor(utcHours / 24);
      utcDay += extraDays;
      const utcHoursAdjusted = utcHours % 24;
      
      const daysInMonth = new Date(year, month, 0).getDate();
      if (utcDay > daysInMonth) {
        utcDay = utcDay - daysInMonth;
        utcMonth += 1;
        if (utcMonth >= 12) {
          utcMonth = 0;
          utcYear += 1;
        }
      }
      
      proposedEnd = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHoursAdjusted, minutes, 0));
    } else {
      // No rollover needed
      proposedEnd = new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHours, minutes, 0));
    }
    
    if (currentEndTime && proposedEnd <= currentEndTime) {
      setError("Proposed end time must be after current shift end time");
      setLoading(false);
      return;
    }

    try {
      const response = await createOvertimeOffer({
        guardId: guardId,
        shiftId: shiftId,
        proposedEndTime: proposedEnd.toISOString(),
        extensionHours: parseFloat(formData.extensionHours) || 0,
        reason: formData.reason.trim() || null,
      });

      if (onSuccess) {
        onSuccess(response.data);
      }
      onClose();
    } catch (err) {
      console.error("Error creating overtime offer:", err);
      console.error("Error details:", {
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        guardId,
        shiftId,
        proposedEndTime: proposedEnd.toISOString(),
        extensionHours: parseFloat(formData.extensionHours) || 0,
        requestData: {
          guardId,
          shiftId,
          proposedEndTime: proposedEnd.toISOString(),
          extensionHours: parseFloat(formData.extensionHours) || 0,
          reason: formData.reason.trim() || null,
        },
      });
      
      // Show more detailed error message
      const errorMessage = err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        "Failed to create overtime offer";
      
      // Add status code if available
      const statusCode = err.response?.status;
      const fullErrorMessage = statusCode 
        ? `${errorMessage} (Status: ${statusCode})`
        : errorMessage;
      
      setError(fullErrorMessage);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return "—";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const guardName = guard?.guardName || guard?.guard_email || guard?.guardEmail || "Guard";

  // Additional safety check for required fields
  const guardId = guard?.guardId || guard?.guard_id;
  const shiftId = guard?.shiftId || guard?.shift_id;
  
  if (!guardId || !shiftId) {
    console.error("OvertimeOfferModal: Missing required guard data", guard);
    return null;
  }

  return (
    <Modal
      title={`Offer Overtime to ${guardName}`}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            className="btn"
            onClick={onClose}
            disabled={loading}
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.8)",
            }}
          >
            Cancel
          </button>
          <button
            className="btn"
            onClick={handleSubmit}
            disabled={loading || !formData.proposedEndTime}
            style={{
              background: "#22c55e",
              color: "white",
              fontWeight: 600,
            }}
          >
            {loading ? "Sending..." : "Send Offer"}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && (
          <div
            style={{
              padding: 12,
              background: "rgba(239, 68, 68, 0.15)",
              borderRadius: 8,
              marginBottom: 16,
              border: "1px solid rgba(239, 68, 68, 0.3)",
            }}
          >
            <div style={{ fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>
              Error
            </div>
            <div style={{ fontSize: 13, color: "rgba(239, 68, 68, 0.9)" }}>
              {error}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
            Guard
          </label>
          <div style={{ opacity: 0.8 }}>
            {guardName}
          </div>
        </div>

        {currentEndTime && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
              Current Shift End Time
            </label>
            <div style={{ opacity: 0.8 }}>
              {formatDateTime(currentEndTime)}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="extensionHours"
            style={{ display: "block", marginBottom: 6, fontWeight: 600 }}
          >
            Extension Hours *
          </label>
          <input
            id="extensionHours"
            type="number"
            min="0.5"
            max="12"
            step="0.5"
            value={formData.extensionHours}
            onChange={handleExtensionHoursChange}
            placeholder="e.g., 2.0"
            required
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.9)",
              fontSize: 14,
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            How many additional hours to offer
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="proposedEndTime"
            style={{ display: "block", marginBottom: 6, fontWeight: 600 }}
          >
            Proposed End Time *
          </label>
          <input
            id="proposedEndTime"
            type="datetime-local"
            value={formData.proposedEndTime}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                proposedEndTime: e.target.value,
              }))
            }
            required
            min={
              currentEndTime
                ? new Date(currentEndTime.getTime() + 30 * 60 * 1000)
                    .toISOString()
                    .slice(0, 16)
                : undefined
            }
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.9)",
              fontSize: 14,
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            When the shift should end (must be after current end time)
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="reason"
            style={{ display: "block", marginBottom: 6, fontWeight: 600 }}
          >
            Reason (Optional)
          </label>
          <textarea
            id="reason"
            value={formData.reason}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                reason: e.target.value,
              }))
            }
            placeholder="e.g., Need coverage for late event, Emergency situation..."
            rows={3}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.9)",
              fontSize: 14,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
            Optional note to explain why overtime is needed
          </div>
        </div>

        {formData.extensionHours && parseFloat(formData.extensionHours) > 0 && (
          <div
            style={{
              padding: 12,
              background: "rgba(34, 197, 94, 0.1)",
              borderRadius: 8,
              border: "1px solid rgba(34, 197, 94, 0.3)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "#22c55e" }}>
              Offer Summary
            </div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 4 }}>
              Extending shift by <strong>{formData.extensionHours} hours</strong>
              {currentEndTime && formData.proposedEndTime && (
                <>
                  <br />
                  From {formatDateTime(currentEndTime)} to{" "}
                  {formatDateTime(new Date(formData.proposedEndTime))}
                </>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
