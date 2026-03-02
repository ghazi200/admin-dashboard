# AI-Optimized Guard Ranking Review

## Current Implementation Status

### ✅ What's Already Available

#### 1. Basic Ranking System
- **File**: `/src/services/ranking.service.js`
- **Current Logic**: Simple rule-based ranking (lowest weekly hours first)
- **Status**: ✅ Basic implementation exists

#### 2. AI Ranking Engine
- **File**: `/src/ai/aiDecisionEngine.js`
- **Features**:
  - ✅ AI-powered ranking using OpenAI GPT-4o-mini
  - ✅ Returns rankings with explanations (`reason` field)
  - ✅ Basic scoring function (`scoreGuard`) with:
    - Acceptance rate (40% weight)
    - Reliability score (30% weight)
    - Fatigue penalty (if weekly hours > 40)
    - Recency bonus (if last shift ended)
- **Status**: ✅ Partially implemented (basic AI ranking exists)

#### 3. Guard Model Data
- **File**: `/src/models/Guard.js`
- **Available Fields**:
  - ✅ `reliability_score` (FLOAT, default 0.8)
  - ✅ `acceptance_rate` (FLOAT, default 0.85)
  - ✅ `weekly_hours` (INTEGER)
  - ✅ `is_active` (BOOLEAN)
- **Status**: ✅ Basic metrics exist

#### 4. AI Decision Tracking
- **File**: `/src/models/AIDecision.js` (referenced in callouts.controller.js)
- **Features**:
  - ✅ Stores AI decision JSON with rankings
  - ✅ Tracks override history
  - ✅ Audit trail for decisions
- **Status**: ✅ Implemented

#### 5. Explainable Output
- **File**: `/src/pages/AIRanking.jsx` (admin dashboard)
- **Features**:
  - ✅ Displays ranking, reason, confidence
  - ✅ Shows assignment reason
  - ✅ Displays override information
- **Status**: ✅ Basic explainability exists

---

## ❌ What's Missing (Next Level Features)

### 1. AI Weighting System
**Status**: ❌ Not implemented
- Current: Fixed weights (40% acceptance, 30% reliability)
- Needed: Dynamic AI-learned weights based on success patterns
- **Implementation**: Would require ML model or adaptive algorithm

### 2. Reliability Decay Over Time
**Status**: ❌ Not implemented
- Current: `reliability_score` is static (only updated on callout accept/decline)
- Needed: Decay function that reduces reliability over time if guard hasn't worked
- **Example**: `reliability = base_score * decay_factor^(days_since_last_shift)`
- **Implementation**: Add time-based decay calculation in ranking service

### 3. Site-Specific Success Rates
**Status**: ❌ Not implemented
- Current: No site tracking in shifts (only `location` text field exists)
- Needed:
  - Track which guards worked which sites
  - Calculate success rate per guard per site
  - Prefer guards with high success rates at specific sites
- **Implementation**:
  - Add `site_id` to `shifts` table (or use `location` field)
  - Create `guard_site_performance` table or calculate on-the-fly
  - Query historical shifts to calculate success rates

### 4. Guard Preference Matching
**Status**: ❌ Not implemented
- Current: No preference tracking
- Needed:
  - Track guard preferences (shift times, locations, days)
  - Match guards to shifts based on preferences
  - Boost score for preference matches
- **Implementation**:
  - Add `preferences` JSONB field to `guards` table
  - Query preferences in ranking service
  - Add preference match bonus to scoring

### 5. Supervisor Feedback Loop
**Status**: ❌ Not implemented
- Current: Override system exists but no feedback collection
- Needed:
  - Allow supervisors to rate AI decisions (good/bad)
  - Store feedback in `AIDecision` or separate table
  - Use feedback to improve future rankings
- **Implementation**:
  - Add `feedback` field to `AIDecision` model (already exists as empty array)
  - Create feedback collection UI
  - Use feedback to adjust weights/parameters

### 6. Enhanced Explainable Output
**Status**: ⚠️ Partially implemented
- Current: Shows basic reason ("Ranked #1 by current rule: lowest weekly hours first")
- Needed: Detailed explanations like:
  - "Guard A selected because: 97% on-time, Worked this site 6 times, Low fatigue score"
- **Implementation**:
  - Enhance `aiDecisionEngine.js` to generate detailed explanations
  - Include multiple factors in explanation
  - Display in `AIRanking.jsx` with breakdown

---

## Database Schema Gaps

### Missing Fields/Tables

1. **Guards Table** - Missing:
   - `preferences` (JSONB) - Guard shift/location preferences
   - `last_shift_date` (DATE) - For reliability decay calculation
   - `on_time_rate` (FLOAT) - On-time arrival percentage
   - `site_success_rates` (JSONB) - Per-site performance data

2. **Shifts Table** - Missing:
   - `site_id` (UUID) - Link to sites table (or normalize `location` field)
   - `actual_start_time` (TIMESTAMP) - For on-time calculation
   - `guard_feedback` (JSONB) - Supervisor feedback on guard performance

3. **New Tables Needed**:
   - `guard_site_performance` - Track guard performance per site
   - `guard_preferences` - Store guard shift/location preferences
   - `ai_ranking_feedback` - Store supervisor feedback on AI decisions

---

## Implementation Priority

### High Priority (Core Features)
1. **Reliability Decay Over Time** - Easy to implement, high impact
2. **Enhanced Explainable Output** - Improves trust and transparency
3. **Site-Specific Success Rates** - High value for multi-site operations

### Medium Priority (Nice-to-Have)
4. **Guard Preference Matching** - Improves guard satisfaction
5. **Supervisor Feedback Loop** - Long-term improvement mechanism

### Low Priority (Advanced)
6. **AI Weighting System** - Requires ML/adaptive algorithms

---

## Quick Wins (Can Implement Now)

### 1. Reliability Decay
```javascript
// In ranking.service.js
function calculateDecayScore(guard, baseScore = 0.8) {
  const daysSinceLastShift = guard.last_shift_date 
    ? Math.floor((Date.now() - new Date(guard.last_shift_date)) / (1000 * 60 * 60 * 24))
    : 30; // Default to 30 days if unknown
  
  const decayFactor = 0.98; // 2% decay per day
  return baseScore * Math.pow(decayFactor, daysSinceLastShift);
}
```

### 2. Enhanced Explanations
```javascript
// In aiDecisionEngine.js - enhance prompt
const explanation = `
Guard ${guard.name} ranked #${rank} because:
- On-time rate: ${guard.onTimeRate}%
- Worked this site: ${guard.siteShiftCount} times
- Fatigue score: ${guard.fatigueScore} (${guard.weeklyHours} hours this week)
- Reliability: ${guard.reliability_score}
`;
```

### 3. Site Success Rate Calculation
```sql
-- Calculate guard success rate per site
SELECT 
  guard_id,
  location,
  COUNT(*) as total_shifts,
  SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as completed_shifts,
  AVG(CASE WHEN actual_start_time <= shift_start THEN 1.0 ELSE 0.0 END) as on_time_rate
FROM shifts
WHERE guard_id IS NOT NULL
GROUP BY guard_id, location;
```

---

## Recommendation

**Start with these 3 features:**
1. **Reliability Decay** - Quick win, improves ranking accuracy
2. **Enhanced Explanations** - Improves transparency and trust
3. **Site-Specific Success Rates** - High business value

These can be implemented incrementally without major schema changes (except adding `last_shift_date` to guards and `site_id` to shifts if not using `location`).

Would you like me to implement any of these features?
