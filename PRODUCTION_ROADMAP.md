# Vejen fra prototype til drift

## Klar
- Lærer-, admin- og chaufførroller med adgangsregler i databasen (`firestore.rules`)
- Login med e-mail og adgangskode, e-mailbekræftelse og "glemt adgangskode"
- Turanmodninger, direkte admin-ture, gentagne ture
- Separat bus og chauffør på ud- og hjemtur
- Konfliktkontrol (bus/chauffør optaget, bus for lille)
- Ændringshistorik
- Advarsel når en godkendt tur inden for 2 dage mangler chauffør
- Fælles data i Firebase (Firestore), opdateres live på alle enheder

## Mangler før skolen tager det i brug
1. Følg `OPSÆTNING.md` (regler, første admin, busser, brugere).
2. Læg appen online med Firebase Hosting.
3. Prøvekørsel i 2–3 uger med admin og et par lærere parallelt med Excel.
4. Flyt kommende ture fra Excel-arket ind.
5. Vælg en skiftedato; derefter er Excel kun til opslag.

## Senere
- Påmindelse på e-mail til admin om ture uden chauffør (kræver Firebase Blaze-planen).
- Eksport af ture til Excel.
- Beskyt API-nøglen, så den kun virker fra skolens webadresse (Google Cloud → Credentials).
