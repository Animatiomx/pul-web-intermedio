import { initializeApp, getApps } from "firebase/app";
import { getAuth, browserLocalPersistence, setPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseConfig } from "./firebaseConfig";

/**
 * Inicializa Firebase una sola vez aunque Vite/React recarguen modulos en dev.
 */
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

/**
 * Servicios compartidos:
 * - `auth`: autenticacion Firebase usada por formularios publicos.
 * - `authPersistenceReady`: promesa que asegura persistencia local antes de
 *   restaurar sesion.
 * - `db`: cliente Firestore usado por servicios transaccionales.
 */
export const auth = getAuth(app);
export const authPersistenceReady = setPersistence(auth, browserLocalPersistence);
export const db = getFirestore(app);
