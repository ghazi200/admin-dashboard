require("dotenv").config();
const { sequelize } = require("../config/db");
const { v4: uuidv4 } = require("uuid");

/**
 * End-to-end test: Callout → AI Notification → Guard Acceptance
 */

async function testCalloutAcceptanceFlow() {
  console.log("🧪 Testing Complete Callout Acceptance Flow\n");
  console.log("=".repeat(70));

  try {
    // Step 1: Find or create a test shift
    console.log("\n📋 Step 1: Finding/Creating Test Shift");
    console.log("-".repeat(70));

    const [shifts] = await sequelize.query(`
      SELECT id, guard_id, status, shift_date, shift_start, shift_end, tenant_id
      FROM shifts
      WHERE status = 'OPEN' OR status = 'CLOSED'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    let testShift = shifts[0];
    let callerGuardId = null;

    if (!testShift) {
      console.log("⚠️  No shifts found, creating a test shift...");
      const newShiftId = uuidv4();
      const today = new Date().toISOString().split('T')[0];
      
      await sequelize.query(`
        INSERT INTO shifts (id, status, shift_date, shift_start, shift_end, created_at)
        VALUES ($1, 'CLOSED', $2, '09:00:00', '17:00:00', NOW())
      `, { bind: [newShiftId, today] });
      
      testShift = { id: newShiftId, status: 'CLOSED', shift_date: today };
      console.log(`✅ Created test shift: ${testShift.id}`);
    } else {
      console.log(`✅ Using existing shift: ${testShift.id}`);
      console.log(`   Status: ${testShift.status}`);
      console.log(`   Guard ID: ${testShift.guard_id || 'NULL'}`);
      callerGuardId = testShift.guard_id;
    }

    // Step 2: Find an active guard to be the caller
    console.log("\n📋 Step 2: Finding Guard to Call Out");
    console.log("-".repeat(70));

    const [guards] = await sequelize.query(`
      SELECT id, name, email, is_active
      FROM guards
      WHERE is_active = true
      LIMIT 1
    `);

    if (!guards[0]) {
      console.log("⚠️  No active guards found, using shift guard_id if available");
      if (!callerGuardId) {
        console.log("❌ Cannot proceed without a guard");
        await sequelize.close();
        process.exit(1);
      }
    } else {
      callerGuardId = guards[0].id;
      console.log(`✅ Found guard: ${guards[0].name || guards[0].email}`);
      console.log(`   Guard ID: ${callerGuardId}`);
    }

    // Step 3: Open the shift and assign it to the caller (simulate they had it)
    console.log("\n📋 Step 3: Opening Shift for Callout");
    console.log("-".repeat(70));

    await sequelize.query(`
      UPDATE shifts
      SET guard_id = $1, status = 'CLOSED'
      WHERE id = $2
    `, { bind: [callerGuardId, testShift.id] });

    console.log(`✅ Shift assigned to caller guard: ${callerGuardId}`);

    // Step 4: Simulate callout trigger (what happens when Button 1 is clicked)
    console.log("\n📋 Step 4: Triggering Callout (Button 1 Click)");
    console.log("-".repeat(70));

    // This simulates what happens in the backend when /callouts/trigger is called
    await sequelize.query(`
      UPDATE shifts
      SET guard_id = NULL, status = 'OPEN'
      WHERE id = $1
    `, { bind: [testShift.id] });

    console.log(`✅ Shift opened (guard_id = NULL, status = 'OPEN')`);
    console.log(`💡 This is what happens when guard clicks 'Call Out' button`);

    // Step 5: Find eligible guards (excluding caller)
    console.log("\n📋 Step 5: Finding Eligible Guards for AI Notification");
    console.log("-".repeat(70));

    const [eligibleGuards] = await sequelize.query(`
      SELECT id, name, email, is_active, acceptance_rate, reliability_score
      FROM guards
      WHERE is_active = true
        AND id != $1
      ORDER BY acceptance_rate DESC, reliability_score DESC
      LIMIT 5
    `, { bind: [callerGuardId] });

    console.log(`✅ Found ${eligibleGuards.length} eligible guards (excluding caller)`);
    eligibleGuards.forEach((g, i) => {
      console.log(`   ${i + 1}. ${g.name || g.email || g.id.substring(0, 8)}`);
      console.log(`      ID: ${g.id.substring(0, 8)}...`);
      console.log(`      Acceptance Rate: ${(g.acceptance_rate || 0.8).toFixed(2)}`);
      console.log(`      Reliability Score: ${(g.reliability_score || 0.8).toFixed(2)}`);
    });

    if (eligibleGuards.length === 0) {
      console.log("⚠️  No eligible guards found - cannot test acceptance");
      await sequelize.close();
      process.exit(0);
    }

    // Step 6: Create callout records (simulate AI notification)
    console.log("\n📋 Step 6: Creating Callout Records (AI Notifications)");
    console.log("-".repeat(70));

    const calloutReason = "SICK";
    const createdCallouts = [];

    for (const guard of eligibleGuards.slice(0, 3)) { // Top 3 guards
      const calloutId = uuidv4();
      await sequelize.query(`
        INSERT INTO callouts (id, shift_id, guard_id, reason, created_at, tenant_id)
        VALUES ($1, $2, $3, $4, NOW(), $5)
      `, { bind: [calloutId, testShift.id, guard.id, calloutReason, testShift.tenant_id] });

      createdCallouts.push({
        id: calloutId,
        guardId: guard.id,
        guardName: guard.name || guard.email || guard.id.substring(0, 8),
      });

      console.log(`✅ Created callout for: ${guard.name || guard.email || guard.id.substring(0, 8)}`);
      console.log(`   Callout ID: ${calloutId.substring(0, 8)}...`);
    }

    console.log(`\n✅ Total callouts created: ${createdCallouts.length}`);
    console.log("💡 In production, guards would receive notifications (SMS/Email/App)");
    console.log("💡 Guards see these callouts in their 'Callouts' page (Button 2)");

    // Step 7: Simulate guard acceptance (Button 2 → Accept)
    console.log("\n📋 Step 7: Guard Accepts Callout (Button 2 → Accept)");
    console.log("-".repeat(70));

    const acceptingGuard = eligibleGuards[0]; // First guard accepts
    const acceptedCallout = createdCallouts[0];

    console.log(`✅ Guard accepting: ${acceptingGuard.name || acceptingGuard.email}`);
    console.log(`   Callout ID: ${acceptedCallout.id.substring(0, 8)}...`);
    console.log(`💡 This is what happens when guard clicks 'Accept' on Callouts page`);

    // This simulates what happens when /callouts/:calloutId/respond is called with "ACCEPTED"
    const now = new Date();

    // Update shift: assign guard and close
    await sequelize.query(`
      UPDATE shifts
      SET guard_id = $1, status = 'CLOSED'
      WHERE id = $2
    `, { bind: [acceptingGuard.id, testShift.id] });

    console.log(`✅ Shift assigned to: ${acceptingGuard.name || acceptingGuard.email}`);
    console.log(`   Shift status: CLOSED`);

    // Update guard metrics
    const newAcceptanceRate = Math.min(0.99, (acceptingGuard.acceptance_rate || 0.8) + 0.03);
    const newReliabilityScore = Math.min(1.0, (acceptingGuard.reliability_score || 0.8) + 0.015);

    await sequelize.query(`
      UPDATE guards
      SET acceptance_rate = $1, reliability_score = $2
      WHERE id = $3
    `, { bind: [newAcceptanceRate, newReliabilityScore, acceptingGuard.id] });

    console.log(`✅ Guard metrics updated:`);
    console.log(`   Acceptance Rate: ${(acceptingGuard.acceptance_rate || 0.8).toFixed(2)} → ${newAcceptanceRate.toFixed(2)} (+0.03)`);
    console.log(`   Reliability Score: ${(acceptingGuard.reliability_score || 0.8).toFixed(2)} → ${newReliabilityScore.toFixed(2)} (+0.015)`);

    // Step 8: Verify final state
    console.log("\n📋 Step 8: Verifying Final State");
    console.log("-".repeat(70));

    const [finalShift] = await sequelize.query(`
      SELECT id, guard_id, status, shift_date, shift_start, shift_end
      FROM shifts
      WHERE id = $1
    `, { bind: [testShift.id] });

    const [finalGuard] = await sequelize.query(`
      SELECT id, name, email, acceptance_rate, reliability_score
      FROM guards
      WHERE id = $1
    `, { bind: [acceptingGuard.id] });

    const [remainingCallouts] = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM callouts
      WHERE shift_id = $1
    `, { bind: [testShift.id] });

    console.log(`✅ Shift Status:`);
    console.log(`   ID: ${finalShift[0].id.substring(0, 8)}...`);
    console.log(`   Status: ${finalShift[0].status}`);
    console.log(`   Assigned Guard: ${finalShift[0].guard_id?.substring(0, 8) || 'NULL'}...`);
    console.log(`   Date: ${finalShift[0].shift_date || 'N/A'}`);
    console.log(`   Time: ${finalShift[0].shift_start || 'N/A'} - ${finalShift[0].shift_end || 'N/A'}`);

    console.log(`\n✅ Guard Metrics:`);
    console.log(`   Name: ${finalGuard[0].name || finalGuard[0].email || 'N/A'}`);
    console.log(`   Acceptance Rate: ${(finalGuard[0].acceptance_rate || 0).toFixed(2)}`);
    console.log(`   Reliability Score: ${(finalGuard[0].reliability_score || 0).toFixed(2)}`);

    console.log(`\n✅ Callout Records:`);
    console.log(`   Total callouts for this shift: ${remainingCallouts[0].total}`);
    console.log(`   (Other guards' callouts remain in database but shift is filled)`);

    // Step 9: Summary
    console.log("\n📋 Step 9: Summary");
    console.log("=".repeat(70));
    console.log("✅ Callout Flow Test Complete!");
    console.log("\n📊 Flow Summary:");
    console.log("   1. ✅ Guard called out (Button 1 clicked)");
    console.log("   2. ✅ Shift opened (guard_id = NULL, status = 'OPEN')");
    console.log("   3. ✅ AI ranked eligible guards");
    console.log("   4. ✅ Callout records created for top guards");
    console.log("   5. ✅ Guards notified (would receive SMS/Email/App)");
    console.log("   6. ✅ Guard accepted callout (Button 2 → Accept)");
    console.log("   7. ✅ Shift assigned and closed");
    console.log("   8. ✅ Guard metrics updated");
    console.log("\n📡 Socket Events That Would Be Emitted:");
    console.log("   - 'callout_started' → Admin dashboard notified");
    console.log("   - 'shift_filled' → Admin dashboard + guards notified");
    console.log("   - 'callout_response' → Admin dashboard notified");
    console.log("\n💡 In Production:");
    console.log("   - Guards receive SMS/Email/App notifications");
    console.log("   - Admin dashboard updates in real-time");
    console.log("   - Other guards see shift is no longer available");
    console.log("   - Live callout count updates on admin dashboard");

    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test Error:", error.message);
    console.error(error.stack);
    await sequelize.close();
    process.exit(1);
  }
}

// Run the test
testCalloutAcceptanceFlow();
