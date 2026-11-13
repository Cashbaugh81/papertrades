// POST /functions/v1/signup  { email, password, name? }
//
// The only way to create an account. The password must contain the secret
// word kept in Vault ('signup_gate_word'); the check runs in Postgres, so the
// word never appears in code or in this function. After the check it issues a
// two-minute, one-time pass for the email (public.signup_passes), which the
// trigger on auth.users requires and consumes. Users created here are
// confirmed straight away.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";

const NOT_PUBLIC = "this is not a public site for use";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "POST only" }, 405);

  let body: { email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(req, { error: "body must be JSON" }, 400);
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(req, { error: "Enter an email address." }, 400);
  if (password.length < 8) return json(req, { error: "Use at least 8 characters." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: ok, error: gateError } = await admin.rpc("signup_gate_ok", { p_password: password });
  if (gateError) return json(req, { error: "Sign-up is unavailable right now." }, 500);
  if (ok !== true) {
    // A short pause makes guessing the word slow.
    await new Promise((r) => setTimeout(r, 750));
    return json(req, { error: NOT_PUBLIC }, 403);
  }

  const { error: passError } = await admin
    .from("signup_passes")
    .upsert({ email, expires_at: new Date(Date.now() + 120_000).toISOString() }, { onConflict: "email" });
  if (passError) return json(req, { error: "Sign-up is unavailable right now." }, 500);

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: name ? { name } : {},
  });
  if (error) {
    // Don't leave an unused pass lying around.
    await admin.from("signup_passes").delete().eq("email", email);
    const msg = /already (been )?registered|already exists/i.test(error.message)
      ? "An account with that email already exists. Sign in instead."
      : error.message;
    return json(req, { error: msg }, /already/i.test(error.message) ? 409 : 400);
  }
  return json(req, { ok: true }, 201);
});
