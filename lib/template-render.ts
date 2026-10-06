/**
 * lib/template-render.ts — one place that fills an email/WhatsApp template.
 *
 *   {{variable}}                       -> the value (blank / kept as typed when unknown, see keepUnknown)
 *   {{pickup_address}}                 -> the pickup address, only when the request's incoterm is EXW
 *   {{request_ref}}                    -> the request number, e.g. LT-0034 (carriers quote it back, replies are matched on it)
 *   [if EXW] ... [end if] block        -> kept only when the incoterm is EXW AND a pickup address exists, otherwise
 *                                         removed completely, together with its own line and the blank line after it.
 *                                         In the editor the block is made of two chips (data-cond="start" / "end");
 *                                         typed {{#if_exw}} ... {{/if_exw}} works too.
 */
import { hasText, isExw } from "@/lib/shipment-labels"

const GAP = "[\\s\\u200b]*"
// a block that sits alone in its <div>/<p>, plus the empty spacer line that follows it
const LONE_BLOCK = new RegExp(
  "<(div|p)\\b[^>]*>" + GAP + "\\{\\{#if_exw\\}\\}[\\s\\S]*?\\{\\{\\/if_exw\\}\\}" + GAP + "<\\/\\1>" +
  "(?:" + GAP + "<(div|p)\\b[^>]*>" + GAP + "(?:<br\\s*\\/?>" + GAP + ")?<\\/\\2>)?", "gi")
const ANY_BLOCK = /\{\{#if_exw\}\}([\s\S]*?)\{\{\/if_exw\}\}/g

export function applyTemplate(text: string, vars: Record<string, string>, opts: { keepUnknown?: boolean } = {}): string {
  const exw = isExw(vars.incoterm)
  const pickup = exw ? String(vars.pickup_address ?? "") : ""
  const show = exw && hasText(pickup)
  let s = String(text ?? "")
  // editor chips -> markers
  s = s.replace(/<span[^>]*data-cond="(start|end)"[^>]*>[\s\S]*?<\/span>/gi, (_m, k: string) => (k === "start" ? "{{#if_exw}}" : "{{/if_exw}}"))
  // conditional block
  if (!show) s = s.replace(LONE_BLOCK, "")
  s = s.replace(ANY_BLOCK, (_m, inner: string) => (show ? inner : ""))
  s = s.replace(/\{\{[#/]if_exw\}\}/g, "")                       // a lone marker never reaches a recipient
  return s.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    key === "pickup_address" ? pickup : key in vars ? (vars[key] ?? "") : opts.keepUnknown ? `{{${key}}}` : "")
}

/** True when the template shows the request number (variable chip or typed {{request_ref}}) in its body or subject. */
export function templateHasRef(t: { subject?: string | null; body?: string | null }): boolean {
  return /request_ref/.test(`${t.subject ?? ""} ${t.body ?? ""}`)
}
