/**
 * lib/template-defaults.ts — "Quote Request" default templates, one per mode (Sea / Air / Land) and channel.
 * A template can be the default for several modes. Server side helpers + pure picker.
 */
export type DefaultModes = { sea?: boolean; air?: boolean; land?: boolean; multi?: boolean }
type Flags = { default_sea?: boolean | null; default_air?: boolean | null; default_land?: boolean | null; default_multi?: boolean | null }
const COL = { sea: "default_sea", air: "default_air", land: "default_land", multi: "default_multi" } as const

/** Which template is the default for the request's modes (first of Sea, Air, Land that has one). */
export function defaultTemplateFor<T extends Flags & { template_id: number; is_default?: boolean | null }>(templates: T[], modes: string[]): T | undefined {
  // an email that covers all legs of a multi-leg request uses the multi-leg default when there is one
  if (modes.includes("Multi")) {
    const t = templates.find((x) => (x as Flags).default_multi)
    if (t) return t
  }
  for (const m of ["Sea", "Air", "Land"] as const) {
    if (!modes.includes(m)) continue
    const t = templates.find((x) => (x as Flags)[COL[m.toLowerCase() as keyof typeof COL]])
    if (t) return t
  }
  // older rows (before per-mode defaults) only have is_default
  return templates.find((x) => x.is_default) ?? undefined
}

const MODES = ["sea", "air", "land", "multi"] as const
/**
 * Save which modes a template is FOR and which of those it is the DEFAULT for.
 * - a default needs its mode; removing a mode removes its default
 * - one default per mode and channel: if another template already holds it, nothing is changed and a message is returned
 *   (remove that default first)
 * Returns an error message, or null on success.
 */
export async function setTemplateModes(db: any, clientCode: string, templateId: number, input: { modes?: DefaultModes; defaults?: DefaultModes }): Promise<{ error: string; conflict?: boolean } | null> {
  const { data: me, error: e0 } = await db.from("templates").select("*").eq("client_code", clientCode).eq("template_id", templateId).maybeSingle()
  if (e0 || !me) return { error: e0?.message ?? "Template not found" }
  const patch: Record<string, boolean> = {}
  for (const m of MODES) {
    if (m === "multi" && !("mode_multi" in me)) continue // migration 075 not run yet
    const mode = input.modes?.[m] ?? !!me[`mode_${m}`]
    const def = (input.defaults?.[m] ?? !!me[`default_${m}`]) && mode
    if (def && !me[`default_${m}`]) {
      const { data: other } = await db.from("templates").select("template_name").eq("client_code", clientCode).eq("type", me.type).eq(`default_${m}`, true).neq("template_id", templateId).limit(1).maybeSingle()
      if (other) return { error: `${m[0].toUpperCase() + m.slice(1)} already has a default quote request: "${other.template_name}". Remove that default first.`, conflict: true }
    }
    patch[`mode_${m}`] = mode
    patch[`default_${m}`] = def
  }
  const { error } = await db.from("templates").update({ ...patch, is_default: ((["sea", "air", "land"]) as const).some((m) => patch[`default_${m}`]) }).eq("client_code", clientCode).eq("template_id", templateId)
  return error ? { error: error.message } : null
}
