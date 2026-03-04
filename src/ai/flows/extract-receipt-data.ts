'use server';
/**
 * @fileOverview A Genkit flow to extract key details from a service receipt or inspection document.
 * Includes security checks for potential manipulation and reg-number matching.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExtractReceiptDataInputSchema = z.object({
  receiptImageDataUri: z
    .string()
    .describe(
      "A photo of a service receipt or inspection protocol, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ExtractReceiptDataInput = z.infer<typeof ExtractReceiptDataInputSchema>;

const ExtractReceiptDataOutputSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe('The date on the document, in YYYY-MM-DD format.'),
  odometerReading: z
    .number()
    .int()
    .min(0)
    .describe('The odometer reading (mätarställning) shown on the document.'),
  licensePlate: z
    .string()
    .describe('The license plate (registreringsnummer) found on the document.'),
  category: z
    .enum(['Service', 'Reparation', 'Däck', 'Besiktning', 'Uppgradering'])
    .describe('The category of the document.'),
  totalCost: z
    .number()
    .optional()
    .describe('The total cost mentioned on a receipt, if applicable.'),
  serviceSummary: z
    .string()
    .describe('A brief summary of the work performed or inspection results.'),
  organizationNumber: z
    .string()
    .optional()
    .describe('The organization number (organisationsnummer) of the workshop found on the document.'),
  isInspection: z
    .boolean()
    .describe('True if the document is an official inspection protocol (besiktningsprotokoll).'),
  inspectionPassed: z
    .boolean()
    .optional()
    .describe('True if it is an inspection and it passed (godkänd).'),
  manipulationRisk: z
    .enum(['low', 'medium', 'high'])
    .describe('Risk score for potential image manipulation (e.g. edited numbers).'),
  manipulationReason: z
    .string()
    .optional()
    .describe('Reason for the manipulation risk assessment, if risk is medium or high.'),
});
export type ExtractReceiptDataOutput = z.infer<typeof ExtractReceiptDataOutputSchema>;

export async function extractReceiptData(input: ExtractReceiptDataInput):
  Promise<ExtractReceiptDataOutput> {
  return extractReceiptDataFlow(input);
}

const extractReceiptDataPrompt = ai.definePrompt({
  name: 'extractReceiptDataPrompt',
  input: {schema: ExtractReceiptDataInputSchema},
  output: {schema: ExtractReceiptDataOutputSchema},
  model: 'googleai/gemini-2.5-flash',
  prompt: `You are an expert at extracting and verifying vehicle documentation for AutoLog.

Your task is to analyze the image and extract key details with high precision. 

CRITICAL SECURITY CHECK: 
1. Look for signs of digital manipulation (Photoshop, altered numbers, inconsistent fonts/pixelation).
2. If the odometer reading or license plate looks edited, set manipulationRisk to 'high'.
3. Extract the workshop's organization number (10 digits, e.g. 556677-8899).
4. Identify if it is an official inspection protocol (Besiktningsprotokoll).

Extraction Guidelines:
- Odometer reading (mätarställning) is critical. 
- Identify the license plate (registreringsnummer).
- For dates, use YYYY-MM-DD format.

Document Image: {{media url=receiptImageDataUri}}`,
});

const extractReceiptDataFlow = ai.defineFlow(
  {
    name: 'extractReceiptDataFlow',
    inputSchema: ExtractReceiptDataInputSchema,
    outputSchema: ExtractReceiptDataOutputSchema,
  },
  async input => {
    const {output} = await extractReceiptDataPrompt(input);
    return output!;
  }
);