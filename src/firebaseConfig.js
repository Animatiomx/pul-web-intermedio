/**
 * Configuracion publica de Firebase.
 *
 * En produccion debe venir de variables `VITE_FIREBASE_*`. Los valores fallback
 * permiten que la app siga funcionando en entornos donde no hay `.env`, pero no
 * deben considerarse secretos: son identificadores publicos del cliente web.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'REDACTED_CREDENTIAL_3ba7c4af',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'pul-test-a00f6.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'pul-test-a00f6',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'pul-test-a00f6.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '593021913800',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:593021913800:web:20d5dee8d335b37407b3fd',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-8RRLEWC2SE',
}
