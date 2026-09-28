const ms = new Date("2026-09-29T06:30:00Z").getTime();
const formatTimeOnly = (ms) => {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/[\u202F\u00A0]/g, ' ');
};
const start = formatTimeOnly(ms);
const end = formatTimeOnly(ms + 30 * 60000);
console.log(`"${start} - ${end}"`);
