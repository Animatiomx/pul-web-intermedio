/**
 * Constantes de integracion externa.
 *
 * Todas aceptan override por `import.meta.env` para poder apuntar a backend
 * local, staging o produccion sin cambiar codigo. Los defaults apuntan a la API
 * productiva de Pul y a los esquemas de deep link usados por la app nativa.
 */
export const APP_DEEP_LINK_BASE =
  import.meta.env.VITE_APP_DEEP_LINK_BASE || "pul://plan";
export const RESERVA_DEEP_LINK_BASE =
  import.meta.env.VITE_RESERVA_DEEP_LINK_BASE ||
  import.meta.env.VITE_Reserva_DEEP_LINK_BASE ||
  "pul://reserva";
export const EVENT_DETAIL_DEEP_LINK_BASE =
  import.meta.env.VITE_EVENT_DETAIL_DEEP_LINK_BASE || "pul://eventodetalle";
export const EVENT_DEEP_LINK_BASE =
  import.meta.env.VITE_EVENT_DEEP_LINK_BASE || "pul://evento";
export const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "https://api.pul.com.mx";
export const URL_PAGE =
  import.meta.env.VITE_BACKEND_URL || "https://pul.com.mx";
export const EVENT_CHECKOUT_ENDPOINT =
  import.meta.env.VITE_EVENT_CHECKOUT_ENDPOINT ||
  `${BACKEND_URL}/stripe/create-checkout-session`;
export const STRIPE_CHECKOUT_ENDPOINT =
  import.meta.env.VITE_STRIPE_CHECKOUT_ENDPOINT ||
  `${BACKEND_URL}/stripe/create-checkout-session`;
export const STRIPE_PAYMENT_INTENT_ENDPOINT =
  import.meta.env.VITE_STRIPE_PAYMENT_INTENT_ENDPOINT ||
  `${BACKEND_URL}/stripe/buy`;
export const EVENT_GUEST_PURCHASE_COMPLETE_ENDPOINT =
  import.meta.env.VITE_EVENT_GUEST_PURCHASE_COMPLETE_ENDPOINT ||
  `${BACKEND_URL}/event-purchases/guest/complete`;
export const PUBLIC_INVITE_ENDPOINT =
  import.meta.env.VITE_PUBLIC_INVITE_ENDPOINT || `${BACKEND_URL}/public`;
export const EMAIL_CONFIRMATION_ENDPOINT =
  import.meta.env.VITE_EMAIL_CONFIRMATION_ENDPOINT ||
  `${BACKEND_URL}/email/send`;
export const NOTIFICATION_ENDPOINT =
  import.meta.env.VITE_NOTIFICATION_ENDPOINT || `${BACKEND_URL}/notification`;
export const RESERVA_RESPONSE_ENDPOINT =
  import.meta.env.VITE_RESERVA_RESPONSE_ENDPOINT ||
  import.meta.env.VITE_Reserva_RESPONSE_ENDPOINT ||
  "";
export const APP_STORE_URL =
  import.meta.env.VITE_APP_STORE_URL || "https://www.apple.com/app-store/";
export const PLAY_STORE_URL =
  import.meta.env.VITE_PLAY_STORE_URL || "https://play.google.com/store";

export const DEBUG_PREFIX = "[Pul Web]";
