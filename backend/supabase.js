const path = require('path');
// This forces Node to find the .env file in your root folder perfectly
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ ERROR: Missing Supabase URL or Anon Key in .env file!");
  console.log("Current URL found:", supabaseUrl);
  console.log("Current Key found:", supabaseKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
