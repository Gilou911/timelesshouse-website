// ════════════════════════════════════════════════════════════
// ⏰  EDGE FUNCTION — scheduled-notifications
// ════════════════════════════════════════════════════════════
// Tourne TOUTES LES HEURES (cron « 0 * * * * » — historiquement 1×/jour
// à 9h UTC) et envoie automatiquement :
//   • Rappels J-7 et J-1 avant un tournage         ← MIS À JOUR
//   • Rappels de facture (3 j avant échéance / le jour J / J+7
//     et J+14 si toujours impayée — max 4 emails par facture)
//   • « À publier aujourd'hui » (métier Communication) : un email
//     par agence listant les sorties du jour + celles d'hier jamais
//     cochées « publié » (anti-doublon : post_sorties.rappel_envoye_pour)
//
// Anti-doublon :
//   • Tournages   → colonnes shoots.reminded_7d / reminded_1d
//                   (réinitialisées par l'admin si la date change)
//   • Factures    → dedupe_key géré par notify-client
//
// DÉPLOIEMENT :
//   supabase functions deploy scheduled-notifications --no-verify-jwt
//
// CRON Supabase (voir files/migration-rappels-reglables.sql) :
//   Integrations → Cron → "daily-notifications" → "0 * * * *"
//
// RÉGLAGES PAR AGENCE (01/08/2026) — agencies.rappels (jsonb) :
//   { tournages: {actif, heure}, factures: {actif, heure},
//     sorties: {actif, heure} } — heure de PARIS. Absent = tout actif
//   à 9 h. La règle d'envoi est « au premier passage À PARTIR de
//   l'heure choisie » : sous l'ancien cron quotidien (11h Paris l'été),
//   le comportement d'hier est conservé tel quel ; sous le cron
//   horaire, chaque agence est servie à son heure, et un passage raté
//   se rattrape à l'heure suivante. L'idempotence tient aux gardes
//   existantes (flags reminded_*, dedupe_key, rappel_envoye_pour).
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
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  // ① Le cron (Supabase → Integrations → Cron) appelle DÉJÀ avec la clé
  //    service dans l'Authorization — un secret serveur. On l'accepte tel
  //    quel : aucune modification du cron nécessaire. (Même principe que
  //    notify-client pour le worker/cron.)
  if (token && token === SB_SERVICE_KEY) return true;
  // ② Repli : en-tête x-cron-key = CRON_SECRET (autre déclencheur possible).
  if (CRON_SECRET && req.headers.get("x-cron-key") === CRON_SECRET) return true;
  // ③ Test manuel : propriétaire de la plateforme.
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

  // ── Réglages de rappels, par agence ─────────────────────────
  // hourCycle h23 : hour12:false rend « 24 » à minuit sur certains
  // moteurs — h23 garantit 0-23, ce que la comparaison exige.
  const heureParis = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23",
  }).format(new Date()));
  // select('*') exprès : `rappels` n'existe pas avant la migration —
  // la nommer ferait tomber TOUTE la tournée (règle PostgREST).
  const { data: agLignes } = await sb.from("agencies").select("*");
  const AGENCES = new Map<string, any>((agLignes || []).map((a: any) => [a.id, a]));
  const rappelDe = (agencyId: string | null, genre: string) => {
    const r = ((AGENCES.get(agencyId || "") || {}).rappels || {})[genre] || {};
    return {
      actif: r.actif !== false,
      heure: Number.isInteger(r.heure) && r.heure >= 0 && r.heure <= 23 ? r.heure : 9,
    };
  };
  // « C'est l'heure » = premier passage à partir de l'heure choisie.
  const cestLheure = (r: { actif: boolean; heure: number }) => r.actif && heureParis >= r.heure;

  // Cibles tournages : aujourd'hui + 7 jours et + 1 jour
  const TARGETS = [
    { days: 7, iso: isoInDays(7), flag: "reminded_7d" as const },
    { days: 1, iso: isoInDays(1), flag: "reminded_1d" as const },
  ];

  // 1️⃣ Récupérer tous les clients actifs avec un email
  const { data: clients, error: cErr } = await sb
    .from("clients")
    .select("id, name, client_email, active, agency_id")
    .eq("active", true)
    .not("client_email", "is", null);

  if (cErr) return new Response(JSON.stringify({ error: cErr.message }), { status: 500 });

  for (const client of clients || []) {
    if (!client.client_email) continue;
    // Les réglages de l'agence du client : coupé, ou pas encore l'heure
    // → on passe. Les gardes anti-doublon rendent le rattrapage sûr.
    const rTour = rappelDe(client.agency_id, "tournages");
    const rFact = rappelDe(client.agency_id, "factures");

    // ─── 2) RAPPELS DE TOURNAGE (J-7 + J-1) ──────────────────
    const { data: shoots } = cestLheure(rTour)
      ? await sb.from("shoots").select("*").eq("client_id", client.id)
      : { data: [] as any[] };
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
    const { data: invoices } = cestLheure(rFact)
      ? await sb.from("invoices").select("*").eq("client_id", client.id).neq("status", "payée")
      : { data: [] as any[] };
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
  // Anti-doublon : le jour exact (J-15 / J-3) désigne la cible, et un
  // dedupe_key scelle chaque envoi — indispensable depuis que le cron
  // passe toutes les heures (sans lui : 24 fois le même email). Ce
  // garde-fou est de la PLATEFORME (il protège l'accès aux données du
  // client final) : pas de réglage d'agence, heure fixe de 9 h.
  const { data: expClients } = heureParis >= 9 ? await sb
    .from("clients")
    .select("id, name, client_email, created_at, agencies!inner(slug, plan)")
    .eq("active", true)
    .eq("agencies.plan", "decouverte") : { data: [] as any[] };

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
        dedupe_key: `exp:${c.id}:j${left}`,
        extra: { days: left, dateLabel },
      });
      log.push({ client: c.name, kind: "access_expiring", days: left,
        result: r1?.ok ? "sent" : (r1?.skipped || "error"), error: r1?.error });
    }

    // b) Le locataire — toujours (c'est lui qui peut prolonger l'accès)
    const r2 = await callNotify({
      kind: "admin_client_expiring", client_id: c.id,
      dedupe_key: `expadm:${c.id}:j${left}`,
      extra: { days: left, dateLabel, url: consoleUrl },
    });
    log.push({ client: c.name, kind: "admin_client_expiring", days: left,
      result: r2?.ok ? "sent" : (r2?.skipped || "error"), error: r2?.error });
  }

  // ─── 5) SORTIES À PUBLIER (métier Communication) ────────────
  // L'agenda éditorial ne vaut que s'il RÉVEILLE : chaque matin, UN
  // email par agence liste ce qui doit sortir dans la journée — et,
  // en seconde section, les sorties d'HIER jamais cochées « publié »
  // (publiées mais pas cochées, ou vraiment manquées : un regard
  // humain tranche). Anti-doublon à deux étages : la colonne
  // post_sorties.rappel_envoye_pour (le jour POUR lequel on a déjà
  // prévenu — une sortie déplacée redevient éligible d'elle-même),
  // et le dedupe_key côté notify-client si le cron est rejoué.
  // Le tout sous try : la tournée du matin (tournages, factures) ne
  // doit jamais tomber pour un rappel de sortie.
  try {
    const hier = isoInDays(-1);
    // Fenêtre large en UTC, tri fin en heure de Paris ensuite : les
    // bornes exactes d'un jour civil parisien en UTC dépendent de
    // l'heure d'été — autant ne pas jouer à ça dans la requête.
    const depuis = new Date(Date.now() - 3 * 86400000).toISOString();
    const jusqua = new Date(Date.now() + 2 * 86400000).toISOString();
    const { data: sortiesDues, error: sErr } = await sb
      .from("post_sorties")
      .select("*, posts!inner(*)")
      .is("publie_le", null)
      .gte("prevue_le", depuis)
      .lt("prevue_le", jusqua);
    if (sErr) throw new Error(sErr.message);

    const jourParis  = (iso: string) => new Date(iso).toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
    const heureParis = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });

    // Rangement par agence : un matin, UN email — jamais un par sortie.
    const parAgence = new Map<string, { jour: any[]; retard: any[] }>();
    for (const s of sortiesDues || []) {
      if (!s.prevue_le || s.posts?.statut === "abandonne") continue;
      if (s.rappel_envoye_pour === today) continue;   // déjà prévenu ce matin
      const j = jourParis(s.prevue_le);
      const quand = j === today ? "jour" : j === hier ? "retard" : null;
      if (!quand) continue;
      const g = parAgence.get(s.posts.agency_id) || { jour: [], retard: [] };
      g[quand].push(s);
      parAgence.set(s.posts.agency_id, g);
    }

    // Les noms des clients concernés, en une seule requête.
    const idsClients = [...new Set(
      [...parAgence.values()].flatMap((g) => [...g.jour, ...g.retard])
        .map((s) => s.posts.client_id).filter(Boolean),
    )];
    const nomClients = new Map<string, string>();
    if (idsClients.length) {
      const { data: cs } = await sb.from("clients").select("id, name").in("id", idsClients);
      (cs || []).forEach((c: any) => nomClients.set(c.id, c.name));
    }

    for (const [agencyId, g] of parAgence) {
      // Le réglage de l'agence : coupé → silence ; pas encore l'heure
      // → on repassera (le cron est horaire, rien n'est perdu).
      const rSort = rappelDe(agencyId, "sorties");
      if (!rSort.actif) {
        log.push({ kind: "admin_publish_today", agency: agencyId, result: "desactive" });
        continue;
      }
      if (heureParis < rSort.heure) continue;
      const versExtra = (s: any) => ({
        heure:  heureParis(s.prevue_le),
        date:   jourParis(s.prevue_le),
        reseau: s.reseau,
        titre:  s.posts.title,
        client: nomClients.get(s.posts.client_id) || "",
      });
      const res = await callNotify({
        kind:       "admin_publish_today",
        agency_id:  agencyId,
        dedupe_key: `sorties:${agencyId}:${today}`,
        extra: { jour: g.jour.map(versExtra), retard: g.retard.map(versExtra) },
      });
      const sent = !!res?.ok && !res?.skipped;
      if (sent) {
        // Chaque sortie retient POUR QUEL JOUR elle a été rappelée :
        // rejouer le cron ne renvoie rien, déplacer la sortie ré-arme.
        const ids = [...g.jour, ...g.retard].map((s) => s.id);
        await sb.from("post_sorties").update({ rappel_envoye_pour: today }).in("id", ids);
      }
      log.push({
        kind: "admin_publish_today", agency: agencyId,
        jour: g.jour.length, retard: g.retard.length,
        result: sent ? "sent" : (res?.skipped || "error"), error: res?.error,
      });
    }
  } catch (e) {
    log.push({ kind: "admin_publish_today", result: "error", error: String((e as any)?.message || e) });
  }

  return new Response(JSON.stringify({ ok: true, date: today, processed: clients?.length || 0, log }), {
    headers: { "Content-Type": "application/json" },
  });
});
