# Logistricks: project context for Claude Code

Read this first. It sums up what the project is, how it is built and deployed, and the decisions already made.
Keep it short and update it when something important changes.

## What Logistricks is
Freight-quoting automation for freight forwarders. AI reads a customer's freight request (email), asks the forwarder's carriers for rates, builds the quotation, follows up, and the forwarder approves before anything is sent.
Public tagline: "Send every quotation faster. Without the chasing."

## Repositories
| Repo | What it is | Deploys to |
|---|---|---|
| `logistricks/logistricks` | Lead website (single page) | https://trylogistricks.com via Vercel |
| `logistricks/logistricks-portal` | Customer portal, trial pages and admin | Vercel (portal / try subdomains) |

- Both are Next.js on Vercel. Pushing to `main` deploys. Prefer a branch and a pull request for risky changes.
- Stack: Next.js, Supabase (database), Vercel, n8n (workflows), Gemini (AI extraction and review).
- The portal repo's `AGENTS.md` warns that this Next.js version has breaking changes. Read `node_modules/next/dist/docs/` before writing Next.js code.

## Domains and email
- Public domain: **trylogistricks.com**. The old `logistricks.net` should only redirect (308) to it.
- Cold-email mailboxes are Google Workspace on trylogistricks.com. SPF, DKIM (selector `google`) and DMARC are set up in Cloudflare DNS. Keep outreach plain-text and low volume.

## Lead website (`logistricks/logistricks`)
- All visible English copy is in `lib/copy/en.ts` (Arabic would be a new `ar.ts` with the same shape).
- Public address and SEO constants: `lib/site.ts` (`NEXT_PUBLIC_SITE_URL` overrides). SEO files: `app/sitemap.ts`, `app/robots.ts`, `components/JsonLd.tsx`, `app/opengraph-image.png`.
- Leads go to the Supabase table `site_leads` (kind `trial` or `demo`). Without Supabase keys, dev mode logs leads to the console.
- Behaviour already built: Lenis smooth scroll (touch smoothing on coarse pointers), reveal animations, a "next section" arrow (`components/NextStep.tsx`), mobile spacing fixes.
- Env vars: see `.env.example` (Supabase service role, SMTP, alert addresses).

## Portal (`logistricks/logistricks-portal`)
- Admin areas: Rules and automation (auto-reply, auto-send, block when critical data is missing), Receivers (emails and WhatsApp), Emails (SMTP and IMAP / Microsoft 365 mailboxes), Approval setup, Brand and Colours, Users, Activity, Auto-Reply Log.
- Builder: Templates (including quotation templates), Carriers (contacts and countries), Notification Templates.
- Theme: `PortalShell` client component. Theme is stored in localStorage (`portal-theme`, `portal-theme-colors`) and in the database (`/api/client-settings?key=theme`). An inline script in `app/layout.tsx` paints the saved theme before first render, and the shell stays hidden until the theme has loaded. Do not remove this, it prevents a flash of the default theme.
- Users: the table `portal_users` stores an **unsalted SHA-256** hex `password_hash`. This is weak. Moving to a salted hash (bcrypt or argon2) is a to-do.
- Carriers need their countries filled in for rate requests to route correctly.
- Each new client gets a Supabase client row, copies of the n8n workflows, a Gemini key and Vercel env vars. Run the extraction test checklist before onboarding.

## n8n workflows
Gmail trigger, IMAP doorway, Core, Auto-Send RFQ, carrier reply to quote, reminders, error workflow. Details are in the Logistricks project docs (n8n blueprint, carrier reply workflow, cleanup plan).

## Brand (use these, do not invent new ones)
- Navy `#0b1727`, `#0f1e36`, `#1a2d4a`, `#243d61`. Orange `#e8821a`, light orange `#ffa04a`. Text `#eef3fa`, muted `#9db0c8`, dim `#6f839f`.
- Fonts: Bricolage Grotesque (headings), IBM Plex Sans (body), IBM Plex Mono (small labels).
- Style: dark navy with a faint grid, glass cards (about 4.5% white fill, 10% white border), pill buttons (orange filled, or ghost outline), and a route line (solid first half, dashed second half, dots at both ends).
- Logo: single-line wordmark with the ring-arrow "i" (`logistricks-wordmark-dark-v5.svg`). It stays unchanged in all headers. The stacked LOGIS / TRICKS tile is used only as the browser tab icon and app icons.

## Working agreements
- Keep copy short, big and true. No invented customers, numbers or prices.
- Do not change the header logo.
- Check mobile as well as desktop for any page change.
- Show logo or design changes before applying them.
- Open to-dos: pricing and billing, data export and retention, onboarding checklist, backups, a demo-to-paid path, and a salted password hash.
