/**
 * Configuracion publica de Firebase.
 *
 * En produccion debe venir de variables `VITE_FIREBASE_*`. Los valores fallback
 * permiten que la app siga funcionando en entornos donde no hay `.env`, pero no
 * deben considerarse secretos: son identificadores publicos del cliente web.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'REDACTED_CREDENTIAL_09d5e8ea',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'pul-33698.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'pul-33698',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'pul-33698.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '748847040914',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID ||
    '1:748847040914:web:645128f11459ca2d6b994b',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-9PYYX0B632',
}
