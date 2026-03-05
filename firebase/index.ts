'use client';

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { 
  Firestore, 
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from './config';

let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let storage: FirebaseStorage;

export function initializeFirebase() {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  if (!db) {
    db = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      // KRITISKT: Long Polling bryter igenom brandväggar och förhindrar "ca9"-krascher
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    });
  }

  if (!auth) auth = getAuth(app);
  if (!storage) storage = getStorage(app);

  return { 
    firebaseApp: app, 
    firestore: db, 
    auth,
    storage
  };
}

export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './errors';
export * from './error-emitter';
export { useUser } from './auth/use-user';
