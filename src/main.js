// Arranque nativo: login con Google (Firebase), datos en Firestore, anuncios AdMob y notificaciones locales.
import { Capacitor } from "@capacitor/core";
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithCredential, signInWithPopup, onAuthStateChanged, signOut, deleteUser,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, collection, doc, setDoc, deleteDoc, onSnapshot, getDocs, writeBatch,
} from "firebase/firestore";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { LocalNotifications } from "@capacitor/local-notifications";
import { App } from "@capacitor/app";
import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents, AdmobConsentStatus } from "@capacitor-community/admob";
import { startAgenda } from "./app.js";

const native = Capacitor.isNativePlatform();
const $ = (s) => document.querySelector(s);

/* ---------- Firebase (valores inyectados en el build desde secretos de GitHub) ---------- */
const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});
const auth = initializeAuth(app, native
  ? { persistence: indexedDBLocalPersistence }
  : { persistence: indexedDBLocalPersistence, popupRedirectResolver: browserPopupRedirectResolver });
const db = initializeFirestore(app, { localCache: persistentLocalCache() });

/* ---------- Publicidad ---------- */
// IDs de PRUEBA de Google. Reemplazar por los reales vía variables VITE_ADMOB_* al publicar.
const BANNER_ID = import.meta.env.VITE_ADMOB_BANNER_ID || "ca-app-pub-3940256099942544/6300978111";
const ADS_TESTING = !import.meta.env.VITE_ADMOB_BANNER_ID;
let adsStarted = false;
async function startAds() {
  if (!native || adsStarted) return;
  adsStarted = true;
  try {
    await AdMob.initialize();
    const info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
    // Reserva espacio para el banner desde ya (se ajusta al tamaño real cuando carga)
    document.documentElement.style.setProperty("--ad-h", "64px");
    AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () =>
      document.documentElement.style.setProperty("--ad-h", "0px"));
    AdMob.addListener(BannerAdPluginEvents.SizeChanged, (s) => {
      if (s && s.height > 0) document.documentElement.style.setProperty("--ad-h", Math.ceil(s.height) + 8 + "px");
    });
    await AdMob.showBanner({
      adId: BANNER_ID, adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER, margin: 0, isTesting: ADS_TESTING,
    });
  } catch (e) { console.warn("Ads", e); }
}

/* ---------- Notificaciones locales (avisan con la app cerrada) ---------- */
const hashId = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % 2000000000 || 1; };
async function setupNotifications() {
  if (!native) return;
  try {
    await LocalNotifications.requestPermissions();
    await LocalNotifications.createChannel({ id: "recordatorios", name: "Recordatorios", importance: 4, vibration: true });
  } catch (e) { console.warn("Notif", e); }
}
let notifTimer = null;
function scheduleNotifications(tasks) {
  if (!native) return;
  clearTimeout(notifTimer);
  notifTimer = setTimeout(async () => {
    try {
      const pend = await LocalNotifications.getPending();
      if (pend.notifications.length) await LocalNotifications.cancel({ notifications: pend.notifications.map((n) => ({ id: n.id })) });
      const now = Date.now();
      const list = tasks
        .filter((t) => !t.done && t.remind >= 0 && t.date)
        .map((t) => {
          const [y, m, d] = t.date.split("-").map(Number);
          const [hh, mm] = (t.time || "08:00").split(":").map(Number);
          return { t, at: new Date(y, m - 1, d, hh, mm).getTime() - t.remind * 60000 };
        })
        .filter((x) => x.at > now)
        .sort((a, b) => a.at - b.at)
        .slice(0, 60)
        .map(({ t, at }) => ({
          id: hashId(t.id + t.date + (t.time || "")),
          title: "⏰ " + t.title,
          body: (t.time ? "A las " + t.time : "Hoy") + (t.notes ? " · " + t.notes : ""),
          schedule: { at: new Date(at), allowWhileIdle: true },
          channelId: "recordatorios",
        }));
      if (list.length) await LocalNotifications.schedule({ notifications: list });
    } catch (e) { console.warn("Notif", e); }
  }, 800);
}

/* ---------- Backend para la agenda ---------- */
let unsub = null;
function backendFor(uid) {
  const col = collection(db, "users", uid, "tasks");
  return {
    save: (id, o) => setDoc(doc(col, id), o),
    remove: (id) => deleteDoc(doc(col, id)),
    subscribe(onTasks, onErr) {
      unsub = onSnapshot(col, (snap) => {
        const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        onTasks(tasks);
        scheduleNotifications(tasks);
      }, onErr);
    },
  };
}

/* ---------- Login ---------- */
async function googleSignIn() {
  const btn = $("#loginBtn"), err = $("#loginErr");
  btn.disabled = true; err.textContent = "";
  try {
    if (native) {
      const r = await FirebaseAuthentication.signInWithGoogle();
      await signInWithCredential(auth, GoogleAuthProvider.credential(r.credential?.idToken));
    } else {
      await signInWithPopup(auth, new GoogleAuthProvider());
    }
  } catch (e) {
    err.textContent = "No se pudo iniciar sesión. Revisa tu internet e inténtalo de nuevo.";
    console.warn(e);
  } finally { btn.disabled = false; }
}
async function logout() {
  if (unsub) { unsub(); unsub = null; }
  if (native) { try { await LocalNotifications.cancel({ notifications: (await LocalNotifications.getPending()).notifications }); } catch (e) {} }
  try { if (native) await FirebaseAuthentication.signOut(); } catch (e) {}
  await signOut(auth);
  location.reload();
}
async function deleteAccount() {
  const user = auth.currentUser; if (!user) return;
  if (!confirm("Se borrarán tu cuenta y TODAS tus tareas. Esto no se puede deshacer. ¿Continuar?")) return;
  try {
    const snap = await getDocs(collection(db, "users", user.uid, "tasks"));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db); snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref)); await b.commit();
    }
    try { await deleteUser(user); }
    catch (e) {
      if (e.code !== "auth/requires-recent-login") throw e;
      await googleSignIn(); await deleteUser(auth.currentUser);
    }
    alert("Tu cuenta y tus datos fueron eliminados.");
    await logout();
  } catch (e) { alert("No se pudo eliminar la cuenta: " + (e.message || e)); }
}

$("#loginBtn").onclick = googleSignIn;
$("#accountBtn").onclick = () => { $("#accountBg").hidden = false; };
const closeAccount = () => { $("#accountBg").hidden = true; };
$("#accountClose").onclick = closeAccount;
$("#accountX").onclick = closeAccount;
$("#accountBg").addEventListener("click", (e) => { if (e.target.id === "accountBg") closeAccount(); });

// Botón "atrás" de Android: cierra la ventana abierta; si no hay ninguna, minimiza la app.
if (native) {
  App.addListener("backButton", () => {
    if (!$("#accountBg").hidden) return closeAccount();
    if (!$("#sheetBg").hidden) return $("#cancelBtn").click();
    App.minimizeApp();
  });
}
$("#logoutBtn").onclick = logout;
$("#deleteAccBtn").onclick = deleteAccount;

let started = false;
onAuthStateChanged(auth, (user) => {
  $("#login").hidden = !!user;
  $("#appRoot").hidden = !user;
  if (!user || started) return;
  started = true;
  $("#accEmail").textContent = user.email || "";
  startAgenda(backendFor(user.uid));
  setupNotifications();
  startAds();
});
