import { generateAiContent } from './ai';
import { getFirestore } from './firebase';

export const MEDICAL_DISCLAIMER =
  '⚠️ This summary is for informational purposes only and is not medical advice. Always consult your doctor or pharmacist with questions about your medication, side effects, or dosages.';

export interface ExplanationResult {
  medicationName: string;
  summary: string;
  disclaimer: string;
  cached: boolean;
}

const SYSTEM_INSTRUCTION = `
You are a caring healthcare educator for CareCircle, an elder care platform.
Explain what this medication is commonly used for and 1 or 2 practical tips in simple, reassuring, plain language at a 6th-grade reading level.
Keep your response short: strictly 2 to 3 sentences maximum.
DO NOT provide dosage recommendations, medical diagnoses, or tell the patient to change or stop treatments.
`;

/**
 * Normalizes a medication name for deterministic Firestore doc keys.
 */
export function getMedicationKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

/**
 * Explains a medication in plain language using Gemini, caching results in Firestore.
 * Always appends the non-medical advice disclaimer strictly IN CODE.
 */
export async function explainMedication(
  medicationName: string,
): Promise<ExplanationResult> {
  const cleanName = medicationName.trim();
  if (!cleanName) {
    throw new Error('Medication name is required');
  }

  const key = getMedicationKey(cleanName);
  const db = getFirestore();
  const cacheRef = db.collection('medicationExplanations').doc(key);

  // 1. Check cache first
  try {
    const snap = await cacheRef.get();
    if (snap.exists) {
      const data = snap.data();
      if (data?.summary) {
        return {
          medicationName: cleanName,
          summary: data.summary,
          disclaimer: MEDICAL_DISCLAIMER,
          cached: true,
        };
      }
    }
  } catch (err) {
    console.warn('Medication cache lookup warning:', err);
  }

  // 2. Fetch from AI (OpenRouter or Gemini)
  let rawSummary = '';
  try {
    rawSummary = await generateAiContent({
      prompt: `Please explain this medication: ${cleanName}`,
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.2,
      maxTokens: 500,
    });
  } catch (err) {
    console.warn('AI explanation error, falling back to label guidance:', err);
  }

  const summary =
    rawSummary.trim() ||
    `${cleanName} is commonly prescribed by healthcare providers. Please review your prescription label for instructions.`;

  // 3. Cache result in Firestore
  try {
    await cacheRef.set({
      medicationName: cleanName,
      summary,
      updatedAt: new Date(),
    });
  } catch (err) {
    console.warn('Failed to cache medication explanation:', err);
  }

  return {
    medicationName: cleanName,
    summary,
    disclaimer: MEDICAL_DISCLAIMER,
    cached: false,
  };
}
