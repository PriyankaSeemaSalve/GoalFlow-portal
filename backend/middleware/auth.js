const jwt      = require('jsonwebtoken');
const supabase = require('../supabase');

/**
 * Verifies Bearer token and enforces single-session rule.
 * Attaches req.user on success.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = header.split(' ')[1];

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }

  // Fetch user and check that this token is still the active session
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, role, dept, avatar, color, manager_id, session_token')
    .eq('id', payload.userId)
    .single();

  if (error || !user) {
    return res.status(401).json({ error: 'User not found' });
  }

  if (user.session_token !== token) {
    // Token was replaced by a newer login elsewhere
    return res.status(401).json({ error: 'Session superseded — you were logged in elsewhere' });
  }

  req.user = user;
  next();
}

/**
 * Role guard — use after requireAuth.
 * Usage: requireRole('admin') or requireRole(['manager','admin'])
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!allowed.includes(req.user?.role)) {
      return res.status(403).json({ error: `Access denied — requires role: ${allowed.join(' or ')}` });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };