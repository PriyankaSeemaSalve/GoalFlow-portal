const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const supabase = require('../supabase');
const { requireAuth } = require('../middleware/auth');
const { auditLog }    = require('../utils/audit');
const { notifyLoginAlert } = require('../utils/email');

const router = express.Router();

// ── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Fetch user by email
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Compare password
  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Issue JWT — this invalidates any previous session (single-session enforcement)
  const token = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  // Persist the new token — old sessions will now get 401 on next request
  await supabase.from('users').update({ session_token: token }).eq('id', user.id);

  // Audit + security email
  await auditLog(user.id, 'LOGIN', 'user', user.id, { email: user.email });
  notifyLoginAlert({ email: user.email, name: user.name }); // fire-and-forget

  res.json({
    token,
    user: {
      id:         user.id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      dept:       user.dept,
      avatar:     user.avatar,
      color:      user.color,
      manager_id: user.manager_id,
    },
  });
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  await supabase.from('users').update({ session_token: null }).eq('id', req.user.id);
  await auditLog(req.user.id, 'LOGOUT', 'user', req.user.id, {});
  res.json({ ok: true });
});

// ── GET /api/auth/me ─────────────────────────────────────────────────────────
// Validates a stored token and returns fresh user data (used on page refresh)
router.get('/me', requireAuth, (req, res) => {
  const { session_token: _st, ...safeUser } = req.user;
  res.json(safeUser);
});

module.exports = router;