"use client";
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import type { User } from "firebase/auth";

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sayonara-sales",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let authReady: Promise<User> | null = null;

function appOrThrow(): FirebaseApp {
  if (!(cfg.apiKey && cfg.projectId && cfg.appId)) throw new Error("NEXT_PUBLIC_FIREBASE_* が未設定です");
  if (!app) app = getApps()[0] || initializeApp(cfg);
  return app;
}

export function getDb(): Firestore {
  if (!db) db = getFirestore(appOrThrow());
  return db;
}

/** Soft path: anonymous Firebase Auth (UID owns shops). Display name stays Jimoty localStorage. */
export function ensureAuth(): Promise<User> {
  if (authReady) return authReady;
  authReady = (async () => {
    const { getAuth, onAuthStateChanged, signInAnonymously } = await import("firebase/auth");
    const auth = getAuth(appOrThrow());
    return new Promise<User>((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, async (u) => {
        unsub();
        try {
          if (u) { resolve(u); return; }
          resolve((await signInAnonymously(auth)).user);
        } catch (e) { authReady = null; reject(e); }
      }, (e) => { authReady = null; reject(e); });
    });
  })();
  return authReady;
}
