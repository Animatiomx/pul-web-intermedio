import { DEBUG_PREFIX, NOTIFICATION_ENDPOINT } from "../constants/appConfig";

/**
 * Envia una notificacion push a usuarios Pul usando el endpoint de OneSignal.
 */
export async function sendPushNotification({ userIds, title, message, data }) {
  const response = await fetch(NOTIFICATION_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      data,
      userIds,
      title,
      message,
    }),
  });

  return response.json();
}

/**
 * Wrapper seguro para notificaciones: nunca rompe el flujo principal si falla.
 */
export async function sendOneSignalNotification(
  userIds = [],
  title,
  message,
  data,
) {
  try {
    if (!userIds.length) {
      console.error(`${DEBUG_PREFIX} No hay destinatarios para OneSignal`);
      return false;
    }

    const result = await sendPushNotification({
      userIds,
      title,
      message,
      data,
    });

    return Boolean(result);
  } catch (error) {
    console.error(`${DEBUG_PREFIX} Error enviando notificación OneSignal`, error);
    return false;
  }
}
