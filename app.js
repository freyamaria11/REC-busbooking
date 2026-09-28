"use strict";
/* =====================================================================
   Efterskole Busbooking – v8
   Opbygning:
     1. Datalag (Store)      – det eneste sted der læses/gemmes data.
                               Skiftes ud med Supabase-kald i næste fase.
     2. Hjælpefunktioner     – datoer, tekst, escaping
     3. Forretningsregler    – konflikter, kapacitet, status
     4. Handlinger           – opret, ændr, godkend, tildel …
     5. Visninger            – lærer, administrator, chauffør
     6. Dialoger og beskeder
     7. Opstart og hændelser
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. Datalag
   --------------------------------------------------------------------- */
const STORAGE_KEY = "busbooking.v8";
const SESSION_KEY = "busbooking.v8.session";

const Store = {
  load() {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {}
  },
  loadLegacy() {
    try {
      const t = localStorage.getItem("busTripsV2");
      if (!t) return null;
      return {
        trips: JSON.parse(t) || [],
        logs: JSON.parse(localStorage.getItem("busLogsV2") || "[]"),
        users: JSON.parse(localStorage.getItem("busUsersV5") || "null")
      };
    } catch (e) { return null; }
  },
  getSession() { try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; } },
  setSession(id) { try { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); } catch (e) {} }
};

/* Statuskoder er de samme som i databasen (supabase_schema.sql). */
const STATUS = {
  pending:   { label: "Afventer",            cls: "st-pending" },
  changed:   { label: "Ændret – afventer",   cls: "st-changed" },
  approved:  { label: "Godkendt",            cls: "st-approved" },
  rejected:  { label: "Afvist",              cls: "st-rejected" },
  cancelled: { label: "Annulleret",          cls: "st-cancelled" }
};
const ROLE = { teacher: "Lærer", admin: "Administrator", driver: "Chauffør" };
const SLOT_MINUTES = 60;          // en kørsel reserverer bus og chauffør i 60 minutter
const MAX_REPEAT_WEEKS = 26;

let state = null;                 // { users, buses, trips, logs }
let me = null;                    // indlogget bruger
const ui = {                      // visningstilstand (gemmes ikke)
  adminTab: "trips", adminFilter: "upcoming", search: "", weekStart: null, teacherTab: "trips"
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function seedData() {
  const d = n => iso(addDays(today(), n));
  const users = [
    { id: "u-admin",  name: "Lise Bang",     email: "busadmin@skole.dk",  role: "admin",   active: true, canDrive: true },
    { id: "u-mette",  name: "Mette Holm",    email: "mh@skole.dk",        role: "teacher", active: true },
    { id: "u-jonas",  name: "Jonas Kjær",    email: "jk@skole.dk",        role: "teacher", active: true },
    { id: "u-chr",    name: "Christian",     email: "christian@skole.dk", role: "driver",  active: true },
    { id: "u-peter",  name: "Peter",         email: "peter@skole.dk",     role: "driver",  active: true },
    { id: "u-morten", name: "Morten",        email: "morten@skole.dk",    role: "driver",  active: true },
    { id: "u-anne",   name: "Anne",          email: "anne@skole.dk",      role: "driver",  active: true }
  ];
  const buses = [
    { id: "b1", name: "Bus 1", capacity: 20, active: true },
    { id: "b2", name: "Bus 2", capacity: 30, active: true },
    { id: "b3", name: "Bus 3", capacity: 50, active: true },
    { id: "b4", name: "Bus 4", capacity: 60, active: true }
  ];
  const base = { seriesId: null, note: "", statusNote: "", outBus: "", returnBus: "", outDriver: "", returnDriver: "" };
  const series = "s-svom";
  const trips = [
    { ...base, id: "t1", destination: "Viborg Domkirke", date: d(0), passengers: 18, outTime: "09:00", returnTime: "12:30",
      status: "approved", createdBy: "u-jonas", outBus: "b1", returnBus: "b1", outDriver: "u-morten", returnDriver: "u-morten",
      note: "Afgang fra p-pladsen ved hallen." },
    { ...base, id: "t2", destination: "Legoland", date: d(1), passengers: 45, outTime: "08:00", returnTime: "16:00",
      status: "approved", createdBy: "u-jonas", outBus: "b3", returnBus: "b3", outDriver: "u-chr" },
    ...[2, 9, 16].map((n, i) => ({ ...base, id: "t-sv" + i, seriesId: series, destination: "Svømning, Hobro Svømmehal",
      date: d(n), passengers: 22, outTime: "13:00", returnTime: "15:00", status: "approved", createdBy: "u-mette",
      outBus: "b2", returnBus: "b2", outDriver: "u-peter", returnDriver: i === 2 ? "u-admin" : "u-peter" })),
    { ...base, id: "t3", destination: "Aalborg Zoo", date: d(6), passengers: 28, outTime: "08:15", returnTime: "15:30",
      status: "pending", createdBy: "u-mette", note: "Kontaktgruppe 4. Afhentning ved hovedindgangen." },
    { ...base, id: "t4", destination: "Skagen – Grenen", date: d(10), passengers: 55, outTime: "07:00", returnTime: "17:30",
      status: "changed", createdBy: "u-jonas", outBus: "b4", returnBus: "b4", outDriver: "u-anne", returnDriver: "u-morten",
      statusNote: "Jonas Kjær ændrede afgang fra 07:30 til 07:00." },
    { ...base, id: "t5", destination: "Aarhus Teater", date: d(4), passengers: 30, outTime: "18:00", returnTime: "22:30",
      status: "rejected", createdBy: "u-mette", statusNote: "Afvist: Ingen chauffører ledige om aftenen den dag." },
    { ...base, id: "t6", destination: "Rebild Bakker", date: d(-5), passengers: 40, outTime: "09:00", returnTime: "14:00",
      status: "approved", createdBy: "u-mette", outBus: "b3", returnBus: "b3", outDriver: "u-anne", returnDriver: "u-anne" }
  ];
  const now = Date.now();
  const logs = [
    { time: new Date(now - 36e5 * 2).toISOString(), by: "Jonas Kjær", text: "ændrede turen til Skagen – Grenen: afgang 07:30 → 07:00." },
    { time: new Date(now - 36e5 * 5).toISOString(), by: "Mette Holm", text: "bestilte bus til Aalborg Zoo." },
    { time: new Date(now - 36e5 * 26).toISOString(), by: "Lise Bang", text: "afviste turen til Aarhus Teater." }
  ];
  return { users, buses, trips, logs, demo: true };
}

/* Flytter data fra v7 (localStorage) over i det nye format. */
function migrateLegacy(old) {
  const s = seedData();
  s.trips = []; s.logs = []; s.demo = false;
  if (Array.isArray(old.users) && old.users.length) {
    s.users = old.users.map(u => ({ id: "u" + u.id, name: u.name, email: u.email || "", role: u.role, active: true }));
  }
  const driverId = name => (s.users.find(u => u.role === "driver" && u.name === name) || {}).id || "";
  const busId = name => (s.buses.find(b => b.name === name) || {}).id || "";
  const statusMap = { "Afventer": "pending", "Godkendt": "approved", "Afvist": "rejected", "Annulleret": "cancelled", "Ændret – afventer admin": "changed" };
  s.trips = old.trips.map(t => ({
    id: "t" + t.id, seriesId: t.seriesId ? "s" + t.seriesId : null, destination: t.destination, date: t.date,
    passengers: +t.passengers || 1, outTime: t.outTime, returnTime: t.returnTime,
    status: statusMap[t.status] || "pending", statusNote: t.updatedAt && t.updatedAt !== "Ny anmodning" ? t.updatedAt : "",
    outBus: busId(t.outBus ?? t.bus), returnBus: busId(t.returnBus ?? t.bus),
    outDriver: driverId(t.outDriver), returnDriver: driverId(t.returnDriver),
    note: t.note || "", createdBy: t.createdBy === "Administrator" ? (s.users.find(u => u.role === "admin") || {}).id : null
  }));
  s.logs = (old.logs || []).map(l => ({ time: null, timeText: l.time, by: "", text: l.text }));
  return s;
}

function loadState() {
  state = Store.load();
  if (!state) {
    const legacy = Store.loadLegacy();
    state = legacy ? migrateLegacy(legacy) : seedData();
    persist();
  }
}
function persist() { Store.save(state); }

/* ---------------------------------------------------------------------
   2. Hjælpefunktioner
   --------------------------------------------------------------------- */
const $ = sel => document.querySelector(sel);
const pad = n => String(n).padStart(2, "0");
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function daysFromToday(s) { return Math.round((parseDate(s) - today()) / 864e5); }
function todayIso() { return iso(today()); }
function toMin(t) { const [h, m] = (t || "00:00").split(":").map(Number); return h * 60 + m; }
function mondayOf(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t - y0) / 864e5 + 1) / 7);
}
const DOW = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const DOW_FULL = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const MON = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function relDay(s) {
  const n = daysFromToday(s);
  if (n === 0) return "I dag";
  if (n === 1) return "I morgen";
  if (n === -1) return "I går";
  if (n > 1 && n < 7) return "Om " + n + " dage";
  return "";
}
function longDate(s) { const d = parseDate(s); return DOW[d.getDay()] + ". " + d.getDate() + ". " + MON[d.getMonth()]; }
function fmtStamp(l) {
  if (!l.time) return l.timeText || "";
  const d = new Date(l.time);
  return d.getDate() + ". " + MON[d.getMonth()] + " kl. " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

const userById = id => state.users.find(u => u.id === id);
const busById = id => state.buses.find(b => b.id === id);
const tripById = id => state.trips.find(t => t.id === id);
const canDrive = u => !!u && (u.role === "driver" || !!u.canDrive);   // chauffører + admin/lærere der også kører bus
const drivers = () => state.users.filter(u => u.active !== false && canDrive(u));
function roleLabel(u) { return ROLE[u.role] + (u.role !== "driver" && u.canDrive ? " · chauffør" : ""); }
const userName = id => (userById(id) || {}).name || "";
const busName = id => (busById(id) || {}).name || "";

/* ---------------------------------------------------------------------
   3. Forretningsregler
   --------------------------------------------------------------------- */
const isActive = t => t.status !== "cancelled" && t.status !== "rejected";
const isOpen = t => t.status === "pending" || t.status === "changed";
const isPast = t => t.date < todayIso();
const LEGS = [
  { key: "out", label: "Udtur",   time: "outTime",    bus: "outBus",    driver: "outDriver" },
  { key: "ret", label: "Hjemtur", time: "returnTime", bus: "returnBus", driver: "returnDriver" }
];
const legOf = key => LEGS.find(l => l.key === key);
function missingDriver(t) { return !t.outDriver || !t.returnDriver; }
function needsDriverSoon(t) {
  const n = daysFromToday(t.date);
  return t.status === "approved" && n >= 0 && n <= 2 && missingDriver(t);
}

/* Returnerer en kort forklaring, hvis bus/chauffør `id` ikke kan bruges på kørselsbenet – ellers null. */
function blocker(trip, legKey, kind, id) {
  if (!id) return null;
  const leg = legOf(legKey);
  const time = trip[leg.time];
  if (kind === "bus") {
    const b = busById(id);
    if (b && +trip.passengers > b.capacity) return "for lille (" + b.capacity + " pl.)";
  }
  // Sammenlign med alle andre ture – og med turens eget andet kørselsben.
  // `trip` kan være en kladde eller en ikke-gemt ændring, så den bruges i stedet for den gemte udgave.
  const pool = state.trips.filter(x => x.id !== trip.id).concat([trip]);
  for (const x of pool) {
    if (!isActive(x) || x.date !== trip.date) continue;
    for (const l of LEGS) {
      if (x === trip && l.key === legKey) continue;
      if (x[kind === "bus" ? l.bus : l.driver] !== id) continue;
      const a = toMin(time), b = toMin(x[l.time]);
      if (a < b + SLOT_MINUTES && b < a + SLOT_MINUTES) {
        return x === trip
          ? "bruges på " + l.label.toLowerCase() + " kl. " + x[l.time]
          : "optaget kl. " + x[l.time] + " (" + x.destination + ")";
      }
    }
  }
  return null;
}
function tripConflicts(t) {
  if (!isActive(t)) return [];
  const out = [];
  for (const l of LEGS) {
    const b = blocker(t, l.key, "bus", t[l.bus]);
    if (b) out.push(l.label + ": " + busName(t[l.bus]) + " er " + b + ".");
    const d = blocker(t, l.key, "driver", t[l.driver]);
    if (d) out.push(l.label + ": " + userName(t[l.driver]) + " er " + d + ".");
  }
  return out;
}

/* Tekst til læreren om, hvor turen står. */
function statusExplain(t) {
  if (t.status === "pending") return "Venter på at busadministratoren godkender turen.";
  if (t.status === "changed") return "Ændringen venter på at busadministratoren godkender den.";
  if (t.status === "approved") {
    if (isPast(t)) return "Turen er gennemført.";
    if (!t.outBus || !t.returnBus) return "Godkendt. Bus bliver tildelt senere.";
    if (missingDriver(t)) return "Godkendt. Chauffør bliver tildelt senere.";
    return "Alt er på plads.";
  }
  if (t.status === "rejected") return "Turen blev afvist.";
  return "Turen er annulleret.";
}
function statusPill(t) {
  const s = STATUS[t.status];
  let html = '<span class="pill ' + s.cls + '">' + s.label + "</span>";
  if (t.status === "approved" && !isPast(t) && missingDriver(t)) html += ' <span class="pill st-missing">Mangler chauffør</span>';
  return html;
}

/* ---------------------------------------------------------------------
   4. Handlinger
   --------------------------------------------------------------------- */
/* Ændringer samles her og gemmes samlet af commit() – i browseren (testversion) eller i Firebase. */
const dirty = { trips: new Set(), users: new Set(), buses: new Set(), deletedUsers: new Set(), logs: [] };
function touch(kind, obj) { if (obj) dirty[kind].add(obj.id); return obj; }

function log(text, tripId) {
  const entry = { time: new Date().toISOString(), by: me ? me.name : "", text, tripId: tripId || null };
  state.logs.unshift(entry);
  if (state.logs.length > 500) state.logs.length = 500;
  dirty.logs.push(entry);
}
function commit(msg) {
  const changes = {
    trips: [...dirty.trips].map(tripById).filter(Boolean),
    users: [...dirty.users].map(userById).filter(Boolean),
    buses: [...dirty.buses].map(busById).filter(Boolean),
    deletedUsers: [...dirty.deletedUsers],
    logs: dirty.logs.splice(0)
  };
  dirty.trips.clear(); dirty.users.clear(); dirty.buses.clear(); dirty.deletedUsers.clear();
  render();
  Promise.resolve(Backend.flush(changes))
    .then(() => { if (msg) toast(msg); })
    .catch(err => { console.error(err); toast("Kunne ikke gemme: " + friendlyError(err), "bad"); });
}

/* Testversion: alt gemmes i browseren. Firebase-versionen erstatter Backend (se firebase.js). */
const DemoBackend = { mode: "demo", flush() { persist(); } };
let Backend = DemoBackend;

function friendlyError(err) {
  const code = (err && err.code) || "";
  const map = {
    "permission-denied": "Du har ikke adgang til at gøre det.",
    "unavailable": "Ingen forbindelse til databasen. Tjek internettet.",
    "auth/invalid-credential": "Forkert e-mail eller adgangskode.",
    "auth/wrong-password": "Forkert e-mail eller adgangskode.",
    "auth/user-not-found": "Forkert e-mail eller adgangskode.",
    "auth/invalid-email": "E-mailadressen ser forkert ud.",
    "auth/email-already-in-use": "Der findes allerede en konto med den e-mail. Log ind, eller brug \"Glemt adgangskode\".",
    "auth/weak-password": "Adgangskoden skal være mindst 6 tegn.",
    "auth/too-many-requests": "For mange forsøg. Vent et par minutter og prøv igen.",
    "auth/network-request-failed": "Ingen forbindelse. Tjek internettet.",
    "auth/missing-password": "Skriv din adgangskode.",
    "auth/unauthorized-domain": "Denne adresse er ikke godkendt i Firebase (Authentication → Settings → Authorized domains).",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "apiKey i firebase-config.js er forkert. Kopiér den igen fra Firebase."
  };
  return map[code] || (err && err.message) || "Ukendt fejl.";
}

function datesForRepeat(start, until) {
  const out = [];
  let d = parseDate(start);
  const end = parseDate(until);
  while (d <= end && out.length < MAX_REPEAT_WEEKS + 1) { out.push(iso(d)); d = addDays(d, 7); }
  return out;
}

function createTrips(draft, repeatUntil) {
  const isAdmin = me.role === "admin";
  const dates = repeatUntil ? datesForRepeat(draft.date, repeatUntil) : [draft.date];
  const seriesId = dates.length > 1 ? "s-" + uid() : null;
  const created = dates.map(date => ({
    id: "t-" + uid(), seriesId, destination: draft.destination, date, passengers: draft.passengers,
    outTime: draft.outTime, returnTime: draft.returnTime, note: draft.note, statusNote: "",
    status: isAdmin ? "approved" : "pending", createdBy: me.id,
    outBus: isAdmin ? draft.outBus : "", returnBus: isAdmin ? draft.returnBus : "",
    outDriver: isAdmin ? draft.outDriver : "", returnDriver: isAdmin ? draft.returnDriver : ""
  }));
  // Ved gentagne admin-ture: fjern ressourcer, der er optaget på enkelte datoer.
  let skipped = 0;
  for (const t of created) {
    state.trips.push(t);
    touch("trips", t);
    for (const l of LEGS) for (const kind of ["bus", "driver"]) {
      const f = kind === "bus" ? l.bus : l.driver;
      if (t[f] && blocker(t, l.key, kind, t[f])) { t[f] = ""; skipped++; }
    }
  }
  const what = created.length > 1 ? created.length + " ugentlige ture" : "en tur";
  if (isAdmin) log("oprettede " + what + " til " + draft.destination + " (" + longDate(draft.date) + ").", created[0].id);
  else log("bestilte bus til " + draft.destination + (created.length > 1 ? " (" + created.length + " ugentlige ture)" : "") + ".", created[0].id);
  commit(isAdmin
    ? (created.length > 1 ? what + " oprettet" : "Turen er oprettet") + (skipped ? ". Nogle datoer mangler bus eller chauffør pga. konflikter." : ".")
    : "Anmodningen er sendt til busadministratoren.");
  return created[0];
}

function describeChanges(t, patch) {
  const names = { destination: "destination", date: "dato", passengers: "antal", outTime: "afgang", returnTime: "hjemkørsel", note: "bemærkning" };
  const parts = [];
  for (const k of Object.keys(names)) {
    if (patch[k] === undefined || String(patch[k]) === String(t[k])) continue;
    if (k === "note") parts.push("bemærkning opdateret");
    else if (k === "date") parts.push("dato " + longDate(t.date) + " → " + longDate(patch.date));
    else parts.push(names[k] + " " + t[k] + " → " + patch[k]);
  }
  return parts;
}

function updateTrip(id, patch) {
  const t = tripById(id);
  const parts = describeChanges(t, patch);
  if (!parts.length) { toast("Ingen ændringer at gemme."); return; }
  if (me.role === "admin") {
    const trial = { ...t, ...patch };
    const c = tripConflicts(trial);
    if (c.length) { toast("Kan ikke gemme: " + c[0], "bad"); return false; }
    Object.assign(t, patch);
    touch("trips", t);
    log("ændrede turen til " + t.destination + ": " + parts.join(", ") + ".", t.id);
    commit("Ændringerne er gemt.");
  } else {
    const wasApproved = t.status === "approved";
    Object.assign(t, patch);
    touch("trips", t);
    if (wasApproved || t.status === "changed") {
      t.status = "changed";
      t.statusNote = me.name + " ændrede: " + parts.join(", ") + ".";
    }
    log("ændrede turen til " + t.destination + ": " + parts.join(", ") + ".", t.id);
    commit(wasApproved ? "Ændringen er sendt til godkendelse." : "Ændringerne er gemt.");
  }
  return true;
}

function assign(id, field, value) {
  const t = tripById(id);
  const leg = LEGS.find(l => l.bus === field || l.driver === field);
  const kind = leg.bus === field ? "bus" : "driver";
  const why = blocker(t, leg.key, kind, value);
  if (why) { toast((kind === "bus" ? busName(value) : userName(value)) + " er " + why + ".", "bad"); render(); return; }
  t[field] = value;
  touch("trips", t);
  const name = kind === "bus" ? busName(value) : userName(value);
  log((value ? "satte " + name + " på " : "fjernede " + (kind === "bus" ? "bus" : "chauffør") + " fra ") +
      leg.label.toLowerCase() + " til " + t.destination + " (" + longDate(t.date) + ").", t.id);
  commit();
}

function approve(id) {
  const t = tripById(id);
  const c = tripConflicts(t);
  if (c.length) { toast("Løs konflikten først: " + c[0], "bad"); return; }
  t.status = "approved";
  t.statusNote = "";
  touch("trips", t);
  log("godkendte turen til " + t.destination + " (" + longDate(t.date) + ")" + (missingDriver(t) ? " – chauffør mangler stadig" : "") + ".", t.id);
  commit(missingDriver(t) ? "Turen er godkendt. Husk at tildele chauffør." : "Turen er godkendt.");
}

function reject(id, reason) {
  const t = tripById(id);
  t.status = "rejected";
  touch("trips", t);
  t.statusNote = reason ? "Afvist: " + reason : "";
  log("afviste turen til " + t.destination + " (" + longDate(t.date) + ")" + (reason ? ": " + reason : "") + ".", t.id);
  commit("Turen er afvist.");
}

function cancelTrip(id) {
  const t = tripById(id);
  t.status = "cancelled";
  touch("trips", t);
  t.statusNote = me.role === "admin" ? "Annulleret af busadministratoren." : "Annulleret af " + me.name + ".";
  log("annullerede turen til " + t.destination + " (" + longDate(t.date) + ").", t.id);
  commit("Turen er annulleret. Bus og chauffør er frigivet.");
}

function applySeries(id) {
  const src = tripById(id);
  const targets = state.trips.filter(x => x.seriesId === src.seriesId && x.id !== src.id && isActive(x) && !isPast(x));
  let ok = 0; const problems = [];
  for (const t of targets) {
    for (const l of LEGS) for (const kind of ["bus", "driver"]) {
      const f = kind === "bus" ? l.bus : l.driver;
      const val = src[f];
      if (!val) continue;
      const trial = { ...t, [f]: val };
      const why = blocker(trial, l.key, kind, val);
      if (why) problems.push(longDate(t.date) + ": " + (kind === "bus" ? busName(val) : userName(val)) + " er " + why);
      else { t[f] = val; touch("trips", t); }
    }
    ok++;
  }
  log("kopierede bus og chauffører fra " + longDate(src.date) + " til " + ok + " ture i serien " + src.destination + ".", src.id);
  commit();
  if (problems.length) {
    openModal({
      title: "Serien er delvist opdateret",
      body: "<p>Følgende kunne ikke kopieres, fordi bussen eller chaufføren ikke er ledig:</p><ul>" +
            problems.map(p => "<li>" + esc(p) + "</li>").join("") + "</ul>",
      actions: [{ label: "OK", primary: true }]
    });
  } else toast("Bus og chauffører er kopieret til " + ok + " ture i serien.");
}

/* Brugere og busser */
function saveUser(data, id) {
  if (id) {
    const u = userById(id);
    const couldDrive = canDrive(u);
    Object.assign(u, data);
    touch("users", u);
    if (couldDrive && !canDrive(u)) clearDriver(u.id);
    log("opdaterede brugeren " + u.name + " (" + roleLabel(u) + ").");
    commit("Brugeren er gemt.");
  } else {
    const newId = Backend.mode === "firebase" ? data.email.toLowerCase() : "u-" + uid();
    state.users.push(touch("users", { id: newId, active: true, ...data }));
    log("oprettede brugeren " + data.name + " (" + roleLabel(data) + ").");
    commit(data.name + " er oprettet.");
  }
}
function clearDriver(userId) {
  let n = 0;
  for (const t of state.trips) {
    if (isPast(t)) continue;
    for (const l of LEGS) if (t[l.driver] === userId) { t[l.driver] = ""; touch("trips", t); n++; }
  }
  return n;
}
function removeUser(id) {
  const u = userById(id);
  const n = clearDriver(id);
  state.users = state.users.filter(x => x.id !== id);
  dirty.deletedUsers.add(id);
  log("fjernede brugeren " + u.name + (n ? " og fjernede " + n + " kommende kørsler fra planen" : "") + ".");
  commit(u.name + " er fjernet." + (n ? " " + n + " kørsler mangler nu chauffør." : ""));
}
function saveBus(data, id) {
  if (id) { touch("buses", Object.assign(busById(id), data)); log("opdaterede " + data.name + " (" + data.capacity + " pladser)."); }
  else { state.buses.push(touch("buses", { id: "b-" + uid(), active: true, ...data })); log("tilføjede " + data.name + " (" + data.capacity + " pladser)."); }
  commit("Bussen er gemt.");
}
function upcomingUsesOfBus(id) {
  return state.trips.filter(t => isActive(t) && !isPast(t) && (t.outBus === id || t.returnBus === id)).length;
}

/* ---------------------------------------------------------------------
   5. Visninger
   --------------------------------------------------------------------- */
function render() {
  if (Backend.mode === "firebase" && me) me = userById(me.id) || me;   // rolle/navn kan ændres af admin
  if (!me) return renderLogin();
  $("#loginScreen").hidden = true;
  $("#appShell").hidden = false;
  $("#userName").textContent = me.name;
  $("#userRole").textContent = roleLabel(me);
  const view = $("#view");
  const active = document.activeElement;
  const keepSearch = active && active.id === "tripSearch" ? active.selectionStart : null;
  if (me.role === "teacher") view.innerHTML = teacherView();
  else if (me.role === "admin") view.innerHTML = adminView();
  else view.innerHTML = driverView();
  if (keepSearch !== null) { const box = $("#tripSearch"); if (box) { box.focus(); box.setSelectionRange(keepSearch, keepSearch); } }
}

/* ---- Login ---- */
function renderLogin() {
  $("#appShell").hidden = true;
  const box = $("#loginScreen");
  box.hidden = false;
  if (Backend.mode === "firebase" || window.BUSBOOKING_FIREBASE) return renderAuth(box);
  const group = (role, title) => {
    const list = state.users.filter(u => u.role === role && u.active);
    if (!list.length) return "";
    return '<div class="login-group"><h2>' + title + '</h2><div class="login-users">' +
      list.map(u => '<button class="login-user" data-act="login" data-id="' + esc(u.id) + '"><b>' + esc(u.name) + "</b><span>" + esc(u.email || ROLE[u.role]) + "</span></button>").join("") +
      "</div></div>";
  };
  box.innerHTML =
    '<div class="login-card">' +
      '<span class="brand-mark" aria-hidden="true">' + $(".brand-mark").innerHTML + "</span>" +
      "<div><h1>Efterskole Busbooking</h1><p class=\"lede\">Vælg hvem du vil logge ind som.</p></div>" +
      '<p class="demo-note"><b>Testversion.</b> Data gemmes kun i denne browser, indtil systemet er koblet på databasen. Rigtigt login med e-mail kommer i samme omgang.</p>' +
      group("admin", "Busadministration") + group("teacher", "Lærere") + group("driver", "Chauffører") +
    "</div>";
}

/* ---- Login med e-mail og adgangskode (Firebase) ---- */
let authView = { screen: "loading" };   // loading | signin | register | reset | verify | noaccess | error
function brandBlock(sub) {
  return '<span class="brand-mark" aria-hidden="true">' + $(".brand-mark").innerHTML + "</span>" +
         "<div><h1>Efterskole Busbooking</h1>" + (sub ? '<p class="lede">' + sub + "</p>" : "") + "</div>";
}
function renderAuth(box) {
  const a = authView;
  const msg = a.message ? '<p class="' + (a.bad ? "form-error" : "form-ok") + '" role="alert">' + esc(a.message) + "</p>" : "";
  const emailField = (id, val) => '<div class="field"><label for="' + id + '">E-mail</label><input id="' + id + '" name="email" type="email" autocomplete="username" value="' + esc(val || a.email || "") + '" required></div>';
  let html = "";
  if (a.screen === "loading") {
    html = brandBlock("Forbinder…") + '<p class="muted">' + esc(a.message || "Et øjeblik.") + "</p>";
  } else if (a.screen === "signin") {
    html = brandBlock("Log ind med din skole-e-mail.") + msg +
      '<form class="auth-form" data-form="signin" novalidate>' + emailField("a-email") +
      '<div class="field"><label for="a-pass">Adgangskode</label><input id="a-pass" name="password" type="password" autocomplete="current-password" required></div>' +
      '<button class="btn btn-primary" type="submit">Log ind</button></form>' +
      '<div class="auth-links"><button class="btn btn-ghost btn-sm" data-act="auth" data-screen="register">Første gang? Opret adgangskode</button>' +
      '<button class="btn btn-ghost btn-sm" data-act="auth" data-screen="reset">Glemt adgangskode?</button></div>';
  } else if (a.screen === "register") {
    html = brandBlock("Opret din adgangskode første gang.") +
      '<p class="muted">Brug den e-mail, som busadministratoren har oprettet dig med. Du får en mail, hvor du bekræfter, at det er din.</p>' + msg +
      '<form class="auth-form" data-form="register" novalidate>' + emailField("a-email") +
      '<div class="field"><label for="a-pass">Vælg adgangskode</label><input id="a-pass" name="password" type="password" autocomplete="new-password" minlength="6" required><span class="hint">Mindst 6 tegn</span></div>' +
      '<div class="field"><label for="a-pass2">Gentag adgangskode</label><input id="a-pass2" name="password2" type="password" autocomplete="new-password" required></div>' +
      '<button class="btn btn-primary" type="submit">Opret adgangskode</button></form>' +
      '<div class="auth-links"><button class="btn btn-ghost btn-sm" data-act="auth" data-screen="signin">← Tilbage til log ind</button></div>';
  } else if (a.screen === "reset") {
    html = brandBlock("Nulstil adgangskode.") +
      '<p class="muted">Skriv din e-mail, så sender vi et link, hvor du kan vælge en ny adgangskode.</p>' + msg +
      '<form class="auth-form" data-form="reset" novalidate>' + emailField("a-email") +
      '<button class="btn btn-primary" type="submit">Send link</button></form>' +
      '<div class="auth-links"><button class="btn btn-ghost btn-sm" data-act="auth" data-screen="signin">← Tilbage til log ind</button></div>';
  } else if (a.screen === "verify") {
    html = brandBlock("Bekræft din e-mail.") +
      "<p>Vi har sendt en mail til <b>" + esc(a.email) + "</b>. Klik på linket i mailen, og kom så tilbage hertil.</p>" +
      '<p class="muted">Kan du ikke finde mailen? Kig i spam-mappen.</p>' + msg +
      '<div class="auth-form"><button class="btn btn-primary" data-act="auth-verified">Jeg har bekræftet min e-mail</button>' +
      '<button class="btn" data-act="auth-resend">Send mailen igen</button></div>' +
      '<div class="auth-links"><button class="btn btn-ghost btn-sm" data-act="logout">Log ud</button></div>';
  } else if (a.screen === "noaccess") {
    html = brandBlock("Du har ikke adgang endnu.") +
      "<p><b>" + esc(a.email) + "</b> er ikke oprettet som bruger i busbookingen.</p>" +
      '<p class="muted">Bed busadministratoren om at tilføje dig under <i>Brugere og busser</i> med præcis denne e-mail. Log derefter ind igen.</p>' +
      '<div class="auth-links"><button class="btn" data-act="logout">Log ud</button></div>';
  } else {
    html = brandBlock("Der opstod en fejl.") + '<p class="form-error">' + esc(a.message || "Ukendt fejl.") + "</p>" +
      '<div class="auth-links"><button class="btn" data-act="reload">Prøv igen</button></div>';
  }
  box.innerHTML = '<div class="login-card">' + html + "</div>";
  const first = box.querySelector("input");
  if (first && !first.value) first.focus();
  else if (box.querySelector("#a-pass")) box.querySelector("#a-pass").focus();
}
function setAuthView(v) { authView = v; if (!me) render(); }

async function handleAuthForm(form) {
  const kind = form.dataset.form;
  const email = (form.email.value || "").trim().toLowerCase();
  const btn = form.querySelector("button[type=submit]");
  const fail = err => { btn.disabled = false; setAuthView({ ...authView, email, message: typeof err === "string" ? err : friendlyError(err), bad: true }); };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Skriv en gyldig e-mailadresse.");
  btn.disabled = true;
  try {
    if (kind === "signin") {
      await Backend.signIn(email, form.password.value);
    } else if (kind === "register") {
      if (form.password.value.length < 6) return fail("Adgangskoden skal være mindst 6 tegn.");
      if (form.password.value !== form.password2.value) return fail("De to adgangskoder er ikke ens.");
      await Backend.register(email, form.password.value);
    } else if (kind === "reset") {
      await Backend.resetPassword(email);
      setAuthView({ screen: "signin", email, message: "Hvis e-mailen findes, har vi sendt et link til " + email + ". Tjek også spam." });
    }
  } catch (err) { fail(err); }
}

/* ---- Fælles turkort ---- */
function dateChip(date) {
  const d = parseDate(date);
  const isToday = daysFromToday(date) === 0;
  return '<div class="datechip' + (isToday ? " today" : "") + '" aria-hidden="true"><span class="dow">' + DOW[d.getDay()] +
         '</span><span class="day">' + d.getDate() + '</span><span class="mon">' + MON[d.getMonth()] + "</span></div>";
}
function tripMeta(t, withCreator) {
  const rel = relDay(t.date);
  const parts = [];
  parts.push((rel ? '<span class="rel">' + rel + "</span> · " : "") + longDate(t.date));
  parts.push('<span class="time">' + esc(t.outTime) + " → " + esc(t.returnTime) + "</span>");
  parts.push(esc(t.passengers) + " personer");
  if (withCreator) parts.push("Bestilt af " + esc(userName(t.createdBy) || "ukendt"));
  if (t.seriesId) {
    const n = state.trips.filter(x => x.seriesId === t.seriesId).length;
    parts.push('<span class="series-tag">Ugentlig · ' + n + " ture</span>");
  }
  return '<p class="meta">' + parts.map(p => "<span>" + p + "</span>").join("") + "</p>";
}
function tripShell(t, inner) {
  const closed = !isActive(t) || isPast(t);
  return '<article class="trip' + (closed ? " is-closed" : "") + '" id="trip-' + esc(t.id) + '">' + dateChip(t.date) +
         '<div class="trip-main"><div class="trip-top"><h3>' + esc(t.destination) + "</h3><div>" + statusPill(t) + "</div></div>" +
         inner + "</div></article>";
}
function resourceSummary(t) {
  return '<div class="resources">' + LEGS.map(l => {
    const bus = t[l.bus] ? esc(busName(t[l.bus])) : '<span class="missing">Bus mangler</span>';
    const drv = t[l.driver] ? esc(userName(t[l.driver])) : '<span class="missing">Chauffør mangler</span>';
    return '<div class="res"><div class="res-label"><span>' + l.label + '</span><span class="time">' + esc(t[l.time]) +
           "</span></div>" + bus + " · " + drv + "</div>";
  }).join("") + "</div>";
}
function noteBlock(t) { return t.note ? '<div class="note"><b>Bemærkning</b>' + esc(t.note) + "</div>" : ""; }
function statusNoteBlock(t) {
  if (!t.statusNote) return "";
  return '<div class="notice' + (t.status === "rejected" ? " bad" : "") + '">' + esc(t.statusNote) + "</div>";
}

/* ---- Lærer ---- */
function teacherCard(t) {
  const editable = isActive(t) && !isPast(t);
  const showRes = t.status === "approved" || t.status === "changed";
  return tripShell(t,
    tripMeta(t) +
    '<p class="status-line">' + statusExplain(t) + "</p>" +
    statusNoteBlock(t) +
    (showRes ? resourceSummary(t) : "") +
    noteBlock(t) +
    (editable ? '<div class="actions"><button class="btn btn-danger btn-sm" data-act="cancel" data-id="' + esc(t.id) + '">Annuller tur</button>' +
                '<button class="btn btn-sm" data-act="edit" data-id="' + esc(t.id) + '">Ændr</button></div>' : ""));
}
function teacherView() {
  if (canDrive(me)) {
    const tabs = [["trips", "Mine busture"], ["mine", "Mine kørsler (" + myRuns().length + ")"]];
    const bar = '<nav class="tabs" role="tablist">' + tabs.map(([k, l]) =>
      '<button class="tab' + (ui.teacherTab === k ? " active" : "") + '" role="tab" aria-selected="' + (ui.teacherTab === k) + '" data-act="ttab" data-tab="' + k + '">' + l + "</button>").join("") + "</nav>";
    if (ui.teacherTab === "mine") {
      return '<section class="page-head"><div><p class="eyebrow">Lærer · chauffør</p><h1>Mine kørsler</h1>' +
             '<p class="lede">De kørsler, du er sat på som chauffør.</p></div></section>' + bar + runsList();
    }
    return teacherTrips(bar);
  }
  return teacherTrips("");
}
function teacherTrips(bar) {
  const mine = state.trips.filter(t => t.createdBy === me.id).sort(byDate);
  const upcoming = mine.filter(t => isActive(t) && !isPast(t));
  const closed = mine.filter(t => !isActive(t) || isPast(t)).reverse();
  return '<section class="page-head"><div><p class="eyebrow">Lærer</p><h1>Mine busture</h1>' +
         '<p class="lede">Bestil bus til ture ud af huset, og følg med i hvornår bus og chauffør er på plads.</p></div>' +
         '<div class="head-actions"><button class="btn btn-primary" data-act="new-trip">+ Bestil bus</button></div></section>' + bar +
         '<h2 class="section-title">Kommende ture <span class="count">' + upcoming.length + "</span></h2>" +
         (upcoming.length ? '<div class="stack">' + upcoming.map(teacherCard).join("") + "</div>"
           : '<div class="empty"><b>Du har ingen kommende ture</b><span>Når du bestiller en bus, kan du følge den her.</span><button class="btn btn-primary" data-act="new-trip">+ Bestil bus</button></div>') +
         (closed.length ? '<details class="closed-list"><summary>Tidligere, afviste og annullerede ture (' + closed.length + ')</summary><div class="stack">' +
           closed.map(teacherCard).join("") + "</div></details>" : "");
}
const byDate = (a, b) => a.date.localeCompare(b.date) || a.outTime.localeCompare(b.outTime);

/* ---- Administrator ---- */
function busOptions(t, legKey) {
  const f = legOf(legKey).bus, cur = t[f];
  return '<option value="">Vælg bus…</option>' + state.buses.filter(b => b.active || b.id === cur).map(b => {
    const why = blocker(t, legKey, "bus", b.id);
    const sel = b.id === cur;
    return '<option value="' + esc(b.id) + '"' + (sel ? " selected" : "") + (why && !sel ? " disabled" : "") + ">" +
           esc(b.name) + " · " + b.capacity + " pl." + (why ? " – " + esc(why) : "") + "</option>";
  }).join("");
}
function driverOptions(t, legKey) {
  const f = legOf(legKey).driver, cur = t[f];
  const list = drivers();
  if (cur && !list.some(d => d.id === cur) && userById(cur)) list.push(userById(cur));
  return '<option value="">Vælg chauffør…</option>' + list.map(d => {
    const why = blocker(t, legKey, "driver", d.id);
    const sel = d.id === cur;
    return '<option value="' + esc(d.id) + '"' + (sel ? " selected" : "") + (why && !sel ? " disabled" : "") + ">" +
           esc(d.name) + (why ? " – " + esc(why) : "") + "</option>";
  }).join("");
}
function legEditor(t) {
  return '<div class="legs">' + LEGS.map(l =>
    '<div class="leg"><div class="leg-head"><span>' + l.label + '</span><b class="time">' + esc(t[l.time]) + "</b></div>" +
    '<label>Bus<select data-assign="' + l.bus + '" data-id="' + esc(t.id) + '"' + (t[l.bus] ? "" : ' class="is-missing"') + ">" + busOptions(t, l.key) + "</select></label>" +
    '<label>Chauffør<select data-assign="' + l.driver + '" data-id="' + esc(t.id) + '"' + (t[l.driver] ? "" : ' class="is-missing"') + ">" + driverOptions(t, l.key) + "</select></label>" +
    "</div>").join("") + "</div>";
}
function adminCard(t) {
  const closed = !isActive(t) || isPast(t);
  const conflicts = tripConflicts(t);
  const id = esc(t.id);
  let actions = "";
  if (!closed) {
    const seriesBtn = t.seriesId ? '<button class="btn btn-ghost btn-sm left" data-act="series" data-id="' + id + '">Kopiér bus og chauffører til resten af serien</button>' : "";
    if (isOpen(t)) {
      actions = seriesBtn + '<button class="btn btn-sm" data-act="edit" data-id="' + id + '">Redigér</button>' +
                '<button class="btn btn-danger btn-sm" data-act="reject" data-id="' + id + '">Afvis</button>' +
                '<button class="btn btn-primary btn-sm" data-act="approve" data-id="' + id + '"' + (conflicts.length ? " disabled title=\"Løs konflikten først\"" : "") + ">Godkend</button>";
    } else {
      actions = seriesBtn + '<button class="btn btn-sm" data-act="edit" data-id="' + id + '">Redigér</button>' +
                '<button class="btn btn-danger btn-sm" data-act="cancel" data-id="' + id + '">Annuller tur</button>';
    }
  }
  return tripShell(t,
    tripMeta(t, true) +
    statusNoteBlock(t) +
    noteBlock(t) +
    (closed ? resourceSummary(t) : legEditor(t)) +
    (conflicts.length ? '<div class="conflict"><b>Konflikt</b><ul>' + conflicts.map(c => "<li>" + esc(c) + "</li>").join("") + "</ul></div>" : "") +
    (actions ? '<div class="actions">' + actions + "</div>" : ""));
}

const FILTERS = [
  { key: "upcoming", label: "Alle kommende", test: t => isActive(t) && !isPast(t) },
  { key: "open",     label: "Kræver svar",    test: t => isOpen(t) && !isPast(t) },
  { key: "missing",  label: "Mangler chauffør", test: t => t.status === "approved" && !isPast(t) && missingDriver(t) },
  { key: "closed",   label: "Afvist og annulleret", test: t => !isActive(t) && !isPast(t) },
  { key: "past",     label: "Tidligere", test: t => isPast(t) }
];

function adminView() {
  const open = state.trips.filter(t => isOpen(t) && !isPast(t)).length;
  const soon = state.trips.filter(needsDriverSoon).sort(byDate);
  const week = state.trips.filter(t => isActive(t) && daysFromToday(t.date) >= 0 && daysFromToday(t.date) < 7).length;
  const activeBuses = state.buses.filter(b => b.active).length;

  const stats = '<div class="stats">' +
    '<button class="stat' + (open ? " alert" : "") + '" data-act="filter" data-filter="open"><b>' + open + "</b><span>Anmodninger venter på svar</span></button>" +
    '<button class="stat' + (soon.length ? " alert" : "") + '" data-act="filter" data-filter="missing"><b>' + soon.length + "</b><span>Mangler chauffør inden for 2 dage</span></button>" +
    '<button class="stat" data-act="tab" data-tab="week"><b>' + week + "</b><span>Ture de næste 7 dage</span></button>" +
    '<button class="stat" data-act="tab" data-tab="people"><b>' + activeBuses + " / " + drivers().length + "</b><span>Busser / chauffører</span></button>" +
    "</div>";

  const alert = soon.length ? '<div class="alert-panel" role="alert"><h2>Chauffør skal tildeles</h2>' +
    "<p>Disse godkendte ture kører inden for 2 dage og mangler stadig chauffør.</p>" +
    soon.map(t => '<div class="alert-item"><div><b>' + esc(t.destination) + "</b> · " + (relDay(t.date) || longDate(t.date)) + " · " +
      [!t.outDriver ? "udtur " + esc(t.outTime) : "", !t.returnDriver ? "hjemtur " + esc(t.returnTime) : ""].filter(Boolean).join(" og ") +
      ' mangler</div><button class="btn btn-sm" data-act="goto" data-id="' + esc(t.id) + '">Tildel chauffør</button></div>').join("") +
    "</div>" : "";

  const tabs = [["trips", "Ture"], ["week", "Ugeplan"], ["log", "Historik"], ["people", "Brugere og busser"]];
  if (canDrive(me)) tabs.splice(2, 0, ["mine", "Mine kørsler (" + myRuns().length + ")"]);
  const tabBar = '<nav class="tabs" role="tablist">' + tabs.map(([k, l]) =>
    '<button class="tab' + (ui.adminTab === k ? " active" : "") + '" role="tab" aria-selected="' + (ui.adminTab === k) + '" data-act="tab" data-tab="' + k + '">' + l + "</button>").join("") + "</nav>";

  let body = "";
  if (ui.adminTab === "trips") body = adminTrips();
  else if (ui.adminTab === "week") body = weekView();
  else if (ui.adminTab === "log") body = logView();
  else if (ui.adminTab === "mine") body = canDrive(me) ? runsList() : adminTrips();
  else body = peopleView();

  return '<section class="page-head"><div><p class="eyebrow">Busadministration</p><h1>Busplan</h1>' +
         '<p class="lede">Godkend anmodninger, og sæt bus og chauffør på hver udtur og hjemtur.</p></div>' +
         '<div class="head-actions"><button class="btn btn-primary" data-act="new-trip">+ Opret tur</button></div></section>' +
         stats + alert + tabBar + body;
}

function adminTrips() {
  const q = ui.search.trim().toLowerCase();
  const f = FILTERS.find(x => x.key === ui.adminFilter) || FILTERS[0];
  const counts = Object.fromEntries(FILTERS.map(x => [x.key, state.trips.filter(x.test).length]));
  let list = state.trips.filter(f.test).filter(t => !q || t.destination.toLowerCase().includes(q) || userName(t.createdBy).toLowerCase().includes(q));
  list.sort(byDate);
  if (f.key === "past") list.reverse();
  // Anmodninger der kræver svar vises øverst under "Alle kommende".
  if (f.key === "upcoming") list = [...list.filter(isOpen), ...list.filter(t => !isOpen(t))];
  const chips = '<div class="chips" role="group" aria-label="Filtrér ture">' + FILTERS.map(x =>
    '<button class="chip' + (x.key === f.key ? " active" : "") + '" data-act="filter" data-filter="' + x.key + '">' + x.label +
    '<span class="n">' + counts[x.key] + "</span></button>").join("") + "</div>";
  return '<div class="toolbar"><input type="search" id="tripSearch" placeholder="Søg destination eller lærer" value="' + esc(ui.search) + '" aria-label="Søg">' + chips + "</div>" +
    (list.length ? '<div class="stack">' + list.map(adminCard).join("") + "</div>"
      : '<div class="empty"><b>Ingen ture her</b><span>' + (q ? "Ingen ture matcher din søgning." : "Der er ingen ture i denne kategori.") + "</span></div>");
}

function weekView() {
  if (!ui.weekStart) ui.weekStart = mondayOf(today());
  const days = [...Array(7)].map((_, i) => addDays(ui.weekStart, i));
  const first = days[0], last = days[6];
  const range = first.getDate() + ". " + (first.getMonth() !== last.getMonth() ? MON[first.getMonth()] + " " : "") + "– " + last.getDate() + ". " + MON[last.getMonth()];
  const tIso = todayIso();
  const events = (busId, date) => {
    const ev = [];
    state.trips.filter(t => isActive(t) && t.date === date).forEach(t => {
      LEGS.forEach(l => {
        const match = busId === null ? !t[l.bus] : t[l.bus] === busId;
        if (match) ev.push({ t, l });
      });
    });
    return ev.sort((a, b) => a.t[a.l.time].localeCompare(b.t[b.l.time])).map(({ t, l }) =>
      '<button class="ev' + (isOpen(t) ? " pending" : "") + '" data-act="goto" data-id="' + esc(t.id) + '"><b>' + esc(t[l.time]) + "</b> " +
      (l.key === "out" ? "Ud → " : "Hjem ← ") + esc(t.destination) + "<br>" +
      (t[l.driver] ? esc(userName(t[l.driver])) : '<span class="missing">Chauffør mangler</span>') + "</button>").join("");
  };
  let grid = '<div class="wc wh"></div>' + days.map(d => '<div class="wc wh' + (iso(d) === tIso ? " today" : "") + '">' + DOW[d.getDay()] + ". " + d.getDate() + ". " + MON[d.getMonth()] + "</div>").join("");
  for (const b of state.buses.filter(b => b.active)) {
    grid += '<div class="wc wrow">' + esc(b.name) + "<small>" + b.capacity + " pladser</small></div>" + days.map(d => '<div class="wc">' + events(b.id, iso(d)) + "</div>").join("");
  }
  const unassigned = days.some(d => events(null, iso(d)));
  if (unassigned) grid += '<div class="wc wrow">Uden bus<small>skal tildeles</small></div>' + days.map(d => '<div class="wc">' + events(null, iso(d)) + "</div>").join("");
  return '<div class="week-nav"><h2>Uge ' + isoWeek(first) + ' <span class="muted" style="font-weight:500">· ' + range + "</span></h2>" +
    '<button class="btn btn-sm" data-act="week" data-step="-1" aria-label="Forrige uge">← Forrige</button>' +
    '<button class="btn btn-sm" data-act="week" data-step="0">Denne uge</button>' +
    '<button class="btn btn-sm" data-act="week" data-step="1" aria-label="Næste uge">Næste →</button></div>' +
    '<div class="week-wrap"><div class="week">' + grid + "</div></div>" +
    '<div class="legend"><span><i></i>Godkendt</span><span><i class="p"></i>Afventer svar</span><span>Klik på en kørsel for at åbne turen.</span></div>';
}

function logView() {
  if (!state.logs.length) return '<div class="empty"><b>Ingen ændringer endnu</b></div>';
  return '<div class="panel">' + state.logs.slice(0, 200).map(l =>
    '<div class="log"><time>' + esc(fmtStamp(l)) + "</time><div>" + (l.by ? "<b>" + esc(l.by) + "</b> " : "") + esc(l.text) + "</div></div>").join("") + "</div>";
}

function peopleView() {
  const group = (role, title) => {
    const list = state.users.filter(u => u.role === role);
    if (!list.length) return "";
    return '<div class="role-group">' + title + " (" + list.length + ")</div>" + list.map(u =>
      '<div class="row user-row"><div class="name"><b>' + esc(u.name) + (u.id === me.id ? " (dig)" : "") +
      (u.role !== "driver" && u.canDrive ? ' <span class="pill st-approved">Kører også bus</span>' : "") + "</b><span>" + esc(u.email || "Ingen e-mail") + "</span></div>" +
      '<button class="btn btn-sm" data-act="edit-user" data-id="' + esc(u.id) + '">Redigér</button>' +
      (u.id === me.id ? "<span></span>" : '<button class="btn btn-danger btn-sm" data-act="remove-user" data-id="' + esc(u.id) + '">Fjern</button>') +
      "</div>").join("");
  };
  const buses = state.buses.map(b =>
    '<div class="row bus-row"><div><b>' + esc(b.name) + "</b>" + (b.active ? "" : ' <span class="pill st-cancelled">Ikke i brug</span>') + "</div>" +
    '<span class="num">' + b.capacity + " pl.</span>" +
    '<button class="btn btn-sm" data-act="edit-bus" data-id="' + esc(b.id) + '">Redigér</button></div>').join("");
  return '<div class="two-col">' +
    '<section class="panel"><div class="panel-head"><h2>Brugere</h2><button class="btn btn-primary btn-sm" data-act="new-user">+ Tilføj bruger</button></div>' +
      '<div class="rows">' + group("admin", "Administratorer") + group("teacher", "Lærere") + group("driver", "Chauffører") + "</div></section>" +
    '<section class="panel"><div class="panel-head"><h2>Busser</h2><button class="btn btn-sm" data-act="new-bus">+ Tilføj bus</button></div>' +
      (state.buses.length ? '<div class="rows">' + buses + "</div>"
        : '<div class="empty"><b>Ingen busser endnu</b><span>Tilføj skolens busser med navn og antal pladser.</span><button class="btn btn-primary btn-sm" data-act="seed-buses">Tilføj Bus 1–4 som udgangspunkt</button></div>') +
      (Backend.mode === "demo" ? '<div class="danger-zone"><span>Start forfra med eksempeldata.</span><button class="btn btn-danger btn-sm" data-act="reset">Nulstil testdata</button></div>' : "") + "</section>" +
    "</div>";
}

/* ---- Chauffør ---- */
function myRuns() {
  const runs = [];
  state.trips.filter(t => t.status === "approved" && !isPast(t)).forEach(t => {
    LEGS.forEach(l => { if (t[l.driver] === me.id) runs.push({ t, l }); });
  });
  return runs.sort((a, b) => a.t.date.localeCompare(b.t.date) || a.t[a.l.time].localeCompare(b.t[b.l.time]));
}
function driverView() {
  return '<section class="page-head"><div><p class="eyebrow">Chauffør</p><h1>Mine kørsler</h1>' +
    '<p class="lede">Hej ' + esc(me.name) + ". Her er de kørsler, du er sat på.</p></div></section>" + runsList();
}
function runsList() {
  const runs = myRuns();
  if (!runs.length) return '<div class="empty"><b>Du har ingen kommende kørsler</b><span>Når du bliver sat på en tur som chauffør, dukker den op her.</span></div>';
  const byDay = {};
  runs.forEach(r => (byDay[r.t.date] = byDay[r.t.date] || []).push(r));
  return Object.keys(byDay).map(date =>
    '<section class="day-group"><div class="day-title"><h2>' + (relDay(date) || longDate(date)) + "</h2>" + (relDay(date) ? "<span>" + longDate(date) + "</span>" : "") + "</div>" +
    byDay[date].map(({ t, l }) => {
      const bus = busById(t[l.bus]);
      return '<article class="run"><div><div class="clock">' + esc(t[l.time]) + '</div><div class="dir">' + l.label + "</div></div><div>" +
        "<h3>" + (l.key === "out" ? "Skolen → " : "") + esc(t.destination) + (l.key === "ret" ? " → Skolen" : "") + "</h3>" +
        "<dl><dt>Bus</dt><dd>" + (bus ? esc(bus.name) + " (" + bus.capacity + " pladser)" : '<span class="missing">Ikke tildelt endnu</span>') + "</dd>" +
        "<dt>Passagerer</dt><dd>" + esc(t.passengers) + "</dd>" +
        "<dt>Kontakt</dt><dd>" + esc(userName(t.createdBy) || "–") + "</dd>" +
        (t.note ? "<dt>Bemærkning</dt><dd>" + esc(t.note) + "</dd>" : "") + "</dl></div></article>";
    }).join("") + "</section>").join("");
}

/* ---------------------------------------------------------------------
   6. Dialoger og beskeder
   --------------------------------------------------------------------- */
function toast(msg, type) {
  const el = document.createElement("div");
  el.className = "toast" + (type === "bad" ? " bad" : "");
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), type === "bad" ? 6000 : 3500);
}

function openModal({ title, body, actions, onMount }) {
  const dlg = $("#modal");
  dlg.innerHTML = '<form method="dialog" novalidate><div class="modal-head"><h2>' + esc(title) + '</h2><button type="button" class="btn btn-ghost btn-sm" data-close aria-label="Luk">✕</button></div>' +
    '<div class="modal-body">' + body + '</div><div class="modal-foot">' +
    actions.map((a, i) => '<button type="' + (a.primary ? "submit" : "button") + '" class="btn ' + (a.primary ? (a.danger ? "btn-danger solid" : "btn-primary") : "") + '" data-i="' + i + '">' + esc(a.label) + "</button>").join("") +
    "</div></form>";
  const form = dlg.querySelector("form");
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.querySelector("[data-close]").onclick = close;
  actions.forEach((a, i) => {
    const btn = form.querySelector('[data-i="' + i + '"]');
    if (!a.primary) btn.onclick = () => { a.run && a.run(form); close(); };
  });
  form.onsubmit = e => {
    e.preventDefault();
    const a = actions.find(x => x.primary);
    if (!a || !a.run) return close();
    if (a.run(form) !== false) close();
  };
  if (!dlg.open) dlg.showModal();
  if (onMount) onMount(form);
  const first = form.querySelector("input,select,textarea");
  if (first) first.focus();
}
function confirmModal(title, text, okLabel, run) {
  openModal({ title, body: "<p>" + text + "</p>", actions: [{ label: "Fortryd" }, { label: okLabel, primary: true, danger: true, run }] });
}

/* ---- Turformular (lærer & admin, ny & redigér) ---- */
function tripForm(t) {
  const isAdmin = me.role === "admin";
  const isNew = !t;
  const v = t || { destination: "", date: iso(addDays(today(), 7)), passengers: 25, outTime: "08:00", returnTime: "15:00", note: "",
                   outBus: "", returnBus: "", outDriver: "", returnDriver: "" };
  const warnApproved = !isNew && !isAdmin && t.status === "approved"
    ? '<p class="notice">Turen er allerede godkendt. Hvis du ændrer den, skal busadministratoren godkende den igen.</p>' : "";
  const body = warnApproved +
    '<div class="form-grid">' +
    field("destination", "Destination", '<input id="f-destination" name="destination" value="' + esc(v.destination) + '" placeholder="Fx Aalborg Zoo" autocomplete="off">', "full") +
    field("date", "Dato", '<input id="f-date" name="date" type="date" value="' + esc(v.date) + '"' + (isNew ? ' min="' + todayIso() + '"' : "") + ">") +
    field("passengers", "Antal personer", '<input id="f-passengers" name="passengers" type="number" min="1" max="200" value="' + esc(v.passengers) + '">', "", "Elever og voksne i alt") +
    field("outTime", "Afgang fra skolen", '<input id="f-outTime" name="outTime" type="time" value="' + esc(v.outTime) + '">') +
    field("returnTime", "Hjemkørsel", '<input id="f-returnTime" name="returnTime" type="time" value="' + esc(v.returnTime) + '">', "", "Hvornår bussen kører hjem fra destinationen") +
    (isNew ? '<div class="field full"><label class="check"><input type="checkbox" id="f-repeat" name="repeat"> Gentag hver uge</label></div>' +
             field("until", "Gentag til og med", '<input id="f-until" name="until" type="date">', "full hidden-until", "Højst " + MAX_REPEAT_WEEKS + " uger frem") +
             '<p class="preview-line" id="f-preview" hidden></p>' : "") +
    field("note", "Bemærkning", '<textarea id="f-note" name="note" placeholder="Fx afhentning ved hovedindgangen">' + esc(v.note) + "</textarea>", "full", "Vises for chaufføren") +
    (isAdmin && isNew ? '<div class="form-section">Bus og chauffør <span>Kan også vælges senere</span></div>' +
      LEGS.map(l => field(l.bus, l.label + " – bus", '<select id="f-' + l.bus + '" name="' + l.bus + '"></select>') +
                    field(l.driver, l.label + " – chauffør", '<select id="f-' + l.driver + '" name="' + l.driver + '"></select>')).join("") : "") +
    "</div>";

  openModal({
    title: isNew ? (isAdmin ? "Opret tur" : "Bestil bus") : "Ændr tur",
    body,
    actions: [{ label: "Fortryd" }, { label: isNew ? (isAdmin ? "Opret tur" : "Send anmodning") : (isAdmin ? "Gem ændringer" : "Gem og send"), primary: true, run: form => submitTrip(form, t) }],
    onMount: form => {
      const untilField = form.querySelector(".hidden-until");
      if (untilField) untilField.hidden = true;
      const refresh = () => {
        const repeat = form.repeat && form.repeat.checked;
        if (untilField) untilField.hidden = !repeat;
        const prev = form.querySelector("#f-preview");
        if (prev) {
          const n = repeat && form.until.value && form.until.value >= form.date.value ? datesForRepeat(form.date.value, form.until.value).length : 0;
          prev.hidden = !n;
          prev.textContent = n ? "Der oprettes " + n + " ture, hver " + DOW_FULL[parseDate(form.date.value).getDay()] + " til og med " + longDate(form.until.value) + "." : "";
        }
        if (isAdmin && isNew) {
          const draft = readDraft(form, { ...v });
          draft.id = "__draft__";
          for (const l of LEGS) {
            for (const [f, fn] of [[l.bus, busOptions], [l.driver, driverOptions]]) {
              const sel = form[f];
              draft[f] = sel.value;
              sel.innerHTML = fn(draft, l.key);
            }
          }
        }
      };
      form.addEventListener("input", refresh);
      form.addEventListener("change", refresh);
      refresh();
    }
  });
}
function field(name, label, control, cls, hint) {
  return '<div class="field ' + (cls || "") + '" data-field="' + name + '"><label for="f-' + name + '">' + label + "</label>" + control +
         (hint ? '<span class="hint">' + hint + "</span>" : "") + '<span class="err" hidden></span></div>';
}
function readDraft(form, base) {
  const d = { ...base };
  d.destination = form.destination.value.trim();
  d.date = form.date.value;
  d.passengers = parseInt(form.passengers.value, 10) || 0;
  d.outTime = form.outTime.value;
  d.returnTime = form.returnTime.value;
  d.note = form.note.value.trim();
  for (const l of LEGS) {
    if (form[l.bus]) d[l.bus] = form[l.bus].value;
    if (form[l.driver]) d[l.driver] = form[l.driver].value;
  }
  return d;
}
function submitTrip(form, existing) {
  const d = readDraft(form, existing || {});
  const errs = {};
  if (!d.destination) errs.destination = "Skriv hvor turen går hen.";
  if (!d.date) errs.date = "Vælg en dato.";
  else if (!existing && d.date < todayIso()) errs.date = "Datoen er allerede passeret.";
  if (!d.passengers || d.passengers < 1) errs.passengers = "Skriv mindst 1.";
  if (!d.outTime) errs.outTime = "Vælg afgangstid.";
  if (!d.returnTime) errs.returnTime = "Vælg tid for hjemkørsel.";
  else if (d.outTime && toMin(d.returnTime) <= toMin(d.outTime)) errs.returnTime = "Hjemkørsel skal være efter afgang.";
  let until = null;
  if (!existing && form.repeat && form.repeat.checked) {
    until = form.until.value;
    if (!until) errs.until = "Vælg hvornår gentagelsen slutter.";
    else if (until <= d.date) errs.until = "Slutdatoen skal ligge efter første tur.";
    else if (daysFromToday(until) - daysFromToday(d.date) > MAX_REPEAT_WEEKS * 7) errs.until = "Højst " + MAX_REPEAT_WEEKS + " uger ad gangen.";
  }
  if (me.role === "admin" && !existing) {
    const probe = { ...d, id: "__draft__" };
    for (const l of LEGS) {
      const b = blocker(probe, l.key, "bus", d[l.bus]);
      if (b) errs[l.bus] = busName(d[l.bus]) + " er " + b + ".";
      const dr = blocker(probe, l.key, "driver", d[l.driver]);
      if (dr) errs[l.driver] = userName(d[l.driver]) + " er " + dr + ".";
    }
  }
  if (showErrors(form, errs)) {
    const firstErr = form.querySelector(".has-err input,.has-err select,.has-err textarea");
    if (firstErr) firstErr.focus();
    return false;
  }
  if (existing) {
    const patch = { destination: d.destination, date: d.date, passengers: d.passengers, outTime: d.outTime, returnTime: d.returnTime, note: d.note };
    return updateTrip(existing.id, patch) !== false;
  }
  createTrips(d, until);
  return true;
}

/* ---- Bruger- og busformularer ---- */
function userForm(u) {
  const v = u || { name: "", email: "", role: "teacher" };
  openModal({
    title: u ? "Redigér bruger" : "Tilføj bruger",
    body: '<div class="form-grid">' +
      field("name", "Navn", '<input id="f-name" name="name" value="' + esc(v.name) + '">', "full") +
      field("email", "E-mail", '<input id="f-email" name="email" type="email" value="' + esc(v.email) + '"' + (u && Backend.mode === "firebase" ? " readonly" : "") + ">", "full",
        Backend.mode === "firebase"
          ? (u ? "E-mailen kan ikke ændres. Opret brugeren igen med den nye e-mail, hvis den skal skiftes." : "Personen logger ind med denne e-mail og opretter selv sin adgangskode.")
          : "Bruges til login, når systemet kobles på databasen") +
      field("role", "Rolle", '<select id="f-role" name="role"' + (u && u.id === me.id ? " disabled" : "") + ">" +
        Object.entries(ROLE).map(([k, l]) => '<option value="' + k + '"' + (k === v.role ? " selected" : "") + ">" + l + "</option>").join("") + "</select>", "full",
        u && u.id === me.id ? "Du kan ikke ændre din egen rolle" : "") +
      '<div class="field full" id="f-drive-wrap"><label class="check"><input type="checkbox" id="f-canDrive" name="canDrive"' + (v.canDrive ? " checked" : "") + "> Kører også bus</label>" +
      '<span class="hint">Personen kan vælges som chauffør og får fanen "Mine kørsler".</span></div>' +
      "</div>",
    onMount: form => {
      const sync = () => { form.querySelector("#f-drive-wrap").hidden = form.role.value === "driver"; };
      form.role.addEventListener("change", sync); sync();
    },
    actions: [{ label: "Fortryd" }, { label: "Gem", primary: true, run: form => {
      const name = form.name.value.trim(), email = form.email.value.trim(), role = form.role.value;
      const errs = {};
      if (!name) errs.name = "Skriv et navn.";
      if (!email && Backend.mode === "firebase") errs.email = "Skriv personens e-mail. Den bruges til login.";
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errs.email = "E-mailadressen ser forkert ud.";
      if (email && state.users.some(x => (x.email || "").toLowerCase() === email.toLowerCase() && (!u || x.id !== u.id))) errs.email = "E-mailen bruges allerede.";
      if (showErrors(form, errs)) return false;
      const finalRole = u && u.id === me.id ? me.role : role;
      saveUser({ name, email, role: finalRole, canDrive: finalRole !== "driver" && form.canDrive.checked }, u && u.id);
    } }]
  });
}
function busForm(b) {
  const v = b || { name: "Bus " + (state.buses.length + 1), capacity: 30, active: true };
  openModal({
    title: b ? "Redigér bus" : "Tilføj bus",
    body: '<div class="form-grid">' +
      field("name", "Navn", '<input id="f-name" name="name" value="' + esc(v.name) + '">') +
      field("capacity", "Pladser", '<input id="f-capacity" name="capacity" type="number" min="1" value="' + esc(v.capacity) + '">') +
      (b ? '<div class="field full"><label class="check"><input type="checkbox" name="active"' + (v.active ? " checked" : "") + "> I brug</label>" +
           '<span class="hint">En bus der ikke er i brug, kan ikke vælges på nye ture.</span></div>' : "") +
      "</div>",
    actions: [{ label: "Fortryd" }, { label: "Gem", primary: true, run: form => {
      const name = form.name.value.trim(), capacity = parseInt(form.capacity.value, 10);
      const active = form.active ? form.active.checked : true;
      const errs = {};
      if (!name) errs.name = "Skriv et navn.";
      if (state.buses.some(x => x.name.toLowerCase() === name.toLowerCase() && (!b || x.id !== b.id))) errs.name = "Navnet bruges allerede.";
      if (!capacity || capacity < 1) errs.capacity = "Skriv antal pladser.";
      if (b && capacity < b.capacity) {
        const tooBig = state.trips.find(t => isActive(t) && !isPast(t) && (t.outBus === b.id || t.returnBus === b.id) && t.passengers > capacity);
        if (tooBig) errs.capacity = "Turen til " + tooBig.destination + " har " + tooBig.passengers + " personer på denne bus.";
      }
      if (b && !active && b.active && upcomingUsesOfBus(b.id)) errs.name = "Bussen er sat på " + upcomingUsesOfBus(b.id) + " kommende kørsler. Flyt dem først.";
      if (showErrors(form, errs)) return false;
      saveBus({ name, capacity, active }, b && b.id);
    } }]
  });
}
function showErrors(form, errs) {
  form.querySelectorAll(".field").forEach(f => {
    const e = errs[f.dataset.field];
    f.classList.toggle("has-err", !!e);
    const el = f.querySelector(".err");
    if (el) { el.hidden = !e; el.textContent = e || ""; }
  });
  return Object.keys(errs).length > 0;
}

/* ---------------------------------------------------------------------
   7. Opstart og hændelser
   --------------------------------------------------------------------- */
function gotoTrip(id) {
  const t = tripById(id);
  ui.adminTab = "trips";
  ui.search = "";
  const f = FILTERS.find(x => x.test(t));
  ui.adminFilter = f ? f.key : "upcoming";
  render();
  const el = document.getElementById("trip-" + id);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash"); }
}

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-act]");
  if (!btn || btn.disabled) return;
  const id = btn.dataset.id;
  const t = id ? tripById(id) : null;
  switch (btn.dataset.act) {
    case "login":
      me = userById(id); Store.setSession(me.id);
      ui.adminTab = "trips"; ui.adminFilter = "upcoming"; ui.search = "";
      render(); window.scrollTo(0, 0); break;
    case "logout":
      me = null; Store.setSession(null);
      if (Backend.mode === "firebase") Backend.signOut();
      render(); break;
    case "auth": setAuthView({ screen: btn.dataset.screen, email: (document.querySelector("#a-email") || {}).value || authView.email }); break;
    case "auth-resend":
      Backend.resendVerification().then(() => setAuthView({ ...authView, message: "Mailen er sendt igen.", bad: false }))
        .catch(err => setAuthView({ ...authView, message: friendlyError(err), bad: true })); break;
    case "auth-verified":
      Backend.reloadUser().then(ok => { if (!ok) setAuthView({ ...authView, message: "E-mailen er ikke bekræftet endnu. Klik på linket i mailen først.", bad: true }); })
        .catch(err => setAuthView({ ...authView, message: friendlyError(err), bad: true })); break;
    case "reload": location.reload(); break;
    case "seed-buses":
      [["Bus 1", 20], ["Bus 2", 30], ["Bus 3", 50], ["Bus 4", 60]].forEach(([name, capacity]) =>
        state.buses.push(touch("buses", { id: "b-" + uid(), name, capacity, active: true })));
      log("tilføjede 4 standardbusser.");
      commit("4 busser er tilføjet. Ret navne og pladser, så de passer."); break;
    case "new-trip": tripForm(null); break;
    case "edit": tripForm(t); break;
    case "approve": approve(id); break;
    case "reject":
      openModal({
        title: "Afvis tur til " + t.destination,
        body: "<p>Læreren kan se begrundelsen.</p>" + field("reason", "Begrundelse (valgfri)", '<textarea id="f-reason" name="reason" placeholder="Fx ingen ledige busser den dag"></textarea>', "full"),
        actions: [{ label: "Fortryd" }, { label: "Afvis tur", primary: true, danger: true, run: form => reject(id, form.reason.value.trim()) }]
      }); break;
    case "cancel":
      confirmModal("Annuller tur", "Vil du annullere turen til <b>" + esc(t.destination) + "</b> " + longDate(t.date) + "? Bus og chauffør bliver frigivet.",
        "Annuller tur", () => cancelTrip(id)); break;
    case "series": applySeries(id); break;
    case "filter": ui.adminTab = "trips"; ui.adminFilter = btn.dataset.filter; render(); break;
    case "tab": ui.adminTab = btn.dataset.tab; render(); break;
    case "ttab": ui.teacherTab = btn.dataset.tab; render(); break;
    case "goto": gotoTrip(id); break;
    case "week": {
      const step = +btn.dataset.step;
      ui.weekStart = step === 0 ? mondayOf(today()) : addDays(ui.weekStart || mondayOf(today()), step * 7);
      render(); break;
    }
    case "new-user": userForm(null); break;
    case "edit-user": userForm(userById(id)); break;
    case "remove-user": {
      const u = userById(id);
      const n = state.trips.filter(x => !isPast(x) && isActive(x) && (x.outDriver === id || x.returnDriver === id)).length;
      confirmModal("Fjern bruger", "Vil du fjerne <b>" + esc(u.name) + "</b>?" + (n ? " Vedkommende er sat på " + n + " kommende ture, som så mangler chauffør." : ""),
        "Fjern", () => removeUser(id)); break;
    }
    case "new-bus": busForm(null); break;
    case "edit-bus": busForm(busById(id)); break;
    case "reset":
      confirmModal("Nulstil testdata", "Alle ture, brugere og historik bliver erstattet med eksempeldata. Det kan ikke fortrydes.", "Nulstil", () => {
        state = seedData(); persist(); me = userById("u-admin") || state.users[0]; Store.setSession(me.id); ui.adminTab = "trips"; render(); toast("Testdata er nulstillet.");
      }); break;
  }
});

document.addEventListener("change", e => {
  const sel = e.target.closest("select[data-assign]");
  if (sel) assign(sel.dataset.id, sel.dataset.assign, sel.value);
});
document.addEventListener("input", e => {
  if (e.target.id === "tripSearch") {
    ui.search = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const box = $("#tripSearch");
    if (box) { box.focus(); box.setSelectionRange(pos, pos); }
  }
});

document.addEventListener("submit", e => {
  const form = e.target.closest("form[data-form]");
  if (form) { e.preventDefault(); handleAuthForm(form); }
});

/* Opstart. Er firebase-config.js udfyldt, overtager firebase.js (Firebase-versionen);
   ellers kører appen som testversion med data i browseren. */
window.Busbooking = {
  useBackend(b) { Backend = b; },
  setAuth: setAuthView,
  setData(part) { Object.assign(state, part); render(); },
  setMe(u) { const first = !me; me = u; if (first) { ui.adminTab = "trips"; ui.adminFilter = "upcoming"; } render(); },
  me: () => me
};
if (window.BUSBOOKING_FIREBASE) {
  state = { users: [], buses: [], trips: [], logs: [] };
  render();
  setTimeout(() => {
    if (Backend.mode !== "firebase") setAuthView({ screen: "error", message: "Kunne ikke hente Firebase. Tjek internetforbindelsen, og åbn appen via en webadresse (fx Live Server), ikke direkte som fil." });
  }, 12000);
} else {
  loadState();
  const saved = Store.getSession();
  me = saved ? userById(saved) || null : null;
  render();
}
