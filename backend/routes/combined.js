const express  = require('express');
const bcrypt   = require('bcrypt');
const supabase = require('../supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const { auditLog } = require('../utils/audit');

// ── Comments ─────────────────────────────────────────────────────────────────
const comments = express.Router();
comments.use(requireAuth);

comments.post('/', async (req, res) => {
  const { goal_id, text } = req.body;
  if (!goal_id || !text?.trim()) return res.status(400).json({ error: 'goal_id and text required' });
  const { data, error } = await supabase.from('comments')
    .insert({ goal_id, user_id: req.user.id, text })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

comments.get('/', async (req, res) => {
  const { goal_id } = req.query;
  let query = supabase.from('comments').select('*').order('created_at', { ascending: true });
  if (goal_id) query = query.eq('goal_id', goal_id);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Users ─────────────────────────────────────────────────────────────────────
const users = express.Router();
users.use(requireAuth);

// List all users (managers/admin only)
users.get('/', requireRole(['manager', 'admin']), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, dept, avatar, color, manager_id, created_at')
    .order('name');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Create user (admin only)
users.post('/', requireRole('admin'), async (req, res) => {
  const { name, email, password, role, dept, manager_id, avatar, color } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, role required' });
  }
  const password_hash = await bcrypt.hash(password, 12);
  const { data, error } = await supabase
    .from('users')
    .insert({ name, email: email.toLowerCase().trim(), password_hash, role, dept, manager_id, avatar: avatar || name.slice(0,2).toUpperCase(), color: color || '#4f7bff' })
    .select('id, name, email, role, dept, avatar, color, manager_id')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  await auditLog(req.user.id, 'CREATE', 'user', data.id, { name, email, role });
  res.status(201).json(data);
});

// Update user (admin only)
users.patch('/:id', requireRole('admin'), async (req, res) => {
  const updates = { ...req.body };
  delete updates.password_hash; // never allow direct hash updates via API
  if (updates.password) {
    updates.password_hash = await bcrypt.hash(updates.password, 12);
    delete updates.password;
  }
  const { data, error } = await supabase.from('users').update(updates).eq('id', req.params.id)
    .select('id, name, email, role, dept, avatar, color, manager_id').single();
  if (error) return res.status(500).json({ error: error.message });
  await auditLog(req.user.id, 'UPDATE', 'user', req.params.id, updates);
  res.json(data);
});

// Delete user (admin only)
users.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('users').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  await auditLog(req.user.id, 'DELETE', 'user', req.params.id, {});
  res.json({ ok: true });
});

// Force-logout a user (admin — invalidates their session)
users.post('/:id/revoke-session', requireRole('admin'), async (req, res) => {
  await supabase.from('users').update({ session_token: null }).eq('id', req.params.id);
  await auditLog(req.user.id, 'REVOKE_SESSION', 'user', req.params.id, {});
  res.json({ ok: true });
});

// ── Org Objectives ────────────────────────────────────────────────────────────
const objectives = express.Router();
objectives.use(requireAuth);

objectives.get('/', async (_req, res) => {
  const { data, error } = await supabase.from('org_objectives').select('*').order('year', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

objectives.post('/', requireRole(['manager', 'admin']), async (req, res) => {
  const { title, category, year } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: 'title required' });
  const { data, error } = await supabase.from('org_objectives').insert({ title, category, year }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

objectives.delete('/:id', requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('org_objectives').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// ── Audit log ─────────────────────────────────────────────────────────────────
const audit = express.Router();
audit.use(requireAuth, requireRole('admin'));

audit.get('/', async (_req, res) => {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*, users!user_id(name, email)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});
// ── GET /api/audit/governance/achievements ──
audit.get('/governance/achievements', async (req, res) => {
  try {
    // Only selects columns that actually exist in your Supabase schema!
    const { data, error } = await supabase
      .from('goals')
      .select('title, progress, status, quarter');
      
    if (error) {
      console.error("Supabase Achievements Read Fault:", error.message);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (err) {
    console.error("Achievements Engine General Fault:", err.message);
    res.status(500).json({ error: err.message });
  }
});



// ── GET /api/audit/governance/completion-grid ──
audit.get('/governance/completion-grid', async (req, res) => {
  try {
    // 1. Fetch all system users
    const { data: employees, error: uErr } = await supabase.from('users').select('id, name, role, dept');
    // 2. Fetch all system goals to check for active cycle entries
    const { data: goals, error: gErr } = await supabase.from('goals').select('owner_id, status, quarter, updated_at');
    
    if (uErr || gErr) {
      console.error("Governance read error:", uErr?.message || gErr?.message);
      throw (uErr || gErr);
    }

    // Map out the compliance matrix based on whether they have added/completed goals
    const complianceMatrix = (employees || []).map(emp => {
      const userGoals = goals ? goals.filter(g => g.owner_id === emp.id) : [];
      
      // Look for goals in the active Q3 timeframe that are running or finished
      const hasQ3Goals = userGoals.some(g => g.status === 'active' || g.status === 'completed');
      
      // Extract their most recent goal action timestamp
      const lastAction = userGoals.length > 0 
        ? userGoals.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0].updated_at 
        : null;
      
      return {
        id: emp.id,
        name: emp.name || 'Anonymous User',
        dept: emp.dept || 'Operations',
        role: emp.role || 'employee',
        hasCompletedQ3: hasQ3Goals, // Switches to true if they have setup or finished goals!
        lastCheckIn: lastAction
      };
    });
    
    res.json(complianceMatrix);
  } catch (err) {
    console.error("Grid processor error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/audit/governance/escalations ──
audit.get('/governance/escalations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('compliance_escalations')
      .select('breach_type, days_overdue, current_tier, created_at, users!employee_id(name, dept)');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = { comments, users, objectives, audit };
