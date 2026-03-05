'use server';
/**
 * @fileOverview An AI agent for verifying if an uploaded image contains a valid service receipt or workshop stamp.
 *
 * - verifyServiceDocument - A function that handles the document verification process.
 * - VerifyServiceDocumentInput - The input type for the verifyServiceDocument function.
 * - VerifyServiceDocumentOutput - The return type for the verifyServiceDocument function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const VerifyServiceDocumentInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a document, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type VerifyServiceDocumentInput = z.infer<
  typeof VerifyServiceDocumentInputSchema
>;

const VerifyServiceDocumentOutputSchema = z.object({
  isServiceDocument: z
    .boolean()
    .describe(
      'True if the image contains a service receipt or workshop stamp, false otherwise.'
    ),
  documentType: z
    .enum(['receipt', 'workshop_stamp', 'other'])
    .describe(
      'The type of service document identified (receipt, workshop_stamp, or other if not a service document).'
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe('Confidence score (0 to 1) of the classification.'),
  extractedText: z
    .string()
    .describe('Any relevant text extracted from the document.'),
  reasoning: z
    .string()
    .describe('Explanation for the classification decision.'),
});
export type VerifyServiceDocumentOutput = z.infer<
  typeof VerifyServiceDocumentOutputSchema
>;

export async function verifyServiceDocument(
  input: VerifyServiceDocumentInput
): Promise<VerifyServiceDocumentOutput> {
  return verifyServiceDocumentFlow(input);
}

const prompt = ai.definePrompt({
  name: 'verifyServiceDocumentPrompt',
  input: {schema: VerifyServiceDocumentInputSchema},
  output: {schema: VerifyServiceDocumentOutputSchema},
  prompt: `You are an AI assistant specialized in verifying vehicle service documentation.
Your task is to analyze an uploaded image and determine if it contains a valid service receipt or a workshop stamp.

Carefully examine the image provided. Look for characteristics typical of receipts (e.g., merchant name, date, service items, total cost) or workshop stamps (e.g., garage name, date, service performed, mileage, signature/stamp impression).

If the image clearly shows a service receipt or a workshop stamp, set 'isServiceDocument' to true, identify the 'documentType', provide a 'confidence' score (from 0 to 1), extract any relevant 'extractedText', and explain your 'reasoning'.
If it's not clearly a service document, set 'isServiceDocument' to false, 'documentType' to 'other', and provide a brief 'reasoning'.

Image: {{media url=photoDataUri}}`,
});

const verifyServiceDocumentFlow = ai.defineFlow(
  {
    name: 'verifyServiceDocumentFlow',
    inputSchema: VerifyServiceDocumentInputSchema,
    outputSchema: VerifyServiceDocumentOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
