const supabase = require('../supabase');

/**
 * Write a record to the audit_log table.
 * @param {string} userId - UUID of the acting user
 * @param {string} action - 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'RETURN' | 'LOGIN' | 'LOGOUT'
 * @param {string} entity - table name e.g. 'goal', 'checkin', 'comment'
 * @param {string} entityId - UUID of the affected row
 * @param {object} changes - { before, after } or any descriptive object
 */
async function auditLog(userId, action, entity, entityId, changes = {}) {
  const { error } = await supabase.from('audit_log').insert({
    user_id:   userId,
    action,
    entity,
    entity_id: entityId,
    changes,
  });
  if (error) console.error('[Audit] Failed to write log:', error.message);
}

module.exports = { auditLog };