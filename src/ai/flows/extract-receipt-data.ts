'use server';
/**
 * @fileOverview Extraherar data från servicedokument.
 * Använder gemini-1.5-flash och manuell JSON-tvätt för maximal stabilitet.
 * Inget output-schema används i prompten för att undvika 400 Bad Request.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractReceiptDataInputSchema = z.object({
  receiptImageDataUri: z
    .string()
    .describe("A photo of a document as a data URI."),
});
export type ExtractReceiptDataInput = z.infer<typeof ExtractReceiptDataInputSchema>;

const ExtractReceiptDataOutputSchema = z.object({
  date: z.string(),
  odometerReading: z.number(),
  licensePlate: z.string(),
  category: z.enum(['Service', 'Reparation', 'Däck', 'Besiktning', 'Uppgradering']),
  totalCost: z.number().optional(),
  serviceSummary: z.string(),
  isInspection: z.boolean(),
  manipulationRisk: z.enum(['low', 'medium', 'high']),
  isAuthenticReceipt: z.boolean(),
});
export type ExtractReceiptDataOutput = z.infer<typeof ExtractReceiptDataOutputSchema>;

export async function extractReceiptData(input: ExtractReceiptDataInput): Promise<ExtractReceiptDataOutput> {
  return extractReceiptDataFlow(input);
}

const extractReceiptDataPrompt = ai.definePrompt({
  name: 'extractReceiptDataPrompt',
  input: {schema: ExtractReceiptDataInputSchema},
  model: 'googleai/gemini-2.5-flash',
  prompt: `Analysera detta fordonsdokument och extrahera data.
Dokument: {{media url=receiptImageDataUri}}

VIKTIG SÄKERHETSKONTROLL (isAuthenticReceipt):
Steg 1 är att verifiera att bilden faktiskt är ett giltigt dokument (kvitto, faktura, arbetsorder eller besiktningspapper) relaterat till fordon/bilservice. 
Om bilden föreställer ett TV-spel (t.ex. Ninjago eller liknande), en selfie, en naturbild, en bil utifrån, eller helt saknar typiska kvittodetaljer (som verkstadsnamn, datum, belopp eller fordonsrelaterad text) MÅSTE du sätta "isAuthenticReceipt" till false. Om den verkar vara ett äkta och relevant dokument, sätt till true.

VIKTIGT OM MÄTARSTÄLLNING:
Mätarställning ("odometerReading") MÅSTE konverteras till svenska MIL. Om det står i km i dokumentet (t.ex 191622 km), svara med 19162 (dela med 10, inga decimaler). Om du är osäker och det är mycket högt, utgå från att det är i km och konvertera till mil.

Svara enbart med rå JSON-data i detta format (ingen markdown, ingen text före eller efter):
{
  "date": "YYYY-MM-DD",
  "odometerReading": number,
  "licensePlate": "REG-NR",
  "category": "Service" | "Reparation" | "Däck" | "Besiktning" | "Uppgradering",
  "totalCost": number,
  "serviceSummary": "beskrivning",
  "isInspection": boolean,
  "manipulationRisk": "low" | "medium" | "high",
  "isAuthenticReceipt": boolean
}`,
});

const extractReceiptDataFlow = ai.defineFlow(
  {
    name: 'extractReceiptDataFlow',
    inputSchema: ExtractReceiptDataInputSchema,
  },
  async (input: any) => {
    let attempts = 0;
    while (attempts < 2) {
      try {
        const result = await extractReceiptDataPrompt(input);
        const text = result.text;
        // Rensa markdown och parsa JSON manuellt för maximal stabilitet
        const cleanJson = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanJson) as ExtractReceiptDataOutput;
      } catch (e: any) {
        attempts++;
        if (attempts >= 2) {
          if (e.message?.includes('429') || String(e).includes('429')) {
            throw new Error('AI Server överbelastad (Kvot överskriden). Vänligen prova igen om en minut.');
          }
          throw new Error('AI-skanning misslyckades: ' + e.message);
        }
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    throw new Error('Systemfel i AI-flödet.');
  }
);
