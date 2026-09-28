# Opsætning af Busbooking med Firebase

Denne vejledning tager dig fra et tomt Firebase-projekt til en app, hvor lærere, chauffører og administratorer deler de samme ture.

Du skal have gjort dette først:
- Oprettet projektet **REC Busplan** i Firebase ✔
- Oprettet Firestore-databasen ✔
- Slået login med **Email/Password** til under Authentication, og tilføjet `127.0.0.1` under Authorized domains

---

## 1. Indsæt adgangsreglerne (2 min.)

Reglerne bestemmer, hvem der må se og ændre hvad. Uden dem kan ingen bruge databasen.

1. Gå til Firebase → **Firestore** → fanen **Rules**.
2. Markér alt, der står i feltet, og slet det.
3. Åbn filen `firestore.rules` i VS Code, markér alt (`Cmd + A`) og kopiér (`Cmd + C`).
4. Indsæt det i Firebase (`Cmd + V`) og klik **Publish**.

## 2. Opret dig selv som administrator (2 min.)

Den første administrator skal oprettes direkte i databasen. Resten af brugerne opretter du bagefter inde i appen.

1. Gå til Firebase → **Firestore** → fanen **Data**.
2. Klik **+ Start collection**.
3. Skriv `users` under **Collection ID** og klik **Next**.
4. Skriv **din e-mail med små bogstaver** under **Document ID**, fx `lise@skole.dk`.
5. Tilføj fire felter. Klik **Add field** for hvert nyt felt:

   | Field  | Type    | Value              |
   |--------|---------|--------------------|
   | name   | string  | Dit navn           |
   | email  | string  | din e-mail         |
   | role   | string  | admin              |
   | active | boolean | true               |

6. Klik **Save**.

## 3. Start appen og log ind første gang

1. Åbn mappen i VS Code, højreklik på `index.html` og vælg **Open with Live Server**.
   Appen skal åbnes via en webadresse (fx `http://127.0.0.1:5500`). Dobbeltklikker du bare på filen, virker login ikke.
2. Klik **Første gang? Opret adgangskode**.
3. Skriv din e-mail (den samme som i trin 2) og vælg en adgangskode.
4. Åbn mailen fra Firebase og klik på linket. Kig i spam, hvis den ikke dukker op.
5. Gå tilbage til appen og klik **Jeg har bekræftet min e-mail**.

Nu står du i administrationen.

## 4. Læg busser og brugere ind

1. Gå til fanen **Brugere og busser**.
2. Klik **Tilføj Bus 1–4 som udgangspunkt**, og ret navne og pladser, så de passer til skolens rigtige busser.
3. Klik **+ Tilføj bruger** for hver lærer og chauffør. Brug deres rigtige skole-e-mail.
4. Sig til kollegerne, at de skal åbne appen, klikke **Første gang? Opret adgangskode** og bruge deres skole-e-mail.

## Hvis noget driller

| Besked | Løsning |
|---|---|
| "apiKey i firebase-config.js er forkert" | Kopiér konfigurationen igen: Firebase → tandhjulet → **Project settings** → **Your apps** → **Config**. Indsæt værdierne i `firebase-config.js`. |
| "Denne adresse er ikke godkendt i Firebase" | Tilføj adressen under Authentication → Settings → Authorized domains. |
| "Du har ikke adgang endnu" | E-mailen findes ikke under `users` i databasen, eller den er skrevet med store bogstaver. Tjek Document ID. |
| "Du har ikke adgang til at gøre det" | Reglerne fra trin 1 er ikke publiceret, eller brugeren har ikke den rigtige rolle. |
| Hænger på "Forbinder…" | Appen er åbnet som fil og ikke via Live Server, eller der er ingen internetforbindelse. |

## Næste skridt: læg appen online

Indtil videre kører appen kun på din egen computer. Næste skridt er at lægge den på **Firebase Hosting**, så alle kan bruge den på fx `https://rec-busplan.web.app`. Det er gratis, og det kræver et par kommandoer i VS Code's terminal. Spørg Claude, når du er klar.

## Testversion uden database

Hvis du vil vise appen frem uden at røre de rigtige data, så sæt `//` foran linjerne i `firebase-config.js`. Så kører appen med eksempeldata, der kun gemmes i browseren.
