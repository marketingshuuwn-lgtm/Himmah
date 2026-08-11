/**
 * Server-only helper to enqueue an approval email through the internal send route.
 * Bypasses HTTP by calling supabase.rpc('enqueue_email') directly with the pre-rendered payload.
 * Simpler than round-tripping through /lovable/email/transactional/send from server-side code.
 */
import { render } from "@react-email/render";
import React from "react";
import { TEMPLATES } from "@/lib/email-templates/registry";

const SITE_NAME = "نظام العلامة - HR";
const SENDER_DOMAIN = "notify.emp.alaamaa.com";
const FROM_DOMAIN = "emp.alaamaa.com";

export async function enqueueApprovalEmail(opts: {
  supabaseAdmin: any;
  templateName: string;
  recipientEmail: string;
  templateData: Record<string, any>;
  idempotencyKey: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
}) {
  const t = TEMPLATES[opts.templateName];
  if (!t) throw new Error(`Unknown template: ${opts.templateName}`);

  // Suppression check
  const { data: sup } = await opts.supabaseAdmin
    .from("suppressed_emails")
    .select("email")
    .eq("email", opts.recipientEmail.toLowerCase())
    .maybeSingle();
  if (sup) {
    await opts.supabaseAdmin.from("security_audit_log").insert({
      entity_type: opts.entityType, entity_id: opts.entityId,
      action: "email_suppressed", actor_user_id: opts.actorUserId, actor_kind: "user",
      metadata: { template: opts.templateName, recipient: opts.recipientEmail },
    });
    return { skipped: true, reason: "suppressed" };
  }

  const html = await render(React.createElement(t.component, opts.templateData));
  const subject = typeof t.subject === "function" ? t.subject(opts.templateData) : t.subject;
  const messageId = opts.idempotencyKey;

  await opts.supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      template_name: opts.templateName,
      recipient_email: opts.recipientEmail,
      subject,
      html,
      from: `${SITE_NAME} <no-reply@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
    },
  });

  await opts.supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: opts.templateName,
    recipient_email: opts.recipientEmail,
    status: "pending",
  });

  await opts.supabaseAdmin.from("security_audit_log").insert({
    entity_type: opts.entityType, entity_id: opts.entityId,
    action: "email_enqueued", actor_user_id: opts.actorUserId, actor_kind: "user",
    metadata: { template: opts.templateName, recipient: opts.recipientEmail, message_id: messageId },
  });

  return { ok: true, messageId };
}
