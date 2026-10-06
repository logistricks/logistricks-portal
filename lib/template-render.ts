/**
 * lib/template-render.ts — one place that fills an email/WhatsApp template.
 *
 *   {{variable}}                       -> the value (blank / kept as typed when unknown, see keepUnknown)
 *   {{pickup_address}}                 -> the pickup address, only when the request's incoterm is EXW
 *   [if EXW] ... [end if] block        -> kept only when the incoterm is EXW AND a pickup address exists,
 *                                         otherwise removed completely. In the editor the block is made of
 *                                         two chips (data-cond="start" / "end"); typed {{#if_exw}} ... {{/if_exw}} works too.
 */
import { hasText, isExw } from "@/lib/shipment-labels"

export function applyTemplate(text: string, vars: Record<string, string>, opts: { keepUnknown?: boolean } = {}): string {
  const exw = isExw(vars.incoterm)
  const pickup = exw ? String(vars.pickup_address ?? "") : ""
  let s = String(text ?? "")
  // editor chips -> markers
  s = s.replace(/<span[^>]*data-cond="(start|end)"[^>]*>[\s\S]*?<\/span>/gi, (_m, k: string) => (k === "start" ? "{{#if_exw}}" : "{{/if_exw}}"))
  // conditional block
  s = s.replace(/\{\{#if_exw\}\}([\s\S]*?)\{\{\/if_exw\}\}/g, (_m, inner: string) => (exw && hasText(pickup) ? inner : ""))
  s = s.replace(/\{\{[#/]if_exw\}\}/g, "")                      // a lone marker never reaches a recipient
  return s.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    key === "pickup_address" ? pickup : key in vars ? (vars[key] ?? "") : opts.keepUnknown ? `{{${key}}}` : "")
}
