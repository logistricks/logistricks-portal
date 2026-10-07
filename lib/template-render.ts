/**
 * lib/template-render.ts — one place that fills an email/WhatsApp template.
 *
 *   {{variable}}                       -> the value (blank / kept as typed when unknown, see keepUnknown)
 *   {{pickup_address}}                 -> the pickup address, only when the request's incoterm is EXW
 *   {{request_ref}}                    -> the request number, e.g. LT-0034 (carriers quote it back, replies are matched on it)
 *   [if special requests] ... [end if]  -> same idea: kept only when the request has special requests.
 *   [if EXW] ... [end if] block        -> kept only when the incoterm is EXW AND a pickup address exists, otherwise
 *                                         removed completely, together with its own line and the blank line after it.
 *                                         In the editor the block is made of two chips (data-cond="start" / "end");
 *                                         typed {{#if_exw}} ... {{/if_exw}} works too.
 */
import { hasText, isExw } from "@/lib/shipment-labels"

const GAP = "[\\s\\u200b]*"
// a block that sits alone in its <div>/<p>, plus the empty spacer line that follows it
const loneBlock = (tag: string) => new RegExp(
  "<(div|p)\\b[^>]*>" + GAP + "\\{\\{#if_" + tag + "\\}\\}[\\s\\S]*?\\{\\{\\/if_" + tag + "\\}\\}" + GAP + "<\\/\\1>" +
  "(?:" + GAP + "<(div|p)\\b[^>]*>" + GAP + "(?:<br\\s*\\/?>" + GAP + ")?<\\/\\2>)?", "gi")
const anyBlock = (tag: string) => new RegExp("\\{\\{#if_" + tag + "\\}\\}([\\s\\S]*?)\\{\\{\\/if_" + tag + "\\}\\}", "g")

export function applyTemplate(text: string, vars: Record<string, string>, opts: { keepUnknown?: boolean } = {}): string {
  const exw = isExw(vars.incoterm)
  const pickup = exw ? String(vars.pickup_address ?? "") : ""
  const show = exw && hasText(pickup)
  let s = String(text ?? "")
  // editor chips -> markers. EXW block: data-cond="start|end"; special-requests block: data-cond="special-start|special-end"
  s = s.replace(/<span[^>]*data-cond="(start|end)"[^>]*>[\s\S]*?<\/span>/gi, (_m, k: string) => (k === "start" ? "{{#if_exw}}" : "{{/if_exw}}"))
  s = s.replace(/<span[^>]*data-cond="special-(start|end)"[^>]*>[\s\S]*?<\/span>/gi, (_m, k: string) => (k === "start" ? "{{#if_special}}" : "{{/if_special}}"))
  // conditional blocks: kept only when there is something to show, otherwise removed with their own line
  const hasSpecial = hasText(vars.special_requirements)
  for (const [tag, on] of [["exw", show], ["special", hasSpecial]] as const) {
    if (!on) s = s.replace(loneBlock(tag), "")
    s = s.replace(anyBlock(tag), (_m, inner: string) => (on ? inner : ""))
    s = s.replace(new RegExp("\\{\\{[#/]if_" + tag + "\\}\\}", "g"), "")   // a lone marker never reaches a recipient
  }

  const isHtml = /<[a-z][^>]*>/i.test(s)
  const esc = (v: string) => (isHtml ? v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : v)
  const value = (key: string): string | null =>
    key === "pickup_address" ? pickup : key in vars ? (vars[key] ?? "") : opts.keepUnknown ? null : ""

  // Variable chips from the editor (orange pills) become plain text — the pill styling must never reach a recipient.
  s = s.replace(/<span[^>]*data-var="(\w+)"[^>]*>[\s\S]*?<\/span>/gi, (_m, key: string) => {
    const v = value(key)
    return v === null ? `{{${key}}}` : esc(v)
  })
  return s.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = value(key)
    return v === null ? `{{${key}}}` : esc(v)
  })
}

/** True when the template shows the request number (variable chip or typed {{request_ref}}) in its body or subject. */
export function templateHasRef(t: { subject?: string | null; body?: string | null }): boolean {
  return /request_ref/.test(`${t.subject ?? ""} ${t.body ?? ""}`)
}
