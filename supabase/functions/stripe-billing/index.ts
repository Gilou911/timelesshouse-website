// ════════════════════════════════════════════════════════════
// 💳  EDGE FUNCTION — stripe-billing (SaaS B.3, brique 6)
// ════════════════════════════════════════════════════════════
// Abonnements LA LOGE par agence (paliers de stockage) :
//   POST /            { action: "checkout", plan, interval }
//        → session Stripe Checkout (URL de paiement) pour le plan
//          essentiel|studio|cinema|prestige × mensuel|annuel
//   POST /            { action: "portal" }
//        → session du portail de facturation (gérer carte, factures,
//          changement/résiliation)
//   POST /webhook     (signé Stripe) → met à jour agencies.plan,
//        subscription_status, stripe_*_id, billing_interval
//
// SÉCURITÉ :
//   ▸ checkout/portal : réservés aux OWNERS de l'agence (JWT vérifié
//     + agency_members.role = 'owner')
//   ▸ webhook : signature Stripe-Signature vérifiée (HMAC-SHA256,
//     tolérance 5 min) avec STRIPE_WEBHOOK_SECRET
//   ▸ le plan est déduit du lookup_key du prix (laloge_<plan>_<iv>)
//     depuis l'OBJET de l'événement — la résiliation retombe sur
//     « decouverte »
//
// SECRETS REQUIS : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto)
// ════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const SITE = "https://laloge.app";

const sbAdmin = createClient(SB_URL, SB_SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PLANS = ["essentiel", "studio", "cinema", "prestige"];
const INTERVALS = ["mensuel", "annuel"];

// ─── Client Stripe minimal (API REST, pas de SDK) ───────────
async function stripe(method: string, path: string, form?: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${btoa(STRIPE_KEY + ":")}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  return await res.json();
}

// ─── Garde : owner d'une agence ─────────────────────────────
type Caller = { userId: string; email: string; agencyId: string };
async function requireOwner(req: Request): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await sbAdmin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: rows } = await sbAdmin
    .from("agency_members").select("agency_id").eq("user_id", data.user.id).eq("role", "owner").limit(1);
  if (!rows?.length) return null;
  return { userId: data.user.id, email: data.user.email || "", agencyId: rows[0].agency_id as string };
}

// ─── Webhook : vérification de signature Stripe ─────────────
async function verifyStripeSignature(payload: string, header: string | null): Promise<boolean> {
  if (!header || !WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"]; const v1 = parts["v1"];
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // tolérance 5 min
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparaison à temps constant
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// lookup_key « laloge_<plan>_<intervalle> » → { plan, interval }
function planFromLookup(lookup: string | undefined): { plan: string; interval: string } | null {
  const m = (lookup || "").match(/^laloge_([a-z]+)_(mensuel|annuel)$/);
  return m && PLANS.includes(m[1]) ? { plan: m[1], interval: m[2] } : null;
}

// ─── Traitement des événements webhook ──────────────────────
async function handleEvent(event: Record<string, any>): Promise<string> {
  const type = event.type as string;
  const obj = event.data?.object as Record<string, any>;

  if (type === "checkout.session.completed") {
    // lie le customer/subscription à l'agence — le plan arrive via
    // customer.subscription.created/updated (objet complet embarqué)
    const agencyId = obj.client_reference_id || obj.metadata?.agency_id;
    if (!agencyId) return "sans agence";
    await sbAdmin.from("agencies").update({
      stripe_customer_id: obj.customer,
      stripe_subscription_id: obj.subscription,
    }).eq("id", agencyId);
    return `agence ${agencyId} liée`;
  }

  if (type === "customer.subscription.created" || type === "customer.subscription.updated") {
    const agencyId = obj.metadata?.agency_id;
    const lookup = obj.items?.data?.[0]?.price?.lookup_key;
    const resolved = planFromLookup(lookup);
    if (!resolved) return "prix inconnu";
    // cible : metadata.agency_id, sinon le customer déjà lié
    const target = agencyId
      ? sbAdmin.from("agencies").update({
          plan: ["active", "trialing"].includes(obj.status) ? resolved.plan : undefined,
          subscription_status: obj.status,
          stripe_subscription_id: obj.id,
          stripe_customer_id: obj.customer,
          billing_interval: resolved.interval,
        }).eq("id", agencyId)
      : sbAdmin.from("agencies").update({
          plan: ["active", "trialing"].includes(obj.status) ? resolved.plan : undefined,
          subscription_status: obj.status,
          stripe_subscription_id: obj.id,
          billing_interval: resolved.interval,
        }).eq("stripe_customer_id", obj.customer);
    const { error } = await target;
    return error ? `erreur: ${error.message}` : `abonnement ${obj.status} → ${resolved.plan}`;
  }

  if (type === "customer.subscription.deleted") {
    // fin d'abonnement → retombe sur l'offre gratuite
    const { error } = await sbAdmin.from("agencies").update({
      plan: "decouverte",
      subscription_status: "canceled",
      stripe_subscription_id: null,
      billing_interval: null,
    }).eq("stripe_customer_id", obj.customer);
    return error ? `erreur: ${error.message}` : "résilié → decouverte";
  }

  return "ignoré";
}

// ─── Handler ────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST attendu" });
  const url = new URL(req.url);

  // ── Webhook Stripe (signé — pas de JWT) ──
  if (url.pathname.endsWith("/webhook")) {
    const payload = await req.text();
    if (!(await verifyStripeSignature(payload, req.headers.get("stripe-signature")))) {
      return json(400, { error: "Signature invalide" });
    }
    try {
      const event = JSON.parse(payload);
      const result = await handleEvent(event);
      console.log(`[stripe-billing] ${event.type} → ${result}`);
      return json(200, { received: true, result });
    } catch (err) {
      console.error("[stripe-billing] webhook:", err);
      return json(500, { error: "Traitement échoué" });
    }
  }

  // ── Actions authentifiées (owner d'agence) ──
  const caller = await requireOwner(req);
  if (!caller) return json(403, { error: "Réservé au propriétaire de l'agence." });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "JSON invalide" }); }

  const { data: agency } = await sbAdmin.from("agencies")
    .select("id, name, slug, contact_email, plan, stripe_customer_id, stripe_subscription_id")
    .eq("id", caller.agencyId).single();
  if (!agency) return json(404, { error: "Agence introuvable" });

  try {
    if (body.action === "checkout") {
      const plan = String(body.plan || "");
      const interval = String(body.interval || "mensuel");
      if (!PLANS.includes(plan) || !INTERVALS.includes(interval)) {
        return json(400, { error: "Plan ou intervalle inconnu" });
      }
      const prices = await stripe("GET", `prices?lookup_keys[]=laloge_${plan}_${interval}&limit=1`) as any;
      const price = prices?.data?.[0];
      if (!price) return json(500, { error: "Tarif introuvable côté Stripe" });

      // customer : réutilisé ou créé (metadata.agency_id = clef de mapping)
      let customer = agency.stripe_customer_id as string | null;
      if (!customer) {
        const c = await stripe("POST", "customers", {
          email: agency.contact_email || caller.email,
          name: agency.name,
          "metadata[agency_id]": agency.id,
          "metadata[slug]": agency.slug,
        }) as any;
        if (!c?.id) return json(500, { error: "Création du client Stripe impossible" });
        customer = c.id as string;
        await sbAdmin.from("agencies").update({ stripe_customer_id: customer }).eq("id", agency.id);
      }

      const session = await stripe("POST", "checkout/sessions", {
        mode: "subscription",
        customer: customer!,
        "line_items[0][price]": price.id,
        "line_items[0][quantity]": "1",
        client_reference_id: agency.id,
        "subscription_data[metadata][agency_id]": agency.id,
        allow_promotion_codes: "true",
        success_url: `${SITE}/communication-admin.html?abonnement=ok`,
        cancel_url: `${SITE}/communication-admin.html?abonnement=annule`,
      }) as any;
      if (!session?.url) return json(500, { error: session?.error?.message || "Session de paiement impossible" });
      return json(200, { url: session.url });
    }

    if (body.action === "portal") {
      if (!agency.stripe_customer_id) return json(400, { error: "Aucun abonnement à gérer." });
      const portal = await stripe("POST", "billing_portal/sessions", {
        customer: agency.stripe_customer_id as string,
        return_url: `${SITE}/communication-admin.html`,
      }) as any;
      if (!portal?.url) return json(500, { error: portal?.error?.message || "Portail indisponible" });
      return json(200, { url: portal.url });
    }

    return json(400, { error: `Action inconnue` });
  } catch (err) {
    console.error("[stripe-billing]", err);
    return json(500, { error: err instanceof Error ? err.message : "Erreur Stripe" });
  }
});
