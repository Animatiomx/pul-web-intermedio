/**
 * Obtiene el identificador canonico de un usuario sin importar la forma
 * en que venga desde Firebase, backend o storage local.
 */
export function getUserId(user) {
  return user?.id || user?.uid || user?.userId || "";
}

/**
 * Reduce un usuario completo o un id suelto a los datos minimos que usa la UI.
 */
export function normalizeUserSummary(value, fallbackId = "") {
  if (value && typeof value === "object") {
    const id = getUserId(value) || fallbackId;
    return {
      id,
      nombre:
        value.nombre ||
        value.name ||
        value.displayName ||
        value.email ||
        id ||
        "Pul",
      imagen: value.imagen || value.image || value.avatar || value.foto || "",
      email: value.email || "",
    };
  }

  const id = String(value || fallbackId || "");
  return {
    id,
    nombre: id ? id : "Usuario Pul",
    imagen: "",
    email: "",
  };
}

/**
 * Extrae ids unicos de una mezcla de strings y objetos de usuario.
 */
export function getUniqueIds(values = []) {
  return [
    ...new Set(
      values
        .map((value) => (typeof value === "object" ? getUserId(value) : value))
        .filter(Boolean)
        .map(String),
    ),
  ];
}
