/**
 * Cliente POST JSON comun para endpoints opcionales del backend.
 */
export async function postJson(endpoint, payload) {
  if (!endpoint) return null;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Request failed with ${response.status}`;
    try {
      const errorPayload = await response.json();
      message = errorPayload?.message || message;
    } catch {
      // Keep the generic status error if the backend did not return JSON.
    }
    throw new Error(message);
  }

  return response.json();
}
