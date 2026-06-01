import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "../../../firebase";
import { getUserId } from "../../../shared/utils/users";
import {
  buildLinkedPlanRefs,
  getLinkedPlanByOrigin,
  queueJoinLinkedPlanInTransaction,
} from "../../plans/services/planParticipation.service";

const PAYMENT_LOCK_TTL_MS = 1000 * 60 * 10;

function toMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

function uniqueById(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export class ReservationConcurrencyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ReservationConcurrencyError";
    this.code = code;
  }
}

export function getReservationMemberIds(reservation = {}) {
  return [
    ...new Set(
      [
        ...(Array.isArray(reservation.integrantesIds)
          ? reservation.integrantesIds
          : []),
        ...(Array.isArray(reservation.integrantes)
          ? reservation.integrantes.map((member) => member?.id)
          : []),
      ].filter(Boolean),
    ),
  ];
}

export function getPendingPaymentRequest(reservation = {}, userId = "") {
  if (!reservation || !userId) return null;

  const request = (reservation.paymentRequests || []).find(
    (item) => item?.id === userId && item?.status === "pending",
  );
  if (request) return request;

  const dividersCurso = Array.isArray(reservation.dividersCurso)
    ? reservation.dividersCurso
    : [];
  if (!dividersCurso.includes(userId)) return null;

  const cuentaCurso = reservation.cuentaCurso || {};
  const monto = Number(
    cuentaCurso.cu || cuentaCurso.total || cuentaCurso.subtotal || 0,
  );
  if (monto <= 0) return null;

  const member = (reservation.integrantes || []).find(
    (item) => item?.id === userId,
  );

  return {
    id: userId,
    nombre: member?.nombre || "",
    imagen: member?.imagen || "",
    monto,
    status: "pending",
  };
}

export function shouldHideReservationForUser(reservation = {}, userId = "") {
  const status = reservation.status || "";
  if (!["cancelada", "curso", "finalizada"].includes(status)) return false;
  if (!userId) return false;
  return !getReservationMemberIds(reservation).includes(userId);
}

function buildSelfJoinedMember(user, userId) {
  return {
    id: userId,
    nombre: user?.nombre || user?.email || "",
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

async function joinMemberInRef({
  targetRef,
  user,
  missingMessage,
  closedMessage,
  alreadyMessage,
  fullMessage,
  capacityField = "noPersonas",
  includeReviewers = false,
  closedStatuses = [
    "cancelada",
    "cancelado",
    "curso",
    "finalizada",
    "finalizado",
  ],
  linkedPlan = null,
}) {
  const userId = getUserId(user);
  if (!targetRef || !userId) {
    throw new ReservationConcurrencyError(
      "missing",
      "No se pudo identificar el recurso o el usuario.",
    );
  }

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(targetRef);
    if (!snap.exists()) {
      throw new ReservationConcurrencyError("missing", missingMessage);
    }

    const data = { id: snap.id, ...snap.data() };
    const linkedPlanRefs = linkedPlan?.id
      ? buildLinkedPlanRefs(linkedPlan.id, userId)
      : null;
    const [linkedPlanSnap, linkedMemberSnap, linkedRequestSnap, linkedWaitlistSnap] =
      linkedPlanRefs
        ? await Promise.all([
            transaction.get(linkedPlanRefs.planRef),
            transaction.get(linkedPlanRefs.memberRef),
            transaction.get(linkedPlanRefs.requestRef),
            transaction.get(linkedPlanRefs.waitlistRef),
          ])
        : [null, null, null, null];

    const status = String(data.status || "").toLowerCase();
    if (closedStatuses.includes(status)) {
      throw new ReservationConcurrencyError("closed", closedMessage);
    }

    const integrantes = uniqueById(data.integrantes || []);
    const integrantesIds = new Set([
      ...(data.integrantesIds || []),
      ...integrantes.map((member) => member.id),
    ]);

    const existingMember = integrantes.find((member) => member.id === userId);

    const capacity = Number(data[capacityField] || data.noPersonas || 0);
    if (!existingMember && capacity > 0 && integrantesIds.size >= capacity) {
      throw new ReservationConcurrencyError("full", fullMessage);
    }

    const member = existingMember || buildSelfJoinedMember(user, userId);

    if (!existingMember) {
      const nextIntegrantes = uniqueById([...integrantes, member]);
      const nextIntegrantesIds = nextIntegrantes.map((item) => item.id);
      const patch = {
        integrantes: nextIntegrantes,
        integrantesIds: nextIntegrantesIds,
        updatedAt: serverTimestamp(),
      };

      if (includeReviewers) {
        patch.reviewers = [...new Set([...(data.reviewers || []), userId])];
      }

      transaction.update(targetRef, patch);
    }

    let linkedPlanResult = null;
    if (linkedPlanRefs && linkedPlanSnap) {
      linkedPlanResult = queueJoinLinkedPlanInTransaction({
        transaction,
        plan: linkedPlan,
        planSnap: linkedPlanSnap,
        memberSnap: linkedMemberSnap,
        requestSnap: linkedRequestSnap,
        waitlistSnap: linkedWaitlistSnap,
        userId,
      });
    }

    return {
      member,
      data,
      alreadyMember: Boolean(existingMember),
      linkedPlan: linkedPlanResult,
      alreadyMessage,
    };
  });
}

export async function joinReservationTransaction(reservationId, user) {
  const linkedPlan = await getLinkedPlanByOrigin("reservacion", reservationId);
  const result = await joinMemberInRef({
    targetRef: doc(db, "reservaciones", reservationId),
    user,
    missingMessage: "La reservación ya no existe.",
    closedMessage: "La reservación ya no acepta integrantes.",
    alreadyMessage: "Ya formas parte de esta reservación.",
    fullMessage: "El cupo de esta reservación ya está lleno.",
    capacityField: "noPersonas",
    includeReviewers: true,
    linkedPlan,
  });

  return { member: result.member, reservation: result.data };
}

export async function joinEventDetailTransaction(eventDetailId, user) {
  const userId = getUserId(user);
  if (!eventDetailId || !userId) {
    throw new ReservationConcurrencyError(
      "missing",
      "No se pudo identificar el evento o el usuario.",
    );
  }

  const linkedPlan = await getLinkedPlanByOrigin("evento", eventDetailId);
  const result = await runTransaction(db, async (transaction) => {
    const reservationRef = doc(db, "reservaciones", eventDetailId);
    const eventUserRef = doc(db, "eventosUsers", eventDetailId);
    const linkedPlanRefs = linkedPlan?.id
      ? buildLinkedPlanRefs(linkedPlan.id, userId)
      : null;

    const [
      reservationSnap,
      eventUserSnap,
      linkedPlanSnap,
      linkedMemberSnap,
      linkedRequestSnap,
      linkedWaitlistSnap,
    ] = await Promise.all([
      transaction.get(reservationRef),
      transaction.get(eventUserRef),
      linkedPlanRefs
        ? transaction.get(linkedPlanRefs.planRef)
        : Promise.resolve(null),
      linkedPlanRefs
        ? transaction.get(linkedPlanRefs.memberRef)
        : Promise.resolve(null),
      linkedPlanRefs
        ? transaction.get(linkedPlanRefs.requestRef)
        : Promise.resolve(null),
      linkedPlanRefs
        ? transaction.get(linkedPlanRefs.waitlistRef)
        : Promise.resolve(null),
    ]);

    const baseData = reservationSnap.exists()
      ? { id: reservationSnap.id, ...reservationSnap.data() }
      : eventUserSnap.exists()
        ? { id: eventUserSnap.id, ...eventUserSnap.data() }
        : null;
    if (!baseData) {
      throw new ReservationConcurrencyError(
        "missing",
        "El evento ya no existe.",
      );
    }

    const status = String(baseData.status || "").toLowerCase();
    if (["cancelada", "cancelado", "curso"].includes(status)) {
      throw new ReservationConcurrencyError(
        "closed",
        "Este evento ya no acepta integrantes.",
      );
    }

    const integrantes = uniqueById(baseData.integrantes || []);
    const integrantesIds = new Set([
      ...(baseData.integrantesIds || []),
      ...integrantes.map((member) => member.id),
    ]);
    const existingMember = integrantes.find((member) => member.id === userId);
    const capacity = Number(baseData.personas || baseData.noPersonas || 0);
    if (!existingMember && capacity > 0 && integrantesIds.size >= capacity) {
      throw new ReservationConcurrencyError(
        "full",
        "El cupo de este evento ya está lleno.",
      );
    }

    const member = existingMember || buildSelfJoinedMember(user, userId);
    if (!existingMember) {
      const nextIntegrantes = uniqueById([...integrantes, member]);
      const nextIntegrantesIds = nextIntegrantes.map((item) => item.id);
      const sharedPatch = {
        integrantes: nextIntegrantes,
        integrantesIds: nextIntegrantesIds,
        updatedAt: serverTimestamp(),
      };

      if (reservationSnap.exists()) {
        transaction.update(reservationRef, sharedPatch);
      }
      if (eventUserSnap.exists()) {
        transaction.update(eventUserRef, sharedPatch);
      }
    }

    let linkedPlanResult = null;
    if (linkedPlanRefs && linkedPlanSnap) {
      linkedPlanResult = queueJoinLinkedPlanInTransaction({
        transaction,
        plan: linkedPlan,
        planSnap: linkedPlanSnap,
        memberSnap: linkedMemberSnap,
        requestSnap: linkedRequestSnap,
        waitlistSnap: linkedWaitlistSnap,
        userId,
      });
    }

    return {
      member,
      eventDetail: baseData,
      alreadyMember: Boolean(existingMember),
      linkedPlan: linkedPlanResult,
    };
  });

  return { member: result.member, eventDetail: result.eventDetail };
}

async function beginPaymentFromRef(targetRef, targetLabel, userId) {
  if (!targetRef || !userId) {
    throw new ReservationConcurrencyError(
      "missing",
      "No se pudo identificar el pago.",
    );
  }

  const lockId = `${userId}-${Date.now()}`;
  const now = Date.now();
  const expiresAt = new Date(now + PAYMENT_LOCK_TTL_MS);

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(targetRef);
    if (!snap.exists()) {
      throw new ReservationConcurrencyError(
        "missing",
        `${targetLabel} ya no existe.`,
      );
    }

    const data = snap.data();
    const request = getPendingPaymentRequest(data, userId);
    const isCurso = data?.status === "curso";
    const pendingRequest = isCurso
      ? (data?.paymentRequests || []).find(
          (item) => item?.id === userId && item?.status === "pending",
        )
      : request;
    const payers = isCurso ? [] : data?.payers || [];
    const alreadyPaid = Boolean(
      !isCurso &&
        (request?.status === "paid" ||
          payers.some((payer) => payer.id === userId)),
    );

    if (!pendingRequest || alreadyPaid) {
      throw new ReservationConcurrencyError(
        "not-pending",
        "Este pago ya no está pendiente.",
      );
    }

    const paymentLocks = { ...(data.paymentLocks || {}) };
    const existingLock = paymentLocks[userId];
    if (existingLock && toMillis(existingLock.expiresAt) > now) {
      throw new ReservationConcurrencyError(
        "payment-locked",
        "Ya hay un pago en proceso para esta solicitud.",
      );
    }

    paymentLocks[userId] = {
      lockId,
      lockedAt: new Date(now),
      startedAt: new Date(now),
      expiresAt,
      monto: request.monto,
    };

    transaction.update(targetRef, {
      paymentLocks,
      updatedAt: serverTimestamp(),
    });

    return { lockId, request };
  });
}

async function releasePaymentLockFromRef(targetRef, userId, lockId) {
  if (!targetRef || !userId || !lockId) return;

  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(targetRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const paymentLocks = { ...(data.paymentLocks || {}) };
    if (paymentLocks[userId]?.lockId !== lockId) return;

    delete paymentLocks[userId];
    transaction.update(targetRef, {
      paymentLocks,
      updatedAt: serverTimestamp(),
    });
  });
}

async function completePaymentFromRef({
  targetRef,
  targetLabel,
  userId,
  lockId,
  paymentIntentId = "",
  payer,
}) {
  if (!targetRef || !userId || !lockId) {
    throw new ReservationConcurrencyError(
      "missing",
      "No se pudo identificar el pago.",
    );
  }

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(targetRef);
    if (!snap.exists()) {
      throw new ReservationConcurrencyError(
        "missing",
        `${targetLabel} ya no existe.`,
      );
    }

    const data = snap.data();
    const paymentLocks = { ...(data.paymentLocks || {}) };
    const activeLock = paymentLocks[userId];
    if (activeLock?.lockId !== lockId) {
      throw new ReservationConcurrencyError(
        "payment-locked",
        "El pago ya fue actualizado desde otro dispositivo.",
      );
    }

    const nextDividersCurso = (data.dividersCurso || []).filter(
      (id) => id !== userId,
    );
    const paymentRequests = (data.paymentRequests || []).map((request) =>
      request.id === userId
        ? {
            ...request,
            status: "paid",
            paidAt: new Date(),
          }
        : request,
    );
    const requestExists =
      paymentRequests.some((request) => request.id === userId) ||
      (data.dividersCurso || []).includes(userId);
    if (!requestExists) {
      throw new ReservationConcurrencyError(
        "not-pending",
        "La solicitud de pago ya no existe.",
      );
    }

    const payersCurso = uniqueById([
      ...(data.payersCurso || []).filter((item) => item.id !== userId),
      payer,
    ]);
    const payers = uniqueById([
      ...(data.payers || []).filter((item) => item.id !== userId),
      payer,
    ]);
    const integrantes = (data.integrantes || []).map((integrante) =>
      integrante.id === userId
        ? { ...integrante, pagado: "Pagado" }
        : integrante,
    );
    const integrantesDivers = (data.integrantesDivers || []).map((integrante) =>
      integrante.id === userId
        ? { ...integrante, pagado: "Pagado" }
        : integrante,
    );
    const pendingPaymentUserIds = (data.pendingPaymentUserIds || []).filter(
      (id) => id !== userId,
    );
    const allPaid =
      nextDividersCurso.length === 0 &&
      (!paymentRequests.length ||
        paymentRequests.every((request) => request.status !== "pending"));

    delete paymentLocks[userId];

    transaction.update(targetRef, {
      paymentRequests,
      pendingPaymentUserIds,
      paymentRequestStatus: allPaid ? "complete" : "requested",
      payers,
      payersCurso,
      dividersCurso: nextDividersCurso,
      integrantes,
      integrantesDivers,
      dividers: (data.dividers || []).filter((id) => id !== userId),
      idPagos: paymentIntentId
        ? Array.from(new Set([...(data.idPagos || []), paymentIntentId]))
        : data.idPagos || [],
      paymentLocks,
      updatedAt: serverTimestamp(),
    });

    return { allPaid };
  });
}

export async function beginReservationPayment(reservationId, userId) {
  return beginPaymentFromRef(
    doc(db, "reservaciones", reservationId),
    "La reservación",
    userId,
  );
}

export async function beginEventDetailPayment(eventDetailId, userId) {
  return beginPaymentFromRef(
    doc(db, "eventosUsers", eventDetailId),
    "El evento",
    userId,
  );
}

export async function releaseReservationPaymentLock(
  reservationId,
  userId,
  lockId,
) {
  return releasePaymentLockFromRef(
    doc(db, "reservaciones", reservationId),
    userId,
    lockId,
  );
}

export async function releaseEventDetailPaymentLock(
  eventDetailId,
  userId,
  lockId,
) {
  return releasePaymentLockFromRef(
    doc(db, "eventosUsers", eventDetailId),
    userId,
    lockId,
  );
}

export async function completeReservationPayment({
  reservationId,
  userId,
  lockId,
  paymentIntentId = "",
  payer,
}) {
  return completePaymentFromRef({
    targetRef: doc(db, "reservaciones", reservationId),
    targetLabel: "La reservación",
    userId,
    lockId,
    paymentIntentId,
    payer,
  });
}

export async function completeEventDetailPayment({
  eventDetailId,
  userId,
  lockId,
  paymentIntentId = "",
  payer,
}) {
  return completePaymentFromRef({
    targetRef: doc(db, "eventosUsers", eventDetailId),
    targetLabel: "El evento",
    userId,
    lockId,
    paymentIntentId,
    payer,
  });
}
