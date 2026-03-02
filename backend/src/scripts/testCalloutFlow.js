/**
 * Test Callout Flow Script
 * 
 * This script simulates the complete callout flow:
 * 1. Find or create an open shift
 * 2. Create a callout for that shift
 * 3. Add AI ranking data (simulating AI decision)
 * 4. Simulate guard contact and acceptance
 * 5. Close shift with AI reasons
 */

require('dotenv').config();
const { sequelize } = require('../models');
const { v4: uuidv4 } = require('uuid');

async function testCalloutFlow() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Step 1: Find or create an open shift
    console.log('📋 Step 1: Finding an open shift...');
    const [openShifts] = await sequelize.query(`
      SELECT id, status, guard_id, shift_date, shift_start, shift_end, location, tenant_id
      FROM shifts 
      WHERE status = 'OPEN' 
      ORDER BY created_at DESC 
      LIMIT 1
    `);

    let shift;
    if (openShifts.length > 0) {
      shift = openShifts[0];
      console.log(`✅ Found open shift: ${shift.id}`);
      console.log(`   Location: ${shift.location || 'N/A'}`);
      console.log(`   Date: ${shift.shift_date}`);
      console.log(`   Time: ${shift.shift_start} - ${shift.shift_end}\n`);
    } else {
      // Create a test shift
      console.log('⚠️  No open shifts found. Creating a test shift...');
      const shiftId = uuidv4();
      const tenantId = uuidv4();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await sequelize.query(`
        INSERT INTO shifts (id, tenant_id, shift_date, shift_start, shift_end, status, location, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, {
        bind: [
          shiftId,
          tenantId,
          today.toISOString(),
          '09:00:00',
          '17:00:00',
          'OPEN',
          'Test Location - Main Office'
        ]
      });

      shift = {
        id: shiftId,
        tenant_id: tenantId,
        shift_date: today.toISOString(),
        shift_start: '09:00:00',
        shift_end: '17:00:00',
        status: 'OPEN',
        location: 'Test Location - Main Office'
      };
      console.log(`✅ Created test shift: ${shift.id}\n`);
    }

    // Step 2: Get available guards
    console.log('👥 Step 2: Getting available guards...');
    const [guards] = await sequelize.query(`
      SELECT id, name, email
      FROM guards 
      LIMIT 5
    `);

    if (guards.length === 0) {
      console.error('❌ No available guards found. Please create guards first.');
      return;
    }

    console.log(`✅ Found ${guards.length} available guards:`);
    guards.forEach((g, i) => {
      console.log(`   ${i + 1}. ${g.name || g.email} (${g.id.substring(0, 8)}...)`);
    });
    console.log('');

    // Step 3: Create a callout
    console.log('📞 Step 3: Creating callout...');
    const calloutId = uuidv4();
    const selectedGuard = guards[0]; // Use first guard for callout

    await sequelize.query(`
      INSERT INTO callouts (id, tenant_id, shift_id, guard_id, reason, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
    `, {
      bind: [
        calloutId,
        shift.tenant_id,
        shift.id,
        selectedGuard.id,
        'SICK' // Use valid reason value
      ]
    });

    console.log(`✅ Created callout: ${calloutId}`);
    console.log(`   Reason: SICK`);
    console.log(`   Guard: ${selectedGuard.name || selectedGuard.email}\n`);

    // Step 4: Add AI ranking data to the shift
    console.log('🤖 Step 4: Adding AI ranking and decision data...');
    
    // Rank guards (top 3)
    const rankedGuards = guards.slice(0, 3).map((g, index) => ({
      guard_id: g.id,
      guard_name: g.name || g.email,
      ranking: index + 1,
      confidence: 0.95 - (index * 0.1), // Decreasing confidence
      contact_reason: index === 0 
        ? "Best match: High availability score, previous experience at this location"
        : index === 1
        ? "Good match: Available and qualified for this shift type"
        : "Alternative option: Available but less experience at this location",
      assignment_reason: index === 0
        ? "Top ranked due to high confidence and perfect fit. Guard has worked at this location 5 times with excellent ratings."
        : index === 1
        ? "Second best option, good for training at new site. Guard has relevant certifications."
        : "Consider if top options are unavailable. Guard needs location orientation."
    }));

    const topGuard = rankedGuards[0];
    const aiDecision = {
      ranking: 1,
      confidence: topGuard.confidence,
      contact_reason: topGuard.contact_reason,
      assignment_reason: topGuard.assignment_reason,
      suggested_guard_id: topGuard.guard_id,
      ranked_guards: rankedGuards,
      contacted_guards: rankedGuards.map(g => ({
        guard_id: g.guard_id,
        guard_name: g.guard_name,
        contacted_at: new Date().toISOString(),
        response: null // Will be updated when guard accepts
      })),
      callout_id: calloutId,
      callout_reason: 'SICK',
      decision_made_at: new Date().toISOString()
    };

    await sequelize.query(`
      UPDATE shifts 
      SET ai_decision = $1 
      WHERE id = $2
    `, {
      bind: [JSON.stringify(aiDecision), shift.id]
    });

    console.log(`✅ Added AI decision data:`);
    console.log(`   Top ranked guard: ${topGuard.guard_name}`);
    console.log(`   Confidence: ${(topGuard.confidence * 100).toFixed(0)}%`);
    console.log(`   Contact reason: ${topGuard.contact_reason}`);
    console.log(`   Assignment reason: ${topGuard.assignment_reason}`);
    console.log(`   Ranked ${rankedGuards.length} guards total\n`);

    // Step 5: Simulate guard acceptance (update AI decision and close shift)
    console.log('✅ Step 5: Simulating guard acceptance...');
    
    const acceptedGuard = topGuard;
    const updatedAiDecision = {
      ...aiDecision,
      assigned_guard_id: acceptedGuard.guard_id,
      assigned_guard_name: acceptedGuard.guard_name,
      accepted_at: new Date().toISOString(),
      contacted_guards: aiDecision.contacted_guards.map(cg => 
        cg.guard_id === acceptedGuard.guard_id
          ? { ...cg, response: 'ACCEPTED', responded_at: new Date().toISOString() }
          : { ...cg, response: 'PENDING' }
      ),
      final_assignment_reason: `${acceptedGuard.assignment_reason} Guard accepted the assignment.`,
      shift_closed_at: new Date().toISOString()
    };

    // Update shift: assign guard and close it
    await sequelize.query(`
      UPDATE shifts 
      SET guard_id = $1, 
          status = $2, 
          ai_decision = $3
      WHERE id = $4
    `, {
      bind: [
        acceptedGuard.guard_id,
        'CLOSED',
        JSON.stringify(updatedAiDecision),
        shift.id
      ]
    });

    console.log(`✅ Guard accepted and shift closed:`);
    console.log(`   Assigned guard: ${acceptedGuard.guard_name}`);
    console.log(`   Shift status: CLOSED`);
    console.log(`   Final reason: ${updatedAiDecision.final_assignment_reason}\n`);

    // Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TEST FLOW COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📋 Shift ID: ${shift.id}`);
    console.log(`📞 Callout ID: ${calloutId}`);
    console.log(`👤 Assigned Guard: ${acceptedGuard.guard_name} (${acceptedGuard.guard_id.substring(0, 8)}...)`);
    console.log(`🤖 AI Confidence: ${(acceptedGuard.confidence * 100).toFixed(0)}%`);
    console.log(`📊 Guards Ranked: ${rankedGuards.length}`);
    console.log(`✅ Shift Status: CLOSED`);
    console.log('\n💡 You can now view this in:');
    console.log('   - Dashboard: Live callouts should show the new callout');
    console.log('   - AI Ranking page: Should show the shift with AI decision data');
    console.log('   - Shifts page: Should show the shift as CLOSED with assigned guard');

  } catch (error) {
    console.error('❌ Error running test flow:', error);
  } finally {
    await sequelize.close();
  }
}

testCalloutFlow();
