import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateAiContent } from '@/lib/ai';
import * as envModule from '@/lib/env';

describe('Unified AI Client (OpenRouter & Gemini)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('dispatches to OpenRouter when OPENROUTER_API_KEY is configured', async () => {
    vi.spyOn(envModule, 'getEnv').mockReturnValue({
      OPENROUTER_API_KEY: 'sk-or-v1-mock-test-key',
      OPENROUTER_MODEL: 'google/gemini-2.5-flash',
      APP_URL: 'http://localhost:3000',
    } as any);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"name":"Aspirin","dose":"81mg"}',
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await generateAiContent({
      prompt: 'Extract Aspirin 81mg',
      systemInstruction: 'Respond in JSON',
      jsonFormat: true,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-v1-mock-test-key',
        }),
      }),
    );
    expect(result).toBe('{"name":"Aspirin","dose":"81mg"}');
  });

  it('handles OpenRouter API errors gracefully', async () => {
    vi.spyOn(envModule, 'getEnv').mockReturnValue({
      OPENROUTER_API_KEY: 'sk-or-v1-mock-test-key',
      OPENROUTER_MODEL: 'google/gemini-2.5-flash',
      APP_URL: 'http://localhost:3000',
    } as any);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => 'Payment Required',
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(
      generateAiContent({
        prompt: 'Test prompt',
      }),
    ).rejects.toThrow(/OpenRouter API error \(402\)/i);
  });
});
