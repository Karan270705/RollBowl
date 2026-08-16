import { supabase } from './src/lib/supabase';

async function run() {
  const { data, error } = await supabase.from('menu_schedules').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
  } else {
    console.log("menu_schedules row:", data);
  }
}

run();
