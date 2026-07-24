// ════════════════════════════════════════════════════════════
// ⏰  EDGE FUNCTION — scheduled-notifications
// ════════════════════════════════════════════════════════════
// Tourne 1× par jour (cron) et envoie automatiquement :
//   • Rappels J-7 et J-1 avant un tournage         ← MIS À JOUR
//   • Rappels de facture (3 j avant échéance / le jour J / J+7
//     et J+14 si toujours impayée — max 4 emails par facture)
//
// Anti-doublon :
//   • Tournages   → colonnes shoots.reminded_7d / reminded_1d
//                   (réinitialisées par l'admin si la date change)
//   • Factures    → dedupe_key géré par notify-client
//
// DÉPLOIEMENT :
//   supabase functions deploy scheduled-notifications --no-verify-jwt
//
// CRON Supabase Dashboard (déjà configuré pour vous) :
//   Integrations → Cron → "daily-notifications" → "0 9 * * *"
// ════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL         = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET    = Deno.env.get("CRON_SECRET") || "";
const sb = createClient(SB_URL, SB_SERVICE_KEY);

// ── Garde d'entrée (durcissement sécurité, 24/07/2026) ──
// Avant, cette fonction ignorait la requête (`_req`) : n'importe qui avec
// la clé publique pouvait déclencher la tournée nocturne. Sans danger
// (anti-doublon → jamais de double envoi, cibles non choisies par
// l'appelant), mais elle ne doit répondre qu'à SON planificateur.
// Deux clés acceptées, comme measure-storage : le secret du cron
// (`x-cron-key`), ou le propriétaire de la plateforme (pour un test manuel).
async function allowed(req: Request): Promise<boolean> {
  if (CRON_SECRET && req.headers.get("x-cron-key") === CRON_SECRET) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await sb.auth.getUser(token);
  if (!data?.user) return false;
  const { data: rows } = await sb
    .from("agency_members")
    .select("role, agencies!inner(slug)")
    .eq("user_id", data.user.id).eq("role", "owner").eq("agencies.slug", "timelesshouse");
  return !!rows && rows.length > 0;
}

// Mapping mois français → numéro (fallback pour les anciens tournages sans date_iso)
const MONTH_MAP: Record<string, number> = {
  "Jan": 0, "Fév": 1, "Mars": 2, "Avr": 3, "Mai": 4, "Juin": 5,
  "Juil": 6, "Août": 7, "Sept": 8, "Oct": 9, "Nov": 10, "Déc": 11,
};

/** Date du jour au format ISO (YYYY-MM-DD) en fuseau Paris */
const todayISO = () =>
  new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });

/** Date dans N jours au format ISO en fuseau Paris */
const isoInDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
};

const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

/** Calcule date_iso d'un shoot à partir des champs legacy si manquant */
function shootISO(shoot: any): string | null {
  if (shoot.date_iso) return shoot.date_iso;
  const m = MONTH_MAP[shoot.month_label];
  if (m === undefined || !shoot.date_day || !shoot.year) return null;
  const mm = String(m + 1).padStart(2, "0");
  const dd = String(shoot.date_day).padStart(2, "0");
  return `${shoot.year}-${mm}-${dd}`;
}

async function callNotify(payload: any) {
  const r = await fetch(`${SB_URL}/functions/v1/notify-client`, {
    method:  "POST",
    headers: { "Authorization": `Bearer ${SB_SERVICE_KEY}`, "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });
  return await r.json().catch(() => ({}));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (!(await allowed(req))) {
    return new Response(JSON.stringify({ error: "Non autorisé" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }
  const today = todayISO();
  const log: any[] = [];

  // Cibles tournages : aujourd'hui + 7 jours et + 1 jour
  const TARGETS = [
    { days: 7, iso: isoInDays(7), flag: "reminded_7d" as const },
    { days: 1, iso: isoInDays(1), flag: "reminded_1d" as const },
  ];

  // 1️⃣ Récupérer tous les clients actifs avec un email
  const { data: clients, error: cErr } = await sb
    .from("clients")
    .select("id, name, client_email, active")
    .eq("active", true)
    .not("client_email", "is", null);

  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500 });

  for (const client of clients || []) {
    if (!client.client_email) continue;

    // ─── 2) RAPPELS DE TOURNAGE (J-7 + J-1) ──────────────────
    const { data: shoots } = await sb.from("shoots").select("*").eq("client_id", client.id);
    for (const shoot of shoots || []) {
      const iso = shootISO(shoot);
      if (!iso) continue;

      for (const t of TARGETS) {
        if (iso !== t.iso) continue;          // pas dans la fenêtre
        if (shoot[t.flag] === true) continue; // déjà envoyé

        const res = await callNotify({
          kind:      "shoot_reminder",
          client_id: client.id,
          extra: {
            daysBefore:  t.days,
            title:       shoot.title,
            type:        shoot.type,
            date_iso:    iso,
            date_day:    shoot.date_day,
            month_label: shoot.month_label,
            year:        shoot.year,
            time_label:  shoot.time_label || "",
            location:    shoot.location || "",
          },
        });

        const sent = !!res?.ok;
        if (sent) {
          // Marque le rappel comme envoyé (anti-doublon — colonne existante)
          await sb.from("shoots").update({ [t.flag]: true }).eq("id", shoot.id);
        }
        log.push({
          client: client.name,
          kind:   "shoot_reminder",
          shoot:  shoot.title,
          days:   t.days,
          result: sent ? "sent" : "error",
          error:  res?.error,
        });
      }
    }

    // ─── 3) RAPPELS DE FACTURE ───────────────────────────────
    // ⚠️ Inchangé. Note : ce bloc envoie `kind: "invoice_reminder"`,
    //    qui doit être implémenté dans notify-client pour fonctionner.
    const { data: invoices } = await sb.from("invoices").select("*").eq("client_id", client.id).neq("status", "payée");
    for (const inv of invoices || []) {
      if (!inv.due_date) continue;

      const days = daysBetween(today, inv.due_date); // négatif = en retard

      let reminderType: string | null = null;
      let dedupeKey:    string | null = null;

      if (days === 3)        { reminderType = "before_due";  dedupeKey = `inv:${inv.id}:j-3`; }
      else if (days === 0)   { reminderType = "due_today";   dedupeKey = `inv:${inv.id}:d-day`; }
      else if (days === -7)  { reminderType = "overdue";     dedupeKey = `inv:${inv.id}:overdue-7`; }
      else if (days === -14) { reminderType = "overdue";     dedupeKey = `inv:${inv.id}:overdue-14`; }

      if (reminderType) {
        const res = await callNotify({
          kind:          "invoice_reminder",
          client_id:     client.id,
          invoice_id:    inv.id,
          reminder_type: reminderType,
          dedupe_key:    dedupeKey,
        });
        log.push({ client: client.name, kind: "invoice_reminder", invoice: inv.reference, type: reminderType, result: res?.ok ? "sent" : (res?.skipped ? "skipped" : "error"), error: res?.error });
      }
    }
  }

  // ─── 4) FIN D'ACCÈS OFFRE DÉCOUVERTE (J-15 / J-3) ──────────
  // La rétention Découverte coupe l'accès à 90 jours (brique 17,
  // client_beyond_retention). Personne n'était prévenu : ni le client
  // final (qui perdait son mariage sans un mot), ni le locataire.
  // Anti-doublon : même principe que les factures — on ne tire QUE le
  // jour exact (J-15 / J-3), le cron étant quotidien.
  const { data: expClients } = await sb
    .from("clients")
    .select("id, name, client_email, created_at, agencies!inner(slug, plan)")
    .eq("active", true)
    .eq("agencies.plan", "decouverte");

  for (const c of expClients || []) {
    const expire = new Date(new Date(c.created_at).getTime() + 90 * 86400000);
    const expireISO = expire.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
    const left = daysBetween(today, expireISO);
    if (left !== 15 && left !== 3) continue;

    const dateLabel = expire.toLocaleDateString("fr-FR", {
      timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric",
    });
    const ag: any = (c as any).agencies;
    const consoleUrl = ag?.slug
      ? `https://${ag.slug}.laloge.house/communication-admin`
      : "https://www.timelesshouse.org/communication-admin";

    // a) Le client final — seulement s'il a un email
    if (c.client_email) {
      const r1 = await callNotify({
        kind: "access_expiring", client_id: c.id,
        extra: { days: left, dateLabel },
      });
      log.push({ client: c.name, kind: "access_expiring", days: left,
        result: r1?.ok ? "sent" : (r1?.skipped || "error"), error: r1?.error });
    }

    // b) Le locataire — toujours (c'est lui qui peut prolonger l'accès)
    const r2 = await callNotify({
      kind: "admin_client_expiring", client_id: c.id,
      extra: { days: left, dateLabel, url: consoleUrl },
    });
    log.push({ client: c.name, kind: "admin_client_expiring", days: left,
      result: r2?.ok ? "sent" : (r2?.skipped || "error"), error: r2?.error });
  }

  return new Response(JSON.stringify({ ok: true, date: today, processed: clients?.length || 0, log }), {
    headers: { "Content-Type": "application/json" },
  });
});
