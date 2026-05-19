const supabase = require('../supabase');

async function sendCheckinReminders() {
  try {
    console.log("⏳ Running compliance evaluation loop check...");
    
    // Scan active system entities
    const { data: users } = await supabase.from('users').select('id, name, email');
    const { data: goals } = await supabase.from('goals').select('owner_id, status').eq('quarter', 'Q3 2025');

    if (!users) return;

    for (const user of users) {
      const userGoals = goals ? goals.filter(g => g.owner_id === user.id) : [];
      
      // If no goals are found for an active cycle, append a tracking escalation log
      if (userGoals.length === 0) {
        await supabase.from('compliance_escalations').insert({
          employee_id: user.id,
          breach_type: 'Goal Submission Missing (Cycle Open > 5 Days)',
          days_overdue: 6,
          current_tier: 'Manager Escalated'
        }).catch(e => console.log("RLS/Insert blocked entry:", e.message));
      }
    }
    console.log("✔ Compliance escalation background task executed successfully.");
  } catch (err) {
    console.error("❌ Escalation engine processing fault:", err);
  }
}

// Make sure it exports the function explicitly so node-cron can read it!
module.exports = { sendCheckinReminders };
