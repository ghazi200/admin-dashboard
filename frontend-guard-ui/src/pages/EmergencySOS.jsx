import React, { useState, useEffect } from "react";
import NavBar from "../components/NavBar";
import { triggerEmergencySOS, getEmergencyContacts, addEmergencyContact } from "../services/guardApi";

export default function EmergencySOS() {
  const [location, setLocation] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [isActivating, setIsActivating] = useState(false);
  const [emergencyActivated, setEmergencyActivated] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [contacts, setContacts] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "" });

  // Get current location
  const getCurrentLocation = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }

      const options = {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          let errorMessage = "Failed to get location";
            switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location permission denied";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location information unavailable";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timed out";
              break;
            default:
              errorMessage = "Failed to get location";
              break;
          }
          reject(new Error(errorMessage));
        },
        options
      );
    });
  };

  // Load emergency contacts
  useEffect(() => {
    const loadContacts = async () => {
      try {
        const res = await getEmergencyContacts();
        setContacts(res?.data || []);
      } catch (e) {
        console.error("Failed to load emergency contacts:", e);
      }
    };
    loadContacts();
  }, []);

  // Handle emergency activation
  const handleEmergencyActivate = async () => {
    // Confirmation dialog
    const confirmed = window.confirm(
      "⚠️ EMERGENCY SOS\n\n" +
      "This will immediately alert supervisors and call the on-call supervisor.\n\n" +
      "Only activate in a real emergency.\n\n" +
      "Continue?"
    );

    if (!confirmed) return;

    setErr("");
    setMsg("");
    setIsActivating(true);
    setEmergencyActivated(false);

    try {
      // Get location
      let locationData = null;
      try {
        locationData = await getCurrentLocation();
        setLocation(locationData);
        setLocationError("");
      } catch (locErr) {
        console.warn("Location error:", locErr);
        setLocationError(locErr.message);
        // Continue even without location
      }

      // Trigger emergency
      const res = await triggerEmergencySOS({
        lat: locationData?.lat,
        lng: locationData?.lng,
        accuracy: locationData?.accuracy,
      });

      setEmergencyActivated(true);
      setMsg("✅ Emergency SOS activated! Supervisors have been notified.");

      // Auto-dial on-call supervisor if phone number is available
      const supervisor = res?.data?.emergency?.supervisor;
      if (supervisor?.phone) {
        // Use browser's tel: protocol to initiate call
        window.location.href = `tel:${supervisor.phone}`;
        console.log(`📞 Auto-dialing supervisor: ${supervisor.phone}`);
      } else if (supervisor) {
        console.log("⚠️ Supervisor found but no phone number available");
      }

      console.log("Emergency SOS response:", res?.data);
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to activate emergency SOS");
    } finally {
      setIsActivating(false);
    }
  };

  // Add emergency contact
  const handleAddContact = async (e) => {
    e.preventDefault();
    if (!newContact.name.trim() || !newContact.phone.trim()) {
      setErr("Name and phone are required");
      return;
    }

    try {
      const res = await addEmergencyContact(newContact);
      setContacts([...contacts, res?.data || newContact]);
      setNewContact({ name: "", phone: "" });
      setShowAddContact(false);
      setMsg("Emergency contact added");
    } catch (e) {
      setErr(e?.response?.data?.message || e.message || "Failed to add contact");
    }
  };

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="card" style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ color: "#dc2626", textAlign: "center" }}>🚨 Emergency SOS</h2>

          {/* Emergency Button */}
          <div style={{ textAlign: "center", marginTop: 30, marginBottom: 30 }}>
            <button
              className="btnPrimary"
              onClick={handleEmergencyActivate}
              disabled={isActivating}
              style={{
                fontSize: 32,
                fontWeight: 700,
                padding: "30px 60px",
                borderRadius: 16,
                background: emergencyActivated
                  ? "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                  : "linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)",
                border: "none",
                color: "#fff",
                boxShadow: emergencyActivated
                  ? "0 4px 20px rgba(16, 185, 129, 0.4)"
                  : "0 4px 20px rgba(220, 38, 38, 0.4)",
                cursor: isActivating ? "not-allowed" : "pointer",
                transition: "all 0.3s",
                animation: emergencyActivated ? "pulse 2s infinite" : "none",
              }}
            >
              {isActivating
                ? "Activating..."
                : emergencyActivated
                ? "✅ SOS Activated"
                : "SOS EMERGENCY"}
            </button>
          </div>

          {emergencyActivated && (
            <div
              style={{
                padding: 16,
                background: "#dcfce7",
                borderRadius: 8,
                border: "1px solid #86efac",
                marginBottom: 20,
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 600, color: "#166534", marginBottom: 8 }}>
                ✅ Emergency SOS Activated
              </div>
              <div style={{ fontSize: 14, color: "#15803d" }}>
                Supervisors have been notified. On-call supervisor is being called.
              </div>
            </div>
          )}

          {/* Location Status */}
          {location && (
            <div
              style={{
                padding: 12,
                background: "#eff6ff",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 12,
              }}
            >
              📍 Location: {location.lat.toFixed(6)}, {location.lng.toFixed(6)} (accuracy: ±
              {Math.round(location.accuracy)}m)
            </div>
          )}

          {locationError && (
            <div
              style={{
                padding: 12,
                background: "#fef2f2",
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 12,
                color: "#991b1b",
              }}
            >
              ⚠️ Location: {locationError}
            </div>
          )}

          {err && <div className="error">{err}</div>}
          {msg && <div className="success">{msg}</div>}

          {/* Emergency Contacts Section */}
          <div style={{ marginTop: 40, borderTop: "1px solid #e5e7eb", paddingTop: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, margin: 0 }}>Emergency Contacts</h3>
              <button
                className="btn"
                onClick={() => setShowAddContact(!showAddContact)}
                style={{ fontSize: 14, padding: "8px 16px" }}
              >
                {showAddContact ? "Cancel" : "+ Add Contact"}
              </button>
            </div>

            {showAddContact && (
              <form onSubmit={handleAddContact} style={{ marginBottom: 16, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                    Name
                  </label>
                  <input
                    type="text"
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                    }}
                    placeholder="Contact name"
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", marginBottom: 4, fontSize: 14, fontWeight: 500 }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    style={{
                      width: "100%",
                      padding: 8,
                      borderRadius: 6,
                      border: "1px solid #d1d5db",
                    }}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
                <button type="submit" className="btnPrimary" style={{ width: "100%" }}>
                  Add Contact
                </button>
              </form>
            )}

            {contacts.length > 0 ? (
              <div>
                {contacts.map((contact, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: 12,
                      background: "#fff",
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      marginBottom: 8,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 500 }}>{contact.name}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{contact.phone}</div>
                    </div>
                    <a
                      href={`tel:${contact.phone}`}
                      style={{
                        padding: "6px 12px",
                        background: "#3b82f6",
                        color: "#fff",
                        borderRadius: 6,
                        textDecoration: "none",
                        fontSize: 14,
                      }}
                    >
                      Call
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: 20, textAlign: "center", color: "#6b7280", fontSize: 14 }}>
                No emergency contacts added yet.
              </div>
            )}

            <div style={{ marginTop: 16, padding: 12, background: "#fef3c7", borderRadius: 8, fontSize: 12, color: "#92400e" }}>
              ℹ️ Additional contacts are stored for your reference. Only the on-call supervisor is auto-dialed during emergencies.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
