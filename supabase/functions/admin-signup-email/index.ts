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
  const username = payload.username || "Anime fan";
  const email = payload.email || "No email saved";
  const createdAt = payload.created_at ? new Date(payload.created_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : new Date().toLocaleString("en-US", { timeZone: "America/New_York" });

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [adminEmail],
      subject: "New AnimeBoxD signup",
      html: `
        <h2>New AnimeBoxD signup</h2>
        <p><strong>User:</strong> ${escapeHtml(username)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Time:</strong> ${escapeHtml(createdAt)}</p>
        <p>Open your AnimeBoxD admin board to review user activity.</p>
      `,
      text: `New AnimeBoxD signup\n\nUser: ${username}\nEmail: ${email}\nTime: ${createdAt}\n\nOpen your AnimeBoxD admin board to review user activity.`
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    return new Response(JSON.stringify({ error: "Resend request failed", detail }), { status: 502, headers: jsonHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
});
