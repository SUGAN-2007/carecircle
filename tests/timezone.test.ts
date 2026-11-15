import { describe, it, expect } from 'vitest';
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';
import { getDoseDocId } from '@/lib/doseLog';

describe('Timezone & Midnight Rollover Handling', () => {
  const timeZone = 'Asia/Kolkata'; // UTC +05:30

  it('accurately resolves midnight rollover across UTC boundaries', () => {
    // 2026-11-15 18:30:00 UTC is exactly 2026-11-16 00:00:00 in Asia/Kolkata
    const utcDate = new Date('2026-11-15T18:30:00.000Z');

    const localDay = formatInTimeZone(utcDate, timeZone, 'yyyy-MM-dd');
    const localTime = formatInTimeZone(utcDate, timeZone, 'HH:mm');

    expect(localDay).toBe('2026-11-16');
    expect(localTime).toBe('00:00');
  });

  it('converts local slot string to exact UTC timestamp', () => {
    const slotStr = '2026-11-15 08:00';
    // 08:00 IST is 02:30 UTC
    const utcDate = fromZonedTime(`${slotStr.replace(' ', 'T')}:00`, timeZone);

    expect(utcDate.toISOString()).toBe('2026-11-15T02:30:00.000Z');
  });

  it('builds consistent, deterministic dose doc IDs regardless of spacing', () => {
    const medId = 'med_abc123';
    const id1 = getDoseDocId(medId, '2026-11-15 08:00');
    const id2 = getDoseDocId(medId, '202611150800');

    expect(id1).toBe('med_abc123_202611150800');
    expect(id1).toBe(id2);
  });
});
