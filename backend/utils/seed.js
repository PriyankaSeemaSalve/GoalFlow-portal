/**
 * Run once to populate the database with demo users and sample data.
 * Usage: node utils/seed.js
 */
require('dotenv').config();
const bcrypt    = require('bcrypt');
const supabase = require('../supabase');


const SALT_ROUNDS = 12;

async function seed() {
  console.log('🌱 Seeding GoalFlow database…\n');

  // ── Users ────────────────────────────────────────────────────────────────────
  const rawUsers = [
    { name: 'Aanya Sharma',  email: 'aanya@corp.com',  password: 'Employee@123', role: 'employee', dept: 'Engineering', avatar: 'AS', color: '#4f7bff' },
    { name: 'Rohan Mehta',   email: 'rohan@corp.com',  password: 'Employee@123', role: 'employee', dept: 'Product',      avatar: 'RM', color: '#22c55e' },
    { name: 'Dev Nair',      email: 'dev@corp.com',    password: 'Employee@123', role: 'employee', dept: 'Design',       avatar: 'DN', color: '#2dd4bf' },
    { name: 'Priya Kapoor',  email: 'priya@corp.com',  password: 'Manager@123',  role: 'manager',  dept: 'Engineering', avatar: 'PK', color: '#a78bfa' },
    { name: 'Sunita Rao',    email: 'sunita@corp.com', password: 'Admin@123',    role: 'admin',    dept: 'Leadership',  avatar: 'SR', color: '#f59e0b' },
  ];

  const insertedUsers = [];
  for (const u of rawUsers) {
    const password_hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    const { data, error } = await supabase
      .from('users')
      .insert({ name: u.name, email: u.email, password_hash, role: u.role, dept: u.dept, avatar: u.avatar, color: u.color })
      .select()
      .single();
    if (error) { console.error(`  ✗ User ${u.email}:`, error.message); continue; }
    insertedUsers.push({ ...data, _password: u.password });
    console.log(`  ✓ User: ${u.email}  (password: ${u.password})`);
  }

  // Wire manager_id for employees (Priya manages Aanya, Rohan, Dev)
  const priya  = insertedUsers.find(u => u.email === 'priya@corp.com');
  const sunita = insertedUsers.find(u => u.email === 'sunita@corp.com');
  const employees = insertedUsers.filter(u => u.role === 'employee');

  for (const emp of employees) {
    await supabase.from('users').update({ manager_id: priya.id }).eq('id', emp.id);
  }
  if (priya) {
    await supabase.from('users').update({ manager_id: sunita.id }).eq('id', priya.id);
  }

  // ── Org Objectives ────────────────────────────────────────────────────────────
  const objectives = [
    { title: 'Increase revenue by 30% YoY',             category: 'Business Growth',  year: 2025 },
    { title: 'Achieve 95% customer satisfaction',        category: 'Customer Success', year: 2025 },
    { title: 'Launch 3 new product features per quarter',category: 'Product',          year: 2025 },
    { title: 'Reduce infrastructure costs by 20%',       category: 'Efficiency',       year: 2025 },
  ];

  const { data: insertedObjs } = await supabase.from('org_objectives').insert(objectives).select();
  console.log(`\n  ✓ ${insertedObjs.length} org objectives seeded`);

  // ── Sample Goals ──────────────────────────────────────────────────────────────
  const aanya = insertedUsers.find(u => u.email === 'aanya@corp.com');
  const rohan = insertedUsers.find(u => u.email === 'rohan@corp.com');
  const dev   = insertedUsers.find(u => u.email === 'dev@corp.com');
  const oo4   = insertedObjs.find(o => o.category === 'Efficiency');
  const oo2   = insertedObjs.find(o => o.category === 'Customer Success');
  const oo3   = insertedObjs.find(o => o.category === 'Product');

  const sampleGoals = [
    { title: 'Migrate legacy API to microservices', description: 'Break down the monolithic API into independently deployable microservices.', owner_id: aanya?.id, status: 'active',    priority: 'high',   category: 'Technical',    progress: 65, due_date: '2025-09-30', org_objective_id: oo4?.id, quarter: 'Q3 2025' },
    { title: 'Improve test coverage to 85%',        description: 'Increase unit and integration test coverage across all services.',          owner_id: aanya?.id, status: 'active',    priority: 'medium', category: 'Quality',      progress: 48, due_date: '2025-08-31', org_objective_id: oo4?.id, quarter: 'Q3 2025' },
    { title: 'Complete React Native certification', description: 'Obtain React Native certification to lead mobile development initiatives.',  owner_id: aanya?.id, status: 'review',    priority: 'low',    category: 'Learning',     progress: 90, due_date: '2025-07-31', org_objective_id: null,    quarter: 'Q3 2025' },
    { title: 'Launch Q3 product roadmap comms',     description: 'Communicate the Q3 roadmap to all stakeholders.',                          owner_id: rohan?.id, status: 'completed', priority: 'high',   category: 'Communication',progress:100, due_date: '2025-07-15', org_objective_id: oo3?.id, quarter: 'Q3 2025' },
    { title: 'Reduce page load time by 40%',        description: 'Implement lazy loading, CDN optimization, and image compression.',          owner_id: rohan?.id, status: 'active',    priority: 'high',   category: 'Performance',  progress: 30, due_date: '2025-09-15', org_objective_id: oo2?.id, quarter: 'Q3 2025' },
    { title: 'Hire 5 senior engineers by EOQ',      description: 'Work with HR to source, interview, and onboard 5 senior engineers.',        owner_id: priya?.id, status: 'active',    priority: 'high',   category: 'Hiring',       progress: 60, due_date: '2025-09-30', org_objective_id: null,    quarter: 'Q3 2025' },
    { title: 'Design new onboarding UX flow',       description: 'Redesign the user onboarding experience to reduce drop-off by 25%.',        owner_id: dev?.id,   status: 'draft',     priority: 'medium', category: 'Design',       progress: 10, due_date: '2025-10-15', org_objective_id: oo2?.id, quarter: 'Q4 2025' },
  ];

  const { data: insertedGoals } = await supabase.from('goals').insert(sampleGoals).select();
  console.log(`  ✓ ${insertedGoals.length} sample goals seeded`);

  // ── Sample Check-ins ──────────────────────────────────────────────────────────
  const g1 = insertedGoals.find(g => g.title.startsWith('Migrate'));
  const g2 = insertedGoals.find(g => g.title.startsWith('Improve'));
  if (g1 && aanya) {
    await supabase.from('checkins').insert([
      { goal_id: g1.id, user_id: aanya.id, progress: 40, note: 'Completed auth service migration.',                 mood: 'on-track', date: '2025-07-01' },
      { goal_id: g1.id, user_id: aanya.id, progress: 65, note: 'Payment service done. Started notification service.',mood: 'on-track', date: '2025-07-15' },
    ]);
  }
  if (g2 && aanya) {
    await supabase.from('checkins').insert([
      { goal_id: g2.id, user_id: aanya.id, progress: 48, note: 'Added 200+ unit tests. Integration tests next.', mood: 'at-risk', date: '2025-07-05' },
    ]);
  }

  // ── Sample Comments ───────────────────────────────────────────────────────────
  if (g1 && priya) {
    await supabase.from('comments').insert({ goal_id: g1.id, user_id: priya.id, text: 'Good progress! Make sure to document the service contracts.' });
  }

  console.log('\n✅ Seed complete!\n');
  console.log('Login credentials:');
  console.log('  Employee  →  aanya@corp.com   /  Employee@123');
  console.log('  Employee  →  rohan@corp.com   /  Employee@123');
  console.log('  Employee  →  dev@corp.com     /  Employee@123');
  console.log('  Manager   →  priya@corp.com   /  Manager@123');
  console.log('  Admin     →  sunita@corp.com  /  Admin@123\n');
}

seed().catch(console.error);