# AutoLog / Mitt Projekt - Omfattande Teknisk Systemritning & Dokumentation

Detta dokument fungerar som den centrala "ritningen" (blueprint) för hela AutoLog-systemet. Syftet är att vara så 100% utförlig och tydlig att en ny utvecklare ska kunna förstå, underhålla och återskapa hela applikationen utifrån denna text ensam, utan att behöva gissa sig till detaljer eller akronymer.

---

## 1. Introduktion & Målsättning
AutoLog är en digital plattform och en "Trust-First"-tjänst för verifierad fordonshistorik, marknadsplats och fordonsgemenskap. Systemets huvuduppgift är att eliminera fusk (såsom mätarskruvning eller förfalskade serviceböcker) genom att digitalisera serviceprotokoll, integrera AI-baserad avläsning av pappersdokument, och låsa all historik kryptografiskt till användarnas identiteter. 

Systemet vänder sig till två primära målgrupper:
1. **Privata bilägare** (CarOwner) som vill dokumentera sin bils historik, chatta på forum, sälja eller köpa bilar.
2. **Verkstäder** (Workshop) som vill certifiera utförda reparationer och servicearbeten elektroniskt på kundernas fordon.

---

## 2. Teknisk Stack & Ramverk
Systemet är byggt på en modern webbstack utan en traditionell databasserver i bakgrunden.
- **Frontend / Ramverk:** Next.js version 15 (med App Router-arkitektur) mixat med React 19.
- **Styling:** Tailwind CSS för design, kryddat med ShadCN UI och Radix UI för tillgängliga komponenter (Tabs, Modals, Dialogs, Dropdowns etc). 
- **Ikoner:** Lucide React.
- **Backend / Databas:** Firebase Firestore (NoSQL-databas). All kommunikation med databasen sker direkt från frontend via klient-SDK (`firebase/firestore`).
- **Autentisering:** Firebase Authentication (Stöd för Google OAuth2 och E-post/Lösenord).
- **Lagring av Filer:** Firebase Cloud Storage (för uppladdning av annonsbilder och kvitton).
- **Artificiell Intelligens (AI):** Google Gemini 1.5 Flash hanterat via ramverket Google Genkit (används via Next.js Server Actions).
- **Integritet & Typning:** TypeScript används genomgående i hela applikationen för att säkerställa att all data är strikt mallad.

---

## 3. Datamodeller & Databasstruktur (Firebase Firestore)
Hela systemets data sparas i en central rot-katalog i Firestore under sökvägen `/artifacts/{projectId}/public/data/` och `/artifacts/{projectId}/users/`. Följande är de exakta TypeScript-modeller (Interfaces) som systemet bygger på:

### A. Användarprofiler (`UserProfile`)
Sparas i kollektionen: `public_profiles`
- `id` (string): Samma som Firebase Auth UID.
- `email` (string): Användarens inloggnings-epost.
- `name` (string): Visningsnamn.
- `userType` ('CarOwner' | 'Workshop'): Avgör om det är en vanlig person eller ett företag.
- `organizationNumber` (string): För verkstäder.
- `role` ('Admin' | 'Användare' | 'Huvudadmin' | 'Moderator'): Administrativa titlar.
- `permissions` (string[]): Lista över exakta rättigheter (se avsnittet om Rättigheter nedan).
- `isForumBanned` (boolean): Flagga om användaren får skriva i forumet.

### B. Fordon (`Vehicle`)
Sparas i kollektionen: `cars` (samt speglas under `users/{ownerId}/vehicles`).
Fordon identifieras alltid genom sitt registreringsnummer (`licensePlate`) som görs om till stora bokstäver utan mellanslag först.
- `ownerId` (string | null): Användar-ID på den aktuella ägaren.
- `make`, `model`, `year` (string/number): Bilens grundfakta.
- `currentOdometerReading` (number): Bilens absolut senaste miltal (anges i svenska Mil, där 1 mil = 10 km).
- `isPublished` (boolean): Sann om bilen ligger ute på Marknadsplatsen.
- `price`, `description`, `adMainImage`, `adImageUrls`: Data som knyts till försäljningsannonsen.
- `status` ('private' | 'for-sale' | 'sold'): Bilens handelsstatus.
- `pendingTransferTo` / `pendingTransferFrom`: Hanterar logiken när Ägare A ska överföra bilen till Ägare B.

### C. Servicehistorik (`VehicleLog`)
Sparas i under-kollektionen: `vehicleHistory/{licensePlate}/logs/{logId}`
- `category` ('Service' | 'Reparation' | 'Däck' | 'Besiktning' | 'Uppgradering' | 'Ägarbyte' | 'Egen Service')
- `date` (string): Datumet arbetet utfördes.
- `odometer` (number): Miltalet när arbetet gjordes. Måste vara logiskt rimligt gentemot `currentOdometerReading`.
- `verificationSource` ('User' | 'AI' | 'Workshop' | 'Official'): Vem/vad som intygar loggen.
- `approvalStatus` ('pending' | 'approved' | 'rejected'): Om loggen är inväntande godkännande.
- `isVerified` (boolean): Resultatet om en verkstad eller AI godkänt loggen.
- `creatorId`, `ownerId`: Vilken inloggad person som skapade posten samt vem som ägde bilen just den millisekunden.

### D. Konversationer & Chatt (`Conversation`)
Sparas i kollektionen: `conversations`
- Används för både Marknadsplatsen (köpare pratar med säljare) och Direktmeddelanden via inkorgen.
- Spårar `participants` (array av UID), `lastMessage`, `unreadBy` (array av UID som ej läst).
- Varje konversation har en under-kollektion `/messages/` som lagrar individuella chattbubblor med avsändare och tidsstämpel.

---

## 4. AI-avläsning av dokument (OCR via Google Gemini)
När en användare laddar upp ett besiktningspapper eller verkstadskvitto:
1. **Frontend:** Bilden base64-kodas i webbläsaren.
2. **Server Action:** Den navigeras till `src/ai/flows/verify-vehicle-plate.ts`. (Koden måste köras under direktivet `'use server'`).
3. **AI-Prompt:** Gemini 1.5 Flash tar emot bilden tillsammans med en starkt konfigurerad AI-Prompt. Prompten instruerar modellen att ignorera grafiska ramar och fält, och kräver utdata strikt i JSON-format.
4. **Extraktion:** AI:n scannar efter:
   - Registreringsnummer (`licensePlate`).
   - Mätarställning (`odometer`) - AI:n har i uppdrag att konvertera eventuella kilometer till svenska mil.
   - Avslöjar falsariet: Om det ser ut som en handritad fusklapp eller ett word-dokument, sätter AI:n `isInspectionDocument` till `false`.
5. **Autovalidering:** På servern jämförs koden mot det reg-nummer `expectedPlate` användaren påstår sig ladda upp för. Stämmer det sätts status till automatgodkänd.

---

## 5. Rättigheter, Roller & Administrationspanel (RBAC)
Behörighetshantering är decentraliserat och baseras inte på enbart en sträng-variabel som "Admin", utan ett flexibelt Array-system av specifika förmågor inuti `UserProfile`. Central logik ligger i `src/lib/permissions.ts`.

### A. Den Absoluta Ägaren (Huvudadmin)
E-postadressen `apersson508@gmail.com` är hårdkodad i systemet under variabeln `SYSTEM_OWNER_EMAIL`. Denna person är osynlig för nedgraderingar och har evig behörighet till 100% av applikationens funktioner (databasens gud-läge).

### B. Behörighetstangenter (Permission Keys)
Vanliga administratörer och moderatorer blir tilldelade unika befogenheter:
- `MANAGE_USERS`: Kan blockera (Banna) eller permanent radera andra användarprofiler.
- `VIEW_AUDIT_LOGS`: Kan se aktivitetsloggen över vilka knappar andra administratörer har tryckt på.
- `MANAGE_VEHICLES`: Får tillgång till knappen för "Skarp Hård Radering" av valfri bil i databasen.
- `MANAGE_MARKETPLACE`: Får befogenhet att ta bort andras olämpliga fordonsannonser från marknadsplatsen.
- `MANAGE_MILEAGE`: Får godkänna eller neka användarnas begäran om att sänka eller tvinga en ändring av en bils miltalsmätare.
- `MANAGE_PERSONNEL`: Kan rekrytera vanlig personal till nya administratörer.
- `MANAGE_FORUM`: Kan radera forumtrådar och portförbjuda användare från forumet.
- `RUN_SYSTEM_TOOLS`: Tillåter körning av applikationens rensningsverktyg och skript.

### C. Adminpanelen (`src/app/admin/page.tsx`)
Renderas endast om kommandot `canViewAdminPanel()` returnerar Sant. Den bygger på en tab-navigering (Flik-system) anpassat för mobiler via flexbox. Beroende på vilka `permissions` du har i din profil renderas olika flikar synliga. Alla administrativa beslut skickas till en "Mutor", funktionen `logAdminAction()`, så att Huvudadmin kan spåra *Vem* som gjorde *Vad*, *När*.

---

## 6. Säkerhet & Privata Dokument (GDPR & Data Låsning)
Fordon byter ägare, men kvittot på kamremsbytet innehåller den ursprungliga ägarens personuppgifter. Den digitala överlåtelsen säkerställer att bilen får spara sin "Gröna Barm" (Verifierat av AI / Verkstad) men bilden göms:
1. Under skapelsen av Loggen låses `ownerId` och `creatorId` fast inuti Firestore dokumentet för alltid.
2. Frontenden `history-list.tsx` kollar alltid av `log.ownerId === currentUser.uid`. Om resultatet är falskt döljs nedladdningsknappen för originalkvittot.
3. Systemets underliggande databassäkerhet (Firebase Storage Rules) säkerställer att ingen utomstående kan gissa URL:en till originalkvittot och ladda ner den genom en REST/Fetch-metod, då Storage Rule aktivt nekar ("Permission Denied") alla begärningar där inloggningstoken inte stämmer överens med filens egna instans-metadata.

---

## 7. Överlåtelse av Fordon (Ägarbyte)
För att förhindra biltjyveri eller felklickningar bygger ägarbytet på "Handskakningsprincipen":
1. **Initiativ:** Den nuvarande ägaren går till fordonet och väljer "Ny ägare". Skriver in mottagarens e-postadress.
2. **Databas-Locking:** Systemet uppdaterar `pendingTransferTo` på fordonet till mottagarens ID, och lägger in `pendingTransferFrom` på en tvilling-variabel i användarens träd.
3. **Mottagarsidan:** Mottagaren loggar in och blir bemött av en dialogruta "Du har en väntande överlåtelse".
4. **Godkännande:** Klickar mottagaren ja, flyttas pekarna över. Mottagarens ID skrivs in över Systemets `cars/{licensePlate} ownerId`. Transaktionen utförs som en Batch-Write, så att processen är 100% atomisk (antingen genomförs allt på millisekunden, eller inget alls vid avbrott).

---

## 8. Fil- och Katalogstruktur
Här är en exakt ritning över de viktigaste katalogerna man navigerar i som utvecklare:

- `src/app/`: Next.js 15 routing (App Router). Varje mapp inuti representerar en URL.
  - `(auth)/`: Sidor relaterade till Logga in / Bli Medlem. Undersidor för inloggningsportalen.
  - `dashboard/`: Bilägarens/verkstadens inloggade hemsida. Visar Mina bilar.
  - `admin/`: Mappen som skapar `domain.com/admin`. Panelen för administratörer.
  - `v/[id]/`: Publika bilningsprofiler "domain.com/v/MJN072". Visar fordonsfakta och historia.
  - `inbox/`: Privatmeddelanden och konversationer mellan säljare/köpare.
  - `market/`: Marknadsplatsens front-sida (Sök, filtrera annonserade bilar).
  - `forum/`: Gemenskapens diskussionsforum.
- `src/components/`: Återanvändbara React-element (Knappar, Modaler, Fordonskort `vehicle-card.tsx`).
- `src/components/ui/`: Genererade Shadcn UI komponenter (grundläggande byggklossar som `alert-dialog.tsx`, `tabs.tsx`, o.s.v.).
- `src/firebase/`:
  - `config.ts`: Initialisering av appen (håller environment variables och bootar Firebase kluster).
  - `index.ts`: Exporterar React Hooks (t.ex. `useUser()`, `useFirestore()`, `useCollection()`).
- `src/lib/`: Hjälpfunktioner. Framförallt `permissions.ts` och the `utils.ts` för Tailwind klassammanslagningar.
- `src/types/`: Central placering av Typings, `autolog.ts` (Datamodellerna listade ovan).
- `src/ai/`:
  - `genkit.ts`: Initierar sambandet mellan maskinen och Googles servrar. Laddas med API-nyckel.
  - `flows/`: Separerbara procedurer för att lösa specifika problem med AI ('verify-vehicle-plate', 'extract-receipt-data').

---

## 9. Drift, Hosting och PWA (Progressive Web App)
- **Klient-hosting (Värd):** Koden hostas på plattformen **Netlify**. Varje uppdatering till GitHub Grenen (`main`) utlöser "Continuous Deployment", vilket bygger om projektet via kommandot `npm run build` och sprider ut statiska filer till servrar världen över (Edge computing).
- **Environment Variables (Miljövariabler):** Kritiska nycklar som `NEXT_PUBLIC_FIREBASE_API_KEY` och `GEMINI_API_KEY` måste läggas upp manuellt inuti Netlifys inställningar. Utan dessa kommer AI-tjänsterna (eller själva databasen) att returnera "400 Bad Request" och falla pladask.
- **PWA (Applikation för Mobil Formfaktor):** Projektet är optimerat för att installeras tekniskt osynligt direkt på slutanvändarens telefon. Genom webb-filen `manifest.webmanifest` kommunicerar systemet med iOS/Android att tjänsten ska betraktas som en fristående ("standalone") applikation (Ingen URL-fält, egen ikon, specifik laddskärm).

---

## 10. Kända Felsökningsfaktorer
- **Horisontell Scrollning:** I flexbox-sammanhang under Tailwind CSS (`src/components/ui/tabs.tsx`), om en list av komponenter slöar sig utanför skärmen på den mobila visningen måste containern ställas in med `justify-start` kombinerat med `w-full overflow-x-auto`. Aldrig `justify-center`, då webbläsaren trycker den avklippta informationen osynlig bakom skärmkanten vilket omöjliggör scrollning.
- **Rules Error i Firestore / Permission Denied:** Om webbläsaren stannar upp helt när en servern ("Next.js API" eller AI Action) ska manipulera en bil, beror det ofta på att Next.js inte förmedlar the lokala inloggningstekniken över till Google API:t. Lösningen i dagsläget är att godkännandet av en manipulerad post ska ske enbart efter att AI:n svarat positivt, fast returnerat godkännandet som ett rent JSON-objekt för klientkoden att utföra sista Write-uppdateringen mot databasen. Alternativt bör det ställas upp med en Server Admin SDK (Firebase Cloud Functions).

Denna dokumentation representerar AutoLog till 100 procent. Både layouten, modellerna, besluten och felkorrigeringarna är avsedda att möjliggöra det ultimata fordonssystemet för alla målgrupper och plattformen agerar absolut i realtid tack vare Firebase teknologin.
