import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
} from "firebase/firestore";
import { db } from "../../../firebase";
import { normalizeUserSummary } from "../../../shared/utils/users";

/**
 * Lee asistentes publicos de un evento desde la subcoleccion
 * `eventos/{eventId}/integrantes`.
 *
 * Esta lista excluye compras invitadas no reclamadas: esas compras viven en
 * `eventosUsers` y `ticketClaims`, pero no deben aparecer en asistentes ni
 * incrementar `integrantesCount` hasta que el boleto se asocie a una cuenta.
 */
export async function fetchEventParticipantsPage(
  eventId,
  cursorId = "",
  pageSize = 50,
) {
  if (!eventId) {
    return { users: [], nextCursor: "", hasMore: false };
  }

  const participantsRef = collection(db, "eventos", eventId, "integrantes");
  const pageQuery = cursorId
    ? query(
        participantsRef,
        orderBy(documentId()),
        startAfter(cursorId),
        limit(pageSize),
      )
    : query(participantsRef, orderBy(documentId()), limit(pageSize));
  const snap = await getDocs(pageQuery);

  return {
    users: snap.docs.map((item) =>
      normalizeUserSummary({
        id: item.id,
        ...item.data(),
      }),
    ),
    nextCursor: snap.docs.at(-1)?.id || cursorId || "",
    hasMore: snap.docs.length === pageSize,
  };
}
