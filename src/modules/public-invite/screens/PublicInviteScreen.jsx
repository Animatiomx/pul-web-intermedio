import { useCallback, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signOut, updateProfile } from "firebase/auth";
import {
  collection,
  doc,
  documentId,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import logo from "../../../assets/logo.png";
import defaultAvatar from "../../../assets/default.png";
import { auth, authPersistenceReady, db } from "../../../firebase";
import {
  APP_STORE_URL,
  BACKEND_URL,
  DEBUG_PREFIX,
  EMAIL_CONFIRMATION_ENDPOINT,
  EVENT_GUEST_PURCHASE_COMPLETE_ENDPOINT,
  PLAY_STORE_URL,
  RESERVA_RESPONSE_ENDPOINT,
  STRIPE_CHECKOUT_ENDPOINT,
  STRIPE_PAYMENT_INTENT_ENDPOINT,
} from "../../../shared/constants/appConfig";
import {
  attemptOpenApp,
  isMobileBrowser,
} from "../../../shared/utils/deepLinks";
import { formatPlanVisibility } from "../../../shared/utils/formatters";
import { postJson } from "../../../shared/utils/http";
import {
  getUserId,
  getUniqueIds,
  normalizeUserSummary,
} from "../../../shared/utils/users";
import {
  validateGuestForm,
  validateLoginForm,
  validatePasswordResetForm,
  validateRegisterForm,
} from "../../../shared/utils/validators";
import {
  getFirebaseAuthErrorMessage,
  sendFirebasePasswordReset,
  signInWithFirebasePassword,
  signUpWithFirebasePassword,
} from "../../auth/services/firebaseAuth.service";
import PlanWebView from "../../plans/components/PlanWebView";
import {
  buildWebUserSummary,
  fetchPlanMembersPage,
  fetchUsersByIds,
  joinPlanTransaction,
  leavePlanTransaction,
  resolvePlanRequest,
  resolveWaitlistUser,
} from "../../plans/services/planParticipation.service";
import {
  fallbackInvite,
  fetchInvite,
  getInviteContext,
  normalizeEvent,
  normalizePlan,
  normalizeReserva,
} from "../services/invite.service";
import PublicInviteView from "./PublicInviteView";
import { fetchEventParticipantsPage } from "../../events/services/eventParticipants.service";
import {
  buildEventPurchaseDraft,
  calculateEventPurchaseCuenta,
  commitEventPurchase,
  generateTicketClaimCode,
} from "../../events/services/eventPurchase.service";
import {
  beginReservationPayment,
  beginEventDetailPayment,
  completeReservationPayment,
  completeEventDetailPayment,
  getPendingPaymentRequest,
  joinEventDetailTransaction,
  joinReservationTransaction,
  releaseReservationPaymentLock,
  releaseEventDetailPaymentLock,
  shouldHideReservationForUser,
} from "../../reservations/services/reservationParticipation.service";
import { sendOneSignalNotification } from "../../../shared/services/notifications.service";

const initialForm = {
  nombre: "",
  email: "",
  telefono: "",
  password: "",
};

const initialLoginForm = {
  email: "",
  password: "",
};

const initialPasswordResetForm = {
  email: "",
};

const initialGuestForm = {
  nombre: "",
  email: "",
  telefono: "",
};

const EVENT_PUBLIC_ATTENDEES_LIMIT = 50;
const EVENT_ATTENDEES_INITIAL_SIZE = 10;
const EVENT_ATTENDEES_PAGE_SIZE = 20;

function goHome() {
  window.location.assign("/");
}

/**
 * Decide si un error de carga debe regresar al usuario al home.
 */
function shouldGoHomeForLoadError(error) {
  return [400, 404].includes(Number(error?.status));
}

/**
 * Etiqueta humana para mensajes de enlace no encontrado.
 */
function getInviteKindLabel(kind) {
  if (kind === "reserva") return "reservación";
  if (kind === "event" || kind === "eventDetail") return "evento";
  return "plan";
}

/**
 * Extrae URL de checkout tolerando varias respuestas del backend Stripe.
 */
function getCheckoutUrl(result) {
  return (
    result?.url ||
    result?.checkoutUrl ||
    result?.session?.url ||
    result?.info?.url ||
    ""
  );
}

/**
 * Firma ligera usada para evitar renders cuando la invitacion no cambio.
 */
function getInviteSignature(invite) {
  return JSON.stringify({
    id: invite?.id || "",
    kind: invite?.kind || "",
    title: invite?.title || "",
    status: invite?.raw?.status || invite?.status || "",
    updatedAt:
      invite?.raw?.updatedAt?.seconds ||
      invite?.raw?.draftUpdatedAt?.seconds ||
      invite?.raw?.dateTime?.seconds ||
      "",
    members:
      invite?.raw?.integrantesIds?.length ||
      invite?.raw?.integrantes?.length ||
      invite?.members ||
      0,
    total:
      invite?.raw?.cuentaCurso?.total ||
      invite?.raw?.cuenta?.total ||
      invite?.total ||
      0,
    paymentRequests: (invite?.raw?.paymentRequests || [])
      .map((request) => `${request.id}:${request.status}:${request.monto}`)
      .join("|"),
  });
}

/**
 * Actualiza estado solo cuando la firma de invitacion realmente cambia.
 */
function setInviteIfChanged(setInvite, nextInvite) {
  setInvite((current) =>
    getInviteSignature(current) === getInviteSignature(nextInvite)
      ? current
      : nextInvite,
  );
}

/**
 * Key de sessionStorage para compras de evento ya resueltas.
 */
function getEventPurchaseStorageKey(eventId) {
  return `pulEventPurchase:${eventId}`;
}

/**
 * Key de sessionStorage para compra invitada pendiente de volver de Stripe.
 */
function getPendingGuestPurchaseStorageKey(eventId) {
  return `pulPendingGuestEventPurchase:${eventId}`;
}

function getEventPurchaseEmailStorageKey(
  purchaseId,
  paymentIntentId,
  sessionId,
) {
  return `pulEventPurchaseEmail:${purchaseId || paymentIntentId || sessionId}`;
}

function getPublicEventAttendees(invite) {
  return (invite?.raw?.integrantes || [])
    .slice(0, EVENT_PUBLIC_ATTENDEES_LIMIT)
    .map((item) => normalizeUserSummary(item))
    .filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addSearchPrefixes(tokens, value) {
  const normalized = normalizeSearchText(value);
  if (!normalized) return;

  tokens.add(normalized);

  if (normalized.length < 4) return;

  for (let i = 4; i <= normalized.length; i += 1) {
    tokens.add(normalized.slice(0, i).trim());
  }
}

function buildNameSearchTokens(name) {
  const normalizedName = normalizeSearchText(name);
  const words = normalizedName.split(" ").filter(Boolean);
  const tokens = new Set();

  addSearchPrefixes(tokens, normalizedName);

  words.forEach((word) => addSearchPrefixes(tokens, word));

  for (let start = 0; start < words.length; start += 1) {
    for (let end = start + 1; end <= words.length; end += 1) {
      addSearchPrefixes(tokens, words.slice(start, end).join(" "));
    }
  }

  return Array.from(tokens).filter(Boolean);
}

/**
 * Loader comun mientras se resuelve invitacion o sesion.
 */
function PulLoader() {
  return (
    <main className="pul-loader-shell" aria-live="polite">
      <div className="pul-loader-card">
        <img src={logo} alt="Pul" className="pul-loader-logo" />
        <div className="pul-loader-spinner" aria-hidden="true" />
        <p>Cargando plan...</p>
      </div>
    </main>
  );
}

/**
 * Aviso para enlaces invalidos antes de redirigir al inicio.
 */
function NotFoundNotice({ kind }) {
  const label = getInviteKindLabel(kind);

  return (
    <main className="pul-loader-shell" aria-live="polite">
      <div className="pul-loader-card">
        <img src={logo} alt="Pul" className="pul-loader-logo" />
        <div className="pul-not-found-icon" aria-hidden="true">
          !
        </div>
        <strong>No se encontró el {label}</strong>
        <p>Te estamos llevando al inicio.</p>
      </div>
    </main>
  );
}

function EventFinishedNotice() {
  return (
    <main className="pul-loader-shell" aria-live="polite">
      <div className="pul-loader-card">
        <img src={logo} alt="Pul" className="pul-loader-logo" />
        <div className="pul-not-found-icon" aria-hidden="true">
          !
        </div>
        <strong>El evento ya terminó</strong>
        <p>Te estamos llevando al inicio.</p>
      </div>
    </main>
  );
}

/**
 * Orquestador publico principal de Pul Web.
 *
 * Esta pantalla es el punto comun para enlaces de planes, reservaciones,
 * detalles de evento y venta publica de eventos. Su responsabilidad es
 * coordinar datos remotos, sesion Firebase, formularios, pagos Stripe,
 * listeners Firestore y delegar el render a vistas especializadas.
 *
 * Contratos principales:
 * - Entrada: URL publica. `getInviteContext` decide si el dominio es plan,
 *   reserva, evento o detalle de evento.
 * - Salida visual: `PlanWebView` para planes y `PublicInviteView` para
 *   reservas/eventos.
 * - Persistencia: servicios de planes, reservaciones y eventos encapsulan las
 *   transacciones de Firestore. Esta pantalla no debe escribir documentos
 *   complejos directamente salvo listeners o perfil de usuario.
 * - Pagos: usuarios autenticados usan PaymentIntent y customer Stripe; invitados
 *   usan Checkout Session y un endpoint backend que verifica el pago antes de
 *   escribir `eventosUsers`.
 *
 * Al modificar este archivo, revisar siempre los efectos que dependen de URL
 * (`payment=success`, `session_id`) y los estados `flowStatus`, porque gobiernan
 * los mensajes, modales y reintentos.
 */
function PublicInviteScreen() {
  const isComingSoonView =
    window.location.pathname === "/" && window.location.search === "";
  const [context] = useState(getInviteContext);
  const [invite, setInvite] = useState(() => fallbackInvite(context));
  const [inviteStatus, setInviteStatus] = useState(
    context.id ? "loading" : "missing",
  );
  const [notFoundKind, setNotFoundKind] = useState(() =>
    !context.id && !isComingSoonView ? context.kind : "",
  );
  const [eventFinished, setEventFinished] = useState(false);
  const [view, setView] = useState("landing");
  const [registerForm, setRegisterForm] = useState(initialForm);
  const [loginForm, setLoginForm] = useState(initialLoginForm);
  const [passwordResetForm, setPasswordResetForm] = useState(
    initialPasswordResetForm,
  );
  const [guestForm, setGuestForm] = useState(initialGuestForm);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [errors, setErrors] = useState({});
  const [planJoinMessage, setPlanJoinMessage] = useState("");
  const [planRequests, setPlanRequests] = useState([]);
  const [planWaitlist, setPlanWaitlist] = useState([]);
  const [planActivities, setPlanActivities] = useState([]);
  const [planUsersById, setPlanUsersById] = useState(new Map());
  const [eventAttendees, setEventAttendees] = useState([]);
  const [eventAttendeesCursor, setEventAttendeesCursor] = useState("");
  const [eventAttendeesHasMore, setEventAttendeesHasMore] = useState(false);
  const [eventAttendeesLoading, setEventAttendeesLoading] = useState(false);
  const [reservationActionLoading, setReservationActionLoading] = useState("");
  const [reservationPaymentSession, setReservationPaymentSession] =
    useState(null);
  const [reservationPaymentLoading, setReservationPaymentLoading] =
    useState(false);
  const [eventPaymentSession, setEventPaymentSession] = useState(null);
  const [eventPaymentLoading, setEventPaymentLoading] = useState(false);
  const [reservationIndividualAccount, setReservationIndividualAccount] =
    useState(null);
  const [authUser, setAuthUser] = useState(() => {
    const cached =
      localStorage.getItem("pulExpressUser") ||
      sessionStorage.getItem("pulExpressUser");
    return cached ? JSON.parse(cached) : null;
  });
  const [flowStatus, setFlowStatus] = useState(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("payment") !== "success") return "idle";
    return context.kind === "event" ? "event-paid" : "paid";
  });
  const [appPrompt, setAppPrompt] = useState(() =>
    context.id && isMobileBrowser() ? "opening" : "fallback",
  );
  const planIdsRef = useRef({
    integrantes: [],
    solicitudes: [],
  });
  const expressRegistrationInProgressRef = useRef(false);

  const showNotFound = useCallback(
    (kind = context.kind) => {
      setNotFoundKind(kind);
      setInviteStatus("missing");
    },
    [context.kind],
  );

  useEffect(() => {
    if (!notFoundKind) return undefined;

    const timeoutId = window.setTimeout(goHome, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [notFoundKind]);

  useEffect(() => {
    if (!eventFinished) return undefined;

    const timeoutId = window.setTimeout(goHome, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [eventFinished]);

  useEffect(() => {
    let mounted = true;
    let unsubscribeAuth = null;

    authPersistenceReady
      .then(() =>
        onAuthStateChanged(auth, async (firebaseUser) => {
          if (!mounted) return;
          if (!firebaseUser) return;

          const token = await firebaseUser.getIdToken();
          const profile = await fetchUserProfile(firebaseUser.uid);
          if (!profile) {
            if (expressRegistrationInProgressRef.current) return;
            await signOut(auth).catch(() => {});
            localStorage.removeItem("pulExpressUser");
            sessionStorage.removeItem("pulExpressUser");
            setAuthUser(null);
            return;
          }
          const nextUser = buildWebUserSummary({
            ...profile,
            id: firebaseUser.uid,
            uid: firebaseUser.uid,
            idToken: token,
            refreshToken: firebaseUser.refreshToken,
            displayName: profile?.nombre || firebaseUser.displayName,
            email: profile?.email || firebaseUser.email,
            photoURL: firebaseUser.photoURL,
            method: profile?.method || "web-login",
          });
          const cached = localStorage.getItem("pulExpressUser");
          const cachedUser = cached ? JSON.parse(cached) : {};
          const mergedUser = { ...cachedUser, ...nextUser, idToken: token };
          localStorage.setItem("pulExpressUser", JSON.stringify(mergedUser));
          sessionStorage.removeItem("pulExpressUser");
          setAuthUser(mergedUser);
        }),
      )
      .then((unsubscribe) => {
        unsubscribeAuth = unsubscribe;
        if (!mounted && typeof unsubscribeAuth === "function")
          unsubscribeAuth();
      })
      .catch((error) => {
        console.warn(`${DEBUG_PREFIX} No se pudo restaurar sesión`, error);
      });

    return () => {
      mounted = false;
      if (typeof unsubscribeAuth === "function") unsubscribeAuth();
    };
  }, []);

  const userDataComplete = {
    id: "",
    idStripe: "",
    email: "",
    nombre: "",
    apellidos: "",
    fechaNacimiento: "",
    edad: 0,
    telefono: 0,
    actividad: "",
    situacionSentimental: "",
    bebidaFavorita: "",
    comidaFavorita: "",
    universidad: "",
    direccion: "",
    lugarFavorito: "",
    genero: "",
    gustos: {},
    cartera: [],
    amigos: [],
    intereses: [],
    salir: [],
    hacerAmigos: [],
    tenerCitas: [],
    econtrarQueHacer: false,
    viewInteractionInfo: true,
    viewQrInfo: true,
    images: [],
    imagen: "",
    zona: "PUEBLA",
    estatus: true,
    estado: "",
    distancia: "",
    profesion: "",
    perfilPublico: "",
    ubicacion: "",
    descripcion: "",
    tooltips: {
      qr: false,
      pulers: false,
      ayuda: false,
      crearPlan: false,
      credito: false,
      division: false,
      invitados: false,
      unirseAPlan: false,
    },
    nombreBusqueda: [],
    method: "",
    createdAt: null,
  };

  useEffect(() => {
    if (!context.id) {
      console.warn(`${DEBUG_PREFIX} No hay ID en la URL`, context);
      return;
    }

    let ignore = false;
    fetchInvite(context)
      .then((data) => {
        if (ignore) return;
        if (data.kind === "event" && data.raw?.terminado === true) {
          setEventFinished(true);
          setInviteStatus("missing");
          return;
        }
        if (
          data.kind === "reserva" &&
          shouldHideReservationForUser(data.raw, getUserId(authUser))
        ) {
          goHome();
          return;
        }
        setInviteIfChanged(setInvite, data);
        setInviteStatus("ready");
      })
      .catch((error) => {
        if (ignore) return;
        if (shouldGoHomeForLoadError(error)) {
          showNotFound(context.kind);
          return;
        }
        console.error(`${DEBUG_PREFIX} Usando fallback por error al cargar`, {
          context,
          error,
        });
        setInviteIfChanged(setInvite, fallbackInvite(context));
        setInviteStatus("fallback");
      });

    return () => {
      ignore = true;
    };
  }, [authUser, context, isComingSoonView, showNotFound]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("session_id");
    const paymentStatus = url.searchParams.get("payment");
    const eventId = url.searchParams.get("eventId") || context.id;

    if (
      context.kind !== "event" ||
      paymentStatus !== "success" ||
      !sessionId ||
      !eventId
    ) {
      return;
    }

    const pendingKey = getPendingGuestPurchaseStorageKey(eventId);
    let ignore = false;
    const completeGuestPurchase = async () => {
      setFlowStatus("purchasing");
      setPlanJoinMessage("Registrando tu compra...");
      try {
        const storedPurchase = sessionStorage.getItem(pendingKey);
        if (!storedPurchase) {
          throw new Error(
            "El pago fue aprobado, pero no encontramos los datos locales de la compra para registrarla.",
          );
        }
        const purchase = JSON.parse(storedPurchase);
        // Compra invitada: el navegador solo conserva el borrador. El backend
        // verifica Stripe y hace las escrituras criticas con permisos admin.
        const completion = await postJson(
          EVENT_GUEST_PURCHASE_COMPLETE_ENDPOINT,
          {
            sessionId,
            purchase,
          },
        );
        const completedPurchase = {
          ...purchase,
          id: completion?.purchaseId || purchase.id,
          paymentIntentId:
            completion?.paymentIntentId || purchase.paymentIntentId || "",
          publicDetailUrl: `https://pul.com.mx/eventodetalle/${
            completion?.purchaseId || purchase.id
          }`,
        };
        sessionStorage.setItem(
          getEventPurchaseStorageKey(eventId),
          JSON.stringify(completedPurchase),
        );
        sessionStorage.removeItem(pendingKey);
        if (!completion?.alreadyRegistered) {
          await sendTicketEmail(completedPurchase, sessionId).catch((error) => {
            console.warn(
              `${DEBUG_PREFIX} Compra registrada, pero no se pudo enviar el correo`,
              error,
            );
          });
        }
        if (ignore) return;
        setPlanJoinMessage(
          "Tu pago fue aprobado y tu compra quedo registrada correctamente.",
        );
        setFlowStatus("event-paid");
        url.searchParams.delete("session_id");
        url.searchParams.delete("payment");
        window.history.replaceState({}, "", url.toString());
        window.setTimeout(() => {
          window.location.reload();
        }, 900);
      } catch (error) {
        if (ignore) return;
        console.error(`${DEBUG_PREFIX} No se pudo registrar compra invitada`, {
          endpoint: EVENT_GUEST_PURCHASE_COMPLETE_ENDPOINT,
          error,
        });
        setPlanJoinMessage(
          error.message ||
            "El pago fue aprobado, pero no pudimos registrar la compra.",
        );
        setFlowStatus("purchase-error");
      }
    };

    completeGuestPurchase();

    return () => {
      ignore = true;
    };
  }, [context.id, context.kind]);

  useEffect(() => {
    if (!context.id || context.kind !== "plan") return;

    if (!authUser) {
      planIdsRef.current = { integrantes: [], solicitudes: [] };
      return;
    }

    planIdsRef.current = { integrantes: [], solicitudes: [] };
    let listenersActive = true;

    const planRef = doc(db, "planes", context.id);
    const topMembersRef = query(
      collection(db, "planes", context.id, "integrantes"),
      orderBy(documentId()),
      limit(10),
    );
    const requestsRef = collection(db, "planes", context.id, "solicitudes");
    const waitlistRef = collection(db, "planes", context.id, "listaEspera");
    const activitiesRef = query(
      collection(db, "planes", context.id, "actividades"),
      orderBy("created_at", "desc"),
      limit(20),
    );

    const applyRequestIds = (ids) => {
      planIdsRef.current = { ...planIdsRef.current, solicitudes: ids };
      setInvite((current) => {
        if (current.kind !== "plan") return current;
        return {
          ...current,
          solicitudesIds: ids,
          requests: ids.length,
        };
      });
    };

    const unsubscribes = [
      onSnapshot(
        planRef,
        (snap) => {
          if (!snap.exists()) {
            showNotFound("plan");
            return;
          }

          const normalized = normalizePlan(
            { fields: null, ...snap.data() },
            snap.id,
          );
          const legacyMembers = normalized.integrantesIds || [];
          const legacyRequests = normalized.solicitudesIds || [];
          const requestIds = planIdsRef.current.solicitudes.length
            ? planIdsRef.current.solicitudes
            : legacyRequests;

          setInvite((current) => {
            const firstMembers = planIdsRef.current.integrantes || [];
            const visibleMembers = firstMembers.length
              ? firstMembers
              : legacyMembers.slice(0, 10);
            return {
              ...normalized,
              integrantesIds: visibleMembers,
              solicitudesIds: requestIds,
              members: normalized.members,
              requests: requestIds.length,
              attendees: firstMembers.length
                ? current.attendees
                : normalized.attendees.slice(0, 10),
            };
          });
          setInviteStatus("ready");
        },
        (error) => {
          console.error(`${DEBUG_PREFIX} Error en listener de plan`, error);
          setInviteStatus("fallback");
        },
      ),
      onSnapshot(topMembersRef, async (snap) => {
        const firstMemberIds = getUniqueIds(
          snap.docs.map((item) => item.data()?.userId || item.id),
        );
        planIdsRef.current = {
          ...planIdsRef.current,
          integrantes: firstMemberIds,
        };

        const usersMap = await fetchUsersByIds(firstMemberIds);
        if (!listenersActive) return;
        setPlanUsersById((current) => {
          const next = new Map(current);
          usersMap.forEach((user, id) => next.set(id, user));
          return next;
        });
        setInvite((current) => {
          if (current.kind !== "plan") return current;
          return {
            ...current,
            integrantesIds: firstMemberIds,
            attendees: firstMemberIds.map(
              (id) => usersMap.get(id) || normalizeUserSummary(id),
            ),
          };
        });
      }),
      onSnapshot(requestsRef, (snap) => {
        setPlanRequests(
          snap.docs.map((item) => ({
            id: item.id,
            userId: item.data()?.userId || item.id,
            created_at: item.data()?.created_at,
          })),
        );
        applyRequestIds(snap.docs.map((item) => item.id));
      }),
      onSnapshot(waitlistRef, (snap) => {
        setPlanWaitlist(
          snap.docs.map((item) => ({
            id: item.id,
            userId: item.data()?.userId || item.id,
            created_at: item.data()?.created_at,
          })),
        );
      }),
      onSnapshot(activitiesRef, (snap) => {
        setPlanActivities(
          snap.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          })),
        );
      }),
    ];

    return () => {
      listenersActive = false;
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    };
  }, [authUser, context, showNotFound]);

  useEffect(() => {
    if (!context.id || context.kind !== "reserva" || !authUser) return;

    const reservationRef = doc(db, "reservaciones", context.id);
    const unsubscribe = onSnapshot(
      reservationRef,
      (snap) => {
        if (!snap.exists()) {
          showNotFound("reserva");
          return;
        }

        const data = { id: snap.id, ...snap.data() };
        if (shouldHideReservationForUser(data, getUserId(authUser))) {
          goHome();
          return;
        }

        setInviteIfChanged(
          setInvite,
          normalizeReserva({ fields: null, ...data }, snap.id),
        );
        setInviteStatus("ready");
      },
      (error) => {
        console.error(`${DEBUG_PREFIX} Error en listener de reserva`, error);
        setInviteStatus("fallback");
      },
    );

    return () => unsubscribe();
  }, [authUser, context.id, context.kind, showNotFound]);

  useEffect(() => {
    if (!context.id || context.kind !== "reserva" || !authUser) {
      return undefined;
    }

    const userId = getUserId(authUser);
    if (!userId) {
      return undefined;
    }

    const individualAccountRef = doc(
      db,
      "subcuentasReservaciones",
      `${context.id}${userId}`,
    );
    const unsubscribe = onSnapshot(
      individualAccountRef,
      (snap) => {
        if (!snap.exists()) {
          setReservationIndividualAccount(null);
          return;
        }

        const account = { id: snap.id, ...snap.data() };
        const total = Number(account.cuenta?.total || account.total || 0);
        setReservationIndividualAccount(total > 0 ? account : null);
      },
      (error) => {
        console.error(
          `${DEBUG_PREFIX} Error en listener de subcuenta de reserva`,
          error,
        );
        setReservationIndividualAccount(null);
      },
    );

    return () => unsubscribe();
  }, [authUser, context.id, context.kind]);

  useEffect(() => {
    const isEventContext =
      context.kind === "event" || context.kind === "eventDetail";
    if (!context.id || !isEventContext || !authUser) return;

    if (context.kind === "eventDetail") {
      let hasResolvedSnapshot = false;
      const applyEventDetailSnapshot = (snap) => {
        if (!snap.exists()) return;
        const data = { id: snap.id, ...snap.data() };
        if (data.sourceType && data.sourceType !== "event") return;
        hasResolvedSnapshot = true;
        setInviteIfChanged(
          setInvite,
          normalizeEvent({ fields: null, ...data }, snap.id, "eventDetail"),
        );
        setInviteStatus("ready");
      };

      const unsubscribes = [
        onSnapshot(
          doc(db, "reservaciones", context.id),
          applyEventDetailSnapshot,
          (error) => {
            console.error(
              `${DEBUG_PREFIX} Error en listener de reservación de evento`,
              error,
            );
            setInviteStatus("fallback");
          },
        ),
        onSnapshot(
          doc(db, "eventosUsers", context.id),
          applyEventDetailSnapshot,
          (error) => {
            console.error(
              `${DEBUG_PREFIX} Error en listener de detalle de evento`,
              error,
            );
            setInviteStatus("fallback");
          },
        ),
      ];

      const notFoundTimeout = window.setTimeout(() => {
        if (!hasResolvedSnapshot) showNotFound("event");
      }, 1800);

      return () => {
        window.clearTimeout(notFoundTimeout);
        unsubscribes.forEach((unsubscribe) => unsubscribe());
      };
    }

    const eventRef = doc(db, "eventos", context.id);
    const unsubscribe = onSnapshot(
      eventRef,
      (snap) => {
        if (!snap.exists()) {
          showNotFound("event");
          return;
        }

        const eventData = snap.data();
        if (eventData?.terminado === true) {
          setEventFinished(true);
          setInviteStatus("missing");
          return;
        }

        setInviteIfChanged(
          setInvite,
          normalizeEvent({ fields: null, ...eventData }, snap.id, context.kind),
        );
        setInviteStatus("ready");
      },
      (error) => {
        console.error(`${DEBUG_PREFIX} Error en listener de evento`, error);
        setInviteStatus("fallback");
      },
    );

    return () => unsubscribe();
  }, [authUser, context.id, context.kind, showNotFound]);

  useEffect(() => {
    const isEventInvite =
      context.kind === "event" || context.kind === "eventDetail";

    if (!context.id || !isEventInvite) {
      return;
    }

    let ignore = false;

    if (!authUser) {
      queueMicrotask(() => {
        if (ignore) return;
        const publicAttendees = getPublicEventAttendees(invite);
        const visibleAttendees = publicAttendees.slice(
          0,
          EVENT_ATTENDEES_INITIAL_SIZE,
        );
        setEventAttendees(visibleAttendees);
        setEventAttendeesCursor(String(visibleAttendees.length));
        setEventAttendeesHasMore(
          visibleAttendees.length < publicAttendees.length,
        );
        setEventAttendeesLoading(false);
      });

      return () => {
        ignore = true;
      };
    }

    queueMicrotask(() => {
      if (ignore) return;
      setEventAttendeesLoading(true);
    });

    fetchEventParticipantsPage(context.id, "", EVENT_ATTENDEES_PAGE_SIZE)
      .then((page) => {
        if (ignore) return;
        setEventAttendees(page.users);
        setEventAttendeesCursor(page.nextCursor);
        setEventAttendeesHasMore(page.hasMore);
      })
      .catch((error) => {
        console.warn(`${DEBUG_PREFIX} No se pudieron cargar asistentes`, error);
        if (!ignore) {
          const rawAttendees = invite.raw?.integrantes || [];
          setEventAttendees(
            rawAttendees
              .slice(0, EVENT_ATTENDEES_PAGE_SIZE)
              .map((item) => normalizeUserSummary(item)),
          );
          setEventAttendeesCursor("");
          setEventAttendeesHasMore(
            rawAttendees.length > EVENT_ATTENDEES_PAGE_SIZE,
          );
        }
      })
      .finally(() => {
        if (!ignore) setEventAttendeesLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [authUser, context.id, context.kind, invite]);

  const planUserIdsKey = [
    invite.hostId,
    ...(invite.integrantesIds || []),
    ...(invite.solicitudesIds || []),
    ...planWaitlist.map((item) => item.userId || item.id),
  ]
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    if (context.kind !== "plan") return;

    if (!authUser) {
      return;
    }

    let ignore = false;
    const ids = planUserIdsKey ? planUserIdsKey.split("|") : [];
    fetchUsersByIds(ids).then((usersMap) => {
      if (ignore) return;
      setPlanUsersById(usersMap);
      setInvite((current) => {
        if (current.kind !== "plan") return current;
        const hostUser =
          usersMap.get(current.hostId) ||
          current.hostUser ||
          normalizeUserSummary(current.hostId);
        const attendees = (current.integrantesIds || [])
          .map((id) => usersMap.get(id) || normalizeUserSummary(id))
          .filter(Boolean);
        return {
          ...current,
          host: hostUser.nombre || current.host,
          hostImage: hostUser.imagen || current.hostImage,
          hostUser,
          attendees,
        };
      });
    });

    return () => {
      ignore = true;
    };
  }, [authUser, context.kind, planUserIdsKey]);

  useEffect(() => {
    const shouldPollPublicInvite =
      context.kind === "event" || context.kind === "eventDetail";

    if (!context.id || !shouldPollPublicInvite || authUser) return;

    const intervalId = window.setInterval(() => {
      fetchInvite(context)
        .then((data) => {
          setInviteIfChanged(setInvite, data);
          setInviteStatus("ready");
        })
        .catch((error) => {
          console.warn(`${DEBUG_PREFIX} No se pudo refrescar el plan`, error);
        });
    }, 12000);

    return () => window.clearInterval(intervalId);
  }, [authUser, context]);

  useEffect(() => {
    if (!context.id || !isMobileBrowser() || inviteStatus === "loading") return;

    const timeoutId = window.setTimeout(() => {
      attemptOpenApp(invite);
    }, 450);

    const fallbackId = window.setTimeout(() => {
      if (!document.hidden && document.hasFocus()) setAppPrompt("fallback");
    }, 1800);

    const markAsOpened = () => {
      setAppPrompt("opened");
    };

    const onVisibilityChange = () => {
      if (document.hidden) markAsOpened();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", markAsOpened);
    window.addEventListener("pagehide", markAsOpened);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(fallbackId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", markAsOpened);
      window.removeEventListener("pagehide", markAsOpened);
    };
  }, [context.id, invite, inviteStatus]);

  const isReserva = invite.kind === "reserva";
  const isEventDetail = invite.kind === "eventDetail";
  const usesReservaLayout = isReserva || isEventDetail;
  const isEvent = invite.kind === "event";
  const isPlan = invite.kind === "plan";
  const purchasableItems = isEvent
    ? [...invite.tickets, ...invite.tables].filter(
        (item) => Number(item?.available ?? 0) > 0,
      )
    : [];
  const selectedItem =
    purchasableItems.find((item) => item.id === selectedItemId) ||
    purchasableItems[0];
  const guestSubtotal = selectedItem
    ? selectedItem.type === "table"
      ? selectedItem.price
      : selectedItem.price * quantity
    : 0;
  const guestCuenta = calculateEventPurchaseCuenta(guestSubtotal);
  const guestServiceFee = guestCuenta.comisionStripe;
  const guestTotal = guestCuenta.total;
  const spotsLeft =
    invite.capacity > 0 ? Math.max(invite.capacity - invite.members, 0) : null;
  const heroImage = invite.image || invite.hostImage;
  const displayTags = [
    ...new Set(
      [
        ...(Array.isArray(invite.tags) ? invite.tags : []),
        isEvent
          ? "Evento"
          : isEventDetail
            ? "Detalle de evento"
            : isReserva
              ? "Reservacion"
              : "Plan",
        isPlan ? formatPlanVisibility(invite.visibility) : invite.host,
      ]
        .filter(Boolean)
        .map((tag) => String(tag).replace(/^#/, "")),
    ),
  ].slice(0, 4);

  useEffect(() => {
    if (!(isReserva || isEventDetail) || !planJoinMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setPlanJoinMessage("");
      if (flowStatus === "plan-join-error" || flowStatus === "payment-error") {
        setFlowStatus("idle");
      }
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [flowStatus, isEventDetail, isReserva, planJoinMessage]);

  useEffect(() => {
    if (!isEvent || flowStatus !== "event-paid") return undefined;

    const timeoutId = window.setTimeout(() => {
      setPlanJoinMessage("");
      setFlowStatus("idle");
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [flowStatus, isEvent]);

  if (isComingSoonView) {
    return (
      <main className="coming-soon-shell">
        <div className="coming-bg" />

        <div className="coming-card">
          <div className="logo-wrapper">
            <img src={logo} alt="Pul" className="coming-soon-logo" />
          </div>

          <div className="badge-live">
            <span className="dot-live" />
            Próximamente
          </div>

          <h1 className="coming-title">
            Estamos preparando algo <span>increíble</span>
          </h1>

          <p className="coming-description">
            Muy pronto podrás descubrir nuevas experiencias, eventos,
            reservaciones y planes compartidos con Pul.
          </p>

          <div className="coming-actions">
            <a
              href={APP_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="store-btn"
            >
              App Store
            </a>

            <a
              href={PLAY_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="store-btn primary"
            >
              Google Play
            </a>
          </div>

          <div className="coming-footer">
            <div className="pulse-circle" />
            <span>Pul · 2026</span>
          </div>
        </div>
      </main>
    );
  }

  if (inviteStatus === "loading") {
    return <PulLoader />;
  }

  if (eventFinished) {
    return <EventFinishedNotice />;
  }

  if (notFoundKind) {
    return <NotFoundNotice kind={notFoundKind} />;
  }

  /** Sincroniza cambios del formulario de registro y limpia errores del campo. */
  const onRegisterFieldChange = (event) => {
    const { name, value } = event.target;
    setRegisterForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /** Sincroniza cambios del formulario de login y limpia errores del campo. */
  const onLoginFieldChange = (event) => {
    const { name, value } = event.target;
    setLoginForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /** Sincroniza el correo de recuperacion y limpia errores del campo. */
  const onPasswordResetFieldChange = (event) => {
    const { name, value } = event.target;
    setPasswordResetForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /** Sincroniza cambios del formulario de comprador invitado. */
  const onGuestFieldChange = (event) => {
    const { name, value } = event.target;
    setGuestForm((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  /** Verifica en backend si el telefono ya pertenece a una cuenta existente. */
  const validatePhone = async (telefono) => {
    const response = await fetch(`${BACKEND_URL}/users/validate-phone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        telefono,
      }),
    });

    return await response.json();
  };

  /** Crea un cliente Stripe asociado al usuario express cuando el backend esta disponible. */
  const createStripeCustomer = async ({ name, email, phone }) => {
    try {
      const response = await fetch(`${BACKEND_URL}/stripe/create-customer`, {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: `Cliente pul: ${name}`,
          email,
          name,
          phone,
        }),
      });

      const { info } = await response.json();

      return info.id;
    } catch (error) {
      console.error(error);
      return null;
    }
  };

  async function fetchUserProfile(uid) {
    if (!uid) return null;

    const snap = await getDoc(doc(db, "usuarios", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  const toStripeAmount = (amount) => {
    const fixed = Number(amount || 0).toFixed(2);
    return Number(fixed.replace(".", ""));
  };

  const ensureStripeCustomer = async (user) => {
    if (user?.idStripe) return user.idStripe;

    const idStripe = await createStripeCustomer({
      name: user?.nombre || user?.displayName || user?.email || "Pul",
      email: user?.email || "",
      phone: user?.telefono || "",
    });

    if (!idStripe) {
      throw new Error("No se pudo crear el cliente de Stripe.");
    }

    const nextUser = { ...user, idStripe };
    await updateDoc(doc(db, "usuarios", user.id || user.uid), {
      idStripe,
    }).catch(() => {});
    localStorage.setItem("pulExpressUser", JSON.stringify(nextUser));
    setAuthUser(nextUser);
    return idStripe;
  };

  /** Persiste el perfil completo del usuario en el backend de Pul. */
  const registerUser = async (uid, data) => {
    const response = await fetch(`${BACKEND_URL}/users/register-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uid,
        data,
      }),
    });

    return await response.json();
  };

  /** Envia bienvenida al correo del usuario recien registrado sin bloquear el alta. */
  const sendWelcomeEmail = async (user) => {
    const email = user?.email?.trim();
    if (!EMAIL_CONFIRMATION_ENDPOINT || !email) return;

    try {
      await postJson(EMAIL_CONFIRMATION_ENDPOINT, {
        to: email,
        template: "welcome-user",
        user: {
          id: user.id || user.uid || "",
          nombre: user.nombre || user.displayName || email.split("@")[0],
          email,
          downloadUrl: window.location.origin || "https://pul.com.mx",
        },
      });
    } catch (error) {
      console.warn(
        `${DEBUG_PREFIX} Usuario registrado, pero no se pudo enviar bienvenida`,
        error,
      );
    }
  };

  const isExpressRegisterUser = (user) =>
    ["express-register", "register-espress"].includes(
      String(user?.method || "").trim(),
    );

  const getPlanEmailTitle = (plan) => {
    const originType = String(plan?.origenTipo || plan?.originType || "")
      .trim()
      .toLowerCase();
    const isBusinessPlan =
      plan?.planVariant === "business" ||
      originType.includes("reserva") ||
      originType.includes("reservacion") ||
      Boolean(plan?.negocio?.nombre);
    const isEventPlan =
      plan?.planVariant === "event" ||
      originType.includes("evento") ||
      originType.includes("event") ||
      Boolean(plan?.evento?.nombre);

    if (isBusinessPlan) {
      return (
        plan?.negocio?.nombre || plan?.linkedEntity?.title || "Negocio PUL"
      );
    }
    if (isEventPlan) {
      return plan?.evento?.nombre || plan?.linkedEntity?.title || "Evento PUL";
    }

    return (
      plan?.concepto ||
      plan?.title ||
      plan?.linkedEntity?.title ||
      "Plan en PUL"
    );
  };

  const getPlanEmailImage = (plan) =>
    plan?.image ||
    plan?.linkedEntity?.image ||
    plan?.negocio?.imagen ||
    plan?.negocio?.fotoHome ||
    plan?.evento?.fotoHome ||
    plan?.evento?.fotos?.[0] ||
    "";

  const getPlanEmailAddress = (plan) =>
    plan?.address ||
    plan?.direccion ||
    plan?.linkedEntity?.address ||
    plan?.negocio?.direccion ||
    plan?.evento?.ubicacion ||
    "";

  const getPlanEmailCoordinates = (plan) =>
    plan?.coordinates ||
    plan?.coordenadas ||
    plan?.negocio?.coordenadas ||
    null;

  const getAbsoluteAssetUrl = (assetUrl) => {
    if (!assetUrl) return "";
    if (/^https?:\/\//i.test(assetUrl)) return assetUrl;
    const origin = window.location.origin || "https://pul.com.mx";
    return `${origin}${assetUrl.startsWith("/") ? "" : "/"}${assetUrl}`;
  };

  const withDefaultAvatar = (member) => ({
    ...member,
    imagen:
      member?.imagen || member?.photoURL || getAbsoluteAssetUrl(defaultAvatar),
    defaultImage: getAbsoluteAssetUrl(defaultAvatar),
  });

  const getPlanEmailMembers = async (status) => {
    const localMembers = [
      ...(Array.isArray(invite.attendees) ? invite.attendees : []),
      ...Array.from(planUsersById.values()),
    ];
    const byId = new Map(
      localMembers
        .map((member) => withDefaultAvatar(normalizeUserSummary(member)))
        .filter((member) => member?.id)
        .map((member) => [member.id, member]),
    );

    if (status === "joined" || status === "linked-joined") {
      byId.set(
        getUserId(authUser),
        withDefaultAvatar(normalizeUserSummary(authUser)),
      );
    }

    try {
      const page = await fetchPlanMembersPage(invite.id, "", 10);
      page.users.forEach((member) => {
        if (member?.id) byId.set(member.id, withDefaultAvatar(member));
      });
    } catch (error) {
      console.warn(
        `${DEBUG_PREFIX} No se pudieron cargar integrantes para correo`,
        error,
      );
    }

    return Array.from(byId.values()).slice(0, 10);
  };

  /** Envia correo de participacion de plan solo a usuarios express-register. */
  const sendPlanParticipationEmail = async (result) => {
    const status = result?.status || "";
    if (
      !["joined", "linked-joined", "requested", "waitlisted"].includes(status)
    ) {
      return;
    }
    if (!isExpressRegisterUser(authUser) || !authUser?.email) return;

    const plan = { ...invite.raw, ...invite, ...(result?.plan || {}) };
    const members = await getPlanEmailMembers(status);

    try {
      await postJson(EMAIL_CONFIRMATION_ENDPOINT, {
        to: authUser.email,
        template: "plan-participation",
        status: status === "linked-joined" ? "joined" : status,
        user: {
          id: getUserId(authUser),
          nombre: authUser.nombre || authUser.displayName || authUser.email,
          email: authUser.email,
        },
        plan: {
          id: invite.id,
          title: getPlanEmailTitle(plan),
          subtitle: plan?.concepto || "Plan en PUL",
          emoji: plan.emoji || "",
          planVariant: plan.planVariant || invite.planVariant || "",
          originType:
            plan.origenTipo || plan.originType || invite.origenTipo || "",
          url: `https://pul.com.mx/plan/${invite.id}`,
          image: getPlanEmailImage(plan),
          date: plan.date || plan.fecha || invite.date || "",
          time: plan.time || plan.hora || invite.time || "",
          people:
            plan.personas ||
            plan.capacity ||
            invite.capacity ||
            invite.members ||
            "",
          membersCount:
            plan.integrantesCount ||
            invite.members ||
            (Array.isArray(members) ? members.length : ""),
          address: getPlanEmailAddress(plan),
          coordinates: getPlanEmailCoordinates(plan),
          members,
        },
      });
    } catch (error) {
      console.warn(
        `${DEBUG_PREFIX} Participacion registrada, pero no se pudo enviar correo de plan`,
        error,
      );
    }
  };

  const getReservationEmailMembers = (reservation, joinedMember) => {
    const byId = new Map();
    const sourceMembers = Array.isArray(reservation?.integrantes)
      ? reservation.integrantes
      : [];

    sourceMembers
      .map((member) => withDefaultAvatar(normalizeUserSummary(member)))
      .filter((member) => member?.id)
      .forEach((member) => byId.set(member.id, member));

    if (joinedMember?.id) {
      byId.set(
        joinedMember.id,
        withDefaultAvatar(normalizeUserSummary(joinedMember)),
      );
    }

    byId.set(
      getUserId(authUser),
      withDefaultAvatar(normalizeUserSummary(authUser)),
    );

    return Array.from(byId.values()).slice(0, 10);
  };

  /** Envia correo de union a reserva solo a usuarios express-register. */
  const sendReservationParticipationEmail = async (result) => {
    if (!isReserva || !isExpressRegisterUser(authUser) || !authUser?.email) {
      return;
    }

    const reservation = { ...invite.raw, ...(result?.reservation || {}) };
    const business = reservation.negocio || {};
    const host = reservation.anfitrion || {};
    const members = getReservationEmailMembers(reservation, result?.member);

    try {
      await postJson(EMAIL_CONFIRMATION_ENDPOINT, {
        to: authUser.email,
        template: "reservation-participation",
        user: {
          id: getUserId(authUser),
          nombre: authUser.nombre || authUser.displayName || authUser.email,
          email: authUser.email,
        },
        reservation: {
          id: invite.id,
          businessName: business.nombre || invite.title || "Reservación PUL",
          hostName: host.nombre || "el anfitrión",
          url: `https://pul.com.mx/reserva/${invite.id}`,
          image:
            business.imagen ||
            business.fotoHome ||
            business.logo ||
            business.fotos?.[0] ||
            invite.image ||
            "",
          date: reservation.fecha || invite.date || "",
          time: reservation.hora || invite.time || "",
          people:
            reservation.noPersonas ||
            reservation.personas ||
            invite.participants ||
            invite.members ||
            "",
          membersCount:
            reservation.integrantesCount ||
            reservation.integrantesIds?.length ||
            members.length,
          address:
            business.direccion ||
            business.ubicacion ||
            reservation.direccion ||
            invite.address ||
            "",
          coordinates:
            business.coordenadas ||
            business.coordinates ||
            reservation.coordenadas ||
            reservation.coordinates ||
            null,
          members,
        },
      });
    } catch (error) {
      console.warn(
        `${DEBUG_PREFIX} Usuario unido a reserva, pero no se pudo enviar correo`,
        error,
      );
    }
  };

  /** Envia correo de union a detalle de evento solo a usuarios express-register. */
  const sendEventDetailParticipationEmail = async (result) => {
    if (
      !isEventDetail ||
      !isExpressRegisterUser(authUser) ||
      !authUser?.email
    ) {
      return;
    }

    const eventDetail = { ...invite.raw, ...(result?.eventDetail || {}) };
    const event = eventDetail.evento || eventDetail.eventPurchase?.event || {};
    const host = eventDetail.anfitrion || {};
    const members = getReservationEmailMembers(eventDetail, result?.member);

    try {
      await postJson(EMAIL_CONFIRMATION_ENDPOINT, {
        to: authUser.email,
        template: "reservation-participation",
        user: {
          id: getUserId(authUser),
          nombre: authUser.nombre || authUser.displayName || authUser.email,
          email: authUser.email,
        },
        reservation: {
          id: invite.id,
          kind: "evento",
          sourceType: "event",
          isEvent: true,
          itemTypeLabel: "evento",
          businessName: event.nombre || invite.title || "Evento PUL",
          hostName: host.nombre || "el anfitrión",
          url: `https://pul.com.mx/eventodetalle/${invite.id}`,
          image:
            event.fotoHome ||
            event.imagen ||
            event.image ||
            event.fotos?.[0] ||
            eventDetail.negocio?.imagen ||
            invite.image ||
            "",
          date: event.fechaString || eventDetail.fecha || invite.date || "",
          time: event.horaInicio || eventDetail.hora || invite.time || "",
          endDate:
            event.fechaStringFin ||
            eventDetail.fechaFin ||
            invite.endDate ||
            "",
          endTime: event.horaFin || eventDetail.horaFin || invite.endTime || "",
          people:
            eventDetail.personas ||
            eventDetail.noPersonas ||
            invite.participants ||
            invite.members ||
            "",
          membersCount:
            eventDetail.integrantesCount ||
            eventDetail.integrantesIds?.length ||
            members.length,
          address:
            event.ubicacion ||
            event.address ||
            eventDetail.ubicacion ||
            eventDetail.negocio?.direccion ||
            invite.address ||
            "",
          coordinates:
            event.coordenadas ||
            event.coordinates ||
            eventDetail.coordenadas ||
            eventDetail.coordinates ||
            null,
          members,
        },
      });
    } catch (error) {
      console.warn(
        `${DEBUG_PREFIX} Usuario unido a evento, pero no se pudo enviar correo`,
        error,
      );
    }
  };

  /** Recarga la pagina despues de cambios de sesion para leer valores frescos. */
  const reloadWithFreshSession = () => {
    window.requestAnimationFrame(() => {
      window.location.reload();
    });
  };

  /** Guarda sesion web, actualiza estado local y dispara recarga controlada. */
  const completeAuth = async (user) => {
    const normalizedUser = buildWebUserSummary(user);
    const persistedUser = { ...user, ...normalizedUser };
    localStorage.setItem("pulExpressUser", JSON.stringify(persistedUser));
    sessionStorage.removeItem("pulExpressUser");

    setAuthUser(persistedUser);

    setFlowStatus("authenticated");

    setView(
      isReserva || isEventDetail
        ? "payment"
        : isEvent
          ? "event-checkout"
          : "landing",
    );

    setPlanJoinMessage("");

    reloadWithFreshSession();
  };

  /** Ejecuta el registro express completo: validacion, Firebase, Stripe, backend y login. */
  const onRegisterSubmit = async (event) => {
    event.preventDefault();

    const nextErrors = validateRegisterForm(registerForm);

    console.log(nextErrors);

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    try {
      const phoneValidation = await validatePhone(registerForm.telefono.trim());

      if (phoneValidation.exists) {
        setErrors({
          form: "Este teléfono ya está registrado.",
        });

        return;
      }

      setFlowStatus("registering");
      expressRegistrationInProgressRef.current = true;

      const firebaseUser = await signUpWithFirebasePassword(
        registerForm.email.trim().toLowerCase(),
        registerForm.password,
      );
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: registerForm.nombre.trim(),
        });
      }

      // CREAR CUSTOMER STRIPE
      const idStripe = await createStripeCustomer({
        name: registerForm.nombre.trim(),
        email: firebaseUser.email || registerForm.email.trim(),
        phone: registerForm.telefono.trim(),
      });

      // OBJETO USUARIO
      const userData = {
        ...userDataComplete,
        id: firebaseUser.localId,
        idStripe,
        nombre: registerForm.nombre.trim(),
        email: firebaseUser.email || registerForm.email.trim().toLowerCase(),
        telefono: registerForm.telefono.trim(),
        method: "express-register",
        fueExpress: true,
        createdAt: new Date().toISOString(),
        nombreBusqueda: buildNameSearchTokens(registerForm.nombre.trim()),
      };

      console.log(userData);

      await registerUser(userData.id, userData);
      await sendWelcomeEmail(userData);
      expressRegistrationInProgressRef.current = false;

      // FIRESTORE + LOGIN
      const firebaseUserLogin = await signInWithFirebasePassword(
        registerForm.email.trim().toLowerCase(),
        registerForm.password,
      );
      completeAuth({
        id: firebaseUserLogin.localId,
        uid: firebaseUserLogin.localId,
        idToken: firebaseUserLogin.idToken,
        idStripe,
        nombre:
          firebaseUserLogin.displayName ||
          registerForm.nombre.trim() ||
          registerForm.email.split("@")[0],
        email: firebaseUserLogin.email || loginForm.email.trim(),
        method: "express-register",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      expressRegistrationInProgressRef.current = false;
      setFlowStatus("register-error");

      setErrors({ form: getFirebaseAuthErrorMessage(error) });
    }
  };

  /** Ejecuta inicio de sesion con Firebase y completa la sesion web local. */
  const onLoginSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validateLoginForm(loginForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFlowStatus("logging-in");
    try {
      const firebaseUser = await signInWithFirebasePassword(
        loginForm.email.trim(),
        loginForm.password,
      );
      const profile = await fetchUserProfile(firebaseUser.localId);
      if (!profile) {
        await signOut(auth).catch(() => {});
        localStorage.removeItem("pulExpressUser");
        sessionStorage.removeItem("pulExpressUser");
        throw { code: "pul/user-profile-not-found" };
      }
      completeAuth({
        ...profile,
        id: firebaseUser.localId,
        uid: firebaseUser.localId,
        idToken: firebaseUser.idToken,
        nombre:
          profile?.nombre ||
          firebaseUser.displayName ||
          loginForm.email.split("@")[0],
        email: firebaseUser.email || loginForm.email.trim(),
        method: profile?.method || "web-login",
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      setFlowStatus("login-error");
      setErrors({ form: getFirebaseAuthErrorMessage(error) });
    }
  };

  /** Envia correo de recuperacion desde el mismo flujo de login. */
  const onPasswordResetSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = validatePasswordResetForm(passwordResetForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setFlowStatus("recovering-password");
    try {
      await sendFirebasePasswordReset(
        passwordResetForm.email.trim().toLowerCase(),
      );
      setFlowStatus("password-reset-sent");
      setErrors({
        form: "Te enviamos un correo para recuperar tu contraseña.",
      });
    } catch (error) {
      setFlowStatus("password-reset-error");
      setErrors({
        form: getFirebaseAuthErrorMessage(error),
      });
    }
  };

  /** Abre la app nativa cuando el usuario prefiere continuar el flujo ahi. */
  const openLoginInApp = () => {
    attemptOpenApp(invite, "express-login");
  };

  /** Solicita al backend enviar confirmacion de compra y QR al correo del comprador. */
  async function sendTicketEmail(purchase, sessionId = "") {
    if (!EMAIL_CONFIRMATION_ENDPOINT || !purchase?.buyer?.email) return;
    const emailStorageKey = getEventPurchaseEmailStorageKey(
      purchase.id,
      purchase.paymentIntentId,
      sessionId,
    );
    if (localStorage.getItem(emailStorageKey)) return;
    localStorage.setItem(emailStorageKey, new Date().toISOString());

    try {
      await postJson(EMAIL_CONFIRMATION_ENDPOINT, {
        to: purchase.buyer.email,
        template: "event-ticket-confirmation",
        purchase: {
          ...purchase,
          claimInstructions: purchase.ticketClaimCode
            ? [
                "Este identificador solo puede utilizarse una vez para asociar este boleto a una cuenta Pul.",
                "Descarga la aplicación Pul.",
                "Inicia sesión o crea cuenta.",
                "Entra al menú.",
                "Ve a Próximos Planes.",
                "Abre la pestaña Eventos.",
                "Selecciona Asignar boleto.",
                "Captura el identificador recibido.",
              ]
            : [],
        },
      });
    } catch (error) {
      localStorage.removeItem(emailStorageKey);
      throw error;
    }
  }

  /** Une al usuario actual al plan o inicia solicitud/lista de espera segun reglas. */
  const joinCurrentPlan = async () => {
    if (!authUser || !invite.id || !isPlan) {
      setView("login");
      return;
    }

    setFlowStatus("joining-plan");
    setPlanJoinMessage("");
    try {
      const result = await joinPlanTransaction(invite.id, authUser);
      await sendPlanParticipationEmail(result);
      setPlanJoinMessage(
        result?.message || "Listo, actualizamos tu participación en el plan.",
      );
      setFlowStatus(
        result?.status === "requested" ? "plan-requested" : "plan-joined",
      );
    } catch (error) {
      setPlanJoinMessage(
        error.message || "No se pudo completar la unión al plan.",
      );
      setFlowStatus("plan-join-error");
    }
  };

  /** Quita la participacion actual del usuario en el plan. */
  const leaveCurrentPlan = async () => {
    if (!authUser || !invite.id || !isPlan) {
      setView("login");
      return;
    }

    setFlowStatus("leaving-plan");
    setPlanJoinMessage("");
    try {
      const result = await leavePlanTransaction(invite.id, authUser);
      setPlanJoinMessage(result?.message || "Te saliste del plan.");
      setFlowStatus("plan-left");
    } catch (error) {
      setPlanJoinMessage(
        error.message || "No se pudo salir del plan. Intenta de nuevo.",
      );
      setFlowStatus("plan-join-error");
    }
  };

  /** Gestiona solicitudes pendientes cuando el usuario autenticado es anfitrion. */
  const resolveRequest = async (user, action) => {
    if (!authUser || !invite.id || !isPlan) return;
    setFlowStatus(
      action === "accept" ? "accepting-request" : "rejecting-request",
    );
    setPlanJoinMessage("");
    try {
      const result = await resolvePlanRequest(
        invite.id,
        authUser,
        user,
        action,
      );
      setPlanJoinMessage(result?.message || "Solicitud actualizada.");
      setFlowStatus("plan-updated");
    } catch (error) {
      setPlanJoinMessage(
        error.message || "No se pudo actualizar la solicitud.",
      );
      setFlowStatus("plan-join-error");
    }
  };

  /** Gestiona aceptacion o retiro de usuarios en lista de espera. */
  const resolveWaitlist = async (user, action) => {
    if (!authUser || !invite.id || !isPlan) return;
    setFlowStatus(
      action === "accept" ? "accepting-waitlist" : "rejecting-waitlist",
    );
    setPlanJoinMessage("");
    try {
      const result = await resolveWaitlistUser(
        invite.id,
        authUser,
        user,
        action,
      );
      setPlanJoinMessage(result?.message || "Lista de espera actualizada.");
      setFlowStatus("plan-updated");
    } catch (error) {
      setPlanJoinMessage(
        error.message || "No se pudo actualizar la lista de espera.",
      );
      setFlowStatus("plan-join-error");
    }
  };

  /**
   * Inicia compra publica de evento.
   *
   * Invitado: genera un claim code sin leer Firestore, guarda el borrador en
   * sessionStorage y redirige a Stripe Checkout. Al volver con `session_id`, el
   * backend verifica el pago y registra `eventosUsers`, disponibilidad y
   * `ticketClaims`.
   *
   * Autenticado: mantiene compatibilidad con el fallback de checkout; el camino
   * principal con cuenta se inicia en `buyAsUser`.
   */
  const completeGuestPurchase = async (buyer) => {
    if (!selectedItem) {
      setFlowStatus("purchase-error");
      return;
    }

    setFlowStatus("purchasing");
    let purchaseType = "";
    let ticketClaimCode = "";
    let purchase = null;
    try {
      const isGuestPurchase = buyer?.method === "guest";
      purchaseType = selectedItem.type === "table" ? "zona" : "ticket";
      ticketClaimCode = isGuestPurchase ? generateTicketClaimCode() : "";
      const buyerName = buyer?.nombre || buyer?.displayName || "";
      const buyerEmail = buyer?.email || "";
      const buyerPhone = buyer?.telefono || buyer?.phone || "";
      const purchaseAttemptId =
        globalThis.crypto?.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const purchaseId =
        `web-${invite.id}-${selectedItem.id}-${buyerEmail}-${purchaseAttemptId}`.replace(
          /[^a-zA-Z0-9_-]/g,
          "-",
        );
      const eventPurchaseDraft = buildEventPurchaseDraft({
        event: { id: invite.id, ...invite.raw },
        buyer,
        type: purchaseType,
        quantity,
        item: selectedItem,
        purchaseId,
        ticketClaimCode,
      });
      purchase = {
        id: purchaseId,
        eventId: invite.id,
        eventName: invite.title,
        item: selectedItem,
        quantity,
        amount: guestTotal,
        amountCents: toStripeAmount(guestTotal),
        monto: guestTotal,
        subtotal: guestSubtotal,
        serviceFee: guestServiceFee,
        comisionStripe: guestServiceFee,
        total: guestTotal,
        buyer: {
          ...buyer,
          nombre: buyerName,
          email: buyerEmail,
          telefono: buyerPhone,
        },
        ticketClaimCode,
        publicDetailUrl: `https://pul.com.mx/eventodetalle/${purchaseId}`,
        eventPurchaseDraft,
        qrPayload: JSON.stringify({
          eventId: invite.id,
          itemId: selectedItem.id,
          quantity,
          email: buyerEmail,
          ticketClaimCode,
        }),
        guest: isGuestPurchase,
        checkoutMode: isGuestPurchase ? "guest" : "authenticated",
        captureMethod: isGuestPurchase ? "manual" : "automatic",
        capture_method: isGuestPurchase ? "manual" : "automatic",
        idStripe: "",
        customer: null,
        customerEmail: buyerEmail,
        customer_email: buyerEmail,
        customerName: buyerName,
        customer_name: buyerName,
        customerPhone: buyerPhone,
        customer_phone: buyerPhone,
        metadata: {
          id_ref: invite.id,
          vista: "evento_web_invitado",
          purchase_id: purchaseId,
          item_id: selectedItem.id,
          buyer_email: buyerEmail,
          buyer_name: buyerName,
          buyer_phone: buyerPhone,
          ticket_claim_code: ticketClaimCode,
          capture_method: isGuestPurchase ? "manual" : "automatic",
        },
        successUrl: `${window.location.origin}${window.location.pathname}?eventId=${invite.id}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: window.location.href,
      };
      if (isGuestPurchase) {
        sessionStorage.setItem(
          getPendingGuestPurchaseStorageKey(invite.id),
          JSON.stringify(purchase),
        );
      }
      const result = await postJson(STRIPE_CHECKOUT_ENDPOINT, purchase);
      const checkoutUrl = getCheckoutUrl(result);
      if (checkoutUrl) {
        window.location.assign(checkoutUrl);
        return;
      }

      if (isGuestPurchase) {
        setPlanJoinMessage(
          "Stripe no devolvi\u00f3 una URL de pago para abrir el checkout.",
        );
        setFlowStatus("purchase-error");
        return;
      }

      await commitEventPurchase({
        event: { id: invite.id, ...invite.raw },
        buyer,
        type: purchaseType,
        quantity,
        item: selectedItem,
        ticketClaimCode,
        paymentIntentId: result?.paymentIntentId || result?.idPago || "",
      });
      await sendTicketEmail(purchase).catch((error) => {
        console.warn(
          `${DEBUG_PREFIX} Compra registrada, pero no se pudo enviar el correo`,
          error,
        );
      });
      sessionStorage.setItem(
        getEventPurchaseStorageKey(invite.id),
        JSON.stringify(purchase),
      );
      setFlowStatus("event-paid");
    } catch (error) {
      if (!STRIPE_CHECKOUT_ENDPOINT && !EMAIL_CONFIRMATION_ENDPOINT) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        await commitEventPurchase({
          event: { id: invite.id, ...invite.raw },
          buyer,
          type: purchaseType,
          quantity,
          item: selectedItem,
          ticketClaimCode,
        });
        if (purchase) {
          sessionStorage.setItem(
            getEventPurchaseStorageKey(invite.id),
            JSON.stringify(purchase),
          );
        }
        setFlowStatus("event-paid");
        return;
      }
      console.error(`${DEBUG_PREFIX} Error al abrir checkout invitado`, {
        endpoint: STRIPE_CHECKOUT_ENDPOINT,
        error,
      });
      setPlanJoinMessage(
        error.message ||
          "No se pudo abrir Stripe. Revisa que el endpoint de checkout est\u00e9 disponible.",
      );
      setFlowStatus("purchase-error");
    }
  };

  /** Valida comprador invitado y lanza compra web. */
  const buyAsGuest = async (event) => {
    event.preventDefault();
    const nextErrors = validateGuestForm(guestForm);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    await completeGuestPurchase({
      nombre: guestForm.nombre.trim(),
      email: guestForm.email.trim(),
      telefono: guestForm.telefono.trim(),
      method: "guest",
    });
  };

  /**
   * Inicia compra de evento con cuenta Pul.
   *
   * Requiere un usuario autenticado y un customer Stripe. Usa PaymentIntent para
   * mostrar PaymentElement y conservar el pago asociado al perfil del usuario.
   */
  const buyAsUser = async () => {
    if (!authUser) {
      setView("register");
      return;
    }

    if (!selectedItem) {
      setFlowStatus("purchase-error");
      return;
    }

    setFlowStatus("purchasing");
    try {
      const idStripe = await ensureStripeCustomer(authUser);
      const result = await postJson(STRIPE_PAYMENT_INTENT_ENDPOINT, {
        idStripe,
        amount: toStripeAmount(guestTotal),
        captureMethod: "automatic",
        paymentMethodTypes: ["card"],
        automaticPaymentMethods: false,
        metadata: {
          id_ref: invite.id,
          vista: "evento_web",
          user_id: getUserId(authUser),
          item_id: selectedItem.id,
        },
      });

      if (!result?.paymentIntent || !result?.publishableKey) {
        setFlowStatus("purchase-error");
        setPlanJoinMessage(
          "Stripe respondió sin datos para mostrar el formulario de pago.",
        );
        return;
      }

      setEventPaymentSession({
        clientSecret: result.paymentIntent,
        paymentIntentId: result.paymentIntentId,
        publishableKey: result.publishableKey,
        customerSessionClientSecret: result.customerSessionClientSecret,
        customer: result.customer || idStripe,
        amount: guestTotal,
        buyer: {
          ...authUser,
          method: authUser.method || "authenticated-web",
        },
        item: selectedItem,
        quantity,
        type: selectedItem.type === "table" ? "zona" : "ticket",
      });
    } catch (error) {
      setPlanJoinMessage(error.message || "No se pudo iniciar el pago.");
      setFlowStatus("purchase-error");
    }
  };

  const cancelEventPayment = () => {
    setEventPaymentSession(null);
    setFlowStatus("idle");
  };

  /**
   * Persiste una compra autenticada despues de que Stripe confirma el pago.
   *
   * Impacto:
   * - Crea un documento en `eventosUsers`.
   * - Resta disponibilidad del boleto o bloquea la mesa en `eventos`.
   * - Crea/actualiza el integrante del evento y evita duplicar `integrantesCount`.
   */
  const confirmEventPayment = async (paymentIntent) => {
    const session = eventPaymentSession;
    if (!session) return;

    setEventPaymentLoading(true);
    setPlanJoinMessage("");
    try {
      const purchase = await commitEventPurchase({
        event: { id: invite.id, ...invite.raw },
        buyer: session.buyer,
        type: session.type,
        quantity: session.quantity,
        item: session.item,
        paymentIntentId: paymentIntent?.id || session.paymentIntentId || "",
      });
      sessionStorage.setItem(
        getEventPurchaseStorageKey(invite.id),
        JSON.stringify(purchase),
      );
      setEventPaymentSession(null);
      setPlanJoinMessage(
        "Tu pago fue aprobado y tu compra quedo registrada correctamente.",
      );
      setFlowStatus("event-paid");
    } catch (error) {
      setPlanJoinMessage(error.message || "No se pudo registrar la compra.");
      setFlowStatus("purchase-error");
    } finally {
      setEventPaymentLoading(false);
    }
  };

  /** Acepta la invitacion de reserva y crea el checkout de pago. */
  const acceptAndPay = async () => {
    if (!authUser || !isReserva) {
      setView("register");
      return;
    }

    setFlowStatus("paying");
    try {
      const result = await postJson(STRIPE_CHECKOUT_ENDPOINT, {
        reservaId: invite.id,
        amount: invite.amount,
        user: authUser,
        successUrl: `${window.location.origin}${window.location.pathname}?reservaId=${invite.id}&payment=success`,
        cancelUrl: window.location.href,
      });

      const checkoutUrl = getCheckoutUrl(result);
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      setPlanJoinMessage(
        "Stripe respondió sin URL de checkout. Revisa la respuesta del backend.",
      );
      setFlowStatus("payment-error");
    } catch (error) {
      setPlanJoinMessage(error.message || "No se pudo iniciar el pago.");
      setFlowStatus("payment-error");
    }
  };

  /** Registra rechazo de invitacion de reserva. */
  const rejectInvitation = async () => {
    setFlowStatus("rejecting");
    try {
      await postJson(RESERVA_RESPONSE_ENDPOINT, {
        reservaId: invite.id,
        action: "reject",
        user: authUser,
      });
      sessionStorage.setItem(
        `pulReservaRejected:${invite.id}`,
        JSON.stringify({
          rejectedAt: new Date().toISOString(),
          user: authUser,
        }),
      );
      setFlowStatus("rejected");
    } catch {
      setFlowStatus("reject-error");
    }
  };

  /** Carga asistentes autenticados en paginas de 100 para planes grandes. */
  const loadPlanAttendeesPage = async (cursorId = "") => {
    if (!authUser || !invite.id || !isPlan) {
      return { users: [], nextCursor: "", hasMore: false };
    }

    return fetchPlanMembersPage(invite.id, cursorId, 100);
  };

  const loadMoreEventAttendees = async () => {
    if (
      eventAttendeesLoading ||
      !eventAttendeesHasMore ||
      !(context.kind === "event" || context.kind === "eventDetail")
    ) {
      return;
    }

    if (!authUser) {
      const publicAttendees = getPublicEventAttendees(invite);
      const nextAttendees = publicAttendees.slice(
        0,
        Math.min(
          eventAttendees.length + EVENT_ATTENDEES_PAGE_SIZE,
          EVENT_PUBLIC_ATTENDEES_LIMIT,
        ),
      );
      setEventAttendees(nextAttendees);
      setEventAttendeesCursor(String(nextAttendees.length));
      setEventAttendeesHasMore(nextAttendees.length < publicAttendees.length);
      return;
    }

    setEventAttendeesLoading(true);
    try {
      const page = await fetchEventParticipantsPage(
        context.id,
        eventAttendeesCursor,
        EVENT_ATTENDEES_PAGE_SIZE,
      );
      setEventAttendees((current) => {
        const next = new Map(current.map((user) => [user.id, user]));
        page.users.forEach((user) => next.set(user.id, user));
        return Array.from(next.values());
      });
      setEventAttendeesCursor(page.nextCursor);
      setEventAttendeesHasMore(page.hasMore);
    } finally {
      setEventAttendeesLoading(false);
    }
  };

  const joinCurrentReservation = async () => {
    if (!authUser || !invite.id || !(isReserva || isEventDetail)) {
      setView("login");
      return;
    }

    setReservationActionLoading("joining");
    setPlanJoinMessage("");
    setFlowStatus("idle");
    try {
      const result = isEventDetail
        ? await joinEventDetailTransaction(invite.id, authUser)
        : await joinReservationTransaction(invite.id, authUser);
      setPlanJoinMessage(
        isEventDetail
          ? "Ya formas parte de este evento."
          : "Ya formas parte de esta reservación.",
      );
      if (!isEventDetail) {
        await sendReservationParticipationEmail(result);
      } else {
        await sendEventDetailParticipationEmail(result);
      }
      if (
        !isEventDetail &&
        result?.reservation?.anfitrion?.id &&
        result.reservation.anfitrion.id !== getUserId(authUser)
      ) {
        await sendOneSignalNotification(
          [result.reservation.anfitrion.id],
          `Nuevo integrante en ${result.reservation.negocio?.nombre || "tu reservación"}`,
          `${authUser.nombre || "Un usuario"} se unió a tu reservación.`,
          { view: "ReservaDetail", id: invite.id, origin: "" },
        );
      }
      if (
        isEventDetail &&
        result?.eventDetail?.anfitrion?.id &&
        result.eventDetail.anfitrion.id !== getUserId(authUser)
      ) {
        await sendOneSignalNotification(
          [result.eventDetail.anfitrion.id],
          `Nuevo integrante en ${result.eventDetail.evento?.nombre || "tu evento"}`,
          `${authUser.nombre || "Un usuario"} se unió a la compra.`,
          { view: "BoletoDetail", id: invite.id, origin: "" },
        );
      }
    } catch (error) {
      setPlanJoinMessage(
        error.message ||
          (isEventDetail
            ? "No pudimos agregarte al evento."
            : "No pudimos agregarte a la reservación."),
      );
      setFlowStatus("plan-join-error");
    } finally {
      setReservationActionLoading("");
    }
  };

  const payPendingReservationRequest = async () => {
    if (!authUser || !invite.id || !(isReserva || isEventDetail)) {
      setView("login");
      return;
    }

    const userId = getUserId(authUser);
    const pendingPaymentRequest = getPendingPaymentRequest(invite.raw, userId);
    if (!pendingPaymentRequest) {
      setPlanJoinMessage("Este pago ya no está pendiente.");
      return;
    }

    setReservationActionLoading("paying");
    setPlanJoinMessage("");
    setFlowStatus("idle");
    let paymentLockId = "";
    let checkoutStarted = false;

    try {
      const paymentClaim = isEventDetail
        ? await beginEventDetailPayment(invite.id, userId)
        : await beginReservationPayment(invite.id, userId);
      paymentLockId = paymentClaim.lockId;
      const idStripe = await ensureStripeCustomer(authUser);

      const result = await postJson(STRIPE_PAYMENT_INTENT_ENDPOINT, {
        idStripe,
        amount: toStripeAmount(paymentClaim.request.monto),
        captureMethod: invite?.raw?.status === "curso" ? "automatic" : "manual",
        paymentMethodTypes: ["card"],
        automaticPaymentMethods: false,
        metadata: {
          id_ref: invite.id,
          vista: isEventDetail
            ? "detalle_evento_pago_pendiente"
            : "detalle_reserva_pago_pendiente",
          user_id: userId,
        },
      });

      if (!result?.paymentIntent || !result?.publishableKey) {
        if (isEventDetail) {
          await releaseEventDetailPaymentLock(invite.id, userId, paymentLockId);
        } else {
          await releaseReservationPaymentLock(invite.id, userId, paymentLockId);
        }
        paymentLockId = "";
        setFlowStatus("payment-error");
        setPlanJoinMessage(
          "Stripe respondió sin datos para mostrar el formulario de pago.",
        );
        return;
      }

      checkoutStarted = true;
      setReservationPaymentSession({
        clientSecret: result.paymentIntent,
        paymentIntentId: result.paymentIntentId,
        publishableKey: result.publishableKey,
        customerSessionClientSecret: result.customerSessionClientSecret,
        customer: result.customer || idStripe,
        lockId: paymentLockId,
        amount: paymentClaim.request.monto,
        request: paymentClaim.request,
      });
    } catch (error) {
      if (!checkoutStarted && paymentLockId) {
        if (isEventDetail) {
          await releaseEventDetailPaymentLock(invite.id, userId, paymentLockId);
        } else {
          await releaseReservationPaymentLock(invite.id, userId, paymentLockId);
        }
      }
      setPlanJoinMessage(error.message || "No se pudo iniciar el pago.");
      setFlowStatus("payment-error");
    } finally {
      setReservationActionLoading("");
    }
  };

  const cancelReservationPayment = async () => {
    const session = reservationPaymentSession;
    setReservationPaymentSession(null);
    const userId = getUserId(authUser);
    if (!session?.lockId || !userId || !invite.id) return;

    const releaseLock = isEventDetail
      ? releaseEventDetailPaymentLock
      : releaseReservationPaymentLock;
    await releaseLock(invite.id, userId, session.lockId).catch((error) => {
      console.warn(`${DEBUG_PREFIX} No se pudo liberar el lock de pago`, error);
    });
  };

  const confirmReservationPayment = async (paymentIntent) => {
    const session = reservationPaymentSession;
    const userId = getUserId(authUser);
    if (!session?.lockId || !userId || !invite.id) return;

    setReservationPaymentLoading(true);
    setPlanJoinMessage("");
    try {
      const paymentPayload = {
        userId,
        lockId: session.lockId,
        paymentIntentId: paymentIntent?.id || session.paymentIntentId || "",
        payer: {
          fecha: new Date(),
          id: userId,
          nombre:
            authUser.nombre || session.request?.nombre || authUser.email || "",
          imagen: authUser.imagen || session.request?.imagen || "",
          monto: session.amount,
        },
      };
      if (isEventDetail) {
        await completeEventDetailPayment({
          ...paymentPayload,
          eventDetailId: invite.id,
        });
      } else {
        await completeReservationPayment({
          ...paymentPayload,
          reservationId: invite.id,
        });
      }

      if (invite.raw?.anfitrion?.id && invite.raw.anfitrion.id !== userId) {
        await sendOneSignalNotification(
          [invite.raw.anfitrion.id],
          `Pago recibido en ${invite.raw.negocio?.nombre || "tu reservación"}`,
          `${authUser.nombre || "Un invitado"} pagó su parte de la reservación.`,
          { view: "", id: invite.id },
        );
      }

      setReservationPaymentSession(null);
      setPlanJoinMessage("Tu pago quedó registrado correctamente.");
      setFlowStatus("paid");
    } catch (error) {
      setPlanJoinMessage(error.message || "El pago no se completó.");
      setFlowStatus("payment-error");
    } finally {
      setReservationPaymentLoading(false);
    }
  };

  const onLogout = async () => {
    await signOut(auth).catch(() => {});
    localStorage.removeItem("pulExpressUser");
    sessionStorage.removeItem("pulExpressUser");
    setAuthUser(null);
    setView("landing");
    setPasswordResetForm(initialPasswordResetForm);
    setPlanJoinMessage("");
    setPlanRequests([]);
    setPlanWaitlist([]);
    setPlanActivities([]);
    setPlanUsersById(new Map());
    setReservationIndividualAccount(null);
    setFlowStatus("idle");
    reloadWithFreshSession();
  };

  const planSlots = [];

  if (isPlan) {
    return (
      <PlanWebView
        invite={invite}
        inviteStatus={inviteStatus}
        authUser={authUser}
        onLogout={onLogout}
        flowStatus={flowStatus}
        planJoinMessage={planJoinMessage}
        planRequests={planRequests}
        planWaitlist={planWaitlist}
        planActivities={planActivities}
        usersById={planUsersById}
        view={view}
        setView={setView}
        errors={errors}
        registerForm={registerForm}
        loginForm={loginForm}
        passwordResetForm={passwordResetForm}
        onRegisterFieldChange={onRegisterFieldChange}
        onLoginFieldChange={onLoginFieldChange}
        onPasswordResetFieldChange={onPasswordResetFieldChange}
        onRegisterSubmit={onRegisterSubmit}
        onLoginSubmit={onLoginSubmit}
        onPasswordResetSubmit={onPasswordResetSubmit}
        joinCurrentPlan={joinCurrentPlan}
        leaveCurrentPlan={leaveCurrentPlan}
        resolveRequest={resolveRequest}
        resolveWaitlist={resolveWaitlist}
        attemptOpenApp={attemptOpenApp}
        loadAttendeesPage={loadPlanAttendeesPage}
      />
    );
  }

  return (
    <PublicInviteView
      isPlan={isPlan}
      isEvent={isEvent}
      isEventDetail={isEventDetail}
      isReserva={isReserva}
      individualAccount={reservationIndividualAccount}
      usesReservaLayout={usesReservaLayout}
      heroImage={heroImage}
      invite={invite}
      displayTags={displayTags}
      attemptOpenApp={attemptOpenApp}
      authUser={authUser}
      onLogout={onLogout}
      rejectInvitation={rejectInvitation}
      setView={setView}
      openLoginInApp={openLoginInApp}
      planSlots={planSlots}
      spotsLeft={spotsLeft}
      appPrompt={appPrompt}
      inviteStatus={inviteStatus}
      planJoinMessage={planJoinMessage}
      eventAttendees={eventAttendees}
      eventAttendeesHasMore={eventAttendeesHasMore}
      eventAttendeesLoading={eventAttendeesLoading}
      loadMoreEventAttendees={loadMoreEventAttendees}
      joinCurrentReservation={joinCurrentReservation}
      payPendingReservationRequest={payPendingReservationRequest}
      reservationActionLoading={reservationActionLoading}
      reservationPaymentSession={reservationPaymentSession}
      reservationPaymentLoading={reservationPaymentLoading}
      eventPaymentSession={eventPaymentSession}
      eventPaymentLoading={eventPaymentLoading}
      cancelEventPayment={cancelEventPayment}
      confirmEventPayment={confirmEventPayment}
      cancelReservationPayment={cancelReservationPayment}
      confirmReservationPayment={confirmReservationPayment}
      view={view}
      flowStatus={flowStatus}
      purchasableItems={purchasableItems}
      selectedItem={selectedItem}
      setSelectedItemId={setSelectedItemId}
      setQuantity={setQuantity}
      quantity={quantity}
      guestForm={guestForm}
      onGuestFieldChange={onGuestFieldChange}
      errors={errors}
      guestSubtotal={guestSubtotal}
      guestServiceFee={guestServiceFee}
      guestTotal={guestTotal}
      buyAsGuest={buyAsGuest}
      buyAsUser={buyAsUser}
      registerForm={registerForm}
      onRegisterFieldChange={onRegisterFieldChange}
      onRegisterSubmit={onRegisterSubmit}
      loginForm={loginForm}
      passwordResetForm={passwordResetForm}
      onLoginFieldChange={onLoginFieldChange}
      onPasswordResetFieldChange={onPasswordResetFieldChange}
      onLoginSubmit={onLoginSubmit}
      onPasswordResetSubmit={onPasswordResetSubmit}
      acceptAndPay={acceptAndPay}
      joinCurrentPlan={joinCurrentPlan}
    />
  );
}

export default PublicInviteScreen;
