
# AutoLog - Teknisk Systemritning & Dokumentation (Blueprint)

## 1. Övergripande Arkitektur
AutoLog är en plattform för verifierad fordonshistorik. Systemet bygger på en "Trust-First"-princip där AI-verifiering, mätarsäkring och relationell datalåsning samverkar för att skapa en manipuleringssäker digital servicebok.

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, ShadCN UI.
- **Backend**: Firebase (Firestore, Authentication, Storage).
- **AI-Motor**: Genkit (Gemini 1.5 Flash) för dokumentextraktion och bildanalys.

## 2. Databasstruktur (Firestore)
All global data lagras under `/artifacts/{projectId}/public/data/` för att centralisera säkerhetsregler.

### 2.1 Fordonsregister
- `/cars/{licensePlate}`: Bilens aktuella status, ägare, miltal och "besiktningsgolv". Innehåller även fält för pågående överlåtelser (`pendingTransferTo`).
- `/users/{userId}/vehicles/{licensePlate}`: Användarens privata garage. En spegling för snabb åtkomst och personliga anteckningar.
- `/allVehicles/{licensePlate}`: Historiskt register för ägarspårning och backup.

### 2.2 Servicehistorik (Permanent)
- `/vehicleHistory/{licensePlate}/logs/{logId}`:
    - `ownerId`: Den som ägde bilen vid servicetillfället (Kritiskt för GDPR-låsning).
    - `creatorId`: Den som skapade posten (Verkstadens UID eller Ägarens UID).
    - `verificationSource`: 'Workshop', 'AI', 'Official' eller 'User'.
    - `approvalStatus`: 'pending', 'approved', 'rejected'.

### 2.3 Kommunikation & Notiser
- `/conversations/{id}`: Chattar mellan parter. Kategoriseras som 'MARKETPLACE', 'SERVICE' (Verkstad) eller 'SUPPORT'.
- `/pending_approvals/{id}`: Väntande serviceförslag från verkstäder till ägare. Syns som röda prickar i menyn.
- `/workshop_notifications/{id}`: Feedback till verkstaden när ägare svarat. Innehåller kopia av logg-datan.
- `/odometer_corrections/{id}`: Ansökningar om mätarsänkning (granskas av admin).

## 3. Kritiska Affärsregler

### 3.1 Mätarsäkring ("Besiktningsgolvet")
- **Golv-princip**: Ett fordon får aldrig sänkas i miltal av en privatperson utan bildbevis på besiktningsprotokoll.
- **Admin-kontroll**: Varje sänkning skapar en `odometer_correction` som kräver manuellt godkännande av en Huvudadmin.
- **Automatisk spärr**: Systemet vägrar spara värden under det senast verifierade "golvet" i realtid.

### 3.2 GDPR & Relationell Låsning (Dokumentåtkomst)
- **Ägarbunden data**: Servicedokument (kvitton/foton) och känsliga anteckningar är knutna till `ownerId` vid servicetillfället.
- **Ägarbyte**: Vid försäljning ser den nya ägaren att service utförts (datum och miltal), men kvitto-bilden och privata detaljer markeras som "Dolt pga GDPR" för att skydda den tidigare ägarens integritet.
- **Verkstads-undantag**: Verkstaden (skaparen) har permanent läsrätt till sina egna loggar och bilder via `creatorId`, oavsett bilens nuvarande ägare.
- **Permanens**: Loggar av typen "Ägarbyte" kan aldrig raderas eller ändras av användare.

### 3.3 Trust Levels (Guld, Silver, Brons)
- **Gold**: 90%+ av historiken är verkstadsloggad i realtid (max 7 dagars diff mellan utförande och loggning).
- **Silver**: Majoriteten är verifierad via AI/Kvitto.
- **Bronze**: Innehåller manuella efterhandsregistreringar eller saknar verifiering.

## 4. Nyckelflöden

### 4.1 Försäljning & Överlåtelse
1. **Annons**: Säljaren publicerar bilen. En unik `transferCode` genereras i chatten när en köpare tar kontakt.
2. **Initiering**: Säljaren väljer köparen ur listan över aktiva chattar kopplade till bilen.
3. **Verifiering**: Köparen anger koden i sitt garage. Systemet byter `ownerId`, låser mätarställningen som ett nytt "golv" och raderar annonsen.
4. **Ångerrätt**: Både köpare och säljare kan avbryta en påbörjad överlåtelse innan koden verifierats.

### 4.2 Verkstadsportalen & Händelser
- **Händelser-vyn**: En dedikerad sida (`/workshop/events`) som kombinerar väntande förslag och historiska beslut.
- **Digital Stämpel**: Vid loggning skickas ett förslag till ägaren. Loggen markeras som `pending` och döljs för allmänheten tills ägaren godkänt.
- **Notis-propagation**: Notiser visas med badges (röda prickar) i huvudmenyn för både ägare (nya förslag) och verkstäder (nya svar).

### 4.3 AI-Verifiering
- **Extraktion**: Gemini 1.5 skannar kvitton efter reg-nr, miltal, datum och pris.
- **Riskbedömning**: AI:n flaggar för manipulation (`manipulationRisk`) om siffror ser redigerade ut.

## 5. Säkerhet & Roller
- **Huvudadmin**: Full tillgång, kan "hårdradera" fordon, godkänna miltal och hantera personal.
- **Moderator**: Kan blockera användare och ta bort annonser.
- **BannedUsers**: Systemet blockerar omedelbart åtkomst till alla tjänster för blockerade UID:n via `BanGuard`.

## 6. Storage Rules (Filskydd)
- Bilder i `/receipts/` skyddas av logik som kontrollerar `request.auth.uid == log.ownerId || request.auth.uid == log.creatorId || isAdmin()`. Detta säkerställer att endast behöriga parter kan se kvittona på filnivå.
