'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const pingFlow = ai.defineFlow(
  {
    name: 'pingFlow',
    inputSchema: z.void(),
    outputSchema: z.boolean(),
  },
  async () => {
    try {
      const res = await ai.generate({
        model: 'googleai/gemini-2.5-flash',
        prompt: 'Svara med endast ordet OK',
      });
      return res.text.includes('OK');
    } catch (e) {
      throw e;
    }
  }
);

export async function testAiConnection() {
  try {
    await pingFlow();
    return { success: true, error: null };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
