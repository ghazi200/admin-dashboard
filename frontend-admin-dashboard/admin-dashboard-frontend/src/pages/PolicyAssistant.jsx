import React, { useEffect, useState } from "react";
import {
  listTenants,
  listSites,
  listPolicyDocuments,
  uploadPolicyPdf,
  uploadPolicyText,
  reindexPolicyDocument,
  setPolicyDocumentActive,
  deletePolicyDocument,
} from "../services/policy.service";

export default function PolicyAssistant() {
  // dropdown data
  const [tenants, setTenants] = useState([]);
  const [sites, setSites] = useState([]);

  // selection
  const [tenantId, setTenantId] = useState("");
  const [siteId, setSiteId] = useState("");

  // upload form
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("handbook");
  const [visibility, setVisibility] = useState("guard");
  const [rawText, setRawText] = useState("");
  const [file, setFile] = useState(null);

  // docs
  const [docs, setDocs] = useState([]);

  // ui state
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // Animation state
  const [displayedText, setDisplayedText] = useState("");
  const fullText = "My name is AGENT 24 what can I help you with ?";

  /* =====================
     Loaders
  ===================== */

  async function loadTenants() {
    const res = await listTenants();
    setTenants(res.data?.rows || []);
  }

  async function loadSites(tId) {
    if (!tId) return setSites([]);
    const res = await listSites(tId);
    setSites(res.data?.rows || []);
  }

  async function loadDocs(tId, sId) {
    if (!tId) return setDocs([]);
    const res = await listPolicyDocuments(tId, sId);
    setDocs(res.data?.rows || []);
  }

  useEffect(() => {
    loadTenants().catch(console.error);
  }, []);

  // Typewriter animation effect
  useEffect(() => {
    let currentIndex = 0;
    let timeoutId;
    const typingSpeed = 50; // milliseconds per character

    const typeText = () => {
      if (currentIndex < fullText.length) {
        setDisplayedText(fullText.slice(0, currentIndex + 1));
        currentIndex++;
        timeoutId = setTimeout(typeText, typingSpeed);
      }
    };

    // Start typing after a short delay
    const timer = setTimeout(typeText, 300);
    return () => {
      clearTimeout(timer);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [fullText]);

  useEffect(() => {
    setSiteId("");
    loadSites(tenantId).catch(console.error);
    loadDocs(tenantId, "").catch(console.error);
  }, [tenantId]);

  useEffect(() => {
    loadDocs(tenantId, siteId).catch(console.error);
  }, [siteId]);

  /* =====================
     Actions
  ===================== */

  async function handleUpload() {
    // Validation before starting upload
    if (!tenantId) {
      setError("Please select a tenant");
      return;
    }
    if (!title || title.trim().length === 0) {
      setError("Please enter a title");
      return;
    }
    if (!file && (!rawText || rawText.trim().length < 20)) {
      setError("Please upload a PDF or enter at least 20 characters of policy text");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("tenantId", tenantId);
        if (siteId) fd.append("siteId", siteId);
        fd.append("title", title.trim());
        fd.append("category", category);
        fd.append("visibility", visibility);

        await uploadPolicyPdf(fd);
      } else {
        const trimmedText = rawText.trim();
        // Send as FormData to match backend multer expectations
        const fd = new FormData();
        fd.append("tenantId", tenantId);
        if (siteId) fd.append("siteId", siteId);
        fd.append("title", title.trim());
        fd.append("category", category);
        fd.append("visibility", visibility);
        fd.append("rawText", trimmedText);
        
        await uploadPolicyText(fd);
      }

      // Only clear fields on successful upload
      setNotice("Policy uploaded successfully.");
      setTitle("");
      setRawText("");
      setFile(null);
      await loadDocs(tenantId, siteId);
    } catch (e) {
      // Preserve form fields on error
      const errorMsg = e?.response?.data?.message || e?.response?.data?.error || "Upload failed";
      setError(errorMsg);
      console.error("Upload error:", e);
    } finally {
      setBusy(false);
    }
  }

  async function handleReindex(id) {
    setRowBusy(id);
    try {
      await reindexPolicyDocument(id, true);
      setNotice("Reindex complete.");
      await loadDocs(tenantId, siteId);
    } catch (e) {
      setError("Reindex failed");
    } finally {
      setRowBusy(null);
    }
  }

  async function toggleActive(id, current) {
    setRowBusy(id);
    try {
      await setPolicyDocumentActive(id, !current);
      await loadDocs(tenantId, siteId);
    } catch {
      setError("Update failed");
    } finally {
      setRowBusy(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this policy document?")) return;
    setRowBusy(id);
    try {
      await deletePolicyDocument(id);
      await loadDocs(tenantId, siteId);
    } catch {
      setError("Delete failed");
    } finally {
      setRowBusy(null);
    }
  }

  /* =====================
     Render
  ===================== */

  return (
    <div>
      <h2>Policy Assistant</h2>

      {/* Animated Agent 24 Statement */}
      <div
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
          color: "white",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <style>
          {`
            @keyframes agentBlink {
              0%, 50% { opacity: 1; }
              51%, 100% { opacity: 0; }
            }
            .agent-cursor {
              display: inline-block;
              width: 2px;
              height: 20px;
              background: white;
              margin-left: 4px;
              animation: agentBlink 1s infinite;
            }
          `}
        </style>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            lineHeight: 1.6,
            minHeight: 28,
          }}
        >
          {displayedText}
          <span className="agent-cursor" />
        </div>
      </div>

      {/* Upload */}
      <div style={{ border: "1px solid #ddd", padding: 12, marginBottom: 16 }}>
        <h3>Upload Policy</h3>

        <div>
          <label>Tenant</label>
          <select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Select tenant</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name || t.id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Site (optional)</label>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            <option value="">Tenant-wide</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.id}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <label>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="handbook">handbook</option>
            <option value="post_orders">post_orders</option>
            <option value="breaks">breaks</option>
            <option value="uniforms">uniforms</option>
            <option value="callouts">callouts</option>
            <option value="overtime">overtime</option>
          </select>
        </div>

        <div>
          <label>Visibility</label>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="guard">guard</option>
            <option value="supervisor">supervisor</option>
            <option value="admin">admin</option>
            <option value="all">all</option>
          </select>
        </div>

        <div>
          <label>
            Upload PDF <span style={{ fontSize: 12, fontWeight: "normal", color: "#666" }}>(optional)</span>
          </label>
          <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files[0])} />
        </div>

        <div style={{ marginTop: 16 }}>
          <label>
            Policy Content <span style={{ fontSize: 12, fontWeight: "normal", color: "#666" }}>(required if no PDF)</span>
          </label>
          <textarea
            rows={8}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste or type your policy content here directly. This text will be processed and made searchable for policy questions. Minimum 20 characters required."
            style={{
              width: "100%",
              padding: "8px",
              fontSize: "14px",
              fontFamily: "inherit",
              border: "1px solid #ddd",
              borderRadius: "4px",
              resize: "vertical",
            }}
          />
          <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
            {rawText.length > 0 ? (
              <span style={{ color: rawText.trim().length < 20 ? "#d32f2f" : "#2e7d32" }}>
                {rawText.trim().length} characters {rawText.trim().length < 20 ? "(minimum 20 required)" : "✓"}
              </span>
            ) : (
              "Enter policy text directly or upload a PDF above"
            )}
          </div>
        </div>

        <button
          onClick={handleUpload}
          disabled={!tenantId || !title || busy || (!file && (!rawText || rawText.trim().length < 20))}
          style={{ marginTop: 16, padding: "10px 20px", fontSize: "16px" }}
        >
          {busy ? "Uploading..." : "Upload Policy"}
        </button>
        
        {!tenantId && <div style={{ color: "#d32f2f", fontSize: 12, marginTop: 8 }}>Please select a tenant</div>}
        {!title && <div style={{ color: "#d32f2f", fontSize: 12, marginTop: 8 }}>Please enter a title</div>}
        {!file && (!rawText || rawText.trim().length < 20) && (
          <div style={{ color: "#d32f2f", fontSize: 12, marginTop: 8 }}>
            Please upload a PDF or enter at least 20 characters of policy text (you have {rawText ? rawText.trim().length : 0})
          </div>
        )}

        {error && <div style={{ color: "red" }}>{error}</div>}
        {notice && <div>{notice}</div>}
      </div>

      {/* Documents */}
      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <h3>Policy Documents</h3>

        <table width="100%" cellPadding={6}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Category</th>
              <th>Visibility</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <td colSpan={5}>No documents</td>
              </tr>
            )}

            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.title}</td>
                <td>{d.category}</td>
                <td>{d.visibility}</td>
                <td>
                  <button onClick={() => toggleActive(d.id, d.is_active)}>
                    {d.is_active ? "On" : "Off"}
                  </button>
                </td>
                <td>
                  <button onClick={() => handleReindex(d.id)} disabled={rowBusy === d.id}>
                    Reindex
                  </button>
                  <button onClick={() => handleDelete(d.id)} disabled={rowBusy === d.id}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
