// Demo transport boundary. Replace this adapter when real APIs are connected.
export async function demoMatchCommand(token: string, body: object) {
  const response = await fetch("/api/demo/lobbies", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "No se pudo completar la acción.");
  return result;
}
