/**
 * End-to-end test: login → find guard "Ghazi Abdullah" → create shift.
 *
 * Usage (from repo root or backend/):
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='yourpass' node backend/scripts/testCreateShiftGhazi.js
 *
 * Optional:
 *   API_BASE=http://localhost:5000
 *   GUARD_NAME="Ghazi Abdullah"
 *   SHIFT_DATE=2026-02-05   (default: today UTC date)
 *
 * Fails fast with clear errors if login fails or guard not found.
 */

const API_BASE = (process.env.API_BASE || "http://localhost:5000").replace(/\/+$/, "");

async function main() {
  const email = process.env.ADMIN_EMAIL || process.env.TEST_ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD || process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (admin dashboard login).");
    process.exit(1);
  }

  const guardName = (process.env.GUARD_NAME || "Ghazi Abdullah").toLowerCase();
  const location = process.env.SHIFT_LOCATION || "248 Duffield Street, Brooklyn";
  const shiftDate =
    process.env.SHIFT_DATE || new Date().toISOString().slice(0, 10);
  const shiftStart = process.env.SHIFT_START || "03:00pm";
  const shiftEnd = process.env.SHIFT_END || "11:00pm";

  console.log("API_BASE:", API_BASE);
  console.log("Login as:", email);

  const loginRes = await fetch(`${API_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const loginJson = await loginRes.json().catch(() => ({}));
  if (!loginRes.ok) {
    console.error("Login failed:", loginRes.status, loginJson);
    process.exit(1);
  }
  const token = loginJson.token;
  if (!token) {
    console.error("No token in login response:", loginJson);
    process.exit(1);
  }
  console.log("Login OK.");

  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const guardsRes = await fetch(`${API_BASE}/api/admin/guards`, { headers: auth });
  const guardsJson = await guardsRes.json().catch(() => ({}));
  if (!guardsRes.ok) {
    console.error("List guards failed:", guardsRes.status, guardsJson);
    process.exit(1);
  }
  const list = Array.isArray(guardsJson) ? guardsJson : guardsJson.guards || guardsJson.data || [];
  const guard = list.find(
    (g) => String(g.name || "").toLowerCase().includes(guardName)
  );
  if (!guard || !guard.id) {
    console.error('Guard not found matching "' + guardName + '". Guards:', list.length);
    if (list[0]) console.error("Sample:", list[0].name, list[0].id);
    process.exit(1);
  }
  console.log("Guard:", guard.name, guard.id);

  const body = {
    location,
    shift_date: shiftDate,
    shift_start: shiftStart,
    shift_end: shiftEnd,
    guard_id: guard.id,
  };
  console.log("POST /api/admin/shifts", body);

  const shiftRes = await fetch(`${API_BASE}/api/admin/shifts`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify(body),
  });
  const shiftJson = await shiftRes.json().catch(() => ({}));
  if (!shiftRes.ok) {
    console.error("Create shift failed:", shiftRes.status, shiftJson);
    process.exit(1);
  }
  console.log("Create shift OK:", JSON.stringify(shiftJson, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
