import { initializeApp, getApps, cert, type App, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, type Firestore } from 'firebase-admin/firestore';
import { getEnv } from './env';

/**
 * Firebase Admin SDK Singleton.
 *
 * Runs strictly server-side.
 * Parses the FIREBASE_SERVICE_ACCOUNT_JSON environment variable and normalises
 * escaped newlines in the private key.
 */

let appInstance: App | null = null;

export function getFirebaseAdmin(): App {
  if (appInstance) return appInstance;

  const currentApps = getApps();
  if (currentApps.length > 0) {
    appInstance = currentApps[0]!;
    return appInstance;
  }

  const env = getEnv();
  let credentials: ServiceAccount;

  try {
    const parsed = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    if (parsed.private_key) {
      // Restore actual newlines if stored escaped as \n in env strings
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    credentials = parsed;
  } catch (err) {
    throw new Error(
      `Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  appInstance = initializeApp({
    credential: cert(credentials),
  });

  return appInstance;
}

export function getFirestore(): Firestore {
  const adminApp = getFirebaseAdmin();
  return getAdminFirestore(adminApp);
}
