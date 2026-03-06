# AutoLog - Teknisk Systemöversikt (Final Version)

## 1. Övergripande syfte
AutoLog är en säker plattform för digitalisering och verifiering av fordonshistorik. Systemet hanterar kommunikation mellan köpare och säljare via kontextisolerade chattrådar, genererar säkra transaktionskoder för ägarbyten och erbjuder kraftfulla administratörsverktyg för att säkerställa plattformens integritet.

## 2. Tech Stack
- **Frontend**: React.js (Next.js 15 App Router)
- **Styling**: Tailwind CSS, ShadCN UI
- **Backend**: Firebase (Firestore, Authentication, Storage)
- **AI**: Genkit (Gemini 1.5 Flash) för verifiering av dokument och extraktion av data.
- **Hosting**: Firebase App Hosting.

## 3. Databasstruktur (Schema)
Samtlig global data lagras under sökvägen `/artifacts/{projectId}/public/data/` för maximal säkerhet via Security Rules.

### Users & Profiles
- `/artifacts/{appId}/public/data/public_profiles/{userId}`: Innehåller `role` ('Huvudadmin', 'Moderator'), `name` och `userType`.
- `/artifacts/{appId}/users/{userId}/profiles/user-profile`: Privata användardata.

### Vehicles & Ads
- `/artifacts/{appId}/public/data/cars/{licensePlate}`: Globalt register för varje fordon. Innehåller `ownerId`, `currentOdometerReading` och `inspectionFloorOdometer` (låst golv).
- `/artifacts/{appId}/public/data/public_listings/{licensePlate}`: Marknadsplatsdata. Innehåller isolerade annonsbilder (`adMainImage`) för att skydda bilens permanenta profilbild (`mainImage`).

### History & Storage
- `/artifacts/{appId}/public/data/vehicleHistory/{licensePlate}/logs/{logId}`: Servicehistorik. Innehåller `hasStoragePhoto` flagga.
- **Storage**: `/receipts/{licensePlate}/{logId}`: Fysiska kvittobilder. Skyddas av regler som endast tillåter nuvarande ägare eller admin att läsa.

### Conversations
- `/artifacts/{appId}/public/data/conversations/{convoId}`: Isolerade trådar baserade på `carId + buyerId + sellerId`. Innehåller `transferCode` (6 siffror).

## 4. Kritiska affärsregler
- **Bildisolering**: Fordonets profilbild (`mainImage`) och annonsbild (`adMainImage`) är strikt separerade. Ändringar i annonsen påverkar inte garaget.
- **Chatt-isolering**: Logiken kräver `buyerId`, `sellerId` och `carId` för att hitta eller skapa en chatt. Detta förhindrar återanvändning av gamla trådar vid nya affärer.
- **GDPR & Dokument-skydd**: Känsliga dokument (kvitti) lagras i Firebase Storage. 
    - Endast nuvarande ägare ser sina egna uppladdade dokument.
    - Vid ägarbyte döljs tidigare ägares kvitto-bilder automatiskt ("Dolt pga GDPR") medan verifieringsstatusen kvarstår.
- **Admin & Hård radering**: Administratörer (role: 'Huvudadmin') har tillgång till en "Hard Delete"-funktion som rensar fordonet, historiken, Storage-bilder och relaterade chattar permanent via en kaskadeffekt.

## 5. Viktiga Flöden
- **Mätarsäkring**: Sänkning av mätarställning kräver administrativ kontroll (ansökan) eller verifierat bildbevis på besiktningsprotokoll.
- **Överlåtelse**: Säljaren väljer en köpare från en lista som är dynamiskt filtrerad för att endast visa personer som faktiskt skickat meddelanden gällande den specifika bilen.
- **Kodverifiering**: Ägarbyte slutförs först när köparen anger säljarens unika 6-siffriga kod i sitt eget garage.

## 6. Säkerhet & Behörighet
- **Frontend**: Admin-knappar och raderingsverktyg renderas endast om `user.role === 'Huvudadmin'`.
- **Backend (Security Rules)**: 
    - Strikt verifiering av ägarskap via Firestore-lookup för Storage-åtkomst.
    - Path-baserad säkerhet under `/artifacts/{projectId}/` säkerställer att ingen kan "sniffa" data utan rättighet.

---
*Jag har nu uppdaterat SYSTEM_OVERVIEW.md med den slutgiltiga arkitekturen och de säkrade sökvägarna.*