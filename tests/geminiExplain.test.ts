import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  explainMedication,
  MEDICAL_DISCLAIMER,
  getMedicationKey,
} from '@/lib/geminiExplain';
import { GoogleGenAI } from '@google/genai';
import { GET } from '@/app/api/gemini/explain/route';
import * as authModule from '@/lib/auth';
import { NextRequest } from 'next/server';

vi.mock('@google/genai');
vi.mock('@/lib/firebase', () => ({
  getFirestore: vi.fn(),
}));

describe('Gemini Medication Explanation System', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes medication keys for deterministic cache storage', () => {
    expect(getMedicationKey('Metformin 500mg')).toBe('metformin_500mg');
    expect(getMedicationKey('Lipitor (Atorvastatin)!')).toBe('lipitor_atorvastatin');
  });

  it('generates an explanation, appends disclaimer in code, and writes to cache', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    const mockGenerateContent = vi.fn().mockResolvedValue({
      text:
        'Metformin helps manage blood sugar levels in people with type 2 diabetes. Take it with meals to reduce stomach discomfort.',
    });

    (GoogleGenAI as any).mockImplementation(function (this: any) {
      return {
        models: { generateContent: mockGenerateContent },
      };
    });

    const mockSet = vi.fn().mockResolvedValue(undefined);
    const mockCacheGet = vi.fn().mockResolvedValue({
      exists: false,
    });

    (getFirestore as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: mockCacheGet, set: mockSet }),
      }),
    });

    const result = await explainMedication('Metformin');

    expect(result.medicationName).toBe('Metformin');
    expect(result.summary).toContain('Metformin helps manage blood sugar');
    expect(result.disclaimer).toBe(MEDICAL_DISCLAIMER);
    expect(result.cached).toBe(false);

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        medicationName: 'Metformin',
        summary: expect.stringContaining('Metformin helps manage blood sugar'),
      }),
    );
  });

  it('returns cached explanation without calling Gemini on cache hit', async () => {
    const { getFirestore } = await import('@/lib/firebase');

    const mockGenerateContent = vi.fn();
    (GoogleGenAI as any).mockImplementation(function (this: any) {
      return {
        models: { generateContent: mockGenerateContent },
      };
    });

    const mockCacheGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        medicationName: 'Lisinopril',
        summary: 'Lisinopril is used to lower high blood pressure and protect your kidneys.',
      }),
    });

    (getFirestore as any).mockReturnValue({
      collection: () => ({
        doc: () => ({ get: mockCacheGet }),
      }),
    });

    const result = await explainMedication('Lisinopril');

    expect(result.cached).toBe(true);
    expect(result.summary).toContain('lower high blood pressure');
    expect(result.disclaimer).toBe(MEDICAL_DISCLAIMER);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('allows all roles (elder, caretaker, family) to access /api/gemini/explain', async () => {
    vi.spyOn(authModule, 'requireRole').mockResolvedValue({
      success: true,
      session: {
        profileId: 'p-1',
        role: 'family',
        sessionVersion: 1,
        name: 'Family Alice',
        timezone: 'Asia/Kolkata',
      },
    });

    const { getFirestore } = await import('@/lib/firebase');
    (getFirestore as any).mockReturnValue({
      collection: () => ({
        doc: () => ({
          get: () =>
            Promise.resolve({
              exists: true,
              data: () => ({
                summary: 'Insulin regulates blood sugar.',
              }),
            }),
        }),
      }),
    });

    const req = new NextRequest('http://localhost:3000/api/gemini/explain?name=Insulin');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toContain('Insulin regulates blood sugar');
    expect(data.disclaimer).toBe(MEDICAL_DISCLAIMER);
  });
});
