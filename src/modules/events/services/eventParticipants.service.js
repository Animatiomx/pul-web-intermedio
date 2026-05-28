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
