"use client"

import { useEffect, useRef, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { setBranding, useBranding } from "@/lib/use-branding"
import { useToast } from "@/components/ui/toast"

/** Downscale raster logos so the data URL stays small; SVGs pass through. */
function prepare(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onerror = () => reject(new Error("Could not read the file"))
    fr.onload = () => {
      const url = String(fr.result)
      if (file.type === "image/svg+xml") return resolve(url)
      const img = new Image()
      img.onerror = () => reject(new Error("Not a valid image"))
      img.onload = () => {
        const max = 480, k = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement("canvas")
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9))
      }
      img.src = url
    }
    fr.readAsDataURL(file)
  })
}

export function BrandingCard() {
  const b = useBranding()
  const { success, error } = useToast()
  const [name, setName] = useState("")
  const [logo, setLogo] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const loaded = useRef(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!loaded.current && (b.displayName || b.logo)) { loaded.current = true; setName(b.displayName); setLogo(b.logo) } }, [b])

  async function pick(f?: File) {
    if (!f) return
    if (!/^image\/(png|jpeg|svg\+xml|webp)$/.test(f.type)) return error("Unsupported file", "Use a PNG, JPEG, WebP or SVG")
    try { setLogo(await prepare(f)) } catch (e) { error("Logo failed", (e as Error).message) }
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/branding", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, logo }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || (res.status === 403 ? "Only admins can change branding" : "Save failed"))
      setBranding({ displayName: name.trim(), logo })
      success("Branding saved", "Name and logo are used in the header and in reports")
    } catch (e) { error("Could not save branding", (e as Error).message) } finally { setSaving(false) }
  }

  return (
    <div className="ds-card p-5">
      <h2 className="mb-0 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Branding</h2>
      <p className="mb-4 text-xs" style={{ color: "var(--text-secondary)" }}>Used in the top-left header and on every printed or exported report</p>

      <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Display name (company name)</label>
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Your company name" className="ds-input mb-4 w-full" />

      <label className="mb-1 block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Logo <span style={{ color: "var(--text-muted)" }}>(optional — none by default)</span></label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded-lg border" style={{ borderColor: "var(--card-border)", background: "#fff" }}>
          {logo ? <img src={logo} alt="Logo preview" className="max-h-14 max-w-[100px] object-contain" /> : <span className="text-[11px]" style={{ color: "#94a3b8" }}>No logo</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => file.current?.click()} className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--card-border)", color: "var(--text-primary)", background: "var(--card-bg)" }}>
            <ImagePlus className="h-3.5 w-3.5" /> {logo ? "Replace" : "Upload logo"}
          </button>
          {logo && (
            <button type="button" onClick={() => setLogo(null)} className="flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium" style={{ color: "#dc2626" }}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </button>
          )}
        </div>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = "" }} />
      </div>

      <button type="button" onClick={save} disabled={saving || !name.trim()} className="mt-4 w-full rounded-lg py-2.5 text-xs font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand-accent)" }}>
        {saving ? "Saving…" : "Save branding"}
      </button>
    </div>
  )
}
