// src/mail/recipients.ts
/** Merge requester + subscriber emails into a deduplicated recipient list.
 *  All emails are lower-cased; the event actor (`excludeEmail`) is removed so
 *  they never get a notification about their own action. */
export function collectRecipients(opts: {
  requesterEmail: string;
  subscribers: string[];
  includeRequester?: boolean;
  includeSubscribers?: boolean;
  excludeEmail?: string;
}): string[] {
  const set = new Set<string>();
  if (opts.includeRequester) set.add(opts.requesterEmail.trim().toLowerCase());
  if (opts.includeSubscribers)
    for (const s of opts.subscribers) set.add(s.trim().toLowerCase());
  if (opts.excludeEmail) set.delete(opts.excludeEmail.trim().toLowerCase());
  return [...set];
}
