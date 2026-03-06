
# AutoLog - Teknisk Systemritning & Produktionsmanual (Blueprint)

## 1. Övergripande Arkitektur
AutoLog är en plattform för verifierad fordonshistorik och marknadsplats. Systemet bygger på en "Trust-First"-princip där relationell datalåsning, mätarsäkring och integrerad annonsering samverkar för att skapa en manipuleringssäker miljö.

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, ShadCN UI.
- **Backend**: Firebase (Firestore, Authentication, Storage).
- **Namn**: AutoLog – Din digitala annons och servicebok.

## 2. Unika Försäljningsargument (USP)
AutoLog är den första tjänsten på marknaden som integrerar bilens hela livscykel:
1. **Sömlös Övergång**: En bil går från att ha en privat servicebok till att bli en publik annons med ett klick.
2. **Mätarsäkrad**: Ett verifierat "besiktningsgolv" förhindrar mätarfusk permanent.
3. **Verkstadsstämpel**: Professionella aktörer kan sätta låsta digitala stämplar som ger omedelbar trovärdighet.

## 3. Databasstruktur (Firestore)
All global data lagras under `/artifacts/{projectId}/public/data/` för centraliserad säkerhet.

### 3.1 Fordonsregister
- `/cars/{licensePlate}`: Bilens aktuella status, nuvarande ägare, miltal och "besiktningsgolv".
- `/users/{userId}/vehicles/{licensePlate}`: Användarens privata garage (speglad data).

### 3.2 Servicehistorik (Permanent)
- `/vehicleHistory/{licensePlate}/logs/{logId}`:
    - `ownerId`: UID för ägaren vid servicetillfället (Kritiskt för GDPR).
    - `creatorId`: UID för skaparen (Verkstad eller Ägare).
    - `verificationSource`: 'Workshop', 'AI', 'Official' eller 'User'.
    - `photoUrl`: Innehåller Base64-sträng för bilder för att garantera tillgänglighet och snabbhet.

## 4. Kritiska Affärsregler

### 4.1 Mätarsäkring ("Besiktningsgolvet")
- **Princip**: Ett fordon får aldrig sänkas i miltal av en privatperson utan bildbevis på besiktningsprotokoll.
- **Admin-kontroll**: Varje manuell sänkning skapar en `odometer_correction` som kräver manuellt godkännande av en Huvudadmin.

### 4.2 GDPR & Relationell Låsning
- **Privat Data**: Kvitto-bilder och kostnader är låsta till den person som ägde bilen när servicen gjordes.
- **Ägarbyte**: Vid försäljning ser den nya ägaren ATT service gjorts (vilket höjer värdet), men kvittot markeras som "Dolt pga GDPR" för att skydda tidigare ägares integritet.

## 5. Designstandard för Profilbilder & Ikoner
För att omedelbart signalera tillit används olika ramar:
- **Privatpersoner**: Cirkulär ram (`rounded-full`) för en personlig känsla.
- **Verkstäder**: Kvadratisk ram med runda hörn (`rounded-lg/xl`) + Blå "Verkstad"-ikon.
- **Placering**: Dessa standarder efterlevs i Chatten, Händelse-hubben, Annonsvyn och Timeline.

## 6. Teknisk Bildhantering (Production-Ready)
För att säkerställa att appen aldrig "tuggar" eller nekas åtkomst pga CORS (Cross-Origin Resource Sharing):
- **Plan A**: Uppladdning till Firebase Storage (för annonsbilder).
- **Plan B (Fail-safe)**: Direkt lagring av Base64 i Firestore (för verkstadsstämplar och kvitton). Detta gör att service kan registreras blixtsnabbt även i instabila miljöer.

## 7. Roller & Åtkomst
- **Huvudadmin**: Full tillgång, kan radera fordon och historik permanent.
- **Moderator**: Hanterar användare och annonser.
- **Verkstad**: Kan sätta digitala stämplar som kräver ägarens godkännande.
- **Användare**: Kan logga egen historik och sälja sitt fordon.
