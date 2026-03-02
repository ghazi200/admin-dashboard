# What You Should See in the Command Center

## 🎯 Navigation

1. **Login to Admin Dashboard** (if not already logged in)
2. **Click "🎯 Command Center"** in the sidebar navigation
3. **URL:** `http://localhost:3000/command-center`

---

## 📊 Main Dashboard Sections

### 1. **Three AI Tiles** (Top of Page)

#### Tile 1: "Right Now — What needs attention"
- Shows critical risks that need immediate attention
- Displays:
  - High-risk shifts (risk score ≥ 70)
  - High-severity events (HIGH or CRITICAL)
  - Count of critical issues

**Example:**
```
⚠️ 2 shifts at risk
🚨 1 critical event
```

#### Tile 2: "Why it's happening"
- Shows insights about why risks exist
- Displays patterns and root causes
- Example: "3 guards have exceeded fatigue threshold"

#### Tile 3: "What to do"
- Shows recommended actions
- Displays actionable items
- Example: "Send backup request to Guard B + C"

---

### 2. **🤖 Ask Command Center** (Natural Language Query)

**Location:** Below the AI tiles

**What you'll see:**
- Input box: "Ask a question about operations..."
- "Ask" button
- "Clear" button (appears after asking a question)

**Try these questions:**
- "What incidents occurred today?"
- "Show me recent callouts"
- "What happened this week?"
- "Any high-risk shifts?"
- "Why did we miss coverage last week?"

**After asking:**
- AI-generated answer appears
- Confidence score (e.g., "Confidence: 85%")
- Source citations (if available)
- Number of sources used

---

### 3. **AI Briefing Section**

**Location:** Below the query section

**What you'll see:**
- "📊 Generate Briefing" button
- After clicking, displays:
  - **AI-Generated Summary** (natural language)
  - **🧠 AI Insights** (pattern detection)
  - **⚠️ Top Risks** (prioritized risks with severity)
  - **💡 Recommended Actions** (with Approve/Reject buttons)
  - **📈 Trends** (INCREASING/DECREASING/STABLE indicators)

**Example Briefing:**
```
Operations briefing for the last 24h:

Tonight's coverage is at risk due to 3 guards with high callout rates 
and weather delays affecting Site A. Immediate attention needed for 
night shifts starting at 6pm.

🧠 AI Insights:
• Pattern detected: Callouts spike on Tuesday evenings at Site B
• Guard reliability declining for evening shifts

⚠️ Top Risks:
[CRITICAL] Shift Coverage Gap - Site A tonight 6pm-2am

💡 Recommended Actions:
[HIGH] Request backup for Site A night shift
[✓ Approve] [✗ Reject] buttons
```

---

### 4. **📋 Action History & Audit Log**

**Location:** Below briefing section

**What you'll see:**
- "Show History" / "Hide History" toggle button
- Filter tabs: `all`, `pending`, `approved`, `rejected`, `executed`, `failed`
- List of all actions with:
  - Status badges (PENDING, APPROVED, REJECTED, EXECUTED, FAILED)
  - Action type (📞 Request Backup, ⚠️ Escalate, etc.)
  - AI indicator (🤖 AI) if AI-recommended
  - Confidence scores
  - Timestamps (Created, Approved, Executed, Rejected)
  - Execution results (if executed)

---

### 5. **🏢 Site Health Dashboard**

**Location:** Below Action History

**What you'll see:**
- "Show Site Health" / "Hide Site Health" toggle button
- Grid of site health cards showing:
  - Site name
  - Health status badge (HEALTHY/WARNING/CAUTION/CRITICAL)
  - Health score (0-100) with progress bar
  - Metrics:
    - Incidents count (last 30 days)
    - Open shifts count
    - Recent events count
  - Risk level and score

**Example Site Card:**
```
Site ABC Building
[HEALTHY] badge
Health Score: 85/100
[Progress bar]
Incidents: 2
Open Shifts: 1
Events: 15
Risk Level: LOW (12)
```

---

### 6. **At-Risk Shifts Panel**

**Location:** Below Site Health

**What you'll see:**
- List of shifts ranked by risk score
- Each shift shows:
  - Shift date and time
  - Risk score (0-100)
  - Risk level (LOW/MEDIUM/HIGH/CRITICAL)
  - Risk factors (why it's at risk)
  - Guard assignment status

**Example:**
```
⚠️ 2024-01-15 18:00-02:00 - Risk: 78
   Factors: Unassigned shift, Guard callout rate: 40%
```

---

### 7. **Live Situation Room Feed**

**Location:** Bottom of page

**What you'll see:**
- Real-time stream of operational events
- Auto-refreshes every 30 seconds
- Events show:
  - Event type (INCIDENT, CALLOUT, INSPECTION, etc.)
  - Severity badge (LOW/MEDIUM/HIGH/CRITICAL)
  - Title and summary
  - Timestamp
  - AI tags (if AI tagging enabled)

**Example Events:**
```
[INCIDENT] [HIGH] Security Breach at Site A
   Unauthorized entry detected at Site A main entrance
   2 hours ago

[CALLOUT] [MEDIUM] Guard Callout - Night Shift
   Guard John Doe called out for tonight's shift due to illness
   1 hour ago
```

---

## 🎨 Visual Indicators

### Color Coding:
- **🟢 Green** = Healthy, Low Risk, Executed
- **🟡 Yellow** = Warning, Medium Risk, Pending
- **🟠 Orange** = Caution, High Risk
- **🔴 Red** = Critical, Very High Risk, Failed
- **🔵 Blue** = Information, Active

### Status Badges:
- **HEALTHY** = Green badge
- **WARNING** = Yellow badge
- **CAUTION** = Orange badge
- **CRITICAL** = Red badge
- **PENDING** = Yellow badge
- **APPROVED** = Green badge
- **REJECTED** = Red badge
- **EXECUTED** = Green badge

---

## 🔄 Real-Time Updates

- **Feed:** Auto-refreshes every 30 seconds
- **At-Risk Shifts:** Auto-refreshes every 60 seconds
- **Site Health:** Auto-refreshes every 60 seconds (when visible)
- **Action History:** Auto-refreshes every 30 seconds (when visible)
- **Socket.IO:** Real-time updates when events occur

---

## 📱 Interactive Features

### Action Approval:
1. Click "📊 Generate Briefing"
2. See recommended actions in briefing
3. Click "✓ Approve" to execute action
4. Click "✗ Reject" to decline action
5. View results in Action History

### Natural Language Queries:
1. Type question in "Ask Command Center" box
2. Press Enter or click "Ask"
3. See AI-generated answer with citations
4. Click "Clear" to reset

### Site Health:
1. Click "Show Site Health"
2. See all sites with health scores
3. Sites sorted by health (worst first)
4. Click on site card for details (if implemented)

---

## ⚠️ If You Don't See Data

### Empty Feed:
- **Normal** if no operational events have occurred yet
- Events are created automatically when:
  - Incidents are reported
  - Callouts occur
  - Shifts are created/updated
  - Guards clock in/out

### No At-Risk Shifts:
- **Normal** if no open shifts exist or all shifts have low risk
- Risk scores are calculated based on:
  - Guard callout history
  - Lateness frequency
  - Time until shift start
  - Site incident rate

### No Site Health:
- **Normal** if no sites have activity
- Sites appear when they have:
  - Incidents
  - OpEvents
  - Related shifts

### No Action History:
- **Normal** if no actions have been created yet
- Actions are created when:
  - AI briefing generates recommendations
  - Actions are manually created
  - Actions are approved/rejected

---

## 🧪 Test the Features

### 1. Generate a Briefing:
- Click "📊 Generate Briefing"
- Wait for AI analysis (may take 5-10 seconds)
- Review summary, insights, risks, and actions

### 2. Ask a Question:
- Type: "What incidents occurred?"
- Click "Ask"
- See answer with sources

### 3. Approve an Action:
- Generate briefing
- Find a recommended action
- Click "✓ Approve"
- Check Action History to see it executed

### 4. View Site Health:
- Click "Show Site Health"
- See all sites with health metrics
- Review health scores and status

---

## 🎯 Key Indicators

**Everything is working if you see:**
- ✅ Three AI tiles at the top
- ✅ "Ask Command Center" input box
- ✅ "Generate Briefing" button
- ✅ "Show History" button
- ✅ "Show Site Health" button
- ✅ At-Risk Shifts panel
- ✅ Live Situation Room feed

**Data will populate as:**
- Events occur in your system
- Shifts are created/updated
- Incidents are reported
- Callouts happen
- Guards clock in/out

---

## 💡 Pro Tips

1. **Generate Briefing First** - This creates actions you can approve
2. **Check Action History** - See all past AI recommendations
3. **Use Natural Language Queries** - Ask questions in plain English
4. **Monitor Site Health** - Identify problem sites quickly
5. **Watch the Feed** - See real-time operational events

---

## 🚀 Next Steps

Once you see the Command Center:
1. Generate a briefing to see AI analysis
2. Ask questions about your operations
3. Approve/reject recommended actions
4. Monitor site health
5. Track at-risk shifts

The Command Center is your **AI-powered operations intelligence hub**!
