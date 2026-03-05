'use server';
/**
 * @fileOverview AI-verifiering för registreringsskyltar.
 * Använder gemini-1.5-flash.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const VerifyVehiclePlateInputSchema = z.object({
  photoDataUri: z.string(),
  expectedPlate: z.string(),
});
export type VerifyVehiclePlateInput = z.infer<typeof VerifyVehiclePlateInputSchema>;

const VerifyVehiclePlateOutputSchema = z.object({
  isCar: z.boolean(),
  licensePlate: z.string().nullable(),
  confidence: z.number(),
  match: z.boolean(),
  reasoning: z.string(),
});
export type VerifyVehiclePlateOutput = z.infer<typeof VerifyVehiclePlateOutputSchema>;

export async function verifyVehiclePlate(input: VerifyVehiclePlateInput): Promise<VerifyVehiclePlateOutput> {
  return verifyVehiclePlateFlow(input);
}

const platePrompt = ai.definePrompt({
  name: 'verifyVehiclePlatePrompt',
  input: {schema: VerifyVehiclePlateInputSchema},
  model: 'googleai/gemini-1.5-flash',
  prompt: `Identifiera registreringsskylten i bilden. Jämför med: {{{expectedPlate}}}
Bild: {{media url=photoDataUri}}

Svara enbart med rå JSON:
{
  "isCar": boolean,
  "licensePlate": string,
  "confidence": number,
  "match": boolean,
  "reasoning": string
}`,
});

const verifyVehiclePlateFlow = ai.defineFlow(
  {
    name: 'verifyVehiclePlateFlow',
    inputSchema: VerifyVehiclePlateInputSchema,
  },
  async input => {
    try {
      const result = await platePrompt(input);
      const text = result.text;
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const output = JSON.parse(cleanJson);
      
      const aiPlate = (output.licensePlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const userPlate = input.expectedPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      return {
        ...output,
        match: aiPlate.includes(userPlate) || userPlate.includes(aiPlate)
      };
    } catch (e) {
      return { isCar: false, licensePlate: null, confidence: 0, match: false, reasoning: 'Fel vid analys.' };
    }
  }
);
