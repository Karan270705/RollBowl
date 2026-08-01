// Self-contained IST date parser for verification
function parseTimeToDateIST(dateStr: string, timeStr: string): Date {
  const timeParts = timeStr.split(':');
  const paddedTimeStr = [
    timeParts[0]?.padStart(2, '0') || '00',
    timeParts[1]?.padStart(2, '0') || '00',
    timeParts[2]?.padStart(2, '0') || '00'
  ].join(':');
  return new Date(`${dateStr}T${paddedTimeStr}+05:30`);
}

interface OperationalContextResult {
  calendarDate: string;
  resolvedOperationalDate: string | null;
  preparationDate: string;
  reason: string;
  resolutionReason: string;
  isResolving: boolean;
}

function simulateResolveSharedOperationalDate(
  mockCurrentISTStr: string,
  mockCalendarDate: string,
  mockNextValidServiceDate: string | null
): OperationalContextResult {
  const currentIST = new Date(mockCurrentISTStr);
  const tomorrowStr = (() => {
    const [year, month, day] = mockCalendarDate.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day + 1));
    return d.toISOString().split('T')[0];
  })();

  const rolloverTimeStr = '15:00';
  const rolloverCutoff = parseTimeToDateIST(mockCalendarDate, rolloverTimeStr);
  const beforeOrAfterRollover = currentIST <= rolloverCutoff ? 'BEFORE_ROLLOVER' : 'AFTER_ROLLOVER';

  const preparationDate = mockNextValidServiceDate || tomorrowStr;

  const buildResult = (resolvedDate: string | null, reasonText: string): OperationalContextResult => ({
    calendarDate: mockCalendarDate,
    resolvedOperationalDate: resolvedDate,
    preparationDate,
    reason: reasonText,
    resolutionReason: reasonText,
    isResolving: false,
  });

  if (beforeOrAfterRollover === 'BEFORE_ROLLOVER') {
    return buildResult(mockCalendarDate, 'Before rollover cutoff');
  }

  if (mockNextValidServiceDate) {
    return buildResult(mockNextValidServiceDate, 'After rollover: next valid service date found');
  }

  return buildResult(null, 'After rollover: no active or upcoming service date');
}

const testCases = [
  {
    name: 'A. July 28, 20:00 IST (Published menu target = July 29)',
    time: '2026-07-28T20:00:00+05:30',
    calendarDate: '2026-07-28',
    nextServiceDate: '2026-07-29',
  },
  {
    name: 'B. July 29, 10:00 IST',
    time: '2026-07-29T10:00:00+05:30',
    calendarDate: '2026-07-29',
    nextServiceDate: '2026-07-30',
  },
  {
    name: 'C. July 29, 14:59 IST',
    time: '2026-07-29T14:59:00+05:30',
    calendarDate: '2026-07-29',
    nextServiceDate: '2026-07-30',
  },
  {
    name: 'D. July 29, 15:01 IST (Next service date = July 30)',
    time: '2026-07-29T15:01:00+05:30',
    calendarDate: '2026-07-29',
    nextServiceDate: '2026-07-30',
  },
  {
    name: 'E. July 29, 15:01 IST (No next published menu after rollover)',
    time: '2026-07-29T15:01:00+05:30',
    calendarDate: '2026-07-29',
    nextServiceDate: null,
  },
];

console.log('==================================================');
console.log('ROLLOVER PARITY VERIFICATION LOGS (5 TEST CASES)');
console.log('==================================================\n');

for (const tc of testCases) {
  const result = simulateResolveSharedOperationalDate(tc.time, tc.calendarDate, tc.nextServiceDate);
  console.log(`--- Test Case: ${tc.name} ---`);
  console.log(JSON.stringify(result, null, 2));
  console.log('');
}
