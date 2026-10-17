/**
 * lib/countries.ts — every country, grouped by continent, for carrier coverage.
 * Carriers store ISO-2 codes (carriers.countries). Requests store free-text country names,
 * so `toCountryCode` understands names, common aliases and codes.
 * Format per entry: "CC:Name|alias|alias"
 */
export type Country = { code: string; name: string }
export type Continent = { id: string; name: string; countries: Country[] }

const RAW: Record<string, string[]> = {
  Africa: [
    "DZ:Algeria", "AO:Angola", "BJ:Benin", "BW:Botswana", "BF:Burkina Faso", "BI:Burundi", "CV:Cabo Verde|Cape Verde", "CM:Cameroon",
    "CF:Central African Republic", "TD:Chad", "KM:Comoros", "CG:Congo|Republic of the Congo|Congo-Brazzaville", "CD:DR Congo|Democratic Republic of the Congo|Congo-Kinshasa|DRC",
    "CI:Côte d'Ivoire|Ivory Coast|Cote d'Ivoire", "DJ:Djibouti", "EG:Egypt", "GQ:Equatorial Guinea", "ER:Eritrea", "SZ:Eswatini|Swaziland", "ET:Ethiopia",
    "GA:Gabon", "GM:Gambia|The Gambia", "GH:Ghana", "GN:Guinea", "GW:Guinea-Bissau", "KE:Kenya", "LS:Lesotho", "LR:Liberia", "LY:Libya", "MG:Madagascar",
    "MW:Malawi", "ML:Mali", "MR:Mauritania", "MU:Mauritius", "MA:Morocco", "MZ:Mozambique", "NA:Namibia", "NE:Niger", "NG:Nigeria", "RW:Rwanda",
    "ST:São Tomé and Príncipe|Sao Tome and Principe", "SN:Senegal", "SC:Seychelles", "SL:Sierra Leone", "SO:Somalia", "ZA:South Africa", "SS:South Sudan",
    "SD:Sudan", "TZ:Tanzania", "TG:Togo", "TN:Tunisia", "UG:Uganda", "ZM:Zambia", "ZW:Zimbabwe",
  ],
  Asia: [
    "AF:Afghanistan", "AM:Armenia", "AZ:Azerbaijan", "BH:Bahrain", "BD:Bangladesh", "BT:Bhutan", "BN:Brunei", "KH:Cambodia", "CN:China|PRC|People's Republic of China|Mainland China",
    "GE:Georgia", "HK:Hong Kong", "IN:India", "ID:Indonesia", "IR:Iran", "IQ:Iraq", "IL:Israel", "JP:Japan", "JO:Jordan", "KZ:Kazakhstan", "KW:Kuwait",
    "KG:Kyrgyzstan", "LA:Laos", "LB:Lebanon", "MO:Macao|Macau", "MY:Malaysia", "MV:Maldives", "MN:Mongolia", "MM:Myanmar|Burma", "NP:Nepal", "KP:North Korea",
    "OM:Oman", "PK:Pakistan", "PS:Palestine|State of Palestine", "PH:Philippines", "QA:Qatar", "SA:Saudi Arabia|KSA", "SG:Singapore", "KR:South Korea|Korea|Republic of Korea",
    "LK:Sri Lanka", "SY:Syria", "TW:Taiwan", "TJ:Tajikistan", "TH:Thailand", "TL:Timor-Leste|East Timor", "TR:Türkiye|Turkey|Turkiye", "TM:Turkmenistan",
    "AE:United Arab Emirates|UAE|U.A.E.|Emirates|Dubai|Abu Dhabi", "UZ:Uzbekistan", "VN:Vietnam|Viet Nam", "YE:Yemen",
  ],
  Europe: [
    "AL:Albania", "AD:Andorra", "AT:Austria", "BY:Belarus", "BE:Belgium", "BA:Bosnia and Herzegovina|Bosnia", "BG:Bulgaria", "HR:Croatia", "CY:Cyprus", "CZ:Czechia|Czech Republic",
    "DK:Denmark", "EE:Estonia", "FI:Finland", "FR:France", "DE:Germany", "GR:Greece", "HU:Hungary", "IS:Iceland", "IE:Ireland", "IT:Italy", "XK:Kosovo", "LV:Latvia",
    "LI:Liechtenstein", "LT:Lithuania", "LU:Luxembourg", "MT:Malta", "MD:Moldova", "MC:Monaco", "ME:Montenegro", "NL:Netherlands|Holland|The Netherlands", "MK:North Macedonia|Macedonia",
    "NO:Norway", "PL:Poland", "PT:Portugal", "RO:Romania", "RU:Russia|Russian Federation", "SM:San Marino", "RS:Serbia", "SK:Slovakia", "SI:Slovenia", "ES:Spain",
    "SE:Sweden", "CH:Switzerland", "UA:Ukraine", "GB:United Kingdom|UK|U.K.|Great Britain|Britain|England|Scotland|Wales|Northern Ireland", "VA:Vatican City|Holy See",
  ],
  "North America": [
    "AG:Antigua and Barbuda", "BS:Bahamas|The Bahamas", "BB:Barbados", "BZ:Belize", "CA:Canada", "CR:Costa Rica", "CU:Cuba", "DM:Dominica", "DO:Dominican Republic",
    "SV:El Salvador", "GD:Grenada", "GT:Guatemala", "HT:Haiti", "HN:Honduras", "JM:Jamaica", "MX:Mexico", "NI:Nicaragua", "PA:Panama", "KN:Saint Kitts and Nevis",
    "LC:Saint Lucia", "VC:Saint Vincent and the Grenadines", "TT:Trinidad and Tobago", "US:United States|USA|U.S.A.|US|U.S.|United States of America|America", "PR:Puerto Rico",
  ],
  "South America": [
    "AR:Argentina", "BO:Bolivia", "BR:Brazil", "CL:Chile", "CO:Colombia", "EC:Ecuador", "GY:Guyana", "PY:Paraguay", "PE:Peru", "SR:Suriname", "UY:Uruguay", "VE:Venezuela",
  ],
  Oceania: [
    "AU:Australia", "FJ:Fiji", "KI:Kiribati", "MH:Marshall Islands", "FM:Micronesia", "NR:Nauru", "NZ:New Zealand", "PW:Palau", "PG:Papua New Guinea", "WS:Samoa",
    "SB:Solomon Islands", "TO:Tonga", "TV:Tuvalu", "VU:Vanuatu",
  ],
}

const ALIASES = new Map<string, string>()
export const CONTINENTS: Continent[] = Object.entries(RAW).map(([name, list]) => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  countries: list.map((e) => {
    const [code, rest] = e.split(":")
    const [primary, ...aliases] = rest.split("|")
    for (const n of [primary, ...aliases]) ALIASES.set(norm(n), code)
    ALIASES.set(code.toLowerCase(), code)
    return { code, name: primary }
  }),
}))

export const ALL_COUNTRIES: Country[] = CONTINENTS.flatMap((c) => c.countries)
export const ALL_CODES: string[] = ALL_COUNTRIES.map((c) => c.code)
const NAME_BY_CODE = new Map(ALL_COUNTRIES.map((c) => [c.code, c.name]))
export const countryName = (code: string) => NAME_BY_CODE.get(code) ?? code
const CONTINENT_BY_CODE = new Map(CONTINENTS.flatMap((c) => c.countries.map((x) => [x.code, c.name] as const)))
export const continentOf = (code: string) => CONTINENT_BY_CODE.get(code) ?? null

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()
}

/** "Turkey", "türkiye", "UAE", "TR", "Gebze, Turkey" → ISO-2 code (null if unknown). */
export function toCountryCode(text: string | null | undefined): string | null {
  const t = String(text ?? "").trim()
  if (!t || t === "—") return null
  const direct = ALIASES.get(norm(t))
  if (direct) return direct
  // "City, Country" — try the last comma part, then any part
  const parts = t.split(/[,/–-]/).map((p) => norm(p)).filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) { const c = ALIASES.get(parts[i]); if (c) return c }
  return null
}

/** Keep only valid, unique codes. */
export function cleanCodes(v: unknown): string[] {
  const ok = new Set(ALL_CODES)
  return Array.from(new Set((Array.isArray(v) ? v : []).map((x) => String(x).toUpperCase()).filter((c) => ok.has(c))))
}

/** Trade regions used by the Requests filter: the continent, with the Middle East split out of Asia (and Egypt, Türkiye counted in it). */
const MIDDLE_EAST = new Set(["AE", "BH", "EG", "IQ", "IR", "IL", "JO", "KW", "LB", "OM", "PS", "QA", "SA", "SY", "TR", "YE"])
export const regionOf = (code: string | null | undefined): string | null => {
  if (!code) return null
  if (MIDDLE_EAST.has(code)) return "Middle East"
  return continentOf(code)
}
