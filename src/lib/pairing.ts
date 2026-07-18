const LS_PAIRING_KEY = "spx-pairing-token";

export function readPairingToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LS_PAIRING_KEY);
}

export function writePairingToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_PAIRING_KEY, token);
}

export function clearPairingToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_PAIRING_KEY);
}

export function getPhoneUrlFromToken(baseUrl: string, token: string): string {
  const url = new URL(baseUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
  url.searchParams.set("session", token);
  // QR scanners on phones require an absolute URL — pathname alone has no host.
  return url.toString();
}

export function readSessionTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("session");
}
