# Efterskole Busbooking v9

V5 begynder overgangen fra klikbar prototype til rigtig flerbruger-webapp.

## Nyt i V5
- Prototype-login med Lærer, Administrator og Chauffør.
- Rollen bestemmer automatisk hvilken del af systemet brugeren ser.
- Admin har en ny Brugere-fane og kan oprette/fjerne brugere.
- Chauffør-login åbner direkte chaufførens egne ture.
- Alle funktioner fra V4 er bevaret, inklusive admin-oprettede ture og separate busser/chauffører ud/hjem.
- `supabase_schema.sql` er med som databaseplan til den rigtige backend.

## Vigtigt
Selve V5 kan stadig åbnes direkte via `index.html` og bruger localStorage. Login er derfor kun en prototype og ikke sikker autentifikation endnu.

Næste trin er at forbinde brugerfladen til Supabase Auth + PostgreSQL, så flere enheder deler de samme ture og rigtige brugerkonti.


## Nyt i V6
- Admin kan godkende en lærer-anmodning uden at tildele chauffør med det samme.
- En godkendt tur kan derfor stå som planlagt, mens chaufførfordelingen afventer.
- Admin-dashboardet viser automatisk en tydelig advarsel fra 2 dage før turen, hvis udtur eller hjemtur mangler chauffør.
- Advarslen fortæller præcist hvilket kørselsben der mangler chauffør.
- Advarslen forsvinder automatisk, når chaufførerne er tildelt.
- Databaseplanen indeholder nu et view til samme 2-dages kontrol i den kommende online-version.


## Nyt i V7
- Admin kan søge og filtrere ture efter status og manglende chauffør.
- Godkendte ture uden fuld chaufførtildeling vises tydeligere.
- Chaufførens visning er gjort mere kørselsorienteret med separat ud-/hjemkortinformation.
- Datoer vises som fx I dag og I morgen, hvor det er relevant.
- Admins direkte tur kan eksplicit oprettes uden bus/chauffør og færdiggøres senere.
- `PRODUCTION_ROADMAP.md` beskriver næste skridt til rigtig drift.


## Nyt i V8
**Fejlrettelser**
- Lærere ser kun deres egne ture. Chauffører ser kun deres egne kørsler.
- Admin kan oprette en tur uden bus og chauffør og tildele dem senere.
- Nye chauffører og busser gemmes og kan vælges med det samme.
- Afviste og annullerede ture kan ikke længere ændres.
- "Kopiér til resten af serien" tjekker konflikter og springer optagede datoer over.
- Ugeplanen viser en rigtig uge (mandag–søndag) med forrige/næste uge.
- Konfliktkontrollen tjekker også turens eget andet kørselsben og bruger de nye tider ved redigering.
- Datoer beregnes i lokal tid (før kunne de skifte dag omkring midnat).
- Alt, der skrives af brugerne, vises som tekst (lukker et sikkerhedshul).
- Tallene for busser og chauffører på dashboardet er ikke længere skrevet fast.

**Nyt design**
- Login med én knap pr. bruger, grupperet efter rolle.
- Formularer i dialogvinduer med tydelige fejlbeskeder i stedet for browserens pop-ups.
- Læreren ser en forklaring på hver status (fx "Chauffør bliver tildelt senere").
- Admin: nøgletal, der kan klikkes på, filtre ("Kræver svar", "Mangler chauffør" …) og søgning.
- Bus- og chaufførlister viser direkte, hvad der er optaget eller for lille, og spærrer for det.
- Chaufføren får en dagsplan ("I dag", "I morgen") med klokkeslæt, bus, antal og kontaktperson.
- Admin kan redigere brugere og busser og nulstille testdata.
- Virker på mobil og i mørk tilstand.

- Data fra v7 i browseren flyttes automatisk over.


## Nyt i V9 – Firebase
- Appen gemmer nu i skolens Firebase-projekt (REC Busplan), så alle ser de samme ture live.
- Login med skole-e-mail og adgangskode. Første gang opretter man selv sin adgangskode og bekræfter e-mailen.
- Kun personer, som admin har oprettet under **Brugere og busser**, får adgang.
- Adgangsregler i `firestore.rules`: lærere ser egne ture, chauffører egne kørsler, admin alt.
- Opsætning: se **`OPSÆTNING.md`**.

### Filer
| Fil | Hvad |
|---|---|
| `index.html` | Sidens opbygning |
| `app.js` | Al logik og alle visninger |
| `style.css` | Design |
| `firebase-config.js` | Forbindelsen til Firebase-projektet |
| `firebase.js` | Login og database (Firebase) |
| `firestore.rules` | Adgangsregler – indsættes i Firebase |
| `OPSÆTNING.md` | Trin-for-trin opsætning |
