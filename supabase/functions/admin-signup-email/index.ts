const jsonHeaders = {
  "Content-Type": "application/json"
};

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const expectedSecret = Deno.env.get("ADMIN_NOTIFY_SECRET");
  const receivedSecret = request.headers.get("x-admin-notify-secret");
  if (!expectedSecret || receivedSecret !== expectedSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const adminEmail = Deno.env.get("ADMIN_EMAIL") || "vmb4manager@gmail.com";
  const fromEmail = Deno.env.get("ADMIN_EMAIL_FROM") || "AnimeBoxD <no-reply@mail.animeboxd.app>";
  if (!resendKey) {
    return new Response(JSON.stringify({ error: "Missing RESEND_API_KEY" }), { status: 500, headers: jsonHeaders });
  }

  const payload = await request.json().catch(() => ({}));
  const createdAt = payload.created_at ? new Date(payload.created_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  let subject: string;
  let html: string;
  let text: string;

  if (payload.kind === "favorite_pick") {
    const displayName = payload.display_name || "Someone browsing";
    const title = payload.title || "an untitled pick";
    const mediaType = payload.media_type || "anime";
    const reason = payload.reason || "";
    subject = "New AnimeBoxD favorite pick";
    html = `
      <h2>New favorite pick</h2>
      <p><strong>From:</strong> ${escapeHtml(displayName)}</p>
      <p><strong>Title:</strong> ${escapeHtml(title)} (${escapeHtml(mediaType)})</p>
      <p><strong>Why:</strong> "${escapeHtml(reason)}"</p>
      <p><strong>Time:</strong> ${escapeHtml(createdAt)}</p>
      <p>Open your AnimeBoxD admin board to see the full community board.</p>
    `;
    text = `New favorite pick\n\nFrom: ${displayName}\nTitle: ${title} (${mediaType})\nWhy: "${reason}"\nTime: ${createdAt}\n\nOpen your AnimeBoxD admin board to see the full community board.`;
  } else {
    const username = payload.username || "Anime fan";
    const email = payload.email || "No email saved";
    subject = "New AnimeBoxD signup";
    html = `
      <h2>New AnimeBoxD signup</h2>
      <p><strong>User:</strong> ${escapeHtml(username)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Time:</strong> ${escapeHtml(createdAt)}</p>
      <p>Open your AnimeBoxD admin board to review user activity.</p>
    `;
    text = `New AnimeBoxD signup\n\nUser: ${username}\nEmail: ${email}\nTime: ${createdAt}\n\nOpen your AnimeBoxD admin board to review user activity.`;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject,
      html,
      text
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    return new Response(JSON.stringify({ error: "Resend request failed", detail }), { status: 502, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
});
