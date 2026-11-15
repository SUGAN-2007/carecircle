import { NextResponse, type NextRequest } from 'next/server';
import { requireRole } from '@/lib/auth';
import { explainMedication } from '@/lib/geminiExplain';

/**
 * GET /api/gemini/explain?name=Lisinopril
 * Accessible to all authenticated family members (elder, caretaker, family).
 * Returns plain-language explanation with hardcoded medical disclaimer.
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(['elder', 'caretaker', 'family'], req);
  if (!auth.success) return auth.response;

  const url = new URL(req.url);
  const name = url.searchParams.get('name')?.trim();

  if (!name) {
    return NextResponse.json(
      { error: 'Medication name parameter is required' },
      { status: 400 },
    );
  }

  try {
    const result = await explainMedication(name);
    return NextResponse.json(result);
  } catch (err) {
    console.error('Failed to explain medication:', err);
    return NextResponse.json(
      { error: 'Unable to explain this medication at this time.' },
      { status: 500 },
    );
  }
}
