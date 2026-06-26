import { publicUrl, sendEmail } from "./email";

// Transactional + lifecycle email content. Thin wrappers over sendEmail() (which is a
// no-op without a configured backend), so calling these anywhere is always safe. Plain,
// monochrome HTML + a text fallback — no images, no tracking pixels.

const FOOT = "\n\nGlanceOS — the office wall that knows what's going on.";

function html(heading: string, lines: string[], cta?: { label: string; url: string }): string {
  const body = lines.map((l) => `<p style="margin:0 0 14px;color:#333;font-size:15px;line-height:1.5">${l}</p>`).join("");
  const button = cta
    ? `<p style="margin:22px 0"><a href="${cta.url}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:15px;display:inline-block">${cta.label}</a></p>`
    : "";
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:8px">
    <h1 style="font-size:20px;color:#111;margin:0 0 16px">${heading}</h1>${body}${button}
    <p style="margin:24px 0 0;color:#888;font-size:12px">GlanceOS — the office wall that knows what's going on.</p></div>`;
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  await sendEmail(to, "Welcome to GlanceOS", {
    text: `Hi ${name},\n\nWelcome to GlanceOS. Build a board, connect a screen, and put your team's live data on the wall.\n\nOpen GlanceOS: ${publicUrl("/")}${FOOT}`,
    html: html(`Welcome, ${name}`, ["Build a board, connect a screen, and put your team's live data on the wall — set up in minutes.", "Need a head start? The board templates get you a populated wall in one click."], { label: "Open GlanceOS", url: publicUrl("/") }),
  });
}

export async function sendVerifyEmail(to: string, name: string, token: string): Promise<void> {
  const url = publicUrl(`/#/verify/${token}`);
  await sendEmail(to, "Verify your email", {
    text: `Hi ${name},\n\nConfirm your email for GlanceOS:\n${url}\n\nThis link expires in 24 hours.${FOOT}`,
    html: html("Confirm your email", [`Hi ${name}, please confirm this is your email address.`, "The link expires in 24 hours."], { label: "Verify email", url }),
  });
}

export async function sendResetEmail(to: string, name: string, token: string): Promise<void> {
  const url = publicUrl(`/#/reset/${token}`);
  await sendEmail(to, "Reset your GlanceOS password", {
    text: `Hi ${name},\n\nReset your password:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.${FOOT}`,
    html: html("Reset your password", [`Hi ${name}, use the button below to set a new password.`, "The link expires in 1 hour. If you didn't request this, you can safely ignore this email."], { label: "Reset password", url }),
  });
}

export async function sendInviteEmail(to: string, orgName: string, inviterName: string | null, role: string, token: string): Promise<void> {
  const url = publicUrl(`/#/invite/${token}`);
  const who = inviterName ? `${inviterName} invited you` : "You've been invited";
  await sendEmail(to, `Join ${orgName} on GlanceOS`, {
    text: `${who} to join ${orgName} on GlanceOS as a ${role}.\n\nAccept: ${url}\n\nThis invite expires in 7 days.${FOOT}`,
    html: html(`Join ${orgName}`, [`${who} to join <strong>${orgName}</strong> on GlanceOS as a <strong>${role}</strong>.`, "This invite expires in 7 days."], { label: "Accept invite", url }),
  });
}

export async function sendOfflineEmail(to: string, deviceName: string): Promise<void> {
  await sendEmail(to, `Screen offline: ${deviceName}`, {
    text: `Your screen "${deviceName}" hasn't checked in and looks offline. Check its power and network.\n\nFleet: ${publicUrl("/#/screens")}${FOOT}`,
    html: html("A screen went offline", [`Your screen <strong>${deviceName}</strong> hasn't checked in and looks offline.`, "Check its power and network connection."], { label: "View screens", url: publicUrl("/#/screens") }),
  });
}

export async function sendDay3Email(to: string, name: string): Promise<void> {
  await sendEmail(to, "Put your board on a real screen", {
    text: `Hi ${name},\n\nYou built a board — the magic happens when it's live on a screen. Open any browser, TV, or Pi at ${publicUrl("/screen")} and pair it in seconds.${FOOT}`,
    html: html("One step to a live wall", [`Hi ${name}, you've built a board — now put it on a screen.`, `Open <strong>${publicUrl("/screen")}</strong> on any browser, TV, or Raspberry Pi and pair it in seconds.`], { label: "Connect a screen", url: publicUrl("/#/screens") }),
  });
}

export async function sendDigestEmail(to: string, name: string, summary: { boards: number; screens: number; online: number }): Promise<void> {
  await sendEmail(to, "Your GlanceOS weekly digest", {
    text: `Hi ${name},\n\nThis week: ${summary.boards} boards, ${summary.screens} screens (${summary.online} online).\n\n${publicUrl("/")}${FOOT}`,
    html: html("Your week on GlanceOS", [`Hi ${name}, here's your workspace at a glance:`, `<strong>${summary.boards}</strong> boards · <strong>${summary.screens}</strong> screens (<strong>${summary.online}</strong> online right now).`], { label: "Open GlanceOS", url: publicUrl("/") }),
  });
}
