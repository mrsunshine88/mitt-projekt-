
# AutoLog – Din digitala annons och servicebok (Teknisk Blueprint)

## 1. Övergripande Arkitektur
AutoLog är marknadens första hybrida plattform som förenar en verifierad digital servicebok med en integrerad marknadsplats. Systemet bygger på en "Trust-First"-princip där relationell datalåsning, mätarsäkring och avancerad tillförlitlighetslogik samverkar.

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS, ShadCN UI.
- **Backend**: Firebase (Firestore, Authentication, Storage).
- **AI-Motor**: Genkit för dokumentverifiering och dataextraktion.

## 2. CarGuard Tillförlitlighetslogik (Version 4)
Systemet använder principen om "Dubbla Datum" för att eliminera efterhandsfusk. Varje servicepost har ett **Utförandedatum** (fysisk service) och ett låst **Systemdatum** (när posten skapades i appen).

### 2.1 Tidsgap & Zoner
Tidsgapet beräknas som: `Systemdatum - Utförandedatum`.
- **Guld-zon**: 0–7 dagar (Realtid).
- **Silver-zon**: 8–90 dagar (Godkänd efterhandsregistrering).
- **Brons-zon**: > 90 dagar (Osäker historik).

### 2.2 Klassificeringsregler
Statusen beräknas i realtid baserat på följande prioriteringsordning:
1.  **🏆 Guld**: Alla av de 3 senaste serviceposterna måste ligga i Guld-zonen (0–7 dagar).
2.  **🥈 Silver**: Kräver minst 2 totala poster OCH att majoriteten (> 50%) av alla poster ligger i Guld- eller Silver-zonen.
3.  **🥉 Brons**: Standardläge. Allt som inte uppfyller kraven ovan (inklusive bilar med endast 1 post).

### 2.3 Uppgraderingsbarhet
Användare kan "tvätta" ett dåligt betyg genom att börja registrera service korrekt. Gamla "Brons-poster" kan spädas ut med nya korrekta inmatningar tills majoritetskravet för Silver eller Guld uppfylls.

## 3. Fordonsregister & Mätarsäkring
- **Besiktningsgolv**: Ett fordon får aldrig sänkas i miltal av en privatperson utan verifierat bildbevis på besiktningsprotokoll.
- **Globalt Register**: `/artifacts/{projectId}/public/data/cars/{licensePlate}` lagrar den officiella statusen som följer bilen vid ägarbyte.

## 4. Verkstadsportalen
Professionella aktörer kan sätta digitala stämplar som:
- Skapar en låst servicepost i bilens historik.
- Inkluderar kvitto och dokumentbevis.
- Kräver ägarens godkännande innan de blir publika.
- Ger omedelbar "Verkstadshistorik"-badge som höjer bilens andrahandsvärde.

## 5. Marknadsplats & Försäljning
- **Sömlös övergång**: En privat servicebok förvandlas till en publik annons med ett klick.
- **Publik åtkomst**: Marknadsplatsen och "Visa telefonnummer" är tillgängliga för gäster utan inloggning för att maximera räckvidden.
- **Säkra ägarbyten**: Överlåtelse sker via digitala koder i chatten. Vid slutförd affär byter `ownerId`, miltalet låses som ett nytt "golv" och historiken följer med till den nya ägaren.

## 6. GDPR & Integritet
- **Relationell Låsning**: Kvitton och känsliga kostnadsuppgifter är låsta till den person som ägde bilen vid servicetillfället.
- **Maskering**: Vid ägarbyte ser den nya ägaren ATT service gjorts, men dokumentbilderna markeras som "Dolt pga GDPR" för att skydda tidigare ägares integritet.

## 7. Teknisk Bildhantering
För att säkerställa stabilitet och undvika nätverksfel (CORS) i utvecklingsmiljöer används en "Fail-safe"-metod:
- Bilder för verkstadsstämplar och kvitton sparas som **Base64-strängar** direkt i Firestore.
- Detta garanterar att historik kan dokumenteras blixtsnabbt oavsett molnlagringens status.
