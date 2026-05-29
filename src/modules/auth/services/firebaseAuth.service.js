import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth, authPersistenceReady } from "../../../firebase";
/**
 * Inicia sesion en Firebase respetando la persistencia local configurada.
 */
export async function signInWithFirebasePassword(email, password) {
  await authPersistenceReady;
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();
  return {
    localId: credential.user.uid,
    idToken: token,
    refreshToken: credential.user.refreshToken,
    displayName: credential.user.displayName,
    email: credential.user.email,
    photoUrl: credential.user.photoURL,
  };
}

/**
 * Crea usuario en Firebase y devuelve tokens necesarios para completar el flujo web.
 */
export async function signUpWithFirebasePassword(email, password) {
  await authPersistenceReady;
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const token = await credential.user.getIdToken();
  return {
    localId: credential.user.uid,
    idToken: token,
    refreshToken: credential.user.refreshToken,
    displayName: credential.user.displayName,
    email: credential.user.email,
    photoUrl: credential.user.photoURL,
  };
}

/**
 * Envia un correo de recuperacion de contraseña con la configuracion actual.
 */
export async function sendFirebasePasswordReset(email) {
  await authPersistenceReady;
  await sendPasswordResetEmail(auth, email);
}
