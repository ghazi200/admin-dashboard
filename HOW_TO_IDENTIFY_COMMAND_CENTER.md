# How to Identify the Command Center

## 🎯 Visual Indicators

When you're on the **Command Center** page, you should see:

---

### 1. **Page Header** (Top of Page)
- **Title**: "AI Operations Command Center" (large, bold, white text)
- **Subtitle**: "Real-time operational intelligence and actionable insights" (gray text)

### 2. **Three AI Tiles** (Top Section - Most Distinctive Feature)

Three large cards side-by-side:

#### **Tile 1: "Right Now"** (Blue/Purple Gradient)
- Header: "RIGHT NOW" (blue text, uppercase)
- Title: "What Needs Attention" (white, bold)
- Content: Shows critical risks and high-severity events
- **Example**: "⚠️ 2024-01-15 18:00 - Risk: 85"

#### **Tile 2: "Analysis"** (Purple/Pink Gradient)
- Header: "ANALYSIS" (purple text, uppercase)
- Title: "Why It's Happening" (white, bold)
- Content: Shows risk factors and analysis
- **Example**: "• calloutRate: 0.8", "• latenessRate: 0.3"

#### **Tile 3: "Actions"** (Green/Blue Gradient)
- Header: "ACTIONS" (green text, uppercase)
- Title: "What To Do" (white, bold)
- Content: Recommended actions
- **Button**: "📊 Generate Briefing" (blue button)

---

### 3. **At-Risk Shifts Panel** (Middle Section)

- **Title**: "At-Risk Shifts" (white, bold)
- **Count**: Shows "X shifts at risk" (gray text)
- **Content**: List of shifts with:
  - Risk badges (red for CRITICAL, orange for HIGH, yellow for MEDIUM)
  - Risk scores (0-100)
  - Shift dates/times
  - "View Details" buttons

---

### 4. **Live Situation Room Feed** (Bottom Section)

- **Title**: "Live Situation Room" (white, bold)
- **Count**: Shows "X recent events" (gray text)
- **Content**: Scrollable list of events with:
  - Color-coded left borders (red=CRITICAL, orange=HIGH, yellow=MEDIUM, gray=LOW)
  - Event type badges (INCIDENT, CALLOUT, INSPECTION, etc.)
  - Severity badges
  - Event titles and summaries
  - Timestamps

---

## 📍 How to Navigate There

### Option 1: Sidebar Menu
1. Look at the **left sidebar** navigation
2. Find: **"🎯 Command Center"** (with target emoji icon)
3. Click it

### Option 2: Direct URL
- Navigate to: `http://localhost:3000/command-center`
- (After logging in as admin)

---

## 🔍 Quick Check

**You're on the Command Center if you see:**

✅ Three colorful gradient tiles at the top  
✅ "Right Now", "Why It's Happening", "What To Do" titles  
✅ "At-Risk Shifts" panel  
✅ "Live Situation Room" feed  
✅ "Generate Briefing" button  
✅ Page title: "AI Operations Command Center"

---

## 🆚 Differences from Regular Dashboard

| Feature | Regular Dashboard | Command Center |
|---------|------------------|----------------|
| **Header** | "Dashboard" | "AI Operations Command Center" |
| **Top Section** | KPIs (Open Shifts, Callouts, etc.) | Three AI tiles with insights |
| **Risk Focus** | Shows raw counts | Shows risk scores and analysis |
| **Feed** | Separate cards | Unified "Situation Room" feed |
| **AI Features** | None | Briefing, risk scoring, recommendations |

---

## 🐛 Troubleshooting

### If you DON'T see the Command Center:

1. **Check URL**: Should be `/command-center`
2. **Check Sidebar**: Look for "🎯 Command Center" link
3. **Check Backend**: Make sure backend is running on port 5000
4. **Check Console**: Open browser DevTools (F12) and look for errors
5. **Check Auth**: Make sure you're logged in as admin

### Common Issues:

- **404 Error**: Route might not be registered → Check `App.js`
- **Empty Page**: Backend might not be running → Start backend server
- **No Data**: Database tables might not exist → Tables auto-create on first use
- **No Events**: No operational events yet → Events are created when incidents/callouts happen

---

## 📸 What It Looks Like

The Command Center page has a **distinctive layout**:

```
┌─────────────────────────────────────────────────┐
│  AI Operations Command Center                   │
│  Real-time operational intelligence...          │
├─────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ RIGHT    │  │ ANALYSIS │  │ ACTIONS  │     │
│  │ NOW      │  │          │  │          │     │
│  │ ⚠️ Risks │  │ Factors  │  │ Generate │     │
│  └──────────┘  └──────────┘  └──────────┘     │
├─────────────────────────────────────────────────┤
│  At-Risk Shifts                                 │
│  [Risk: 85] Shift on 2024-01-15 18:00          │
│  [Risk: 72] Shift on 2024-01-15 20:00          │
├─────────────────────────────────────────────────┤
│  Live Situation Room                            │
│  [INCIDENT] High severity - Event details...    │
│  [CALLOUT] Medium severity - Guard called out...│
└─────────────────────────────────────────────────┘
```

---

## ✨ Key Visual Cues

1. **Three gradient tiles** = Command Center (unique to this page)
2. **Risk scores** = Command Center (Dashboard shows counts, not scores)
3. **"Generate Briefing" button** = Command Center (AI feature)
4. **"Situation Room" feed** = Command Center (unified event stream)

If you see these, you're definitely on the Command Center! 🎯
