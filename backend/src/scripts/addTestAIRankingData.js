// Script to add test AI decision data to shifts
require('dotenv').config();
const { sequelize } = require('../models');

async function addTestAIRankingData() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    // Get some shifts
    const [shifts] = await sequelize.query(`
      SELECT id, status, guard_id, shift_date, shift_start, shift_end 
      FROM shifts 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    console.log(`\n📊 Found ${shifts.length} shifts\n`);

    // Sample AI decision data
    const testAIDecisions = [
      {
        ranking: 1,
        confidence: 0.95,
        contact_reason: "Best match: High availability score, previous experience at this location",
        assignment_reason: "Guard has worked at this location 5 times with excellent ratings",
        suggested_guard_id: null,
        reasons: {
          availability: "High",
          experience: "Excellent",
          location_match: "Perfect",
          rating: 4.8
        }
      },
      {
        ranking: 2,
        confidence: 0.87,
        contact_reason: "Good match: Available and qualified for this shift type",
        assignment_reason: "Guard has relevant certifications and is available",
        suggested_guard_id: null,
        reasons: {
          availability: "High",
          certifications: ["First Aid", "CPR"],
          experience: "Good"
        }
      },
      {
        ranking: 3,
        confidence: 0.72,
        contact_reason: "Alternative option: Available but less experience at this location",
        assignment_reason: "Guard is available but needs location orientation",
        suggested_guard_id: null,
        reasons: {
          availability: "Medium",
          experience: "Moderate",
          location_match: "Needs orientation"
        }
      }
    ];

    let updated = 0;
    for (let i = 0; i < Math.min(shifts.length, 3); i++) {
      const shift = shifts[i];
      const aiDecision = testAIDecisions[i] || testAIDecisions[0];
      
      // Add created_at timestamp to AI decision
      const fullAIDecision = {
        ...aiDecision,
        created_at: new Date().toISOString(),
        decision_type: "guard_assignment"
      };

      await sequelize.query(
        `UPDATE shifts SET ai_decision = $1 WHERE id = $2`,
        { bind: [JSON.stringify(fullAIDecision), shift.id] }
      );

      console.log(`✅ Updated shift ${shift.id.substring(0, 8)}...`);
      console.log(`   Status: ${shift.status}`);
      console.log(`   Ranking: ${aiDecision.ranking}`);
      console.log(`   Contact Reason: ${aiDecision.contact_reason.substring(0, 50)}...`);
      console.log('');
      updated++;
    }

    console.log(`\n✅ Updated ${updated} shifts with AI decision data`);
    console.log('\n🧪 You can now test the AI Ranking page at /ai-ranking\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await sequelize.close();
  }
}

addTestAIRankingData();
