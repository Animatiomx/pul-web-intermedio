import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { DEBUG_PREFIX, URL_PAGE } from "../../../shared/constants/appConfig";
import { sendOneSignalNotification } from "../../../shared/services/notifications.service";
import {
  getUniqueIds,
  getUserId,
  normalizeUserSummary,
} from "../../../shared/utils/users";

/**
 * Servicio de participacion de planes.
 *
 * Controla integrantes, solicitudes, lista de espera y sincronizacion con
 * origenes relacionados (`reservaciones` o `eventosUsers`). Las pantallas deben
 * usar estos metodos en lugar de escribir directo para conservar contadores,
 * subcolecciones y documentos origen consistentes.
 */

/**
 * Normaliza textos de configuracion del plan para comparar sin acentos ni caso.
 */
function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Indica si el plan requiere aprobacion explicita del anfitrion.
 */
function isPrivatePlan(value) {
  return normalizeKey(value) === "privado";
}

/**
 * Indica si el plan esta limitado a amigos del anfitrion.
 */
function isFriendsPlan(value) {
  return normalizeKey(value) === "amigos";
}

/**
 * Obtiene el cupo del plan tolerando nombres nuevos y heredados.
 */
function getPlanCapacity(plan) {
  return Number(plan?.personas ?? plan?.capacity ?? 0);
}

/**
 * Obtiene un titulo legible del plan tolerando campos usados por app y web.
 */
function getPlanTitle(plan) {
  return plan?.concepto || plan?.title || plan?.nombre || "tu plan";
}

/**
 * Obtiene el id del anfitrion del plan tolerando formatos heredados.
 */
function getPlanHostId(plan) {
  return plan?.anfitrion?.id || plan?.hostId || plan?.anfitrionId || "";
}

function getPlanOriginType(plan) {
  const raw = normalizeKey(plan?.origenTipo || plan?.originType || "");
  if (raw === "evento" || raw === "event") return "evento";
  if (raw === "reservacion" || raw === "reserva" || raw === "reservation") {
    return "reservacion";
  }
  return "";
}

/**
 * Obtiene el id del documento origen ligado al plan, si existe.
 */
function getPlanOriginId(plan) {
  return plan?.origenId || plan?.originId || "";
}

/**
 * Construye la referencia Firestore al origen del plan.
 */
function getOriginRef(plan) {
  const originType = getPlanOriginType(plan);
  const originId = getPlanOriginId(plan);
  if (!originType || !originId) return null;
  return doc(
    db,
    originType === "evento" ? "eventosUsers" : "reservaciones",
    originId,
  );
}

/**
 * Calcula cupo del origen relacionado, soportando reservas y compras de evento.
 */
function getOriginCapacity(origin, originType) {
  if (!origin) return 0;
  return Number(
    originType === "evento" || origin.sourceType === "event"
      ? origin.personas || origin.eventPurchase?.quantity || origin.noPersonas || 0
      : origin.noPersonas || origin.personas || 0,
  );
}

/**
 * Extrae ids de integrantes del origen desde arreglos nuevos y heredados.
 */
function getOriginMemberIds(origin = {}) {
  return [
    ...new Set(
      [
        ...(Array.isArray(origin.integrantesIds) ? origin.integrantesIds : []),
        ...(Array.isArray(origin.integrantes)
          ? origin.integrantes.map((item) => item?.id)
          : []),
        ...(Array.isArray(origin.integrantesDivers)
          ? origin.integrantesDivers.map((item) => item?.id)
          : []),
      ].filter(Boolean),
    ),
  ];
}

/**
 * Lista usuarios que no pueden salir porque sostienen pagos o propiedad.
 */
function getOriginExitBlockedIds(origin = {}) {
  return new Set(
    [
      origin.anfitrion?.id,
      origin.createdBy,
      origin.draftOwnerId,
      ...(Array.isArray(origin.dividersCurso) ? origin.dividersCurso : []),
      ...(Array.isArray(origin.pendingPaymentUserIds)
        ? origin.pendingPaymentUserIds
        : []),
      ...(Array.isArray(origin.paymentRequests)
        ? origin.paymentRequests
            .filter((item) => item?.status === "pending")
            .map((item) => item?.id)
        : []),
    ].filter(Boolean),
  );
}

/**
 * Construye integrante compatible con documentos de reserva/evento origen.
 */
function buildOriginMember(user, userId) {
  return {
    id: userId,
    nombre: user?.nombre || user?.displayName || user?.email || "",
    imagen: user?.imagen || user?.photoURL || "",
    pushToken: user?.pushToken || "",
    divider: false,
    pagado: "",
    joinType: "joinedBySelf",
    joinedBySelf: true,
    invitedByAdmin: false,
    joinedAt: new Date(),
  };
}

/**
 * Agrega/actualiza integrante en el documento origen sin duplicar ids.
 */
function addMemberToOrigin(origin, user, userId) {
  const currentMembers = Array.isArray(origin.integrantes)
    ? origin.integrantes
    : [];
  const nextMembersById = new Map(
    currentMembers.filter((item) => item?.id).map((item) => [item.id, item]),
  );
  nextMembersById.set(userId, {
    ...buildOriginMember(user, userId),
    ...(nextMembersById.get(userId) || {}),
    id: userId,
  });
  const nextMembers = Array.from(nextMembersById.values());
  const nextMemberIds = [
    ...new Set([
      ...getOriginMemberIds(origin),
      ...nextMembers.map((item) => item.id),
      userId,
    ]),
  ];

  return {
    integrantes: nextMembers,
    integrantesIds: nextMemberIds,
    integrantesDivers: Array.isArray(origin.integrantesDivers)
      ? addMemberToList(origin.integrantesDivers, user, userId)
      : origin.integrantesDivers || [],
  };
}

/**
 * Agrega/actualiza integrante dentro de un arreglo legacy.
 */
function addMemberToList(members, user, userId) {
  const nextMembersById = new Map(
    (members || []).filter((item) => item?.id).map((item) => [item.id, item]),
  );
  nextMembersById.set(userId, {
    ...buildOriginMember(user, userId),
    ...(nextMembersById.get(userId) || {}),
    id: userId,
  });
  return Array.from(nextMembersById.values());
}

/**
 * Remueve un integrante del documento origen y de sus arreglos legacy.
 */
function removeMemberFromOrigin(origin, userId) {
  return {
    integrantes: (origin.integrantes || []).filter((item) => item?.id !== userId),
    integrantesIds: getOriginMemberIds(origin).filter((id) => id !== userId),
    integrantesDivers: (origin.integrantesDivers || []).filter(
      (item) => item?.id !== userId,
    ),
  };
}

/**
 * Valida cupo del origen y devuelve la lista de ids resultante.
 */
function assertOriginCapacity(origin, originType, userId) {
  const memberIds = getOriginMemberIds(origin);
  if (memberIds.includes(userId)) return memberIds;

  const capacity = getOriginCapacity(origin, originType);
  if (capacity > 0 && memberIds.length >= capacity) {
    throw new Error("Cupo completo");
  }

  return [...memberIds, userId];
}

/**
 * Lee contadores actuales y cae al arreglo legacy cuando aun existe.
 */
function getPlanCount(data, type) {
  const countField = `${type}Count`;
  if (typeof data?.[countField] === "number") return data[countField];
  const legacy = Array.isArray(data?.[type]) ? data[type] : [];
  return new Set(legacy.filter(Boolean)).size;
}

/**
 * Construye referencias a subcolecciones de participantes del plan.
 */
function planParticipantRef(planId, type, userId) {
  return doc(db, "planes", planId, type, userId);
}

/**
 * Convierte el usuario autenticado web al resumen persistido en storage y Firestore.
 */
export function buildWebUserSummary(user) {
  const id = getUserId(user);
  return {
    id,
    uid: user?.uid || id,
    nombre:
      user?.nombre ||
      user?.displayName ||
      user?.email?.split?.("@")?.[0] ||
      "Pul",
    email: user?.email || "",
    imagen: user?.imagen || user?.photoURL || "",
    idStripe: user?.idStripe || "",
    method: user?.method || "web-login",
  };
}

/**
 * Carga perfiles de usuario por id para enriquecer asistentes y solicitudes.
 */
export async function fetchUsersByIds(ids = []) {
  const uniqueIds = getUniqueIds(ids);
  if (!uniqueIds.length) return new Map();

  const entries = await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const snap = await getDoc(doc(db, "usuarios", userId));
        if (!snap.exists()) return [userId, normalizeUserSummary(userId)];
        return [userId, normalizeUserSummary({ id: snap.id, ...snap.data() })];
      } catch (error) {
        console.warn(`${DEBUG_PREFIX} No se pudo cargar usuario`, {
          userId,
          error,
        });
        return [userId, normalizeUserSummary(userId)];
      }
    }),
  );

  return new Map(entries);
}

/**
 * Carga integrantes del plan por paginas para no saturar planes con muchas personas.
 */
export async function fetchPlanMembersPage(planId, cursorId = "", pageSize = 100) {
  if (!planId) {
    return { users: [], nextCursor: "", hasMore: false };
  }

  const membersRef = collection(db, "planes", planId, "integrantes");
  const pageQuery = cursorId
    ? query(
        membersRef,
        orderBy(documentId()),
        startAfter(cursorId),
        limit(pageSize),
      )
    : query(membersRef, orderBy(documentId()), limit(pageSize));
  const snap = await getDocs(pageQuery);
  const memberIds = snap.docs.map((item) => item.data()?.userId || item.id);
  const usersById = await fetchUsersByIds(memberIds);

  return {
    users: memberIds.map((id) => usersById.get(id) || normalizeUserSummary(id)),
    nextCursor: snap.docs.at(-1)?.id || cursorId || "",
    hasMore: snap.docs.length === pageSize,
  };
}

export async function getLinkedPlanByOrigin(originType, originId) {
  if (!originType || !originId) return null;

  const normalizedOriginType =
    normalizeKey(originType) === "evento" || normalizeKey(originType) === "event"
      ? "evento"
      : "reservacion";
  const plansRef = collection(db, "planes");
  const plansQuery = query(
    plansRef,
    where("origenTipo", "==", normalizedOriginType),
    where("origenId", "==", originId),
  );
  const snap = await getDocs(plansQuery);
  if (snap.empty) return null;

  const planDoc =
    snap.docs.find((item) => item.data()?.estatus !== "cancelado") ||
    snap.docs[0];
  return { id: planDoc.id, ...planDoc.data() };
}

/**
 * Agrupa referencias de subcolecciones de plan usadas dentro de transacciones.
 */
export function buildLinkedPlanRefs(planId, userId) {
  return {
    planRef: doc(db, "planes", planId),
    memberRef: planParticipantRef(planId, "integrantes", userId),
    requestRef: planParticipantRef(planId, "solicitudes", userId),
    waitlistRef: doc(db, "planes", planId, "listaEspera", userId),
  };
}

/**
 * Encola dentro de una transaccion externa la union al plan ligado al origen.
 */
export function queueJoinLinkedPlanInTransaction({
  transaction,
  plan,
  planSnap,
  memberSnap,
  requestSnap,
  waitlistSnap,
  userId,
}) {
  if (!planSnap.exists()) return { status: "no-plan" };
  const freshPlan = { ...plan, id: planSnap.id, ...planSnap.data() };
  if (getPlanHostId(freshPlan) === userId) {
    return {
      status: "host",
      message: "Tú eres el anfitrión de este plan.",
      plan: freshPlan,
    };
  }

  const { planRef, memberRef } = buildLinkedPlanRefs(freshPlan.id, userId);

  if (!memberSnap.exists()) {
    transaction.set(
      memberRef,
      {
        id: userId,
        userId,
        planId: freshPlan.id,
        created_at: serverTimestamp(),
      },
      { merge: true },
    );
    transaction.update(planRef, {
      integrantes: [],
      solicitudes: [],
      integrantesCount: getPlanCount(freshPlan, "integrantes") + 1,
      solicitudesCount: Math.max(
        0,
        getPlanCount(freshPlan, "solicitudes") -
          (requestSnap.exists() ? 1 : 0),
      ),
      participantesStorage: "subcoleccion",
      updated_at: serverTimestamp(),
    });
  }
  if (requestSnap.exists()) transaction.delete(requestSnap.ref);
  if (waitlistSnap.exists()) transaction.delete(waitlistSnap.ref);

  return {
    status: memberSnap.exists() ? "joined" : "linked-joined",
    message: "También te unimos al plan relacionado.",
    plan: freshPlan,
  };
}

/**
 * Registra actividad visible del plan despues de cambios de participacion.
 */
async function recordPlanActivity(planId, type, user, message) {
  const activityRef = doc(collection(db, "planes", planId, "actividades"));
  await setDoc(activityRef, {
    id: activityRef.id,
    type,
    userId: getUserId(user) || null,
    userName: user?.nombre || user?.email || "Alguien",
    message,
    created_at: serverTimestamp(),
  });
}

/**
 * Construye payload de navegacion para abrir el detalle del plan en la app.
 */
function buildPlanNotificationData(planId) {
  return { view: "DetailsPlan", id: planId };
}

function getLinkedEntityImage(plan = {}) {
  const linked = plan.linkedEntity || {};
  return (
    linked.image ||
    linked.fotoHome ||
    linked.imagen ||
    linked.fotos?.[0] ||
    plan.image ||
    plan.fotoHome ||
    plan.imagen ||
    ""
  );
}

function getPlanEmailVariant(plan = {}) {
  const linkedType =
    plan.linkedEntity?.type || plan.linkedEntityType || plan.linkableType;
  if (linkedType === "evento") return "event";
  if (linkedType === "negocio") return "business";
  return linkedType || getPlanOriginType(plan) || "";
}

async function buildPlanEmailFallback(plan, hostUser, status, targetUser) {
  const planTitle = getPlanTitle(plan);
  const hostName =
    hostUser?.nombre ||
    hostUser?.displayName ||
    plan?.anfitrion?.nombre ||
    "El anfitrión";
  const linked = plan?.linkedEntity || {};
  const acceptedStatuses = new Set(["request_accepted", "waitlist_accepted"]);
  const membersById = new Map();

  try {
    const page = await fetchPlanMembersPage(plan?.id || "", "", 10);
    page.users.forEach((member) => {
      if (member?.id) membersById.set(member.id, member);
    });
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} No se pudieron cargar integrantes para correo`, {
      planId: plan?.id,
      error,
    });
  }

  if (acceptedStatuses.has(status) && getUserId(targetUser)) {
    const member = normalizeUserSummary(targetUser);
    membersById.set(member.id, member);
  }

  const members = Array.from(membersById.values()).slice(0, 10);
  const baseMembersCount = Number(
    plan?.integrantesCount || plan?.integrantes?.length || members.length || 1,
  );
  const membersCount = acceptedStatuses.has(status)
    ? Math.max(baseMembersCount, members.length, baseMembersCount + 1)
    : Math.max(baseMembersCount, members.length, 1);

  return {
    enabled: true,
    type: "plan",
    id: plan?.id || "",
    template: "plan-participation",
    status,
    actorName: hostName,
    plan: {
      id: plan?.id || "",
      title: planTitle,
      name: planTitle,
      subtitle: linked.title || plan?.descripcion || planTitle,
      emoji: plan?.emoji || linked.emoji || "",
      image: getLinkedEntityImage(plan),
      date: plan?.fecha || plan?.date || "",
      time: plan?.hora || plan?.time || "",
      people: plan?.personas || membersCount,
      membersCount,
      members,
      address:
        plan?.direccion ||
        linked.address ||
        plan?.address ||
        "Ubicación por confirmar",
      coordinates: plan?.coordenadas || linked.coordinates || plan?.coordinates,
      url: `${URL_PAGE}/plan/${plan?.id || ""}`,
      originType: plan?.origenTipo || plan?.originType || "",
      planVariant: getPlanEmailVariant(plan),
      hostName,
      actorName: hostName,
    },
  };
}

/**
 * Notifica al anfitrion cuando un usuario cambia su participacion.
 */
async function notifyHostPlanParticipation(plan, user, status) {
  const hostId = getPlanHostId(plan);
  const userId = getUserId(user);
  if (!hostId || hostId === userId) return;

  const planTitle = getPlanTitle(plan);
  const userName = user?.nombre || user?.email || "Alguien";
  const notifications = {
    joined: {
      title: `Se unieron a tu plan: ${planTitle}`,
      message: `${userName} se unió a tu plan: ${planTitle}`,
    },
    requested: {
      title: `Solicitud de unirse a tu plan: ${planTitle}`,
      message: `${userName} envió solicitud para unirse a tu plan: ${planTitle}`,
    },
    waitlisted: {
      title: `Lista de espera: ${planTitle}`,
      message: `${userName} se agregó a la lista de espera.`,
    },
    left: {
      title: `Se salieron de tu plan: ${planTitle}`,
      message: `${userName} se salió de tu plan: ${planTitle}`,
    },
    "request-cancelled": {
      title: `Solicitud cancelada: ${planTitle}`,
      message: `${userName} canceló su solicitud para unirse a tu plan.`,
    },
    "waitlist-cancelled": {
      title: `Lista de espera cancelada: ${planTitle}`,
      message: `${userName} salió de la lista de espera.`,
    },
  };
  const notification = notifications[status];
  if (!notification) return;

  await sendOneSignalNotification(
    [hostId],
    notification.title,
    notification.message,
    buildPlanNotificationData(plan.id),
  );
}

/**
 * Notifica al usuario cuando el anfitrion responde su solicitud o lista.
 */
async function notifyUserPlanResolution(plan, user, status, hostUser) {
  const userId = getUserId(user);
  if (!userId) return;

  const planTitle = getPlanTitle(plan);
  const hostName =
    hostUser?.nombre ||
    hostUser?.displayName ||
    plan?.anfitrion?.nombre ||
    "El anfitrión";
  const notifications = {
    requestAccepted: {
      title: `Te aceptaron tu solicitud: ${planTitle}`,
      message: "El anfitrión aceptó tu solicitud para unirte.",
    },
    requestRejected: {
      title: `Te rechazaron tu solicitud: ${planTitle}`,
      message: "El anfitrión no aceptó tu solicitud para este plan.",
    },
    waitlistAccepted: {
      title: `Aprobaron tu solicitud de lista de espera: ${planTitle}`,
      message: "El anfitrión te aceptó desde la lista de espera.",
    },
    waitlistRejected: {
      title: `Rechazaron tu solicitud de lista de espera: ${planTitle}`,
      message: "El anfitrión no pudo darte un lugar en este plan.",
    },
  };
  const notification = notifications[status];
  if (!notification) return;
  const emailStatusByResolution = {
    requestAccepted: "request_accepted",
    requestRejected: "request_rejected",
    waitlistAccepted: "waitlist_accepted",
    waitlistRejected: "waitlist_rejected",
  };
  const messageByResolution = {
    requestAccepted: `${hostName} aceptó tu solicitud del plan ${planTitle}`,
    requestRejected: `${hostName} rechazó tu solicitud del plan ${planTitle}`,
    waitlistAccepted: `${hostName} aprobó tu solicitud de lista de espera del plan ${planTitle}`,
    waitlistRejected: `${hostName} rechazó tu solicitud de lista de espera del plan ${planTitle}`,
  };

  await sendOneSignalNotification(
    [userId],
    notification.title,
    messageByResolution[status] || notification.message,
    {
      ...buildPlanNotificationData(plan.id),
      emailFallback: await buildPlanEmailFallback(
        plan,
        hostUser,
        emailStatusByResolution[status],
        user,
      ),
    },
  );
}

/**
 * Une al usuario al plan, manda solicitud o lo agrega a lista de espera segun reglas.
 */
export async function joinPlanTransaction(planId, user) {
  const userId = getUserId(user);
  if (!planId || !userId) throw new Error("No hay usuario o plan válido.");

  const planRef = doc(db, "planes", planId);
  const memberRef = planParticipantRef(planId, "integrantes", userId);
  const requestRef = planParticipantRef(planId, "solicitudes", userId);
  const waitlistRef = doc(db, "planes", planId, "listaEspera", userId);

  const result = await runTransaction(db, async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Este plan ya no existe.");

    const plan = { id: planSnap.id, ...planSnap.data() };
    const hostId = getPlanHostId(plan);
    if (hostId === userId) {
      return { status: "host", message: "Tú eres el anfitrión de este plan.", plan };
    }

    const originType = getPlanOriginType(plan);
    const originRef = getOriginRef(plan);
    const [memberSnap, requestSnap, waitlistSnap, originSnap] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(requestRef),
      transaction.get(waitlistRef),
      originRef ? transaction.get(originRef) : Promise.resolve(null),
    ]);
    const origin = originSnap?.exists()
      ? { id: originSnap.id, ...originSnap.data() }
      : null;
    if (originRef && !origin) {
      throw new Error("La reservación o evento asociado ya no existe.");
    }
    const originMemberIds = origin ? getOriginMemberIds(origin) : [];
    const isOriginMember = originMemberIds.includes(userId);

    if (memberSnap.exists()) {
      if (originRef && origin && !isOriginMember) {
        assertOriginCapacity(origin, originType, userId);
        transaction.update(originRef, {
          ...addMemberToOrigin(origin, user, userId),
          updatedAt: serverTimestamp(),
        });
      }
      return { status: "joined", message: "Ya formas parte de este plan.", plan };
    }

    const visibility = plan.visibilidad;

    // Plan privado: se crea solicitud y no integrante definitivo hasta que el
    // anfitrion acepte, salvo que el usuario ya venga del origen asociado.
    if (isPrivatePlan(visibility) && !isOriginMember) {
      if (origin) {
        assertOriginCapacity(origin, originType, userId);
      }
      if (!requestSnap.exists()) {
        const currentRequests = getPlanCount(plan, "solicitudes");
        transaction.set(
          requestRef,
          {
            id: userId,
            userId,
            planId,
            created_at: serverTimestamp(),
          },
          { merge: true },
        );
        if (waitlistSnap.exists()) transaction.delete(waitlistRef);
        transaction.update(planRef, {
          integrantes: [],
          solicitudes: [],
          solicitudesCount: currentRequests + 1,
          participantesStorage: "subcoleccion",
        });
      }
      return {
        status: "requested",
        message: "Solicitud enviada. Espera la aprobación del anfitrión.",
        plan,
      };
    }

    if (isFriendsPlan(visibility) && hostId && !isOriginMember) {
      const friendRef = doc(db, "usuarios", hostId, "amigos", userId);
      const hostRef = doc(db, "usuarios", hostId);
      const [friendSnap, hostSnap] = await Promise.all([
        transaction.get(friendRef),
        transaction.get(hostRef),
      ]);
      const isFriend =
        friendSnap.exists() ||
        Boolean(hostSnap.exists() && (hostSnap.data()?.amigos || []).includes(userId));
      if (!isFriend) {
        return {
          status: "blocked",
          message: "No puedes unirte. Este plan es solo para amigos del anfitrión.",
          plan,
        };
      }
    }

    const currentMembers = getPlanCount(plan, "integrantes");
    const capacity = getPlanCapacity(plan);

    // Si existe origen, el cupo real vive en reservacion/evento y debe validarse
    // en la misma transaccion que el alta del integrante del plan.
    if (origin) {
      assertOriginCapacity(origin, originType, userId);
    } else if (capacity > 0 && currentMembers >= capacity) {
      if (!waitlistSnap.exists()) {
        transaction.set(
          waitlistRef,
          {
            id: userId,
            userId,
            planId,
            created_at: serverTimestamp(),
          },
          { merge: true },
        );
      }
      return {
        status: "waitlisted",
        message: "El cupo está lleno. Te agregamos a la lista de espera.",
        plan,
      };
    }

    transaction.set(
      memberRef,
      {
        id: userId,
        userId,
        planId,
        created_at: serverTimestamp(),
      },
      { merge: true },
    );
    if (requestSnap.exists()) transaction.delete(requestRef);
    if (waitlistSnap.exists()) transaction.delete(waitlistRef);
    if (originRef && origin && !isOriginMember) {
      transaction.update(originRef, {
        ...addMemberToOrigin(origin, user, userId),
        updatedAt: serverTimestamp(),
      });
    }
    transaction.update(planRef, {
      integrantes: [],
      solicitudes: [],
      integrantesCount: currentMembers + 1,
      solicitudesCount: Math.max(0, getPlanCount(plan, "solicitudes") - (requestSnap.exists() ? 1 : 0)),
      participantesStorage: "subcoleccion",
    });

    return { status: "joined", message: "Te uniste a este plan.", plan };
  });

  if (["joined", "requested", "waitlisted"].includes(result.status)) {
    await recordPlanActivity(
      planId,
      result.status === "joined"
        ? "join"
        : result.status === "requested"
          ? "request"
          : "waitlist",
      user,
      result.status === "joined"
        ? `${user.nombre || user.email} se unió al plan`
        : result.status === "requested"
          ? `${user.nombre || user.email} envió solicitud para unirse`
          : `${user.nombre || user.email} se unió a la lista de espera`,
    );
    await notifyHostPlanParticipation(result.plan, user, result.status);
  }

  return result;
}

export async function joinLinkedPlanFromOrigin(originType, originId, user) {
  const userId = getUserId(user);
  if (!originType || !originId || !userId) return { status: "missing" };

  const plan = await getLinkedPlanByOrigin(originType, originId);
  if (!plan?.id) return { status: "no-plan" };

  const planRef = doc(db, "planes", plan.id);
  const memberRef = planParticipantRef(plan.id, "integrantes", userId);
  const requestRef = planParticipantRef(plan.id, "solicitudes", userId);
  const waitlistRef = doc(db, "planes", plan.id, "listaEspera", userId);
  const originRef = getOriginRef(plan);

  const result = await runTransaction(db, async (transaction) => {
    const [planSnap, memberSnap, requestSnap, waitlistSnap, originSnap] =
      await Promise.all([
        transaction.get(planRef),
        transaction.get(memberRef),
        transaction.get(requestRef),
        transaction.get(waitlistRef),
        originRef ? transaction.get(originRef) : Promise.resolve(null),
      ]);

    if (!planSnap.exists()) return { status: "no-plan" };

    const freshPlan = { id: planSnap.id, ...planSnap.data() };
    if (getPlanHostId(freshPlan) === userId) {
      return { status: "host", message: "Tú eres el anfitrión de este plan.", plan: freshPlan };
    }

    const origin = originSnap?.exists()
      ? { id: originSnap.id, ...originSnap.data() }
      : null;
    if (originRef && !origin) {
      throw new Error("La reservación o evento asociado ya no existe.");
    }
    const originPlanType = getPlanOriginType(freshPlan);
    const originMemberIds = origin ? getOriginMemberIds(origin) : [];
    const isOriginMember = originMemberIds.includes(userId);

    if (!isOriginMember && originRef && origin) {
      assertOriginCapacity(origin, originPlanType, userId);
      transaction.update(originRef, {
        ...addMemberToOrigin(origin, user, userId),
        updatedAt: serverTimestamp(),
      });
    } else if (!origin && getPlanCapacity(freshPlan) > 0) {
      const currentMembers = getPlanCount(freshPlan, "integrantes");
      if (currentMembers >= getPlanCapacity(freshPlan) && !memberSnap.exists()) {
        throw new Error("Cupo completo");
      }
    }

    if (!memberSnap.exists()) {
      transaction.set(
        memberRef,
        {
          id: userId,
          userId,
          planId: freshPlan.id,
          created_at: serverTimestamp(),
        },
        { merge: true },
      );
      transaction.update(planRef, {
        integrantes: [],
        solicitudes: [],
        integrantesCount: getPlanCount(freshPlan, "integrantes") + 1,
        solicitudesCount: Math.max(
          0,
          getPlanCount(freshPlan, "solicitudes") -
            (requestSnap.exists() ? 1 : 0),
        ),
        participantesStorage: "subcoleccion",
      });
    }
    if (requestSnap.exists()) transaction.delete(requestRef);
    if (waitlistSnap.exists()) transaction.delete(waitlistRef);

    return {
      status: memberSnap.exists() ? "joined" : "linked-joined",
      message: "También te unimos al plan relacionado.",
      plan: freshPlan,
    };
  });

  if (result.status === "linked-joined") {
    await recordPlanActivity(
      plan.id,
      "join",
      user,
      `${user.nombre || user.email} se unió al plan`,
    );
    await notifyHostPlanParticipation(result.plan, user, "joined");
  }

  return result;
}

/**
 * Quita al usuario de integrantes, solicitudes o lista de espera en una transaccion.
 */
export async function leavePlanTransaction(planId, user) {
  const userId = getUserId(user);
  if (!planId || !userId) throw new Error("No hay usuario o plan válido.");

  const planRef = doc(db, "planes", planId);
  const memberRef = planParticipantRef(planId, "integrantes", userId);
  const requestRef = planParticipantRef(planId, "solicitudes", userId);
  const waitlistRef = doc(db, "planes", planId, "listaEspera", userId);

  const result = await runTransaction(db, async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Este plan ya no existe.");
    const plan = { id: planSnap.id, ...planSnap.data() };
    if (getPlanHostId(plan) === userId) {
      return { status: "host", message: "No puedes salir, eres el anfitrión.", plan };
    }

    const originRef = getOriginRef(plan);
    const [memberSnap, requestSnap, waitlistSnap, originSnap] = await Promise.all([
      transaction.get(memberRef),
      transaction.get(requestRef),
      transaction.get(waitlistRef),
      originRef ? transaction.get(originRef) : Promise.resolve(null),
    ]);
    const origin = originSnap?.exists()
      ? { id: originSnap.id, ...originSnap.data() }
      : null;
    if (memberSnap.exists() && originRef && !origin) {
      throw new Error("La reservación o evento asociado ya no existe.");
    }

    if (memberSnap.exists() && originRef && origin) {
      // Usuarios con pagos/divisiones pendientes no pueden salir porque dejarian
      // la cuenta o la compra relacionada en estado inconsistente.
      if (getOriginExitBlockedIds(origin).has(userId)) {
        throw new Error(
          "No puedes salir de este plan porque estás en división de cuenta o tienes pagos asociados.",
        );
      }
      transaction.update(originRef, {
        ...removeMemberFromOrigin(origin, userId),
        updatedAt: serverTimestamp(),
      });
    }

    const updates = {
      integrantes: [],
      solicitudes: [],
      participantesStorage: "subcoleccion",
      integrantesCount: Math.max(
        0,
        getPlanCount(plan, "integrantes") - (memberSnap.exists() ? 1 : 0),
      ),
      solicitudesCount: Math.max(
        0,
        getPlanCount(plan, "solicitudes") - (requestSnap.exists() ? 1 : 0),
      ),
    };

    if (memberSnap.exists()) transaction.delete(memberRef);
    if (requestSnap.exists()) transaction.delete(requestRef);
    if (waitlistSnap.exists()) transaction.delete(waitlistRef);
    transaction.update(planRef, updates);

    if (memberSnap.exists()) return { status: "left", message: "Te saliste del plan.", plan };
    if (requestSnap.exists()) return { status: "request-cancelled", message: "Tu solicitud fue cancelada.", plan };
    if (waitlistSnap.exists()) return { status: "waitlist-cancelled", message: "Saliste de la lista de espera.", plan };
    return { status: "none", message: "No tenías una participación activa.", plan };
  });

  if (["left", "request-cancelled", "waitlist-cancelled"].includes(result.status)) {
    await recordPlanActivity(
      planId,
      result.status === "left" ? "leave" : "cancel_request",
      user,
      result.status === "left"
        ? `${user.nombre || user.email} salió del plan`
        : `${user.nombre || user.email} canceló su participación`,
    );
    await notifyHostPlanParticipation(result.plan, user, result.status);
  }

  return result;
}

/**
 * Permite al anfitrion aceptar o rechazar solicitudes pendientes.
 */
export async function resolvePlanRequest(planId, hostUser, targetUser, action) {
  const hostId = getUserId(hostUser);
  const targetUserId = getUserId(targetUser);
  if (!planId || !hostId || !targetUserId) throw new Error("Datos incompletos.");

  const planRef = doc(db, "planes", planId);
  const memberRef = planParticipantRef(planId, "integrantes", targetUserId);
  const requestRef = planParticipantRef(planId, "solicitudes", targetUserId);

  const result = await runTransaction(db, async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Este plan ya no existe.");
    const plan = { id: planSnap.id, ...planSnap.data() };
    if (getPlanHostId(plan) !== hostId) {
      throw new Error("Solo el anfitrión puede gestionar solicitudes.");
    }

    const originType = getPlanOriginType(plan);
    const originRef = getOriginRef(plan);
    const [requestSnap, memberSnap, originSnap] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(memberRef),
      originRef ? transaction.get(originRef) : Promise.resolve(null),
    ]);
    if (!requestSnap.exists()) {
      return { status: "missing", message: "La solicitud ya no está pendiente.", plan };
    }
    const origin = originSnap?.exists()
      ? { id: originSnap.id, ...originSnap.data() }
      : null;
    if (originRef && !origin) {
      throw new Error("La reservación o evento asociado ya no existe.");
    }

    const currentRequests = getPlanCount(plan, "solicitudes");
    const currentMembers = getPlanCount(plan, "integrantes");

    transaction.delete(requestRef);

    if (action === "accept") {
      if (originRef && origin) {
        assertOriginCapacity(origin, originType, targetUserId);
        transaction.update(originRef, {
          ...addMemberToOrigin(origin, targetUser, targetUserId),
          updatedAt: serverTimestamp(),
        });
      }
      if (!memberSnap.exists()) {
        transaction.set(
          memberRef,
          {
            id: targetUserId,
            userId: targetUserId,
            planId,
            created_at: serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    transaction.update(planRef, {
      integrantes: [],
      solicitudes: [],
      integrantesCount:
        action === "accept" && !memberSnap.exists()
          ? currentMembers + 1
          : currentMembers,
      solicitudesCount: Math.max(0, currentRequests - 1),
      participantesStorage: "subcoleccion",
    });

    return {
      status: action === "accept" ? "accepted" : "rejected",
      message:
        action === "accept"
          ? "Solicitud aceptada."
          : "Solicitud rechazada.",
      plan,
    };
  });

  if (["accepted", "rejected"].includes(result.status)) {
    await recordPlanActivity(
      planId,
      result.status === "accepted" ? "accept_request" : "reject_request",
      targetUser,
      result.status === "accepted"
        ? `${targetUser.nombre || targetUser.email} fue aceptado al plan`
        : `${targetUser.nombre || targetUser.email} fue rechazado del plan`,
    );
    await notifyUserPlanResolution(
      result.plan,
      targetUser,
      result.status === "accepted" ? "requestAccepted" : "requestRejected",
      hostUser,
    );
  }

  return result;
}

/**
 * Permite al anfitrion aceptar o quitar usuarios de la lista de espera.
 */
export async function resolveWaitlistUser(planId, hostUser, targetUser, action) {
  const hostId = getUserId(hostUser);
  const targetUserId = getUserId(targetUser);
  if (!planId || !hostId || !targetUserId) throw new Error("Datos incompletos.");

  const planRef = doc(db, "planes", planId);
  const memberRef = planParticipantRef(planId, "integrantes", targetUserId);
  const waitlistRef = doc(db, "planes", planId, "listaEspera", targetUserId);

  const result = await runTransaction(db, async (transaction) => {
    const planSnap = await transaction.get(planRef);
    if (!planSnap.exists()) throw new Error("Este plan ya no existe.");
    const plan = { id: planSnap.id, ...planSnap.data() };
    if (getPlanHostId(plan) !== hostId) {
      throw new Error("Solo el anfitrión puede gestionar lista de espera.");
    }
    if (getPlanOriginType(plan) && getPlanOriginId(plan)) {
      throw new Error(
        "Este plan viene de una reservación o evento y no usa lista de espera.",
      );
    }

    const [waitlistSnap, memberSnap] = await Promise.all([
      transaction.get(waitlistRef),
      transaction.get(memberRef),
    ]);
    if (!waitlistSnap.exists()) {
      return { status: "missing", message: "El usuario ya no está en lista de espera." };
    }

    const currentMembers = getPlanCount(plan, "integrantes");
    transaction.delete(waitlistRef);

    if (action === "accept" && !memberSnap.exists()) {
      transaction.set(
        memberRef,
        {
          id: targetUserId,
          userId: targetUserId,
          planId,
          created_at: serverTimestamp(),
        },
        { merge: true },
      );
      transaction.update(planRef, {
        integrantes: [],
        solicitudes: [],
        integrantesCount: currentMembers + 1,
        participantesStorage: "subcoleccion",
      });
    }

    return {
      status: action === "accept" ? "accepted" : "rejected",
      message:
        action === "accept"
          ? "Usuario aceptado desde lista de espera."
          : "Usuario eliminado de lista de espera.",
      plan,
    };
  });

  if (["accepted", "rejected"].includes(result.status)) {
    await recordPlanActivity(
      planId,
      result.status === "accepted" ? "accept_waitlist" : "reject_request",
      targetUser,
      result.status === "accepted"
        ? `${targetUser.nombre || targetUser.email} fue aceptado desde lista de espera`
        : `${targetUser.nombre || targetUser.email} fue rechazado de lista de espera`,
    );
    await notifyUserPlanResolution(
      result.plan,
      targetUser,
      result.status === "accepted" ? "waitlistAccepted" : "waitlistRejected",
      hostUser,
    );
  }

  return result;
}
