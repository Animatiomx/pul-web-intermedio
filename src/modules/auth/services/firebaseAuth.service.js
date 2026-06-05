import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth, authPersistenceReady } from "../../../firebase";

/**
 * Traduce errores tecnicos de Firebase Auth a mensajes accionables para UI.
 *
 * Recibe cualquier error lanzado por Firebase o por la capa REST y devuelve un
 * texto seguro para mostrar al usuario. No lanza errores.
 */
export function getFirebaseAuthErrorMessage(error) {
  const code = error?.code || error?.message || "";
  const messages = {
    "auth/invalid-credential":
      "El correo o la contraseña no son correctos. Revisa tus datos e intenta de nuevo.",
    "auth/wrong-password":
      "La contraseña no es correcta. Intenta de nuevo o recupera tu contraseña.",
    "auth/user-not-found":
      "No encontramos una cuenta con ese correo. Revisa el correo o crea una cuenta.",
    "auth/invalid-email": "Escribe un correo válido.",
    "auth/missing-password": "Ingresa tu contraseña.",
    "auth/too-many-requests":
      "Hiciste varios intentos seguidos. Espera unos minutos antes de intentar otra vez.",
    "auth/email-already-in-use":
      "Este correo ya está registrado. Inicia sesión para continuar.",
    "auth/weak-password":
      "La contraseña es muy débil. Usa al menos 6 caracteres.",
    "auth/network-request-failed":
      "No pudimos conectar con Firebase. Revisa tu conexión e intenta de nuevo.",
    "auth/user-disabled":
      "Esta cuenta está deshabilitada. Contacta a soporte para revisarla.",
    "pul/user-profile-not-found":
      "Encontramos una cuenta asociada a este acceso en Pul, pero no corresponde a un usuario. Si necesitas ayuda, contacta a soporte para que revisen tu cuenta.",
  };

  const matchedCode = Object.keys(messages).find((item) =>
    String(code).includes(item),
  );

  return (
    messages[matchedCode] ||
    "No pudimos completar la autenticación. Intenta de nuevo."
  );
}
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
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
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
