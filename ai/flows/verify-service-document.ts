'use server';
/**
 * @fileOverview Verifierar om en bild innehåller ett servicedokument.
 * Använder gemini-1.5-flash och manuell JSON-tvätt.
 * Inget output-schema används i prompten för att undvika 400 Bad Request.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const VerifyServiceDocumentInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe("A photo of a document as a data URI."),
});
export type VerifyServiceDocumentInput = z.infer<typeof VerifyServiceDocumentInputSchema>;

const VerifyServiceDocumentOutputSchema = z.object({
  isServiceDocument: z.boolean(),
  documentType: z.enum(['receipt', 'workshop_stamp', 'inspection_protocol', 'other']),
  confidence: z.number(),
  extractedText: z.string(),
  reasoning: z.string(),
});
export type VerifyServiceDocumentOutput = z.infer<typeof VerifyServiceDocumentOutputSchema>;

export async function verifyServiceDocument(input: VerifyServiceDocumentInput): Promise<VerifyServiceDocumentOutput> {
  return verifyServiceDocumentFlow(input);
}

const verifyPrompt = ai.definePrompt({
  name: 'verifyServiceDocumentPrompt',
  input: {schema: VerifyServiceDocumentInputSchema},
  model: 'googleai/gemini-1.5-flash',
  prompt: `Analysera bilden och avgör om det är ett servicedokument.
Bild: {{media url=photoDataUri}}

Svara enbart med rå JSON enligt detta format (ingen markdown):
{
  "isServiceDocument": boolean,
  "documentType": "receipt" | "workshop_stamp" | "inspection_protocol" | "other",
  "confidence": number,
  "extractedText": "text",
  "reasoning": "beskrivning"
}`,
});

const verifyServiceDocumentFlow = ai.defineFlow(
  {
    name: 'verifyServiceDocumentFlow',
    inputSchema: VerifyServiceDocumentInputSchema,
  },
  async input => {
    let attempts = 0;
    while (attempts < 2) {
      try {
        const result = await verifyPrompt(input);
        const text = result.text;
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson) as VerifyServiceDocumentOutput;
      } catch (e: any) {
        attempts++;
        if (attempts >= 2) {
          return {
            isServiceDocument: false,
            documentType: 'other',
            confidence: 0,
            extractedText: '',
            reasoning: 'AI-analys misslyckades: ' + e.message
          };
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('AI-skanning misslyckades.');
  }
);
