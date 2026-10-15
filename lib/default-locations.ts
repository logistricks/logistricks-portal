/**
 * Default port and airport: when a requester asks for an export but doesn't say where from, the shipment is taken
 * to start at the default port (sea) or the default airport (air). Stored in client_settings under "default_locations".
 */
export type DefaultPlace = { name: string; country: string }
export type DefaultLocations = { port: DefaultPlace; airport: DefaultPlace }

export const EMPTY_DEFAULTS: DefaultLocations = { port: { name: "", country: "" }, airport: { name: "", country: "" } }

const clean = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

export function cleanDefaults(v: any): DefaultLocations {
  return {
    port: { name: clean(v?.port?.name), country: clean(v?.port?.country) },
    airport: { name: clean(v?.airport?.name), country: clean(v?.airport?.country) },
  }
}

export async function loadDefaults(admin: any, clientCode: string): Promise<DefaultLocations> {
  const { data } = await admin.from("client_settings").select("value").eq("client_code", clientCode).eq("key", "default_locations").maybeSingle()
  return cleanDefaults(data?.value)
}

/** Flat form handed to the email-processing workflow. Empty strings when not set. */
export function flatDefaults(d: DefaultLocations) {
  return {
    default_port: d.port.name, default_port_country: d.port.country,
    default_airport: d.airport.name, default_airport_country: d.airport.country,
  }
}
