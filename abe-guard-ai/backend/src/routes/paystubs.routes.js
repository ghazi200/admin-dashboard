const express = require("express");
const multer = require("multer");
const auth = require("../middleware/auth"); // ✅ Fixed: use 'auth' not 'authAdmin'
const requirePayrollMode = require("../middleware/requirePayrollMode");
const requireRole = require("../middleware/requireRole");
const { UPLOAD_ROOT, ensureUploadDir, MAX_UPLOAD_BYTES } = require("../config/uploads");

ensureUploadDir();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_ROOT);
  },
  filename: function (req, file, cb) {
    const safe = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});

function fileFilter(req, file, cb) {
  const ok =
    file.mimetype === "application/pdf" ||
    file.mimetype === "image/png" ||
    file.mimetype === "image/jpeg";

  if (!ok) return cb(new Error("Unsupported file type. Upload PDF/JPG/PNG only."));
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const router = express.Router();

// ✅ Admin only + mode gate (A or Hybrid)
// Note: requirePayrollMode sets req.tenant and validates mode
router.use(auth);
router.use(requireRole(["admin"]));
router.use(requirePayrollMode(["PAYSTUB_UPLOAD", "HYBRID"], { actor: "admin" }));

// POST /api/admin/paystubs  (multipart/form-data)
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { PayStub } = req.app.locals.models;

    const tenantId = req.tenant.id;
    const adminId = req.admin?.id || null;

    const {
      guard_id,
      pay_period_start,
      pay_period_end,
      pay_date,
      payment_method,
      hours_worked = 0,
      gross_amount = 0,
      tax_amount = 0,
      deductions_amount = 0,
      net_amount = 0,
    } = req.body;

    // ✅ Validation: Required fields
    if (!guard_id || !pay_period_start || !pay_period_end || !pay_date || !payment_method) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ✅ Validation: Payment method must be valid
    const paymentMethod = String(payment_method).toUpperCase();
    if (!["DIRECT_DEPOSIT", "CHECK"].includes(paymentMethod)) {
      return res.status(400).json({ 
        message: "Invalid payment_method", 
        allowed: ["DIRECT_DEPOSIT", "CHECK"] 
      });
    }

    if (!req.file) return res.status(400).json({ message: "Missing file upload" });

    // ✅ File URL - adjust path based on how you serve static files
    // If using Express static middleware: app.use('/uploads', express.static('uploads'))
    // Then file_url should be relative: /uploads/paystubs/filename
    const file_url = `/uploads/paystubs/${req.file.filename}`;

    // ✅ Convert string numbers to decimals for proper database storage
    const stub = await PayStub.create({
      tenant_id: tenantId,
      guard_id,
      pay_period_start,
      pay_period_end,
      pay_date,
      payment_method: paymentMethod,
      hours_worked: parseFloat(hours_worked) || 0,
      gross_amount: parseFloat(gross_amount) || 0,
      tax_amount: parseFloat(tax_amount) || 0,
      deductions_amount: parseFloat(deductions_amount) || 0,
      net_amount: parseFloat(net_amount) || 0,
      file_url,
      file_name: req.file.originalname,
      created_by_admin_id: adminId,
    });

    return res.json({ ok: true, stub });
  } catch (e) {
    console.error("Error uploading pay stub:", e);
    return res.status(500).json({ message: e.message });
  }
});

// GET /api/admin/paystubs?guardId=...
router.get("/", async (req, res) => {
  try {
    const { PayStub } = req.app.locals.models;

    // ✅ Use tenant from requirePayrollMode middleware (already validated)
    const tenantId = req.tenant.id;
    const guardId = req.query.guardId;

    const where = { tenant_id: tenantId };
    if (guardId) where.guard_id = guardId;

    const rows = await PayStub.findAll({
      where,
      order: [["pay_date", "DESC"]],
      limit: 100,
    });

    return res.json(rows);
  } catch (e) {
    console.error("Error listing pay stubs:", e);
    return res.status(500).json({ message: e.message });
  }
});

module.exports = router;
