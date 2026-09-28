/* =====================================================================
   Forbindelse til skolens Firebase-projekt (REC Busplan).

   Værdierne er ikke hemmelige – de skal ligge i appen. Data beskyttes af
   adgangsreglerne i firestore.rules.

   Hvis login fejler med "apiKey er forkert": kopiér blokken igen fra
   Firebase → Project settings (tandhjulet) → General → Your apps →
   "SDK setup and configuration" → Config, og indsæt værdierne herunder.

   Slet eller udkommentér hele blokken for at køre testversionen med
   eksempeldata i browseren i stedet.
   ===================================================================== */
window.BUSBOOKING_FIREBASE = {
  apiKey: "AIzaSyA9-F6tt9Qq7xhUWoe1-RYzpWT4OmEFwbk",
  authDomain: "rec-busplan.firebaseapp.com",
  projectId: "rec-busplan",
  storageBucket: "rec-busplan.firebasestorage.app",
  messagingSenderId: "716384077716",
  appId: "1:716384077716:web:44cd8383628a4cafde3181"
};
