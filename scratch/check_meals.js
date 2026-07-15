const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Checking for meals with duplicate names...");
  try {
    const { data: meals, error } = await supabase
      .from('meals')
      .select('id, name, stall_id, is_available');
    
    if (error) throw error;

    const nameMap = {};
    meals.forEach(m => {
      if (!nameMap[m.name]) {
        nameMap[m.name] = [];
      }
      nameMap[m.name].push(m);
    });

    let duplicateNamesCount = 0;
    Object.keys(nameMap).forEach(name => {
      if (nameMap[name].length > 1) {
        console.log(`Duplicate meal name "${name}":`, nameMap[name]);
        duplicateNamesCount++;
      }
    });

    console.log(`Total duplicate meal names: ${duplicateNamesCount}`);
    console.log(`Total meals in DB: ${meals.length}`);
  } catch (err) {
    console.error("Failed to check meals:", err);
  }
}

run();
