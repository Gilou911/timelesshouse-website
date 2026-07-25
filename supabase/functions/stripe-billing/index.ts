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
//   POST /            { action: "univers-checkout", universe, interval }
//        → ajoute un MÉTIER (option payante). Abonnement en cours → une
//          ligne de plus, active aussitôt ; sinon → session de paiement.
//   POST /            { action: "univers-cancel", universe }
//        → résilie un métier : la ligne est retirée SANS proratisation
//          et le métier reste utilisable jusqu'à `valid_until` (la
//          période déjà réglée est due). Le métier « inclus » est protégé.
//
// TARIFS À CRÉER DANS STRIPE (lookup_key) :
//   laloge_<plan>_<mensuel|annuel>              — paliers de stockage
//   laloge_univers_<metier>_<mensuel|annuel>    — métiers optionnels
//   (métiers : celebration, filmmaker, communication, neutre)
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
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function verifyStripeSignature(payload: string, header: string | null): Promise<boolean> {
  if (!header || !WEBHOOK_SECRET) return false;
  // L'en-tête Stripe-Signature peut porter PLUSIEURS v1 (rotation de secret) :
  // t=…,v1=…,v1=… → on collecte tous les v1 et on accepte si l'un correspond.
  let t = "";
  const v1s: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i), v = part.slice(i + 1);
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // tolérance 5 min
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparaison à temps constant contre chaque v1 (pas de court-circuit)
  let ok = false;
  for (const v1 of v1s) if (timingSafeEqual(hex, v1)) ok = true;
  return ok;
}

// lookup_key « laloge_<plan>_<intervalle> » → { plan, interval }
function planFromLookup(lookup: string | undefined): { plan: string; interval: string } | null {
  const m = (lookup || "").match(/^laloge_([a-z]+)_(mensuel|annuel)$/);
  return m && PLANS.includes(m[1]) ? { plan: m[1], interval: m[2] } : null;
}

// ─── MÉTIERS (25/07/2026) ───────────────────────────────────
// Une loge se vend par métier. L'abonnement porte donc PLUSIEURS lignes :
// le palier de stockage + une ligne par métier optionnel.
// lookup_key attendu côté Stripe : « laloge_univers_<metier>_<intervalle> ».
// (La liste doit rester alignée sur METIERS dans univers.js.)
const UNIVERSES = ["celebration", "filmmaker", "communication", "neutre"];
function universeFromLookup(lookup: string | undefined): { universe: string; interval: string } | null {
  const m = (lookup || "").match(/^laloge_univers_([a-z]+)_(mensuel|annuel)$/);
  return m && UNIVERSES.includes(m[1]) ? { universe: m[1], interval: m[2] } : null;
}

/** Trie les lignes d'un abonnement : le palier d'un côté, les métiers de l'autre.
 *  ⚠️ On ITÈRE — l'ancien code lisait items.data[0] et supposait une ligne
 *  unique : dès qu'un métier passait en tête, le palier cessait d'être
 *  synchronisé (l'agence gardait un plan périmé). */
function trierLignes(obj: Record<string, any>) {
  const items = (obj.items?.data || []) as Record<string, any>[];
  let palier: { plan: string; interval: string; itemId: string } | null = null;
  const metiers: { universe: string; interval: string; itemId: string }[] = [];
  for (const it of items) {
    const lk = it.price?.lookup_key as string | undefined;
    const p = planFromLookup(lk);
    if (p && !palier) { palier = { ...p, itemId: it.id }; continue; }
    const u = universeFromLookup(lk);
    if (u) metiers.push({ ...u, itemId: it.id });
  }
  return { palier, metiers };
}

/** Fin de la période DÉJÀ RÉGLÉE, en ISO — c'est la date jusqu'à laquelle
 *  un métier résilié reste utilisable. Stripe la donne en secondes Unix. */
function periodeFin(obj: Record<string, any>): string | null {
  const s = Number(obj.current_period_end || 0);
  return s > 0 ? new Date(s * 1000).toISOString() : null;
}

/** L'agence visée par un événement : metadata d'abord, sinon le customer lié. */
async function agenceDe(obj: Record<string, any>): Promise<string | null> {
  const fromMeta = obj.metadata?.agency_id;
  if (fromMeta) return String(fromMeta);
  if (!obj.customer) return null;
  const { data } = await sbAdmin.from("agencies").select("id")
    .eq("stripe_customer_id", obj.customer).maybeSingle();
  return data?.id ? String(data.id) : null;
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
    const { palier, metiers } = trierLignes(obj);
    const actif = ["active", "trialing"].includes(obj.status);

    // État de l'abonnement : mis à jour MÊME sans palier reconnu (un
    // abonnement qui ne porterait que des métiers reste un abonnement).
    const patch: Record<string, unknown> = {
      subscription_status: obj.status,
      stripe_subscription_id: obj.id,
    };
    if (obj.customer) patch.stripe_customer_id = obj.customer;
    // Le palier n'est écrit QUE s'il est reconnu : sans cette garde, une
    // ligne métier en tête ferait retomber l'agence sur un plan faux.
    if (palier) {
      patch.billing_interval = palier.interval;
      if (actif) patch.plan = palier.plan;
    }

    const agencyId = obj.metadata?.agency_id;
    const cible = agencyId
      ? sbAdmin.from("agencies").update(patch).eq("id", agencyId)
      : sbAdmin.from("agencies").update(patch).eq("stripe_customer_id", obj.customer);
    const { error } = await cible;
    if (error) return `erreur: ${error.message}`;

    // ── Métiers portés par l'abonnement ──
    // On n'AJOUTE et ne rafraîchit que ce qui est présent : jamais de
    // suppression ici. Un métier résilié a déjà été passé en `cancelling`
    // avec sa date de fin par l'action `univers-cancel` — le webhook ne
    // doit pas écraser ce sursis.
    let note = "";
    if (metiers.length) {
      const id = await agenceDe(obj);
      if (id) {
        for (const m of metiers) {
          await sbAdmin.from("agency_universes").upsert({
            agency_id: id,
            universe: m.universe,
            source: "option",
            status: actif ? "active" : "cancelling",
            valid_until: actif ? null : periodeFin(obj),
            stripe_item_id: m.itemId,
          }, { onConflict: "agency_id,universe" });
        }
        note = ` · ${metiers.length} métier(s)`;
      }
    }
    return `abonnement ${obj.status}${palier ? ` → ${palier.plan}` : " (palier inchangé)"}${note}`;
  }

  if (type === "customer.subscription.deleted") {
    // fin d'abonnement → retombe sur l'offre gratuite
    const { error } = await sbAdmin.from("agencies").update({
      plan: "decouverte",
      subscription_status: "canceled",
      stripe_subscription_id: null,
      billing_interval: null,
    }).eq("stripe_customer_id", obj.customer);
    if (error) return `erreur: ${error.message}`;
    // Les métiers OPTIONNELS ne s'éteignent pas d'un coup : la période
    // est réglée, elle est due. Ils passent en sursis jusqu'à l'échéance.
    // Le métier « inclus » n'est jamais touché — c'est le socle de la loge.
    const id = await agenceDe(obj);
    if (id) {
      await sbAdmin.from("agency_universes")
        .update({ status: "cancelling", valid_until: periodeFin(obj) })
        .eq("agency_id", id).eq("source", "option").eq("status", "active");
    }
    return "résilié → decouverte (métiers optionnels en sursis)";
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

    // ── Ajouter un MÉTIER (option payante) ──────────────────
    if (body.action === "univers-checkout") {
      const universe = String(body.universe || "");
      const interval = String(body.interval || "mensuel");
      if (!UNIVERSES.includes(universe) || !INTERVALS.includes(interval)) {
        return json(400, { error: "Métier ou intervalle inconnu" });
      }
      // Déjà possédé et encore valide ? On ne facture pas deux fois.
      const { data: deja } = await sbAdmin.from("agency_universes")
        .select("status, valid_until").eq("agency_id", agency.id).eq("universe", universe).maybeSingle();
      if (deja && (deja.status === "active"
        || (deja.valid_until && new Date(deja.valid_until as string) > new Date()))) {
        return json(400, { error: "Ce métier est déjà actif sur votre loge." });
      }

      const prices = await stripe("GET", `prices?lookup_keys[]=laloge_univers_${universe}_${interval}&limit=1`) as any;
      const price = prices?.data?.[0];
      if (!price) return json(500, { error: "Tarif introuvable côté Stripe pour ce métier." });

      // Abonnement en cours → on y ajoute simplement une ligne. Stripe
      // proratise sur la période entamée ; le métier est actif aussitôt.
      if (agency.stripe_subscription_id) {
        const item = await stripe("POST", "subscription_items", {
          subscription: agency.stripe_subscription_id as string,
          price: price.id,
          quantity: "1",
          proration_behavior: "create_prorations",
        }) as any;
        if (!item?.id) return json(500, { error: item?.error?.message || "Ajout au abonnement impossible" });
        await sbAdmin.from("agency_universes").upsert({
          agency_id: agency.id, universe, source: "option",
          status: "active", valid_until: null, stripe_item_id: item.id,
        }, { onConflict: "agency_id,universe" });
        return json(200, { ok: true, ajoute: true });
      }

      // Pas encore d'abonnement (offre gratuite) → passage en caisse.
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
        success_url: `${SITE}/communication-admin.html?metier=ok`,
        cancel_url: `${SITE}/communication-admin.html?metier=annule`,
      }) as any;
      if (!session?.url) return json(500, { error: session?.error?.message || "Session de paiement impossible" });
      return json(200, { url: session.url });
    }

    // ── Se désabonner d'un MÉTIER ───────────────────────────
    // Règle de Gil : on garde l'usage jusqu'à l'échéance déjà réglée.
    // La ligne est retirée TOUT DE SUITE et SANS proratisation : plus
    // aucune facturation ensuite, et la période en cours — déjà payée —
    // reste due, donc utilisable. C'est `valid_until` qui la protège.
    if (body.action === "univers-cancel") {
      const universe = String(body.universe || "");
      const { data: ligne } = await sbAdmin.from("agency_universes")
        .select("universe, source, status, stripe_item_id")
        .eq("agency_id", agency.id).eq("universe", universe).maybeSingle();
      if (!ligne) return json(404, { error: "Ce métier n'est pas sur votre loge." });
      if (ligne.source !== "option") {
        return json(400, { error: "Le métier compris dans votre offre ne peut pas être retiré." });
      }
      if (ligne.status !== "active") return json(400, { error: "Ce métier est déjà résilié." });

      let fin: string | null = null;
      if (agency.stripe_subscription_id) {
        const sub = await stripe("GET", `subscriptions/${agency.stripe_subscription_id}`) as any;
        fin = periodeFin(sub || {});
      }
      if (ligne.stripe_item_id) {
        await stripe("DELETE", `subscription_items/${ligne.stripe_item_id}`, {
          proration_behavior: "none",
        });
      }
      const { error } = await sbAdmin.from("agency_universes")
        .update({ status: "cancelling", valid_until: fin, stripe_item_id: null })
        .eq("agency_id", agency.id).eq("universe", universe);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, jusquau: fin });
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
