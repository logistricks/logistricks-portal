/**
 * lib/log-activity.ts
 * Server-only helper — fires and forgets an insert into activity_log.
 * Never throws; errors are logged to console only.
 */

import { createClient } from "@supabase/supabase-js"

export type ActivityEventType =
  | "request_received"
  | "request_status_changed"
  | "carrier_added"
  | "carrier_updated"
  | "carrier_deleted"
  | "template_created"
  | "template_updated"
  | "template_deleted"
  | "approval_submitted"
  | "approval_step_approved"
  | "approval_step_rejected"
  | "approval_cycle_completed"

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function logActivity(params: {
  clientCode:  string
  eventType:   ActivityEventType
  actor?:      string
  description: string
  requestId?:  string
  meta?:       Record<string, unknown>
}): Promise<void> {
  try {
    const { error } = await adminClient()
      .from("activity_log")
      .insert({
        client_code: params.clientCode,
        event_type:  params.eventType,
        actor:       params.actor      ?? "system",
        description: params.description,
        request_id:  params.requestId  ?? null,
        meta:        params.meta       ?? {},
      })
    if (error) console.warn("[log-activity] insert failed:", error.message)
  } catch (err) {
    console.warn("[log-activity] unexpected error:", err)
  }
}
