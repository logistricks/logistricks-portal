/**
 * lib/untrusted.ts — text that came from an outside email (via the AI) and is about to be stored or re-sent.
 * Links and control characters are removed so a crafted email cannot use the portal to pass a phishing link on to carriers.
 */
export function stripLinks(v: string): string {
  return v
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "")
    .replace(/\b(?:https?|ftp|file|javascript|data):[^\s)>\]]*/gi, "[link removed]")
    .replace(/\bwww\.[^\s)>\]]+/gi, "[link removed]")
}
