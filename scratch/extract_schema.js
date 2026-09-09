const fs = require('fs');
const path = require('path');
const dir = 'f:/RollBowl/supabase/migrations';
const files = fs.readdirSync(dir).sort();
let schema = {};
let policies = [];
let rpcs = [];

for (const file of files) {
  if (!file.endsWith('.sql')) continue;
  const content = fs.readFileSync(path.join(dir, file), 'utf8');
  
  // Tables
  const tableMatches = content.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?(\w+)\s*\(([\s\S]*?)\);/g);
  for (const m of tableMatches) {
    if (!schema[m[1]]) schema[m[1]] = { columns: [], addedColumns: [] };
    const cols = m[2].split(',\n').map(c => c.trim()).filter(c => c.length > 0);
    schema[m[1]].columns.push(...cols);
  }
  
  // Alter Table Add Column
  const alterMatches = content.matchAll(/ALTER TABLE (?:public\.)?(\w+)\s+ADD COLUMN (?:IF NOT EXISTS )?([^;]+);/g);
  for (const m of alterMatches) {
    if (!schema[m[1]]) schema[m[1]] = { columns: [], addedColumns: [] };
    schema[m[1]].addedColumns.push(m[2].trim());
  }
  
  // Policies
  const policyMatches = content.matchAll(/CREATE POLICY\s+\"?([^\"]+)\"?\s+ON\s+(?:public\.)?(\w+)[\s\S]*?(?:USING\s*\(([\s\S]*?)\))?(?:\s*WITH CHECK\s*\(([\s\S]*?)\))?;/g);
  for (const m of policyMatches) {
    policies.push({ name: m[1], table: m[2], using: m[3] ? m[3].trim() : null, withCheck: m[4] ? m[4].trim() : null });
  }
  
  // RPCs
  const rpcMatches = content.matchAll(/CREATE OR REPLACE FUNCTION (?:public\.)?(\w+)[\s\S]*?AS \$\$/g);
  for (const m of rpcMatches) {
    rpcs.push(m[1]);
  }
}

fs.writeFileSync('f:/RollBowl/scratch/schema_dump.json', JSON.stringify({ schema, policies, rpcs }, null, 2));
console.log('Schema dump created in scratch/schema_dump.json');
