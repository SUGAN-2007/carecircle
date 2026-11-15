import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { parseMedicationWithGemini } from '@/lib/geminiParse';
import { checkRateLimit } from '@/lib/rateLimit';
import { getFirestore } from '@/lib/firebase';

const requestSchema = z.object({
  text: z.string().trim().min(1, 'Please enter medication details').max(500),
});

/**
 * POST /api/gemini/parse
 * Natural-language medication entry parser.
 * Accessible to Elder and Caretaker.
 * Rate-limited per profile.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker'], req);
  if (!auth.success) return auth.response;

  // Rate limit: 10 Gemini parse requests per profile per 5 minutes
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  const rateKey = `gemini_parse_${auth.session.profileId}_${ip}`;
  const db = getFirestore();
  const rateCheck = await checkRateLimit(db, rateKey, 10, 5 * 60 * 1000);

  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few moments before trying again.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Invalid input' },
      { status: 400 },
    );
  }

  const result = await parseMedicationWithGemini(parsed.data.text);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    success: true,
    medication: result.data,
  });
}
