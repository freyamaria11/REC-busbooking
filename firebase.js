/* =====================================================================
   Kobling til Firebase (login + Firestore-database).
   Indlæses kun når firebase-config.js er udfyldt. Selve appen ligger i app.js.
   ===================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, query, where, orderBy, limit, writeBatch
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const App = window.Busbooking;
const config = window.BUSBOOKING_FIREBASE;

const fbApp = initializeApp(config);
const auth = getAuth(fbApp);
auth.languageCode = "da";
const db = getFirestore(fbApp);

// Firestore kan ikke gemme `undefined`, så data renses før de sendes.
const clean = obj => JSON.parse(JSON.stringify(obj));
const withId = d => ({ ...d.data(), id: d.id });

let listeners = [];          // aktive realtime-lyttere
let roleListeners = [];      // lyttere der afhænger af rollen
let startedRole = null;

function stop(list) { list.forEach(unsub => unsub()); list.length = 0; }
function stopAll() { stop(roleListeners); stop(listeners); startedRole = null; }

function onError(err) {
  console.error(err);
  if (err.code === "permission-denied") {
    const u = auth.currentUser;
    App.setAuth({ screen: "noaccess", email: u ? u.email : "" });
  } else {
    App.setAuth({ screen: "error", message: "Kunne ikke hente data: " + (err.message || err.code) });
  }
}

/* Henter de ture, brugeren må se – afhængigt af rollen. */
function startRole(profile, email) {
  stop(roleListeners);
  startedRole = roleKey(profile);
  const trips = collection(db, "trips");
  if (profile.role === "admin") {
    roleListeners.push(onSnapshot(trips, snap => App.setData({ trips: snap.docs.map(withId) }), onError));
    roleListeners.push(onSnapshot(query(collection(db, "logs"), orderBy("time", "desc"), limit(200)),
      snap => App.setData({ logs: snap.docs.map(d => d.data()) }), onError));
    return;
  }
  // Lærer: egne ture. Chauffør (eller lærer der også kører): godkendte ture, hvor man kører.
  const parts = {};
  const merge = () => {
    const map = new Map();
    Object.values(parts).flat().forEach(t => map.set(t.id, t));
    App.setData({ trips: [...map.values()] });
  };
  const listen = (key, q) => roleListeners.push(onSnapshot(q, snap => { parts[key] = snap.docs.map(withId); merge(); }, onError));
  if (profile.role === "teacher") listen("own", query(trips, where("createdBy", "==", email)));
  if (profile.role === "driver" || profile.canDrive) {
    listen("out", query(trips, where("status", "==", "approved"), where("outDriver", "==", email)));
    listen("ret", query(trips, where("status", "==", "approved"), where("returnDriver", "==", email)));
  }
}
const roleKey = p => p.role + (p.canDrive ? "+kører" : "");

function handleUser(user) {
  stopAll();
  App.setData({ users: [], buses: [], trips: [], logs: [] });
  if (!user) { App.setMe(null); App.setAuth({ screen: "signin" }); return; }
  const email = (user.email || "").toLowerCase();
  if (!user.emailVerified) { App.setMe(null); App.setAuth({ screen: "verify", email }); return; }

  App.setAuth({ screen: "loading", message: "Henter dine oplysninger…" });
  listeners.push(onSnapshot(collection(db, "users"), snap => {
    const users = snap.docs.map(withId);
    const profile = users.find(u => u.id === email && u.active !== false);
    App.setData({ users });
    if (!profile) { stop(roleListeners); App.setMe(null); App.setAuth({ screen: "noaccess", email }); return; }
    if (startedRole !== roleKey(profile)) startRole(profile, email);
    App.setMe(profile);
  }, onError));
  listeners.push(onSnapshot(collection(db, "buses"), snap => App.setData({ buses: snap.docs.map(withId) }), onError));
}

App.useBackend({
  mode: "firebase",
  signIn: (email, password) => signInWithEmailAndPassword(auth, email, password),
  async register(email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await sendEmailVerification(cred.user);
  },
  resetPassword: email => sendPasswordResetEmail(auth, email),
  resendVerification: () => sendEmailVerification(auth.currentUser),
  async reloadUser() {
    const u = auth.currentUser;
    if (!u) return false;
    await u.reload();
    if (!u.emailVerified) return false;
    await u.getIdToken(true);      // nyt login-token, så databasen kan se at e-mailen er bekræftet
    handleUser(u);
    return true;
  },
  signOut: () => signOut(auth),

  /* Gemmer alle ændringer fra én handling samlet (enten lykkes alt, eller intet). */
  flush(ch) {
    const me = App.me();
    const batch = writeBatch(db);
    ch.trips.forEach(t => batch.set(doc(db, "trips", t.id), clean(t)));
    ch.users.forEach(u => batch.set(doc(db, "users", u.id), clean(u)));
    ch.buses.forEach(b => batch.set(doc(db, "buses", b.id), clean(b)));
    ch.deletedUsers.forEach(id => batch.delete(doc(db, "users", id)));
    ch.logs.forEach(l => batch.set(doc(collection(db, "logs")), clean({ ...l, byEmail: me ? me.id : "" })));
    return batch.commit();
  }
});

onAuthStateChanged(auth, handleUser);
