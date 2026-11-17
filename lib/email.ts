import nodemailer from "nodemailer";
import { config } from "./config";

export interface Mail {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
}

export const emailEnabled = () => config.email.provider !== "none" && !!config.email.from;

export async function sendMail(m: Mail): Promise<void> {
  const to = m.to.filter(Boolean);
  if (!to.length) throw new Error("No recipients.");
  if (!emailEnabled()) throw new Error("Email sending is not configured (EMAIL_PROVIDER / EMAIL_FROM).");

  if (config.email.provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.email.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.email.from,
        to,
        cc: m.cc?.filter(Boolean),
        reply_to: m.replyTo || undefined,
        subject: m.subject,
        text: m.text,
        attachments: m.attachments?.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })),
      }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return;
  }

  const s = config.email.smtp;
  const transport = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: s.user ? { user: s.user, pass: s.pass } : undefined,
  });
  await transport.sendMail({
    from: config.email.from,
    to,
    cc: m.cc?.filter(Boolean),
    replyTo: m.replyTo || undefined,
    subject: m.subject,
    text: m.text,
    attachments: m.attachments,
  });
}
