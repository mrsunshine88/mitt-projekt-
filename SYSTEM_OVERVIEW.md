# AutoLog - Enterprise Architecture & Technical Blueprint

Detta dokument fungerar som den centrala arkitekturritningen för Autolog. Syftet är att ge en komplett teknisk överblick för seniora utvecklare, arkitekter och intressenter. Dokumentet förklarar inte bara *hur* systemet är uppbyggt, utan framförallt *varför* specifika arkitektoniska och säkerhetsmässiga beslut har fattats för att uppnå skalbarhet, datasäkerhet och en friktionsfri användarupplevelse.

---

## 1. Executive Summary & Affärslogik
AutoLog är en "Trust-First"-plattform designad för att eliminera fusk på fordonsmarknaden (mätarskruvning, förfalskade stämplar). Genom att kombinera kryptografisk låsning av identiteter, decentraliserad dataverifiering via anslutna bilverkstäder, och AI-driven OCR-teknik för legacy-papper, skapas en oföränderlig (immutable) fordonsjournal. 

Plattformen agerar som en PWA (Progressive Web App) med "omni-channel"-stöd (desktop, tablet, mobil) ifrån en och samma kodbas, byggd för att fungera i realtid.

---

## 2. Arkitektur & Teknisk Stack

Systemet tillämpar en "Serverless" och "Edge-first" arkitektur för att minimera underhåll av infrastruktur och maximera global prestanda.

- **Frontend / Rendering:** Next.js 15 (App Router). Systemet nyttjar stenhårt gränsdragningen mellan **React Server Components (RSC)** för tunga datahämtningar/SEO och **Client Components** för interaktivt UI.
- **Gränssnitt / UI:** Tailwind CSS för utility-first styling, Radix UI för tillgängliga (a11y) headless-komponenter, och Framer Motion/CSS-transitions för micro-interaktioner.
- **Backend-as-a-Service (BaaS):** Firebase. Vi utnyttjar Firebase Firestore (NoSQL) för realtids-synkronisering via WebSockets, och Firebase Storage för BLOB-lagring.
- **Autentisering:** Firebase Auth (JWT-baserad sessionshantering baserat på Google OAuth2 & E-post).
- **AI-Implementation:** Google Gemini 1.5 Flash via ramverket Genkit. Körs isolerat i Next.js Server Actions för att dölja API-nycklar och promt-logik från klienten.
- **Bygge & Typning:** 100% Strict TypeScript. All data som lämnar eller går in i databasen definieras via gemensamma interfaces.
- **Hosting / CI/CD:** Netlify Edge. Varje git-push till `main` triggar en pre-render build (`npm run build`). API-routes och Server Actions distribueras till serverlösa funktioner (AWS Lambda via Netlify).

---

## 3. Datamodellering (NoSQL & Firestore)
Firestore är en dokumentbaserad NoSQL-databas. Till skillnad från relationella databaser (SQL) som bygger på `JOIN`-operationer, använder AutoLog dataduplicering och hierarkisk häckning (Sub-collections) för att optimera läshastighet (O(1) lookups på klientsidan). All data isoleras i en rot-nod: `/artifacts/{projectId}/`.

### A. Användarprofiler (`UserProfile`)
Samling: `public_profiles`
- `id` (string): PK (Primary Key) knuten till Auth UID.
- `userType` ('CarOwner' | 'Workshop'): Styr domänspecifik affärslogik för klienten.
- `permissions` (string[]): En array av specifika rättigheter. (Istället för att bara ha rollen "Admin" tillämpas detaljerad RBAC-logik, t.ex. `MANAGE_USERS`, `VIEW_AUDIT_LOGS`).

### B. GDPR & Raderade Konton (`DeletedProfile`)
Samling: `deleted_profiles`
I enlighet med GDPR raderas personuppgifter (PII) omedelbart vid kontoradering (Right to be forgotten). För att inte bryta applikationens referensintegritet (ex. gamla foruminlägg) behåller systemet Post-ID:t men pekar om det till en anonymiserad profil.
- `email`: Hårdkodad till `raderad.enligt@gdpr.com`.
- `name`: `Raderad Användare`.
- Detta hanteras atomärt i molnet.

### C. Fordon (`Vehicle`)
Samling: `cars` (Speglas även under användarens privata sub-collection för extremt snabba vy-renderingar på instrumentpanelen).
- `licensePlate` (string): Fordonets PK (alltid uppercase, trimmad).
- `currentOdometerReading` (number): Miltalet spåras state-fullt. Systemet förkastar per automatik alla nya journalinlägg som försöker understiga "inspectionFloorOdometer" (systemets låsta mätargolv) för att förhindra bakåtskruvning.
- `pendingTransferTo`: Kärnan i "Handshake"-protokollet för ägarbyte.

### D. Fordonsjournal / Loggar (`VehicleLog`)
Samling: `vehicleHistory/{licensePlate}/logs/{logId}`
- Innehåller data om Service, Besiktning, Ägarbyte.
- `trustLevel` beräknas dynamiskt i frontend utifrån en avancerad algoritm: Är det utfört av Workshop (Guld), AI-skannat papper (Silver) eller egenpåhittat via Användare (Brons)? Beräknar även tids-delta mellan uppladdning och utfört datum för att bestraffa retroaktiv inläggning.
- **Säkerhetsanmärkning (`hasStoragePhoto` vs `photoUrl`):** Vi lagrar *aldrig* base64-kvitton i själva dokumentet. Se avsnitt 6 angående WebSocket-säkerhet.

---

## 4. Säkerhet, Zero-Trust Architecture & Data-läckage
Systemet är designat utifrån premissen att *klienten alltid är komprometterad*. Om en säkerhetsregel enbart finns i React (t.ex. att dölja en knapp med `if (!isAdmin)`), klassas den som värdelös. All verifiering sker på moln-nivå.

### A. WebSocket "Payload Sniffing" & Lösningen
Tidigare fanns en enorm sårbarhet: Om ett kvitto lagrades som en Base64-sträng eller Okrypterad "Download URL" inuti logg-dokumentet i Firestore, streamades den datan ner till klienten via Firebase WebSockets (`onSnapshot`). En skicklig användare kunde trycka F12 (DevTools) och läsa ut kvitton på andras bilar.

**Lösningen (Enterprise Pattern):**
1. När en verkstad laddar upp ett kvitto, fångar frontenden den bilden och laddar upp den som en ren BLOB till en isolerad Firebase Storage Bucket under `/receipts/{plate}/{logId}`.
2. Firestore-dokumentet får enbart flaggan `hasStoragePhoto: true`. (Ingen Base64-data skickas någonsin i websockets).
3. **Storage Security Rules:** Storage Bucketen är skyddad av Firebase Security Rules. När en klient begär kvittot från Storage-servern, exekverar molnet backend-regeln:
   ```javascript
   firestore.get(/databases/.../logs/$(docId)).data.ownerId == request.auth.uid
   ```
4. Är man inte registrerad ägare till bilen, returnerar Storage-servern HTTP 403 Forbidden. F12-verktyg är totalt ineffektiva mot detta. Biltjuvar eller snokare kan absolut aldrig se ett privat kvitto.

(Notis: Filen "DeepSystemScan" i Adminpanelen har befogenhet att svepa över existerande gammal data och komprimera/migrera den in till Storage-klasserna automatiskt).

### B. Transaktionssäkerhet (Batch Writes & ACID)
Vid processer som ägarbyte byter kritiska nycklar plats på flera platser i databasen samtidigt. AutoLog använder alltid Firestore `writeBatch` (Atomic Operations) för detta. Antingen går hela ägarbytet igenom i sin helhet på millisekunden, eller så misslyckas det totalt om uppkopplingen bryts. Data hamnar aldrig i ett korrupt "mellanläge".

### C. Total Aktivitetslogg (Audit Trail)
Systemet tillämpar absolut tystnadslöfte-brytande mot administratörer. Varje knapptryck i adminpanelen (Banning av användare, radering av forum-kommentarer, eller ens att *klicka upp redigeringsvyn för en bil*) fyrar omedelbart av händelsen till samlingen `admin_audit_logs`. Huvudadministratören kan därmed med extrem granularitet se exakt vem i personalen som gjort vad och varför.

---

## 5. Artificiell Intelligens (RPA & OCR-Pipeline)
När traditionella papperskvitton ska digitaliseras har användarna absolut noll tålamod för manuell datainmatning. AutoLog tillämpar en AI-pipeline i tre steg:
1. **Intag:** Bilden skickas från klienten via Next.js Server Action till Google Gemini 1.5 Flash (Optimerad för multi-modal hastighet).
2. **Contextual Prompting:** Prompten, definierad i serverkoden, tvingar LLM:en att formatera sina svar som validerad JSON. Promt engineering tvingar AI:n att förkasta handritade lappar (`isInspectionDocument: false`).
3. **Sanering:** Servern normaliserar utdatan (tvingar km till mil) och verifierar registreringsnumret (Computer Vision cross-check) innan den skickar en godkänd "AI-stämpel" tillbaka till databasen. På grund av detta nekas manuellt manipulerade mätarställningar.

---

## 6. Frontend & Reaktiva UX-beslut
- **State Management:** Vi förlitar oss nästan uteslutande på "Server State" via Firebase hooks (`useCollection`, `useDoc`). Klient-State begränsas till strikta UI-tillstånd, vilket eliminerar Redux boilerplate.
- **Formfactor Responsive Pattern:** Vissa element, som Admin-layouten, visade sig vara omöjliga att tvinga in på mobila skärmar via traditionell CSS media-querying av Flexbox utan horisontell scroll-buggning. Därför modifierar vi DOM-trädet adaptivt: Vertikal Stackning (`flex-col`) på mobiler (garanterad Y-scroll och tryckyta) vs Tag-Cloud Wrappers (`flex-wrap`) på Desktops. Funktionalitet överrider "DRY" (Don't Repeat Yourself) när användarupplevelsen kräver det.

Denna arkitektur garanterar en blixtsnabb, moln-nativ plattform med extrem säkerhetspostur, redo att skala horisontellt för hundratusentals fordon.

Denna dokumentation representerar AutoLog till 100 procent. Både layouten, modellerna, loggningssystemet, GDPR-anonymiseringarna och rollsystemet är avsedda att möjliggöra det ultimata fordonssystemet för alla målgrupper och plattformen agerar absolut i realtid tack vare Firebase teknologin.
