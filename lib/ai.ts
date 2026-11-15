import { GoogleGenAI } from '@google/genai';
import { getEnv } from './env';

export interface GenerateAiOptions {
  prompt: string;
  systemInstruction?: string;
  temperature?: number;
  maxTokens?: number;
  jsonFormat?: boolean;
}

/**
 * Unified AI generation function supporting both OpenRouter and Google Gemini.
 * Prefers OpenRouter if OPENROUTER_API_KEY is present, with fallback to GEMINI_API_KEY.
 */
export async function generateAiContent(options: GenerateAiOptions): Promise<string> {
  const env = getEnv();
  const maxTokens = options.maxTokens ?? 1000;
  const temperature = options.temperature ?? 0.3;

  // 1. OpenRouter Integration
  if (env.OPENROUTER_API_KEY) {
    const model = env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';
    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];

    if (options.systemInstruction) {
      messages.push({ role: 'system', content: options.systemInstruction });
    }
    messages.push({ role: 'user', content: options.prompt });

    const body: Record<string, any> = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    if (options.jsonFormat) {
      body.response_format = { type: 'json_object' };
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': env.APP_URL || 'https://carecircle.vercel.app',
        'X-Title': 'CareCircle',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenRouter API error (${res.status}): ${errText}`);
    }

    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  // 2. Direct Google Gemini Gen AI Integration
  if (env.GEMINI_API_KEY) {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
    const config: any = {
      temperature,
    };

    if (options.systemInstruction) {
      config.systemInstruction = options.systemInstruction;
    }
    if (options.jsonFormat) {
      config.responseMimeType = 'application/json';
    }

    const resp = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
      config,
    });

    return typeof resp.text === 'string' ? resp.text : '';
  }

  throw new Error('Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is configured.');
}
