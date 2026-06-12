export type GoogleProfile = {
  email: string;
  name?: string;
  hd?: string;
};

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  hostedDomain: string;
  state: string;
}): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("hd", opts.hostedDomain);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("prompt", "select_account");
  return u.toString();
}

export function verifyDomain(
  profile: { email: string; hd?: string },
  hostedDomain: string,
): boolean {
  if (!profile.hd || profile.hd !== hostedDomain) return false;
  const domain = profile.email.split("@")[1]?.toLowerCase();
  return domain === hostedDomain.toLowerCase();
}

// I/O — exchanges the code for a profile. Not unit tested (network);
// covered indirectly and kept thin.
export async function exchangeCode(opts: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<GoogleProfile> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`token exchange failed: ${res.status} ${body}`);
  }
  const tokens = (await res.json()) as { id_token: string };
  const payload = decodeJwtPayload(tokens.id_token);
  return {
    email: String(payload.email ?? ""),
    name: payload.name ? String(payload.name) : undefined,
    hd: payload.hd ? String(payload.hd) : undefined,
  };
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split(".")[1];
  if (!part) throw new Error("malformed id_token");
  return JSON.parse(Buffer.from(part, "base64url").toString());
}
