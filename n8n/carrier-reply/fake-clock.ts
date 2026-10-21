// The test emails are dated 2026-10-01. Without this the "quote expired" check would fail them as soon as that date has passed.
// Import it FIRST in a test runner: it makes "now" 2026-10-01 09:00 UTC.
const FIXED = Date.parse("2026-10-01T09:00:00Z")
const RealDate = Date
class FakeDate extends RealDate {
  constructor(...a: unknown[]) { if (a.length === 0) super(FIXED); else super(...(a as [string])) }
  static now() { return FIXED }
}
;(globalThis as { Date: DateConstructor }).Date = FakeDate as unknown as DateConstructor
