import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator, getAuth, inMemoryPersistence, initializeAuth, signInAnonymously, type Auth,
} from "firebase/auth";
import {
  connectFirestoreEmulator, getFirestore, initializeFirestore, memoryLocalCache, type Firestore,
} from "firebase/firestore";

const NAME = "shop-builder";

/**
 * Server Firestore client. Anonymous sign-in exists only so security rules see
 * a signed-in user (unclaimed shops). The uid is never stored on a shop and
 * callers do not send one.
 */
function cfg() {
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || (emulator ? "demo" : ""),
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "sayonara-sales.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || (emulator ? "demo-sayonara" : "sayonara-sales"),
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || (emulator ? "1:1:web:demo" : ""),
  };
}

let ready: Promise<Firestore> | null = null;

export function serverDb(): Promise<Firestore> {
  if (!ready) {
    ready = open().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

async function open(): Promise<Firestore> {
  const c = cfg();
  if (!c.apiKey || !c.projectId || !c.appId) throw new Error("Firebase client config is missing");
  const app: FirebaseApp = getApps().find((a) => a.name === NAME) || initializeApp(c, NAME);
  let auth: Auth;
  try { auth = initializeAuth(app, { persistence: inMemoryPersistence }); }
  catch { auth = getAuth(app); }
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (authHost) {
    const host = authHost.startsWith("http") ? authHost : `http://${authHost}`;
    try { connectAuthEmulator(auth, host, { disableWarnings: true }); } catch { /* already connected */ }
  }
  let db: Firestore;
  try { db = initializeFirestore(app, { localCache: memoryLocalCache() }); }
  catch { db = getFirestore(app); }
  const fsHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (fsHost) {
    const [h, p] = fsHost.split(":");
    try { connectFirestoreEmulator(db, h, Number(p || 8080)); } catch { /* already connected */ }
  }
  if (!auth.currentUser) await signInAnonymously(auth);
  return db;
}
