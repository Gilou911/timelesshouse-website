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
const sb = createClient(SB_URL, SB_SERVICE_KEY);

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

serve(async (_req) => {
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

  return new Response(JSON.stringify({ ok: true, date: today, processed: clients?.length || 0, log }), {
    headers: { "Content-Type": "application/json" },
  });
});
