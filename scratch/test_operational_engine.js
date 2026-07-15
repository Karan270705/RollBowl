const config = { ORDER_CUTOFF_TIME: '10:00', PICKUP_START_TIME: '12:00', PICKUP_END_TIME: '14:00' };
function parseTimeToDateIST(dateStr, timeStr) {
  const timeParts = timeStr.split(':');
  const paddedTimeStr = [
    timeParts[0]?.padStart(2, '0') || '00',
    timeParts[1]?.padStart(2, '0') || '00',
    timeParts[2]?.padStart(2, '0') || '00'
  ].join(':');
  return new Date(dateStr + 'T' + paddedTimeStr + '+05:30');
}
function setTimeOnDate(date, timeStr) {
  const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
  return parseTimeToDateIST(dateStr, timeStr);
}
const now = new Date(new Date('2026-07-15T15:03:00+05:30').toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
const operationalDate = '2026-07-16';
const orderCutoff = setTimeOnDate(operationalDate, config.ORDER_CUTOFF_TIME);
const pickupStart = setTimeOnDate(operationalDate, config.PICKUP_START_TIME);
const pickupEndForOp = setTimeOnDate(operationalDate, config.PICKUP_END_TIME);
const canPlaceOrders = now <= orderCutoff;
const isPrepTime = now > orderCutoff && now < pickupStart;
const pickupWindowOpen = now >= pickupStart && now <= pickupEndForOp;
let status = 'ORDERING_CLOSED';
if (canPlaceOrders) { status = 'ORDERING_OPEN'; } else if (pickupWindowOpen) { status = 'PICKUP_ACTIVE'; }
console.log({ now: now.toISOString(), orderCutoff: orderCutoff.toISOString(), canPlaceOrders, isPrepTime, pickupWindowOpen, status });
