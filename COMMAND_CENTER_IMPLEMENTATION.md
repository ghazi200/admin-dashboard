# AI Operations Command Center - Implementation Summary

## ✅ Phase 1 Implementation Complete

### What Was Built

#### Backend (Admin Dashboard)

1. **Database Models**
   - ✅ `OpEvent` - Stores standardized operational events
   - ✅ `CommandCenterAction` - Audit trail for AI-recommended actions

2. **Services**
   - ✅ `opsEvent.service.js` - Event standardization and storage
   - ✅ `riskScoring.service.js` - Deterministic risk scoring (Phase 1: rules-based)
   - ✅ `socketEventInterceptor.js` - Intercepts Socket.IO events and converts to OpEvents

3. **Controllers**
   - ✅ `commandCenter.controller.js` - API endpoints:
     - `GET /api/admin/command-center/feed` - Operational events feed
     - `GET /api/admin/command-center/at-risk-shifts` - Risk-ranked shifts
     - `POST /api/admin/command-center/briefing` - AI briefing generation

4. **Routes**
   - ✅ `adminCommandCenter.routes.js` - Command Center API routes
   - ✅ Integrated into `server.js`

5. **Socket.IO Integration**
   - ✅ Event interceptor initialized in `server.js`
   - ✅ Captures events: incidents, callouts, inspections, clock in/out, shifts

#### Frontend (Admin Dashboard)

1. **API Service**
   - ✅ Added Command Center API functions to `api.js`

2. **Page Component**
   - ✅ `CommandCenter.jsx` - Full Command Center dashboard with:
     - Three AI tiles (Right Now, Why It's Happening, What To Do)
     - At-Risk Shifts panel
     - Live Situation Room feed
     - AI Briefing button and display

3. **Routing**
   - ✅ Added `/command-center` route to `App.js`

---

## Features Implemented

### ✅ 1. Live Situation Room Feed
- Real-time operational events stream
- Event types: INCIDENT, CALLOUT, INSPECTION, CLOCKIN, SHIFT
- Severity levels: LOW, MEDIUM, HIGH, CRITICAL
- Auto-refresh every 30 seconds
- Socket.IO real-time updates

### ✅ 2. Risk Scoring Engine (Phase 1: Rules-Based)
- **Shift Risk Scoring** (0-100):
  - Past callouts (25%)
  - Lateness frequency (20%)
  - Site incident frequency (20%)
  - Distance to site (15%) - if geo available
  - Consecutive hours worked (10%)
  - Time until shift start (10%)

- **Guard Reliability Risk**
  - Based on callout rate
  - Lateness history
  - Data quality (uncertainty for low data)

- **Site Risk**
  - Coverage gaps (open shifts)
  - Incident frequency

### ✅ 3. At-Risk Shifts Panel
- Automatically calculates risk for all open shifts
- Ranks by risk score (highest first)
- Shows risk factors and reasoning
- Filters by minimum risk score (default: 40)
- Refreshes every minute

### ✅ 4. AI Briefing (Phase 1: Template-Based)
- Generates operational summary for time period (24h, 7d, 30d)
- Shows top risks, recommended actions, what changed
- Template-based summaries (Phase 2: LLM-generated)
- Rule-based recommended actions

### ✅ 5. Three AI Tiles
- **Right Now**: Critical risks and high-severity events
- **Why It's Happening**: Risk factor analysis
- **What To Do**: Recommended actions

---

## API Endpoints

### GET `/api/admin/command-center/feed`
Get operational events feed.

**Query Params:**
- `tenantId` (optional, auto-set for tenant admins)
- `siteId` (optional)
- `type` (optional: INCIDENT, CALLOUT, INSPECTION, CLOCKIN, SHIFT)
- `severity` (optional: LOW, MEDIUM, HIGH, CRITICAL)
- `limit` (default: 50, max: 200)
- `offset` (default: 0)
- `startDate` (optional)
- `endDate` (optional)

**Response:**
```json
{
  "data": [...OpEvents],
  "count": 50,
  "filters": {...}
}
```

### GET `/api/admin/command-center/at-risk-shifts`
Get shifts ranked by risk score.

**Query Params:**
- `tenantId` (optional, auto-set for tenant admins)
- `limit` (default: 20)
- `minRiskScore` (default: 40)

**Response:**
```json
{
  "data": [
    {
      "shift": {...},
      "risk": {
        "riskScore": 78.5,
        "riskLevel": "HIGH",
        "factors": {...}
      }
    }
  ],
  "count": 10,
  "options": {...}
}
```

### POST `/api/admin/command-center/briefing`
Generate AI briefing for a tenant.

**Body:**
```json
{
  "tenantId": "...",  // Optional for super admin
  "timeRange": "24h", // or "7d", "30d"
  "focus": "all"      // or "coverage", "incidents", "compliance"
}
```

**Response:**
```json
{
  "tenantId": "...",
  "timeRange": "24h",
  "summary": "...",
  "topRisks": [...],
  "recommendedActions": [...],
  "whatChanged": {...},
  "stats": {...}
}
```

---

## Database Tables

### `ops_events`
Stores standardized operational events.

**Key Fields:**
- `tenant_id`, `site_id`
- `type` (INCIDENT, CALLOUT, INSPECTION, CLOCKIN, SHIFT, COMPLIANCE, PAYROLL)
- `severity` (LOW, MEDIUM, HIGH, CRITICAL)
- `title`, `summary`
- `entity_refs` (JSONB: incident_id, shift_id, guard_id, etc.)
- `ai_enhanced` (boolean)
- `ai_tags` (JSONB: risk_level, category, auto_summary, confidence)
- `raw_event` (JSONB: original event data)

### `command_center_actions`
Audit trail for AI-recommended actions (for future action approval system).

---

## Next Steps (Phase 2)

1. **LLM Integration**
   - Replace template-based briefing with GPT-4o-mini summaries
   - Add AI-generated risk explanations
   - Generate more nuanced recommended actions

2. **Action Approval System**
   - Build UI for approving/rejecting recommended actions
   - Execute approved actions automatically
   - Log outcomes

3. **Enhanced Risk Scoring**
   - Add more factors (weather, traffic, guard fatigue)
   - Historical pattern analysis
   - ML-based predictions (Phase 3)

4. **Additional Features**
   - Site health dashboard
   - Guard readiness panel
   - Daily digest emails
   - Cross-tenant analytics (super admin)

---

## Testing

### 1. Start Backend
```bash
cd admin-dashboard/backend
npm start
```

### 2. Start Frontend
```bash
cd admin-dashboard/frontend-admin-dashboard/admin-dashboard-frontend
npm start
```

### 3. Access Command Center
Navigate to: `http://localhost:3000/command-center`

### 4. Test Endpoints
```bash
# Get feed
curl http://localhost:5000/api/admin/command-center/feed \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get at-risk shifts
curl http://localhost:5000/api/admin/command-center/at-risk-shifts \
  -H "Authorization: Bearer YOUR_TOKEN"

# Generate briefing
curl -X POST http://localhost:5000/api/admin/command-center/briefing \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"timeRange": "24h"}'
```

---

## Notes

- **Tenant Isolation**: All queries are tenant-scoped (except super admin)
- **Real-Time**: Socket.IO events are automatically captured and stored
- **Performance**: Risk scoring runs async, doesn't block API responses
- **Scalability**: Can add caching for risk scores and summaries
- **Cost**: Phase 1 uses no LLM calls (cheap). Phase 2 will add OpenAI costs.

---

## Status

✅ **Phase 1 Complete** - Foundation is ready for production use with rule-based intelligence.

🚧 **Phase 2 In Progress** - LLM integration can begin when ready.

📋 **Phase 3 Planned** - ML-based predictions and automation.
