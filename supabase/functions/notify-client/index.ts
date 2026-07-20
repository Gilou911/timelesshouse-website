// ══════════════════════════════════════════════════════════════════
// TimelessHouse — notify-client (Supabase Edge Function)
// Source rapatriée dans le repo depuis le déploiement v42 (extraction
// eszip) puis MARQUE BLANCHE (SaaS B.3) : chaque email porte la marque
// de l'AGENCE du client (nom, couleur d'accent, email de contact) —
// TimelessHouse par défaut ; les notifications « admin_* » partent vers
// l'email de contact de l'agence du client, plus vers un ADMIN_EMAIL
// global. Mode { dry_run: true } : construit tout sans envoyer.
// ══════════════════════════════════════════════════════════════════
// Kinds supportés :
//   welcome                  → email de bienvenue au client
//   new_media                → nouveau média livré
//   event_ready              → photos / film disponibles
//   invoice_ready            → facture disponible dans l'espace client
//   invoice_reminder         → relance auto (J-3 / J0 / J+7 / J+14) ← NOUVEAU
//   shoot_scheduled          → tournage programmé
//   shoot_updated            → tournage modifié (date/lieu)
//   shoot_reminder           → rappel automatique J-7 / J-1
//   strategy_ready           → stratégie de contenu publiée ← NOUVEAU
//   admin_new_comment        → notifie l'admin d'un commentaire
//   admin_media_approved     → notifie l'admin d'une approbation
//   admin_changes_requested  → notifie l'admin d'une demande de modif
// ══════════════════════════════════════════════════════════════════
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// ── Secrets (injectés automatiquement par Supabase + ceux que vous avez ajoutés) ──
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// Expéditeur : modifiable dans les secrets Supabase (FROM_EMAIL)
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "TimelessHouse <service@timelesshouse.org>";
// Destinataire admin pour les notifications internes
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "service@timelesshouse.org";
// ── Marque blanche (SaaS B.3) ──
// L'adresse d'expédition reste celle du domaine vérifié Resend ; seul
// le NOM affiché change (« Studio Lumière <service@timelesshouse.org> »).
const FROM_ADDR = (FROM_EMAIL.match(/<(.+)>/) || [null, FROM_EMAIL])[1];
const DEFAULT_BRAND = {
  name: "TimelessHouse",
  email: ADMIN_EMAIL,
  accent: "#2a2620",
  site: "https://timelesshouse.org"
};
// Posée de façon SYNCHRONE par chaque builder (via brandOf) juste avant
// les appels à layout() — aucun await entre les deux, donc aucune
// requête concurrente ne peut mélanger les marques.
let CURRENT_BRAND = DEFAULT_BRAND;
function brandOf(client) {
  const b = client && client.__brand || DEFAULT_BRAND;
  CURRENT_BRAND = b;
  return b;
}
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────
/** Récupère une ligne dans une table Supabase via son id */ async function sbGet(table, id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=*`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`
    }
  });
  const rows = await res.json();
  return rows?.[0] ?? null;
}
/** Envoie un email via Resend (expéditeur au nom de la marque) */ async function sendEmail({ to, subject, html, brand, replyTo }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: `${(brand || DEFAULT_BRAND).name} <${FROM_ADDR}>`,
      to,
      subject,
      html,
      ...replyTo ? { reply_to: replyTo } : {}
    })
  });
  if (!res.ok) throw new Error(`Resend : ${await res.text()}`);
  return res.json();
}
/** Formate une date de tournage en français : "17 mai 2026" */ function shootDateFR(s) {
  const iso = s?.date_iso;
  if (iso) {
    const [y, m, d] = String(iso).split("-").map(Number);
    const MOIS = [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre"
    ];
    return `${d} ${MOIS[m - 1]} ${y}`;
  }
  // Repli sur les champs legacy (date_day / month_label / year)
  return [
    s?.date_day,
    s?.month_label,
    s?.year
  ].filter(Boolean).join(" ");
}
/** Formate une date ISO "2026-05-17" en "17 mai 2026" */ function isoDateFR(iso) {
  if (!iso) return "";
  const [y, m, d] = String(iso).split("-").map(Number);
  const MOIS = [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre"
  ];
  return `${d} ${MOIS[m - 1]} ${y}`;
}
/** Nombre de jours entre 2 dates ISO (b - a) — négatif si b < a */ function daysBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
/** Date du jour au format ISO (YYYY-MM-DD) en fuseau Paris */ function todayISO() {
  return new Date().toLocaleDateString("fr-CA", {
    timeZone: "Europe/Paris"
  });
}
// ─────────────────────────────────────────────────────────────────
// Mise en page email (template commun)
// ─────────────────────────────────────────────────────────────────
function layout(body) {
  const B = CURRENT_BRAND;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620}
  .wrap{max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;
        box-shadow:0 4px 32px rgba(42,38,32,.10)}
  .header{background:${B.accent};padding:32px 40px;text-align:center}
  .header h1{margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;
             text-transform:uppercase;font-weight:400;font-family:sans-serif}
  .body{padding:40px}
  h2{margin:0 0 20px;font-size:22px;color:#2a2620;font-weight:400;line-height:1.4}
  p{margin:0 0 16px;font-size:15px;line-height:1.7;color:#4a4540}
  .btn{display:inline-block;margin:24px 0 8px;padding:14px 32px;background:${B.accent};
       color:#e8d8be !important;text-decoration:none;border-radius:32px;
       font-family:sans-serif;font-size:13px;letter-spacing:.1em;text-transform:uppercase}
  .code-box{display:inline-block;margin:16px 0;padding:12px 28px;background:#f5f0e8;
            border-radius:10px;font-family:monospace;font-size:20px;letter-spacing:.18em;
            color:#2a2620;border:1px solid #e0dbd0}
  .amount-box{display:inline-block;margin:16px 0;padding:14px 36px;background:#f5f0e8;
              border-radius:10px;font-family:Georgia,serif;font-size:28px;letter-spacing:.04em;
              color:#2a2620;border:1px solid #e0dbd0}
  .ref{display:inline-block;font-family:monospace;font-size:13px;letter-spacing:.12em;
       background:#f5f0e8;border:1px solid #e0dbd0;padding:4px 12px;border-radius:6px;
       color:#4a4540}
  .note{font-size:13px;color:#8a8480;line-height:1.6}
  .shoot-card{margin:20px 0;padding:22px 26px;background:#f9f7f3;border-left:3px solid #e8d8be;
              border-radius:0 10px 10px 0}
  .shoot-kicker{font-family:sans-serif;font-size:11px;color:#a09078;
                text-transform:uppercase;letter-spacing:.2em;font-weight:600}
  .shoot-title{font-family:Georgia,serif;font-size:20px;color:#2a2620;margin-top:6px;line-height:1.3}
  .shoot-meta{font-family:sans-serif;font-size:13px;color:#4a4540;margin-top:14px;line-height:1.8}
  .shoot-meta strong{color:#2a2620}
  blockquote{border-left:3px solid #e8d8be;margin:16px 0;padding:12px 20px;
             background:#f9f7f3;border-radius:0 8px 8px 0;font-style:italic;color:#4a4540}
  .footer{padding:24px 40px;border-top:1px solid #f0ece4;text-align:center;
          font-size:11px;font-family:sans-serif;color:#a09890;letter-spacing:.05em}
  .footer a{color:#a09890;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>${B.name}</h1></div>
  <div class="body">${body}</div>
  <div class="footer">
    ${B.name} &nbsp;·&nbsp;
    ${B.site ? `<a href="${B.site}">${B.site.replace("https://", "")}</a>` : `<a href="mailto:${B.email}">${B.email}</a>`}
  </div>
</div>
</body>
</html>`;
}
/** Bloc « carte tournage » réutilisé par les 3 emails tournage */ function shootCard(s) {
  const isVideo = s?.type === "video";
  return `
    <div class="shoot-card">
      <div class="shoot-kicker">${isVideo ? "🎥 Tournage vidéo" : "📸 Shooting photo"}</div>
      <div class="shoot-title">${s?.title ?? ""}</div>
      <div class="shoot-meta">
        <strong>📅 Date&nbsp;:</strong> ${shootDateFR(s)}<br/>
        ${s?.time_label ? `<strong>🕐 Horaires&nbsp;:</strong> ${s.time_label}<br/>` : ""}
        ${s?.location ? `<strong>📍 Lieu&nbsp;:</strong> ${s.location}` : ""}
      </div>
    </div>`;
}
// ─────────────────────────────────────────────────────────────────
// Constructeurs d'emails par type
// ─────────────────────────────────────────────────────────────────
function buildWelcome(client) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  return {
    subject: `Votre espace privé ${B.name}`,
    html: layout(`
      <h2>Bienvenue dans votre espace privé</h2>
      <p>Bonjour ${prenom},</p>
      <p>Votre espace personnel ${B.name} est prêt. Vous pouvez y accéder à tout moment avec votre code&nbsp;:</p>
      <div style="text-align:center">
        <div class="code-box">${client.code}</div>
      </div>
      <div style="text-align:center">
        <a class="btn" href="https://timelesshouse.org">Accéder à mon espace</a>
      </div>
      <p class="note">Conservez ce code précieusement — il vous sera demandé à chaque connexion.</p>
    `)
  };
}
function buildNewMedia(client, media, extra) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  const typeLabel = media?.type === "video" ? "film" : "contenu";
  const title = media?.title ?? "un nouveau contenu";
  const url = extra?.loginUrl ?? "https://timelesshouse.org";
  return {
    subject: `Nouveau ${typeLabel} disponible — ${B.name}`,
    html: layout(`
      <h2>Un nouveau ${typeLabel} est disponible</h2>
      <p>Bonjour ${prenom},</p>
      <p>Nous avons mis à disposition <strong>${title}</strong> dans votre espace personnel.</p>
      <div style="text-align:center">
        <a class="btn" href="${url}">Voir mon espace</a>
      </div>
      <p class="note">Votre code d'accès : <strong>${client.code}</strong></p>
    `)
  };
}
// ── event_ready ──────────────────────────────────────────────────
function buildStrategyReady(client, strategy) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  const titre = strategy?.subtitle || strategy?.title || "Votre stratégie de contenu";
  const concepts = Array.isArray(strategy?.concepts) ? strategy.concepts.length : 0;
  const conceptStr = concepts > 0 ? `${concepts} concept${concepts > 1 ? "s" : ""} de contenu` : "vos concepts de contenu";
  return {
    subject: `Votre stratégie de contenu est prête — ${B.name}`,
    html: layout(`
      <h2>Votre stratégie de contenu est prête</h2>
      <p>Bonjour ${prenom},</p>
      <p>Nous avons finalisé votre stratégie de contenu. Elle est disponible dès maintenant dans votre espace personnel, dans l'onglet «&nbsp;Stratégies&nbsp;».</p>
      <div class="shoot-card">
        <div class="shoot-kicker">💡 Stratégie de contenu</div>
        <div class="shoot-title">${titre}</div>
        <div class="shoot-meta">
          <strong>📋 Contenu&nbsp;:</strong> ${conceptStr}, avec hooks, storyboards et appels à l'action détaillés
        </div>
      </div>
      <p>Vous pouvez la consulter, et la partager à vos collaborateurs grâce au lien de partage intégré — sans qu'ils aient besoin de se connecter.</p>
      <div style="text-align:center">
        <a class="btn" href="https://timelesshouse.org">Consulter ma stratégie</a>
      </div>
    `)
  };
}
function buildEventReady(client, extra) {
  const B = brandOf(client);
  const { hasPhotos, hasVideo, deliveryUrl } = extra ?? {};
  const prenom = client.greeting ?? client.partner1 ?? client.name ?? "chers clients";
  let contenu = "votre contenu";
  let sujet = `Votre contenu est disponible — ${B.name}`;
  let titre = "Votre contenu est disponible";
  if (hasPhotos && hasVideo) {
    contenu = "vos photos et votre film";
    titre = "Vos photos et votre film sont disponibles";
    sujet = `Vos photos & votre film vous attendent — ${B.name}`;
  } else if (hasVideo) {
    contenu = "votre film";
    titre = "Votre film est disponible";
    sujet = `Votre film vous attend — ${B.name}`;
  } else if (hasPhotos) {
    contenu = "vos photos";
    titre = "Vos photos sont disponibles";
    sujet = `Vos photos vous attendent — ${B.name}`;
  }
  const coupleLabel = client.partner1 && client.partner2 ? `${client.partner1} & ${client.partner2}` : client.partner1 ?? client.name ?? "";
  const phrase = coupleLabel ? `C'est avec une immense joie que nous vous remettons ${contenu} — les souvenirs de <strong>${coupleLabel}</strong>.` : `${contenu.charAt(0).toUpperCase() + contenu.slice(1)} est désormais disponible dans votre espace personnel.`;
  const url = deliveryUrl || "https://timelesshouse.org";
  return {
    subject: sujet,
    html: layout(`
      <h2>${titre}</h2>
      <p>Bonjour ${prenom},</p>
      <p>${phrase}</p>
      <p>Vous pouvez y accéder dès maintenant :</p>
      <div style="text-align:center">
        <a class="btn" href="${url}">Découvrir ${contenu}</a>
      </div>
      <p class="note" style="margin-top:28px">
        Votre code d'accès : <strong>${client.code}</strong><br/>
        Vous pouvez partager ce lien avec vos proches en leur communiquant votre code.
      </p>
    `)
  };
}
// ── invoice_ready ────────────────────────────────────────────────
function buildInvoiceReady(client, extra) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  const ref = extra?.reference ?? "";
  const loginUrl = extra?.loginUrl ?? "https://timelesshouse.org";
  const montantHtml = extra?.amount != null ? `<div style="text-align:center">
         <div class="amount-box">${new Intl.NumberFormat("fr-FR").format(extra.amount)} €</div>
       </div>` : "";
  const refHtml = ref ? `&nbsp;<span class="ref">${ref}</span>` : "";
  return {
    subject: `Votre facture${ref ? " " + ref : ""} est disponible — ${B.name}`,
    html: layout(`
      <h2>Votre facture est disponible</h2>
      <p>Bonjour ${prenom},</p>
      <p>Votre facture${refHtml} est désormais disponible dans votre espace client.
         Vous pouvez la consulter et la télécharger en vous connectant ci-dessous.</p>
      ${montantHtml}
      <div style="text-align:center">
        <a class="btn" href="${loginUrl}">Consulter ma facture</a>
      </div>
      <p class="note" style="margin-top:28px">
        Votre code d'accès : <strong>${client.code}</strong><br/>
        En cas de question, répondez simplement à cet email.
      </p>
    `)
  };
}
// ── invoice_reminder ─────────────────────────────────────────────
// Reçoit `reminder_type` (envoyé par le cron scheduled-notifications) :
//   • before_due  → J-3 avant échéance (ton doux)
//   • due_today   → jour de l'échéance (rappel ferme mais cordial)
//   • overdue     → en retard (escalade selon le nombre de jours)
function buildInvoiceReminder(client, invoice, reminderType) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  const loginUrl = "https://timelesshouse.org";
  const ref = invoice?.reference ?? "";
  const dueDate = invoice?.due_date ?? null;
  const amount = invoice?.amount;
  // Pour les retards : nombre de jours écoulés depuis l'échéance
  const daysOverdue = dueDate ? -daysBetween(todayISO(), dueDate) : 0;
  const montantHtml = amount != null ? `<div style="text-align:center">
         <div class="amount-box">${new Intl.NumberFormat("fr-FR").format(amount)} €</div>
       </div>` : "";
  const refHtml = ref ? `&nbsp;<span class="ref">${ref}</span>` : "";
  const dueDateFR = isoDateFR(dueDate);
  // Variantes selon le type de rappel
  let subject;
  let titre;
  let intro;
  let outro;
  if (reminderType === "before_due") {
    // J-3
    subject = `Rappel — votre facture${ref ? " " + ref : ""} arrive à échéance — ${B.name}`;
    titre = "Votre facture arrive à échéance";
    intro = `Petit rappel amical : votre facture${refHtml} arrive à échéance le <strong>${dueDateFR}</strong>, soit dans 3 jours.`;
    outro = "Si le règlement est déjà en cours, ne tenez pas compte de ce message.";
  } else if (reminderType === "due_today") {
    // Jour J
    subject = `Échéance aujourd'hui — facture${ref ? " " + ref : ""} — ${B.name}`;
    titre = "Votre facture est à régler aujourd'hui";
    intro = `Votre facture${refHtml} arrive à échéance <strong>aujourd'hui</strong>.`;
    outro = "Si le règlement est déjà parti, merci de ne pas tenir compte de ce message.";
  } else {
    // overdue (J+7, J+14, ou autre)
    const isStrong = daysOverdue >= 14;
    subject = isStrong ? `Relance — facture${ref ? " " + ref : ""} en retard de ${daysOverdue} jours — ${B.name}` : `Votre facture${ref ? " " + ref : ""} est en retard — ${B.name}`;
    titre = isStrong ? "Votre facture reste impayée" : "Votre facture est en retard";
    intro = isStrong ? `Sauf erreur de notre part, votre facture${refHtml} (échéance du <strong>${dueDateFR}</strong>) reste impayée depuis ${daysOverdue} jours.` : `Votre facture${refHtml} était à régler le <strong>${dueDateFR}</strong>, et nous n'avons pas encore reçu votre règlement.`;
    outro = isStrong ? "Merci de procéder au règlement dans les meilleurs délais, ou de nous contacter pour faire le point ensemble." : "Merci de procéder au règlement dès que possible, ou de nous indiquer si un règlement est en cours.";
  }
  return {
    subject,
    html: layout(`
      <h2>${titre}</h2>
      <p>Bonjour ${prenom},</p>
      <p>${intro}</p>
      ${montantHtml}
      <p>${outro}</p>
      <div style="text-align:center">
        <a class="btn" href="${loginUrl}">Consulter ma facture</a>
      </div>
      <p class="note" style="margin-top:28px">
        Votre code d'accès : <strong>${client.code}</strong><br/>
        Une question ou un imprévu ? Répondez simplement à cet email.
      </p>
    `)
  };
}
// ── shoot_scheduled ──────────────────────────────────────────────
function buildShootScheduled(client, extra) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  const isVideo = extra?.type === "video";
  const url = extra?.loginUrl ?? "https://timelesshouse.org";
  const titre = isVideo ? "Votre tournage vidéo est programmé" : "Votre shooting photo est programmé";
  return {
    subject: `${titre} — ${B.name}`,
    html: layout(`
      <h2>${titre}</h2>
      <p>Bonjour ${prenom},</p>
      <p>Nous avons le plaisir de confirmer la programmation de votre ${isVideo ? "tournage vidéo" : "shooting photo"}&nbsp;:</p>
      ${shootCard(extra)}
      <p>Retrouvez tous les détails dans votre espace client. Une question d'ici là ? Répondez simplement à cet email.</p>
      <div style="text-align:center">
        <a class="btn" href="${url}">Voir mon calendrier</a>
      </div>
      <p class="note">Votre code d'accès : <strong>${client.code}</strong></p>
    `)
  };
}
// ── shoot_updated ────────────────────────────────────────────────
function buildShootUpdated(client, extra) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  const url = extra?.loginUrl ?? "https://timelesshouse.org";
  return {
    subject: `Mise à jour — votre tournage « ${extra?.title ?? ""} » — ${B.name}`,
    html: layout(`
      <h2>Un changement sur votre tournage</h2>
      <p>Bonjour ${prenom},</p>
      <p>Les informations de votre ${extra?.type === "video" ? "tournage vidéo" : "shooting photo"}
         ont été mises à jour. Voici les détails à jour&nbsp;:</p>
      ${shootCard(extra)}
      <p>Merci de vérifier que ces nouvelles informations vous conviennent.
         En cas de souci, répondez simplement à cet email.</p>
      <div style="text-align:center">
        <a class="btn" href="${url}">Vérifier dans mon espace</a>
      </div>
      <p class="note">Votre code d'accès : <strong>${client.code}</strong></p>
    `)
  };
}
// ── shoot_reminder ───────────────────────────────────────────────
// `extra.daysBefore` est envoyé par le cron (7 ou 1) pour adapter le libellé.
function buildShootReminder(client, extra) {
  const B = brandOf(client);
  const prenom = client.greeting ?? client.name ?? "cher client";
  const days = extra?.daysBefore ?? null;
  const isVideo = extra?.type === "video";
  const url = extra?.loginUrl ?? "https://timelesshouse.org";
  const quand = days === 1 ? "demain" : days === 7 ? "dans une semaine" : days != null ? `dans ${days} jours` : "bientôt";
  const titre = days === 1 ? "C'est pour demain !" : `À ${quand} !`;
  return {
    subject: `Rappel — votre tournage ${quand} — ${B.name}`,
    html: layout(`
      <h2>${titre}</h2>
      <p>Bonjour ${prenom},</p>
      <p>Petit rappel amical : nous nous retrouvons ${quand} pour votre
         ${isVideo ? "tournage vidéo" : "shooting photo"}.</p>
      ${shootCard(extra)}
      <p>Des questions ou un imprévu ? Répondez simplement à cet email !</p>
      <div style="text-align:center">
        <a class="btn" href="${url}">Voir le détail</a>
      </div>
      <p class="note">Votre code d'accès : <strong>${client.code}</strong></p>
    `)
  };
}
function buildAdminNewComment(client, media, comment) {
  const B = brandOf(client);
  return {
    subject: `💬 Commentaire de ${client?.name ?? "votre client"}`,
    html: layout(`
      <h2>Nouveau commentaire client</h2>
      <p><strong>${client?.name ?? "Un client"}</strong> a laissé un commentaire
         sur <em>${media?.title ?? "un média"}</em>&nbsp;:</p>
      <blockquote>${comment}</blockquote>
      <div style="text-align:center">
        <a class="btn" href="https://timelesshouse.org/communication-admin.html">
          Ouvrir l'espace admin
        </a>
      </div>
    `)
  };
}
function buildAdminApproval(client, media, kind) {
  const B = brandOf(client);
  const approved = kind === "admin_media_approved";
  const emoji = approved ? "✅" : "🔁";
  const action = approved ? "approuvé" : "demandé des modifications sur";
  return {
    subject: `${emoji} ${client?.name ?? "Client"} — ${approved ? "Média approuvé" : "Modifications demandées"}`,
    html: layout(`
      <h2>${emoji} ${approved ? "Approbation reçue" : "Demande de modification"}</h2>
      <p><strong>${client?.name ?? "Votre client"}</strong> a ${action}
         <em>${media?.title ?? "un média"}</em>.</p>
      <div style="text-align:center">
        <a class="btn" href="https://timelesshouse.org/communication-admin.html">
          Ouvrir l'espace admin
        </a>
      </div>
    `)
  };
}
// ─────────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────────
serve(async (req)=>{
  // Pré-vol CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: CORS
    });
  }
  try {
    const body = await req.json();
    const { kind, client_id, media_id, invoice_id, strategy_id, reminder_type, extra, comment } = body;
    if (!kind) {
      return new Response(JSON.stringify({
        error: "Paramètre 'kind' manquant"
      }), {
        status: 400,
        headers: {
          ...CORS,
          "Content-Type": "application/json"
        }
      });
    }
    // Récupération du client + de son AGENCE (marque blanche)
    const client = client_id ? await sbGet("clients", client_id) : null;
    const agency = client?.agency_id ? await sbGet("agencies", client.agency_id) : null;
    if (client) client.__brand = agency ? {
      name: agency.name || DEFAULT_BRAND.name,
      email: agency.contact_email || DEFAULT_BRAND.email,
      accent: agency.accent_color || DEFAULT_BRAND.accent,
      site: agency.slug === "timelesshouse" ? DEFAULT_BRAND.site : null
    } : DEFAULT_BRAND;
    /** Réponse dry_run : tout est construit, rien n'est envoyé */
    const dryRun = (o)=>new Response(JSON.stringify({
        ok: true,
        dry_run: true,
        to: o.to,
        subject: o.subject,
        from: `${(o.brand || DEFAULT_BRAND).name} <${FROM_ADDR}>`,
        reply_to: o.replyTo ?? null
      }), {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "application/json"
        }
      });
    // ── Emails vers le client ──────────────────────────────────────
    const CLIENT_KINDS = [
      "welcome",
      "new_media",
      "event_ready",
      "invoice_ready",
      "invoice_reminder",
      "shoot_scheduled",
      "shoot_updated",
      "shoot_reminder",
      "strategy_ready"
    ];
    if (CLIENT_KINDS.includes(kind)) {
      if (!client?.client_email) {
        return new Response(JSON.stringify({
          error: "Email du client introuvable. Ajoutez-le dans sa fiche."
        }), {
          status: 400,
          headers: {
            ...CORS,
            "Content-Type": "application/json"
          }
        });
      }
      let built;
      if (kind === "welcome") {
        built = buildWelcome(client);
      } else if (kind === "new_media") {
        const media = media_id ? await sbGet("media", media_id) : null;
        built = buildNewMedia(client, media, extra);
      } else if (kind === "invoice_ready") {
        built = buildInvoiceReady(client, extra ?? {});
      } else if (kind === "invoice_reminder") {
        const invoice = invoice_id ? await sbGet("invoices", invoice_id) : null;
        if (!invoice) {
          return new Response(JSON.stringify({
            error: "Facture introuvable (invoice_id manquant ou invalide)."
          }), {
            status: 400,
            headers: {
              ...CORS,
              "Content-Type": "application/json"
            }
          });
        }
        // Sécurité : si la facture a été payée entre-temps, on n'envoie rien
        if (invoice.status === "payée") {
          return new Response(JSON.stringify({
            ok: true,
            skipped: "invoice_paid"
          }), {
            status: 200,
            headers: {
              ...CORS,
              "Content-Type": "application/json"
            }
          });
        }
        built = buildInvoiceReminder(client, invoice, reminder_type ?? "before_due");
      } else if (kind === "shoot_scheduled") {
        built = buildShootScheduled(client, extra ?? {});
      } else if (kind === "shoot_updated") {
        built = buildShootUpdated(client, extra ?? {});
      } else if (kind === "shoot_reminder") {
        built = buildShootReminder(client, extra ?? {});
      } else if (kind === "strategy_ready") {
        const strategy = strategy_id ? await sbGet("strategies", strategy_id) : null;
        if (!strategy) {
          return new Response(JSON.stringify({
            error: "Stratégie introuvable (strategy_id manquant ou invalide)."
          }), {
            status: 400,
            headers: {
              ...CORS,
              "Content-Type": "application/json"
            }
          });
        }
        // Sécurité : on ne notifie jamais pour un brouillon (invisible côté client)
        if (strategy.status !== "published") {
          return new Response(JSON.stringify({
            ok: true,
            skipped: "strategy_not_published"
          }), {
            status: 200,
            headers: {
              ...CORS,
              "Content-Type": "application/json"
            }
          });
        }
        built = buildStrategyReady(client, strategy);
      } else {
        // event_ready
        built = buildEventReady(client, extra ?? {});
      }
      const outgoing = {
        to: client.client_email,
        brand: client.__brand,
        replyTo: client.__brand?.email,
        ...built
      };
      if (body.dry_run) return dryRun(outgoing);
      await sendEmail(outgoing);
    // ── Emails vers l'admin ────────────────────────────────────────
    } else if ([
      "admin_new_comment",
      "admin_media_approved",
      "admin_changes_requested"
    ].includes(kind)) {
      const media = media_id ? await sbGet("media", media_id) : null;
      let built;
      if (kind === "admin_new_comment") {
        built = buildAdminNewComment(client, media, comment ?? "");
      } else {
        built = buildAdminApproval(client, media, kind);
      }
      const outgoing = {
        to: client?.__brand?.email || ADMIN_EMAIL,
        brand: client?.__brand,
        replyTo: client?.client_email || undefined,
        ...built
      };
      if (body.dry_run) return dryRun(outgoing);
      await sendEmail(outgoing);
    } else {
      return new Response(JSON.stringify({
        error: `Type inconnu : ${kind}`
      }), {
        status: 400,
        headers: {
          ...CORS,
          "Content-Type": "application/json"
        }
      });
    }
    return new Response(JSON.stringify({
      ok: true
    }), {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json"
      }
    });
  } catch (err) {
    console.error("[notify-client]", err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: {
        ...CORS,
        "Content-Type": "application/json"
      }
    });
  }
});
