const fs = require('fs');
const schema = JSON.parse(fs.readFileSync('schema.json', 'utf8'));
const menu_schedules = schema.definitions.menu_schedules;
console.log(Object.keys(menu_schedules.properties));
