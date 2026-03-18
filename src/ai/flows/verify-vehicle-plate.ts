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
  isInspectionDocument: z.boolean().catch(false),
  licensePlate: z.string().nullable().catch(null),
  odometer: z.number().nullable().catch(null),
  confidence: z.number().catch(0),
  match: z.boolean().optional(),
  reasoning: z.string().optional(),
});
export type VerifyVehiclePlateOutput = z.infer<typeof VerifyVehiclePlateOutputSchema>;

export async function verifyVehiclePlate(input: VerifyVehiclePlateInput): Promise<VerifyVehiclePlateOutput> {
  return verifyVehiclePlateFlow(input);
}

const platePrompt = ai.definePrompt({
  name: 'verifyVehiclePlatePrompt',
  input: {schema: VerifyVehiclePlateInputSchema},
  model: 'googleai/gemini-2.5-flash',
  prompt: `Granska följande dokument noggrant. Är detta ett svenskt Registreringsbevis eller ett Besiktningsprotokoll (t.ex från Besikta, Opus, Carspect, Bilprovningen etc)?
Identifiera registreringsskylten och eventuell mätarställning (vägmätarställning/miltal). Förväntat reg-nr: {{{expectedPlate}}}

VIKTIGT OM ÄKTHET:
1. Sätt "isInspectionDocument" till true BARA om det ser ut som ett officiellt utskrivet protokoll från ett riktigt besiktningsföretag (t.ex. Besikta, Opus, Carspect, DEKRA) eller Transportstyrelsen.
2. AVVISA (sätt till false) alla handskrivna papper, enkla Word-utskrifter som saknar logotyper/tabell-struktur, eller försök till förfalskning där någon bara skrivit reg-nr och "Besikta". Ett riktigt protokoll innehåller besiktningsresultat, tabeller för bromsvärden/miljökontroll, datum och stationsinformation.
3. Mätarställningen (odometer) MÅSTE konverteras till svenska MIL (1 mil = 10 km). Om det till exempel står "191622" (vilket oftast är i km på papperet), ska du svara med "19162". Dela värdet på 10 och avrunda nedåt till en helsiffra om du misstänker att det är angivet i km (vilket det är om det är 6 siffror).

Svara ENBART med rå JSON enligt detta exakta format utan markdown över eller under:
{
  "isInspectionDocument": true/false,
  "licensePlate": "MJN072",
  "odometer": 19162,
  "confidence": 99,
  "reasoning": "Kort förklaring"
}
Bild: {{media url=photoDataUri}}`,
});

const verifyVehiclePlateFlow = ai.defineFlow(
  {
    name: 'verifyVehiclePlateFlow',
    inputSchema: VerifyVehiclePlateInputSchema,
  },
  async (input: any) => {
    let attempts = 0;
    try {
      const result = await platePrompt(input);
      const text = result.text;
      const cleanJson = text.replace(/```json|```/g, '').trim();
      const output = JSON.parse(cleanJson);
      
      const aiPlate = (output.licensePlate || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const userPlate = input.expectedPlate.toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      return {
        ...output,
        match: aiPlate.includes(userPlate) || userPlate.includes(aiPlate),
        odometer: output.odometer ? Number(output.odometer) : null
      };
    } catch (e: any) {
      console.error("AI verifyVehiclePlate error:", e);
      return { isInspectionDocument: false, licensePlate: null, odometer: null, confidence: 0, match: false, reasoning: `Fel vid AI-analys: ${e.message}` };
    }
  }
);
