const express  = require('express');
const supabase = require('../supabase');
const { requireAuth } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');
const { notifyCheckinSubmitted } = require('../utils/email');

const router = express.Router();
router.use(requireAuth);

// ── POST /api/checkins ───────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { goal_id, progress, note, mood, date } = req.body;

  if (!goal_id || !note?.trim()) {
    return res.status(400).json({ error: 'goal_id and note are required' });
  }

  // Verify goal exists and belongs to the user (or user is manager/admin)
  const { data: goal } = await supabase.from('goals').select('*, users!owner_id(manager_id)').eq('id', goal_id).single();
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  if (req.user.role === 'employee' && goal.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Not your goal' });
  }

  const { data, error } = await supabase.from('checkins')
    .insert({ goal_id, user_id: req.user.id, progress: parseInt(progress) || 0, note, mood, date: date || new Date().toISOString().split('T')[0] })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  // Auto-update goal progress
  await supabase.from('goals').update({ progress: parseInt(progress) || 0, updated_at: new Date() }).eq('id', goal_id);

  // If 100%, move to review
  if (parseInt(progress) >= 100) {
    await supabase.from('goals').update({ status: 'review' }).eq('id', goal_id);
  }

  await auditLog(req.user.id, 'CHECKIN', 'checkin', data.id, { goal_id, progress, mood });

  // Notify manager
  if (req.user.manager_id) {
    const { data: manager } = await supabase.from('users').select('email, name').eq('id', req.user.manager_id).single();
    if (manager) {
      notifyCheckinSubmitted({
        managerEmail: manager.email,
        managerName:  manager.name,
        employeeName: req.user.name,
        goalTitle:    goal.title,
        progress:     parseInt(progress) || 0,
        mood:         mood || 'on-track',
      });
    }
  }

  res.status(201).json(data);
});

// ── GET /api/checkins?goal_id=xxx ────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { goal_id } = req.query;
  let query = supabase.from('checkins').select('*').order('date', { ascending: false });
  if (goal_id) query = query.eq('goal_id', goal_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;