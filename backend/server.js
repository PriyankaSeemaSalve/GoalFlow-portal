require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const cron       = require('node-cron');

const authRoutes      = require('./routes/auth');
const goalRoutes      = require('./routes/goals');
const checkinRoutes   = require('./routes/checkins');
const commentRoutes   = require('./routes/comments');
const userRoutes      = require('./routes/users');
const objectiveRoutes = require('./routes/objectives');
const auditRoutes     = require('./routes/audit');
const { sendCheckinReminders } = require('./utils/scheduler');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json());

// ── Request logger (dev) ────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/goals',      goalRoutes);
app.use('/api/checkins',   checkinRoutes);
app.use('/api/comments',   commentRoutes);
app.use('/api/users',      userRoutes);
app.use('/api/objectives', objectiveRoutes);
app.use('/api/audit',      auditRoutes);

// ── Health check ────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Global error handler ────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Cron jobs ───────────────────────────────────────────────────────────────────
// Runs at 9 AM on the 1st of July, October, January, April (check-in window openers)
cron.schedule('0 9 1 7,10,1,4 *', sendCheckinReminders);

// ── Start ────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🎯 GoalFlow API running on http://localhost:${PORT}\n`);
});