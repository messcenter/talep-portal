// src/domain/hosted-domain.ts
/** Whether an email belongs to the configured hosted domain (e.g. kokilmetal.com.tr).
 *  Used when adding subscribers (CC) to keep access within the corporate domain. */
export function isHostedDomain(email: string, hostedDomain: string): boolean {
  const e = email.trim().toLowerCase();
  const d = hostedDomain.trim().toLowerCase();
  return e.endsWith("@" + d);
}
