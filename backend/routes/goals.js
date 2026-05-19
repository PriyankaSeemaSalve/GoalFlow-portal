const express  = require('express');
const supabase = require('../supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');
const {
  notifyGoalSubmitted,
  notifyGoalApproved,
  notifyGoalRejected, // Linked to match your email utility export smoothly!
} = require('../utils/email');
const { dispatchTeamsAdaptiveCard } = require('../utils/email'); // Teams Integration Engine

const router = express.Router();
router.use(requireAuth);

// ── GET /api/goals ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  let query = supabase
    .from('goals')
    .select(`
      *,
      comments ( id, user_id, text, created_at )
    `)
    .order('created_at', { ascending: false });

  if (req.user.role === 'employee') {
    query = query.eq('owner_id', req.user.id);
  } else if (req.user.role === 'manager') {
    const { data: team } = await supabase
      .from('users').select('id').eq('manager_id', req.user.id);
    const teamIds = (team || []).map(u => u.id).concat(req.user.id);
    query = query.in('owner_id', teamIds);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── POST /api/goals ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { title, description, priority, category, due_date, org_objective_id, quarter, status } = req.body;

  if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

  const { data, error } = await supabase
    .from('goals')
    .insert({
      title, description, priority, category, due_date, org_objective_id, quarter,
      owner_id: req.user.id,
      status: status || 'draft',
      progress: 0,
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await auditLog(req.user.id, 'CREATE', 'goal', data.id, { title: data.title });

  if (data.status === 'review' && req.user.manager_id) {
    const { data: manager } = await supabase
      .from('users').select('email, name').eq('id', req.user.manager_id).single();
    if (manager) {
      notifyGoalSubmitted({
        managerEmail: manager.email,
        managerName:  manager.name,
        employeeName: req.user.name,
        goalTitle:    data.title,
      });
      // ── TRRIGGER AUTOMATED MICROSOFT TEAMS BOT ALERTS ──
      dispatchTeamsAdaptiveCard(
        "Performance Target Submitted for Review",
        `Employee ${req.user.name} has uploaded a fresh performance objective sheet layout: "${data.title}". Action is required to evaluate or approve alignment metrics.`,
        `team`
      );
    }
  }

  res.status(201).json(data);
});

// ── PATCH /api/goals/:id ─────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: before, error: fetchErr } = await supabase
    .from('goals').select('*').eq('id', id).single();
  if (fetchErr || !before) return res.status(404).json({ error: 'Goal not found' });

  // Authorization Block Check
  if (req.user.role === 'employee') {
    if (before.owner_id !== req.user.id) return res.status(403).json({ error: 'Not your goal' });
  }

  const updates = { ...req.body, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('goals').update(updates).eq('id', id).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // ── GOVERNANCE AUDIT TRAIL LOGGING ENGINE ──
  // If a goal is modified after it has already transitioned into an active state (Lock Date Simulation), append an explicitly structured track entry
  if (before.status === 'active' || before.status === 'completed') {
    await supabase.from('system_audit_trail').insert({
      performed_by_id: req.user.id,
      action_type: 'POST_LOCK_GOAL_ALTERATION',
      target_employee_id: data.owner_id,
      old_values: { title: before.title, progress: before.progress, status: before.status },
      new_values: { title: data.title, progress: data.progress, status: data.status }
    }).catch(e => console.log("Governance insertion silent tracker alert:", e.message));
  }

  // Fallback default logger stream line
  await auditLog(req.user.id, 'UPDATE', 'goal', id, { before, after: data });

  // ── Workflow Core Notifications Hook Channels ──
  if (req.body.status === 'active' && before.status === 'review') {
    const { data: owner } = await supabase.from('users').select('email, name').eq('id', data.owner_id).single();
    if (owner) {
      notifyGoalApproved({ employeeEmail: owner.email, employeeName: owner.name, goalTitle: data.title });
      dispatchTeamsAdaptiveCard(
        "Performance Objective Approved",
        `Your manager has officially signed off on your quarterly tracking targets sheet: "${data.title}". It is now marked active for monitoring.`,
        `goals`
      );
    }
  }

  if (req.body.status === 'draft' && before.status === 'review') {
    const { data: owner } = await supabase.from('users').select('email, name').eq('id', data.owner_id).single();
    if (owner) {
      notifyGoalRejected({ employeeEmail: owner.email, employeeName: owner.name, goalTitle: data.title });
      dispatchTeamsAdaptiveCard(
        "Goal Modification Requested",
        `Your manager has reviewed objective entry "${data.title}" and requested alignment adjustments or updates.`,
        `goals`
      );
    }
  }

  if (req.body.status === 'review' && before.status === 'draft') {
    const managerId = req.user.manager_id || before.manager_id;
    if (managerId) {
      const { data: manager } = await supabase.from('users').select('email, name').eq('id', managerId).single();
      if (manager) {
        notifyGoalSubmitted({ managerEmail: manager.email, managerName: manager.name, employeeName: req.user.name, goalTitle: data.title });
        dispatchTeamsAdaptiveCard(
          "Performance Target Submitted for Review",
          `Employee ${req.user.name} has submitted a performance objective for review: "${data.title}".`,
          `team`
        );
      }
    }
  }

  res.json(data);
});

// ── DELETE /api/goals/:id — admin only ───────────────────────────────────────
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('goals').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await auditLog(req.user.id, 'DELETE', 'goal', req.params.id, {});
  res.json({ ok: true });
});

module.exports = router;
