import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/cron/tick/route';
import * as reminderEngine from '@/lib/reminderEngine';
import { NextRequest } from 'next/server';

describe('Cron Endpoint Authentication & Timing-Safe Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects requests missing the x-cron-secret header with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/tick', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects requests with an incorrect secret with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/tick', {
      method: 'POST',
      headers: {
        'x-cron-secret': 'wrong-cron-secret-that-does-not-match',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('executes tick and returns 200 when valid secret is provided via POST', async () => {
    vi.spyOn(reminderEngine, 'runReminderTick').mockResolvedValue({
      processed: 5,
      sent: 2,
      failed: 0,
      missed: 1,
    });

    const validSecret = process.env.CRON_SECRET || 'test-cron-secret-min-16';

    const req = new NextRequest('http://localhost:3000/api/cron/tick', {
      method: 'POST',
      headers: {
        'x-cron-secret': validSecret,
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.processed).toBe(5);
    expect(body.sent).toBe(2);
    expect(body.missed).toBe(1);
  });

  it('also supports GET method with valid secret (for schedulers limited to GET)', async () => {
    vi.spyOn(reminderEngine, 'runReminderTick').mockResolvedValue({
      processed: 1,
      sent: 0,
      failed: 0,
      missed: 0,
    });

    const validSecret = process.env.CRON_SECRET || 'test-cron-secret-min-16';

    const req = new NextRequest('http://localhost:3000/api/cron/tick', {
      method: 'GET',
      headers: {
        'x-cron-secret': validSecret,
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
