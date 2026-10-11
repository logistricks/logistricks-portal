/**
 * lib/template-defaults.ts — "Quote Request" default templates, one per mode (Sea / Air / Land) and channel.
 * A template can be the default for several modes. Server side helpers + pure picker.
 */
export type DefaultModes = { sea?: boolean; air?: boolean; land?: boolean }
type Flags = { default_sea?: boolean | null; default_air?: boolean | null; default_land?: boolean | null }
const COL = { sea: "default_sea", air: "default_air", land: "default_land" } as const

/** Which template is the default for the request's modes (first of Sea, Air, Land that has one). */
export function defaultTemplateFor<T extends Flags & { template_id: number; is_default?: boolean | null }>(templates: T[], modes: string[]): T | undefined {
  for (const m of ["Sea", "Air", "Land"] as const) {
    if (!modes.includes(m)) continue
    const t = templates.find((x) => (x as Flags)[COL[m.toLowerCase() as keyof typeof COL]])
    if (t) return t
  }
  // older rows (before per-mode defaults) only have is_default
  return templates.find((x) => x.is_default) ?? undefined
}

/** Set which modes a template is the default for. Takes the mode away from any other template of the same channel. */
export async function setDefaultModes(db: any, clientCode: string, templateId: number, modes: DefaultModes): Promise<string | null> {
  const { data: me, error: e0 } = await db.from("templates").select("id, type, default_sea, default_air, default_land").eq("client_code", clientCode).eq("template_id", templateId).maybeSingle()
  if (e0 || !me) return e0?.message ?? "Template not found"
  const next = { default_sea: modes.sea ?? !!me.default_sea, default_air: modes.air ?? !!me.default_air, default_land: modes.land ?? !!me.default_land }
  // free the modes this template is taking, then set them (the unique indexes allow one holder per mode)
  for (const k of ["default_sea", "default_air", "default_land"] as const) {
    if (!next[k]) continue
    const { error } = await db.from("templates").update({ [k]: false }).eq("client_code", clientCode).eq("type", me.type).eq(k, true).neq("template_id", templateId)
    if (error) return error.message
  }
  const { error } = await db.from("templates").update({ ...next, is_default: next.default_sea || next.default_air || next.default_land }).eq("client_code", clientCode).eq("template_id", templateId)
  if (error) return error.message
  // keep is_default honest on the templates that just lost a mode
  await db.from("templates").update({ is_default: false }).eq("client_code", clientCode).eq("default_sea", false).eq("default_air", false).eq("default_land", false).eq("is_default", true)
  return null
}
