import React, { useEffect, useState } from "react";
import { createIncident, listSites } from "../services/guardApi";
import NavBar from "../components/NavBar";
import "./incident-report.css";

export default function IncidentReport() {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    type: "",
    severity: "",
    description: "",
    location_text: "",
    site_id: "",
    occurred_at: "",
  });

  const [files, setFiles] = useState([]);

  useEffect(() => {
    loadSites();
  }, []);

  async function loadSites() {
    try {
      setLoading(true);
      const res = await listSites();
      
      // Handle different response structures
      let sitesData = [];
      if (Array.isArray(res.data)) {
        sitesData = res.data;
      } else if (res.data && Array.isArray(res.data.data)) {
        sitesData = res.data.data;
      } else if (Array.isArray(res)) {
        sitesData = res;
      }
      
      // ✅ Filter out any non-site objects (in case shifts got mixed in)
      sitesData = sitesData.filter(item => {
        // Sites should have 'name' field, shifts would have 'shift_date' or 'shift_start'
        return item && item.name && !item.shift_date && !item.shift_start;
      });
      
      setSites(sitesData);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load sites. You can still submit the report without selecting a site.");
      setSites([]);
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(e) {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length > 5) {
      setError("Maximum 5 files allowed");
      return;
    }
    setFiles(selectedFiles);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      if (!form.type || !form.severity || !form.description) {
        setError("Please fill in all required fields");
        setLoading(false);
        return;
      }

      const formData = new FormData();
      formData.append("type", form.type);
      formData.append("severity", form.severity);
      formData.append("description", form.description);
      
      if (form.location_text) {
        formData.append("location_text", form.location_text);
      }
      
      if (form.site_id) {
        formData.append("site_id", form.site_id);
      }
      
      if (form.occurred_at) {
        formData.append("occurred_at", form.occurred_at);
      }

      // Append files
      files.forEach((file) => {
        formData.append("files", file);
      });

      await createIncident(formData);
      
      setSuccess(true);
      setForm({
        type: "",
        severity: "",
        description: "",
        location_text: "",
        site_id: "",
        occurred_at: "",
      });
      setFiles([]);
      
      // Reset success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);
        } catch (err) {
      setError(err.response?.data?.message || "Failed to create incident report");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <NavBar />
      <div className="page">
        <div className="container">
          <div className="card">
            <h1>Report Incident</h1>
            <p>Report any incidents, emergencies, or safety concerns</p>
            <div className="infoBox">
              ℹ️ You can report incidents at any time, even when clocked out.
            </div>
          </div>

          {error && <div className="error">{error}</div>}
          {success && <div className="success">✅ Incident report submitted successfully</div>}

          <form onSubmit={handleSubmit} className="formCard">
            <div className="formGroup">
              <label className="formLabel">
                Incident Type <span className="required">*</span>
              </label>
              <select
                className="formSelect"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                required
              >
              <option value="">Select type...</option>
              <option value="TRESPASS">Trespass</option>
              <option value="THEFT">Theft</option>
              <option value="VANDALISM">Vandalism</option>
              <option value="MEDICAL">Medical Emergency</option>
              <option value="OTHER">Other</option>
              </select>
            </div>

            <div className="formGroup">
              <label className="formLabel">
                Severity <span className="required">*</span>
              </label>
              <select
                className="formSelect"
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                required
              >
              <option value="">Select severity...</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              </select>
            </div>

            <div className="formGroup">
              <label className="formLabel">Site/Building (optional)</label>
              <select
                className="formSelect"
                value={form.site_id}
                onChange={(e) => setForm({ ...form, site_id: e.target.value })}
              >
              <option value="">Select site...</option>
              {Array.isArray(sites) && sites.length > 0 ? (
                sites.map((site) => (
                  <option key={site.id || site.site_id} value={site.id || site.site_id}>
                    {site.name || site.site_name || "Unknown Site"} {site.address_1 ? `- ${site.address_1}` : ""}
                  </option>
                ))
              ) : (
                <option value="">No sites available</option>
              )}
              </select>
            </div>

            <div className="formGroup">
              <label className="formLabel">
                Description <span className="required">*</span>
              </label>
              <textarea
                className="formTextarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                required
                rows={6}
                placeholder="Provide detailed description of the incident..."
              />
            </div>

            <div className="formGroup">
              <label className="formLabel">Location (if not using site selection)</label>
              <input
                type="text"
                className="formInput"
                value={form.location_text}
                onChange={(e) => setForm({ ...form, location_text: e.target.value })}
                placeholder="e.g., Main entrance, Parking lot B..."
              />
            </div>

            <div className="formGroup">
              <label className="formLabel">Occurred At (optional)</label>
              <input
                type="datetime-local"
                className="formInput"
                value={form.occurred_at}
                onChange={(e) => setForm({ ...form, occurred_at: e.target.value })}
              />
            </div>

            <div className="formGroup">
              <label className="formLabel">Attachments (photos, videos, audio) - Max 5 files</label>
              <input
                type="file"
                className="formInput"
                multiple
                accept="image/*,video/*,audio/*"
                onChange={handleFileChange}
              />
              {files.length > 0 && (
                <div className="fileInfo">
                  Selected: {files.length} file(s)
                  <ul className="fileList">
                    {files.map((file, idx) => (
                      <li key={idx}>{file.name}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="buttonGroup">
              <button
                type="button"
                className="btnSecondary"
                onClick={() => {
                  setForm({
                    type: "",
                    severity: "",
                    description: "",
                    location_text: "",
                    site_id: "",
                    occurred_at: "",
                  });
                  setFiles([]);
                  setError("");
                }}
              >
                Clear
              </button>
              <button
                type="submit"
                className="btnPrimary"
                disabled={loading}
              >
                {loading ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
