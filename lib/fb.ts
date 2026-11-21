"use client";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously, type Auth, type User } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sayonara-sales",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let authReady: Promise<User> | null = null;

export function firebaseReady() {
  return !!(cfg.apiKey && cfg.projectId && cfg.appId);
}

function appOrThrow(): FirebaseApp {
  if (!firebaseReady()) throw new Error("NEXT_PUBLIC_FIREBASE_* が未設定です");
  if (!app) app = getApps()[0] || initializeApp(cfg);
  return app;
}

export function getDb(): Firestore {
  if (!db) db = getFirestore(appOrThrow());
  return db;
}

export function getFbAuth(): Auth {
  if (!auth) auth = getAuth(appOrThrow());
  return auth;
}

/** Soft path: anonymous Firebase Auth (UID owns shops). Display name stays Jimoty localStorage. */
export function ensureAuth(): Promise<User> {
  if (authReady) return authReady;
  authReady = new Promise((resolve, reject) => {
    const a = getFbAuth();
    const unsub = onAuthStateChanged(a, async (u) => {
      unsub();
      try {
        if (u) { resolve(u); return; }
        const cred = await signInAnonymously(a);
        resolve(cred.user);
      } catch (e) { authReady = null; reject(e); }
    }, (e) => { authReady = null; reject(e); });
  });
  return authReady;
}
