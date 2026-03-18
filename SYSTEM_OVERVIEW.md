# AutoLog - Teknisk Systemritning & Dokumentation (Blueprint)

## 1. Systemarkitektur & Dataflöde
AutoLog är en plattform för verifierad fordonshistorik. Systemet bygger på en "Trust-First"-princip där AI-verifiering, mätarsäkring och relationell datalåsning samverkar för att skapa en manipuleringssäker digital servicebok. Applikationen saknar en traditionell Node.js-datorserver. Istället agerar Firebase Firestore direkt som både databas och backend-motor via serverless-principer.

- **Frontend**: Byggd med Next.js 15 (App Router) och React 19. Använder Tailwind CSS, Lucide-ikoner och ShadCN UI för komponenter. All datahämtning sker asynkront via anpassade React-hookar (`useMemoFirebase`, `useCollection` och `useDoc`) som öppnar realtidslyssnare (`onSnapshot`) via Firebases Web SDK direkt till Firestore.
- **Backend & Autentisering**: Hanteras via Firebase Authentication. Inloggning stöder Google OAuth och traditionell e-post/lösenord. 
- **Roles & Huvudadministratören**: Behörighet hanteras hybridt: dels via en hårdkodad global konstant i `src/lib/permissions.ts` (`SYSTEM_OWNER_EMAIL`) som definierar appens skapare, och dels via Firestore-dokumentet `/artifacts/{projectId}/public/data/public_profiles/{uid}` som innehåller en array med `permissions` (t.ex. `MANAGE_USERS`, `MANAGE_MARKETPLACE`). Innan en administratör försöker godkänna en mätaransökan (`odometer_correction`) eller radera en annons från marknadsplatsen görs en realtids-kontroll i frontend-koden genom funktionen `hasPermission()` som matchar användarens profil mot rollen, varpå Firestore-reglerna (`firestore.rules`) gör en andra validering med funktionen `isAdmin()` som dubbelkollar en separat `admin_roles`-kollektion på serversidan.

## 2. AI-avläsning av dokument (OCR)
AutoLog använder tillämpad artificiell intelligens för att digitalisera pappersdokument via Google Gemini (Gemini 1.5 Flash) och maskininlärningsramverket Genkit. När en användare laddar upp ett kvitto eller ett besiktningspapper inleds en omfattande automatiserad process:

1. **Extraktion & Analys**: Bilden konverteras (t.ex. till Base64 eller en nedladdningsurl) och skickas till AI-modellen. AI-prompten är hårt mallstyrd för att ignorera grafiska ramar och strikt hämta ut specifik JSON-data.
2. **Kritiska parametrar som extraheras**:
   - `odometer`: (Aktuell mätarställning – AI:n känner skillnad på km och mil, och returnerar alltid formaterat i svensk standardmil).
   - `date`: Service- eller besiktningsdatumet för dokumentet.
   - `licensePlate`: Registreringsnumret (Används för backend-autentisering för att verifiera att kvittot tillhör just den valda bilen).
   - `price` / `cost`: Totalkostnaden för arbetet (om det är ett verkstadskvitto).
   - `manipulationRisk`: Ett boolean-värde (`true`/`false`) där AI-modellen ger ett utlåtande om huruvida bilden ser digitalt manipulerad ut (exempelvis photoshoppade siffror eller klipp-och-klistra artefakter).
3. **Mappning till Databas**: Den strukturerade JSON-datan slussas tillbaka till plattformen (ex.`src/components/log-event-dialog.tsx`). Ett objekt i TypeScript av typen `Partial<VehicleLog>` skapas. Variablerna paketeras, metadata såsom `verificationSource: 'AI'`, `isVerified: true` och systemets tidsstämpel (`serverTimestamp()`) injiceras in i Firestore via ett `writeBatch`-anrop till sökvägen `/vehicleHistory/{licensePlate}/logs/{genererat_id}`. Är användaren en godkänd AI-läsare flaggas inlägget direkt med `approvalStatus: 'approved'`.

## 3. Säkerhet & Rättigheter (GDPR & Dokumentåtkomst)
För AutoLog är det extremt kritiskt att de dokument, anteckningar och kvitton som hör till ett utfört arbete inte slarvas ut offentligt. Om en bilägare (Ägare A) säljer sin bil till Ägare B tre år senare, har Ägare B rätten att veta *att* bilen är servad (för andrahandsvärdets skull), men Ägare B har **inte** rätten att se Ägare A:s originalkvitto som innehåller kontonummer, telefonnummer och adress.

1. **Relationell Låsning**: Varje fordon i systemet (`/cars/{licensePlate}`) har ett specificerat `ownerId`. 
2. **Känslig Historik**: Varje post i servicehistoriken (`VehicleHistory`) sparar ett hårt avtryck av `ownerId` exakt vid den millisekund då arbetet utfördes. Systemet låser därmed kvittot till rätt person i databasen för alltid.
3. **Visuell Filtrering (Frontend)**: Komponenten `HistoryList` läser av inloggad användare och jämför det med `log.ownerId` och `log.creatorId`. Endast om det stämmer överens (eller om det är Huvudadministratören) aktiveras Boolean-flaggan `showPrivateData`. Utan den flaggan renderas enbart Datum, Miltal och Kategori.
4. **Molnsäkerhet (Firebase Storage Rules)**: Själva PNG/JPEG-filerna på servern är kryptografiskt säkrade på filnivå. Filerna lagras i kataloger döpta efter `{licensePlate}` och Firestore Storage Security Rules validerar åtkomstbeviset för varenda bildnedladdning. Det tvingar anropet att ha en giltig inloggnings-token (`request.auth.uid`) som till punkt och pricka måste matcha metadata-avtrycket på filen, annars nekas requesten med en *403 Forbidden*. 
Moln-koden i Storage Rules dikterar logiken och ser ut så här:
```javascript
match /receipts/{licensePlate}/{logId} {
  allow read: if request.auth != null && (
    request.auth.uid == resource.metadata.ownerId || 
    request.auth.uid == resource.metadata.creatorId || 
    request.auth.token.email == "din.admin.email@domain.com"
  );
}
```
Samt motsvarande logik i Firestore Rules för läsning under `vehicleHistory/logs`. Den framtida ägaren ser en stämpel i appen att servicen verifierats via bevis, men ser ej beviset. Huvudadministratören förbigår samtlig blockering för modereringssyften.

## 4. Felsökning (Permission Error vid AI-avläsning)
I testmiljön stöter plattformen ofta på följande fel vid AI-analys eller uppladdning av inspektionspapper:
`@firebase/firestore: Firestore: Uncaught Error in snapshot listener: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.`

**Varför uppstår det?**
Felet uppstår på grund av Firestore Security Rules asymmetri under testning. Klientsidans kod initierar AI-uppladdningen och försöker därefter lägga in en logg med extremt höga rättigheter (som exempelvis en `approvalStatus: 'approved'` utan att vara verkstad, eller vid uppdatering av miltalsgolv under dokumenttolkningen). AI-rutinerna utförs dock i en separat backend-miljö. När koden agerar på egen hand i skyddad miljö utan att skicka med klientens token (webbläsarens inloggningscookie), så uppfattar databasen datatrafiken som "fientlig" och ostyrkt. Databasen svarar omedelbart med *permission-denied* och stänger säkerhetsmässigt ner hela den aktuella realtidslyssnaren inuti React, vilket fryser klienten och utlöser ett evighetsladdande på plattformens moduler.

**Lösningen**:
För att systemet ska fungera 100% säkert och felfritt i produktion måste all AI och tyngre backend-skrivning flyttas till ett dedikerat Google Cloud Service Account (t.ex. körd inuti en Firebase Cloud Function). Ett Service Account använder Firebase Admin SDK. Skillnaden är kritisk: Admin SDK kommunicerar över ett extremt säkert och inbundet certifikat, och har per automatik universellt förbigående av samliga av användarnas säkerhetsregler (`firestore.rules`). Det gör att den officiella servern smärtfritt kan tolka dokumentet i en låst svart låda, godkänna det som AI-läst, manipulera bilens känsligaste värden och bekräfta proceduren utan att någonsin nekas tillträde från sin egen databas. Frontenden kan sedan i godan ro enbart läsa det färdiga resultatet från databasen.

## 5. PWA & Deployment
AutoLog distribueras inte via App Store eller Google Play, men systemet beter sig och känns hundraprocentigt som en native-applikation installerad direkt på användarens telefonens startskärm.

- **"Fake App" (PWA - Progressive Web App)**: I rotkatalogen för Next.js är systemet definierat som en fullblodig PWA via filen `manifest.webmanifest`. Här anges de strikta konventionerna från Apple/Google: Systemet tvingar fram `display: "standalone"`, specifierar `theme_color` för att smälta in UI-kanterna och refererar exakta upplösningar på ikoner (PWA-badge) för olika Android/iOS skärmar. När en användare i Safari eller Chrome ges alternativet "Lägg till på startskärmen" och klickar på appen, upptäcker operativsystemet manifest-kriterierna. URL-rutan (webbläsarens navigeringsrutor) i telefonen tas bort helt, applikationen förses med dess ikon i telefonens appbibliotek, och AutoLog öppnas därefter i en avskärmad helskärmssymulering – exakt som en nedladdad native-app.
- **GitHub Flow & Netlify**: Infrastrukturen bakom webbhotellet och lanseringsmodellen bygger på kontinuerlig integrering mellan GitHub och hosting-plattformen Netlify. Källkoden sparas kontinuerligt ner av författaren och därefter skickas ('pushas') samlingen av kodfiler till huvudgrenen (`main`) i ett lagrat GitHub-förvar. 
Netlify är sammankopplat och registrerat som en *Webhook* över förvaret. Vid varenda ny push från skaparen till GitHub känner Netlifys robotar av händelsen omedelbart. Netlify plockar in hela koden i en ren bygg-server-container, injicerar tyst men kraftfullt alla säkerhetslagrade nycklar (environments variables som t.ex. `NEXT_PUBLIC_FIREBASE_API_KEY`), och kör sedan kommandot för produktion (`npm run build`). Next.js bygger då den optimerade slutprodukten, varpå servern rullar ut systemet live för alla världens användare blixtsnabbt – utan en millisekund i nertid.
