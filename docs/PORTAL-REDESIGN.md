# Portal redesign: top navigation and the new look

**Summary.** The portal moved from a flat top menu (Dashboard, Requests, Quotes, Approvals, Auto Reply, Users, Reports, Settings with five tabs) to a top bar with three sections and a hover sub bar. The look now follows the lead trial page: Bricolage Grotesque headings, rounder cards, an orange focus ring on every field, a navy greeting banner on the dashboard. **No feature was removed.** Every page, tab, button and pop-up that existed before is still there; most moved to a clearer place.

## Backup and how to compare

| What | Where |
|---|---|
| Full copy of the portal before the redesign | git branch `backup/pre-redesign` (commit `7bb4403`) |
| Look at the old portal | Vercel → Deployments → the `backup/pre-redesign` branch preview. Open it with the same login. It uses the same database, so treat it as read-and-compare. |
| Go back completely | `git revert` the redesign commit, or `git checkout backup/pre-redesign -- .` then commit. No database change was made, so nothing needs undoing there. |

The redesign changes screens only. No migration, no API change, no data change.

## The new navigation

```
[ Logo = Home ]     Work     Builder     Admin
```

- **Hover** a section → its sub bar slides in under the top bar; it disappears when the pointer leaves.
- **Click** a section → opens that section's main page (Work → Requests, Builder → Templates, Admin → Rules).
- **Pick a page** from the sub bar → the sub bar stays pinned until you move to another section.
- **Home (logo)** → the dashboard with no sub bar. Reloading keeps the pin.
- On phones, tapping a section opens its main page and shows its sub bar. Counts show as a dot on the section.
- Counts (new requests, non-linked quotes, approvals waiting) show as orange badges in the sub bar.

### Where everything went

| Before | Now |
|---|---|
| Dashboard | Work → Dashboard (also the Home logo) |
| Requests (list, drop zone, status buttons, detail pop-up, timeline, outcome and booking) | Work → Requests, unchanged inside |
| Non-linked Quotes (link to a request, delete) | Work → Non-Linked Quotes, unchanged inside |
| Approvals | Work → Approvals |
| Approval History (had no link anywhere) | Work → Approvals, new **History** button; **Pending** button on the way back |
| Reports | Work → Reports |
| Settings → Templates (message and quotation) | Builder → Templates |
| Settings → Carriers | Builder → Carriers |
| Settings → Notification Templates | Builder → Notification Templates |
| Settings → Setup → Automation (auto-reply, auto-send, block when data missing, critical fields) | Admin → Rules |
| Settings → Setup → Receiver Emails and WhatsApp Numbers | Admin → Receivers |
| Settings → Setup → Email Server (SMTP), and the separate Email Sources page (IMAP / Microsoft 365) | Admin → Emails (both on one page; the old `/settings/email-sources` address redirects here) |
| Settings → Setup → Approval Workflow → Manage Approval Cycles | Admin → Approval Setup |
| Users → Activity tab | Admin → Activity |
| Auto Reply (log) | Admin → Auto-Reply Log |
| Users | Admin → Users |
| Settings → Theme (colours, logo, company name) | Admin → Brand & Colours (admins only, as before) |

Old bookmarks still work: `/settings` opens Rules, `/settings?tab=templates|carriers|notifications` open the same pages as before, `/users?tab=activity` is unchanged.

## What changed in the look

- **Fonts.** Bricolage Grotesque for titles and big numbers; IBM Plex Sans stays for text and Plex Mono for small labels.
- **Shape.** Cards and panels are rounder (18px), with a softer shadow. Buttons, fields and filter chips are rounder to match.
- **Fields.** Every text box, search box and dropdown gets the orange border and soft orange ring on focus.
- **Hover.** Table rows glow orange on hover; stat cards lift and glow; buttons lift slightly (already present, kept).
- **Page titles.** Larger and bolder. Each Settings page now has one title instead of a title plus a tab bar plus a sub-menu.
- **Dashboard.** New greeting banner (navy with an orange glow) with "5 need attention / 12 open right now" and a "This period" check-mark box. Numbers in the stat cards use the display font.
- **Brand colours.** Everything still reads the client's own colours from Admin → Brand & Colours. A client with green and teal sees green and teal in the new bars, banners and chips.
- **Dark mode.** The sun/moon button still works and the new bars follow it.

## What was removed on purpose

- The description lines under page titles (for example "Manage your organisation's configuration").
- The explanation paragraph under each Settings section.
- The bottom tab bar on phones (the top bar replaces it).
- The old Settings tab bar and left sub-menu (the sub bar replaces them).

Pop-ups for **new notifications and requests** (the bell and the toasts) are kept exactly as they were.

## Feature checklist (verified)

Checked page by page against the backup. Items from the owner's list are marked ★.

- ★ Non-linked quotes: link to request, delete, counts
- ★ Request outcome and booking panel
- ★ Request status as buttons, not a drop-down
- ★ Freight request pop-up (detail modal)
- ★ Request timeline
- Request drop zone (drag an email, paste a copied email), intake log, filters by status and source, search with `/`
- Send to carriers, comparison, quotation builder, forward quotation, special requests, send RFQ
- Approvals: pending, decisions, history
- Approval cycles: create, edit, steps
- Receiver emails (add with availability check, switch on/off, delete) and WhatsApp numbers
- SMTP: provider presets, test send; IMAP and Microsoft 365 mailboxes: add, edit, test, delete
- Rules: auto-reply, auto-send, block when critical data is missing, critical fields picker, auto-reply for missing data and for complete requests
- Templates, quotation templates, notification templates, carriers (with contacts)
- Users: add, edit, deactivate; Activity log; Auto-reply log
- Reports: all reports, print, export
- Brand & Colours: presets, custom colours, logo, company name
- Bell notifications, push subscription, dark mode, log out

Automated smoke test: all 20 portal addresses load with no page error and the right sub bar; hover, leave, click, pin, Home and phone layouts behave as described.

## Notes for support

- Mobile: the Work/Builder/Admin buttons sit in the top bar; the sub bar scrolls sideways.
- A hovering mouse shows the sub bar over the page; it never pushes the page down. Only a pinned sub bar takes space.
- Adding a page later: add one line to `lib/portal-nav.ts`.

## Files

`lib/portal-nav.ts` (menu map) · `components/portal/portal-nav.tsx` (hover and pin) · `components/portal/portal-topbar.tsx` · `components/portal/page-hero.tsx` · `components/portal/email-sources-panel.tsx` · `app/globals.css` (tokens) · `app/layout.tsx` (font) · Settings, Users and Approvals pages.

## Visual revamp (branch `redesign`)

Beyond the navigation, every page now follows the trial page's look:

- **Top bar**: Home button (accent tile) and LOGISTRICKS name at the left; Work | Builder | Admin truly centred; theme, notifications, avatar and logout on the right. Hover shows the sub bar, click opens the section's main page, picking a sub page pins it.
- **Header band**: every page opens with a navy band (orange glow, display font, large title) holding that page's buttons. Requests also shows counts.
- **Global skin**: Bricolage Grotesque display font, orange primary buttons with navy text and lift, orange focus ring on inputs, 18–22px rounded cards and pop-ups with blurred backdrop, mono uppercase table headers.
- **Requests**: large dashed drop-zone card with "Paste copied email"; request pop-up has a bigger navy header, route card, larger tabs.
- **Notifications tray**: navy header, rounded tray, accent badge.
- Per-client colours still drive everything through the brand CSS variables. No page, button or API call was removed.
