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
// Expéditeur : modifiable dans les secrets Supabase (FROM_EMAIL).
//
// ⚠️ Ce repli doit TOUJOURS pointer vers un domaine réellement vérifié chez
// Resend. L'ancienne valeur (service@timelesshouse.org) ne l'était pas —
// cette adresse vit dans Google Workspace, pas dans Resend : si le secret
// avait disparu, tous les envois auraient échoué. Voir EMAIL-DOMAINE.md.
//
// MARQUE BLANCHE — le domaine ci-dessous est VISIBLE par le client final du
// locataire. Choix de Gil (22/07/2026) : un domaine NEUTRE partagé plutôt
// que de demander à chaque locataire de vérifier le sien (zéro effort de
// leur côté). Le NOM affiché reste celui de l'agence à chaque envoi.
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "La Loge <noreply@laloge.house>";
// Destinataire admin pour les notifications internes
const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "service@timelesshouse.org";
// ── Marque blanche (SaaS B.3) ──
// L'adresse d'expédition reste celle du domaine vérifié Resend ; le NOM
// affiché, la couleur d'accent, le LOGO et l'adresse de réponse viennent
// de l'agence (« Studio Lumière <notifications@laloge.house> »).
const FROM_ADDR = (FROM_EMAIL.match(/<(.+)>/) || [null, FROM_EMAIL])[1];
const DEFAULT_BRAND = {
  name: "TimelessHouse",
  email: ADMIN_EMAIL,
  accent: "#2a2620",
  logo: null,
  site: "https://timelesshouse.org"
};
// Posée de façon SYNCHRONE par chaque builder (via brandOf) juste avant
// les appels à layout() — aucun await entre les deux, donc aucune
// requête concurrente ne peut mélanger les marques.
let CURRENT_BRAND = DEFAULT_BRAND;
// ── Habillage par UNIVERS (22/07/2026, demande de Gil) ──────────
// La marque (logo, accent, reply-to) reste celle de l'AGENCE ; le
// thème, lui, suit l'univers du CLIENT : un couple qui reçoit ses
// photos de mariage mérite un email éditorial, une équipe marketing
// un email compact. Posé ici car chaque gabarit passe par brandOf().
let CURRENT_THEME = "standard";
let CURRENT_MONO = null;
// ── Destinations des boutons (22/07/2026) ───────────────────────
// Constaté par Gil : TOUS les boutons renvoyaient vers
// timelesshouse.org, y compris dans les emails d'un locataire — la
// fuite de marque blanche la plus visible qui soit. Les gabarits
// utilisaient `extra?.loginUrl` que personne ne fournissait, et
// retombaient donc systématiquement sur le repli en dur. Ces deux
// variables sont posées par brandOf() (comme le thème), juste avant
// chaque construction : plus aucune URL en dur dans un gabarit.
let CURRENT_ESPACE = "https://timelesshouse.org/app";
let CURRENT_CONSOLE = "https://www.timelesshouse.org/communication-admin";
function themeOf(client) {
  const u = String(client?.universe || "");
  if (u === "celebration" || /mariage|wedding|fian|anniv/i.test(u)) return "mariage";
  // Univers Communication : habillage NEUMORPHIQUE (modèle fourni par
  // Gil le 22/07/2026) — le style de l'app, transposé en email.
  if (u === "communication") return "neumorphique";
  return "standard";
}
function monogramme(client) {
  const a = String(client?.partner1 || "").trim().charAt(0);
  const b = String(client?.partner2 || "").trim().charAt(0);
  if (a && b) return `${a.toUpperCase()}&nbsp;&amp;&nbsp;${b.toUpperCase()}`;
  const ini = String(client?.initials || "").trim().toUpperCase();
  return ini ? esc(ini) : null;
}
function brandOf(client) {
  const b = client && client.__brand || DEFAULT_BRAND;
  CURRENT_BRAND = b;
  CURRENT_THEME = themeOf(client);
  CURRENT_MONO = CURRENT_THEME === "mariage" ? monogramme(client) : null;
  // Destinations à la marque de l'agence (voir plus haut)
  const propre = b.slug && b.slug !== "timelesshouse";
  CURRENT_ESPACE = propre ? `https://${b.slug}.laloge.house` : "https://timelesshouse.org/app";
  CURRENT_CONSOLE = propre
    ? `https://${b.slug}.laloge.house/communication-admin`
    : "https://www.timelesshouse.org/communication-admin";
  return b;
}
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
// Fenêtre anti-bombardement : au-delà de N emails vers le MÊME client en
// FENÊTRE minutes, on refuse (protège la boîte du client, le coût Resend et
// la réputation du domaine d'envoi). Journalisé dans la table notifications.
const RL_WINDOW_MIN = 10;
const RL_MAX = 12; // par client, tous types confondus (généreux : ne gêne pas une livraison groupée)
// Échappement HTML — AUCUNE donnée fournie par l'appelant (commentaire,
// nom du client, titre d'un média, lieu d'un tournage…) ne doit pouvoir
// injecter du balisage dans l'email. Les URLs passent aussi par ici : en
// contexte d'attribut, &→&amp; est le comportement HTML correct.
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
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
/** FILET DE MARQUE BLANCHE (22/07/2026) — dernière ligne de défense.
 *  Le 22/07, 13 boutons renvoyaient les clients d'un locataire chez
 *  TimelessHouse : des URL en dur dans les gabarits, invisibles tant
 *  qu'on ne cliquait pas. Corrigées une à une — mais rien n'empêchait
 *  la faute de revenir au prochain gabarit écrit distraitement.
 *  Ici, JUSTE AVANT l'envoi : si la marque est celle d'un locataire,
 *  toute URL de la plateforme est réécrite vers SON domaine, et le
 *  fait est journalisé pour qu'on corrige la source. Aucun effet sur
 *  les emails de la plateforme elle-même (slug timelesshouse). */
function filetMarqueBlanche(html, brand) {
  const slug = brand?.slug;
  if (!slug || slug === "timelesshouse") return html;
  const base = `https://${slug}.laloge.house`;
  let n = 0;
  let out = String(html).replace(
    /https:\/\/(?:www\.)?timelesshouse\.org(\/app)?/g,
    () => { n++; return base; },
  );
  // Vitrines La Loge (bug du 22/07 : la console envoyait l'origine de
  // l'onglet — laloge.app/… atterrit sur la page Offres). Un chemin sur
  // une vitrine n'a aucun sens pour un client final : on replie l'URL
  // ENTIÈRE sur la racine de la loge, qui mène à l'écran de connexion.
  // L'ancrage https:// épargne les sous-domaines *.laloge.house.
  out = out.replace(
    /https:\/\/(?:www\.)?laloge\.(?:app|house)[^"'\s<]*/g,
    () => { n++; return base; },
  );
  if (n > 0) {
    console.warn(`[notify-client] FILET : ${n} lien(s) de plateforme réécrit(s) vers ${base} — un gabarit contient une URL en dur, à corriger à la source.`);
  }
  return out;
}

/** Envoie un email via Resend (expéditeur au nom de la marque) */ async function sendEmail({ to, subject, html, brand, replyTo }) {
  html = filetMarqueBlanche(html, brand);
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
  if (CURRENT_THEME === "mariage") return layoutMariage(body, B);
  if (CURRENT_THEME === "neumorphique") return layoutNeumorphique(body, B);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;color:#2a2620}
  .wrap{max-width:580px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;
        box-shadow:0 4px 32px rgba(42,38,32,.10)}
  /* Avec logo : fond BLANC + filet d'accent. Un logo est presque toujours
     dessiné pour un fond clair — le poser sur l'accent de l'agence (souvent
     sombre) le rendrait invisible une fois sur deux. Sans logo : on garde
     l'en-tête coloré et le nom en toutes lettres. */
  .header{background:${B.logo ? "#ffffff" : B.accent};padding:${B.logo ? "26px 40px" : "32px 40px"};
          text-align:center;${B.logo ? `border-bottom:3px solid ${B.accent};` : ""}}
  .header h1{margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;
             text-transform:uppercase;font-weight:400;font-family:sans-serif}
  .header img{max-height:44px;max-width:220px;display:block;margin:0 auto}
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
  <div class="header">${B.logo
    ? `<img src="${esc(B.logo)}" alt="${esc(B.name)}"/>`
    : `<h1>${esc(B.name)}</h1>`}</div>
  <div class="body">${body}</div>
  <div class="footer">
    ${esc(B.name)} &nbsp;·&nbsp;
    ${B.site ? `<a href="${esc(B.site)}">${esc(B.site.replace("https://", ""))}</a>` : `<a href="mailto:${esc(B.email)}">${esc(B.email)}</a>`}
  </div>
</div>
</body>
</html>`;
}
/** Habillage NEUMORPHIQUE (univers Communication) — le style de l'app
 *  transposé en email, d'après le modèle fourni par Gil (22/07/2026) :
 *  fond #EAE5DE, ombres jumelles #d4cfc8/#ffffff, marque HORS de la
 *  boîte (nom serif italique + « Espace client »), grande boîte
 *  extrudée, blocs de données CREUSÉS (code, montant, tournage),
 *  bouton pilule extrudé. Les classes des 15 gabarits sont restylées
 *  ici : chaque email garde son contenu, seul l'habit change. */
function layoutNeumorphique(body, B) {
  const annee = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;background:#EAE5DE;
       font-family:'Inter',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#272522}
  table{border-collapse:collapse !important}
  .wrap{max-width:600px;margin:0 auto;padding:40px 10px}
  .marque{padding:0 10px 26px}
  .marque h1{font-family:'Playfair Display',Georgia,Times,serif;font-size:24px;font-weight:700;
             font-style:italic;color:#272522;margin:0;letter-spacing:-.5px}
  .marque img{max-height:40px;max-width:200px;display:block}
  .marque p{font-size:10px;font-weight:600;letter-spacing:1px;text-transform:uppercase;
            color:#7A756D;margin:5px 0 0}
  .body{background:#EAE5DE;border-radius:24px;padding:40px;
        box-shadow:12px 12px 24px #d4cfc8,-12px -12px 24px #ffffff}
  h2{font-family:'Playfair Display',Georgia,Times,serif;font-size:26px;font-weight:normal;
     color:#272522;margin:0 0 14px;letter-spacing:-.5px;line-height:1.3}
  p{font-size:14px;color:#656059;margin:0 0 16px;line-height:1.7}
  .btn{display:inline-block;margin:20px 0 6px;padding:14px 30px;background:#EAE5DE;border-radius:50px;
       box-shadow:5px 5px 10px #d4cfc8,-5px -5px 10px #ffffff;
       font-family:'Inter',-apple-system,sans-serif;font-size:13px;font-weight:600;
       color:#272522 !important;text-decoration:none}
  .code-box{display:inline-block;margin:16px 0;padding:14px 30px;background:#EAE5DE;border-radius:14px;
            box-shadow:inset 6px 6px 12px #d4cfc8,inset -6px -6px 12px #ffffff;
            font-family:monospace;font-size:20px;letter-spacing:.18em;color:#272522}
  .amount-box{display:inline-block;margin:16px 0;padding:16px 36px;background:#EAE5DE;border-radius:14px;
              box-shadow:inset 6px 6px 12px #d4cfc8,inset -6px -6px 12px #ffffff;
              font-family:'Playfair Display',Georgia,serif;font-size:26px;color:#272522}
  .ref{display:inline-block;font-family:monospace;font-size:12.5px;letter-spacing:.1em;
       background:#EAE5DE;border-radius:8px;padding:6px 14px;color:#656059;
       box-shadow:inset 3px 3px 6px #d4cfc8,inset -3px -3px 6px #ffffff}
  .note{font-size:12px;color:#7A756D;line-height:1.6}
  .shoot-card{margin:20px 0;padding:26px;background:#EAE5DE;border-radius:16px;
              box-shadow:inset 8px 8px 16px #d4cfc8,inset -8px -8px 16px #ffffff}
  .shoot-kicker{font-size:11px;font-weight:600;color:#7A756D;text-transform:uppercase;letter-spacing:.5px}
  .shoot-title{font-family:'Playfair Display',Georgia,serif;font-size:20px;color:#272522;margin-top:8px;line-height:1.3}
  .shoot-meta{font-size:13px;color:#656059;margin-top:14px;line-height:1.9}
  .shoot-meta strong{color:#272522}
  blockquote{margin:16px 0;padding:18px 22px;background:#EAE5DE;border-radius:14px;
             box-shadow:inset 6px 6px 12px #d4cfc8,inset -6px -6px 12px #ffffff;
             font-style:italic;color:#656059}
  .pied{text-align:center;padding-top:28px}
  .pied p{font-size:11px;color:#8F8A82;margin:0}
  .pied a{color:#8F8A82;text-decoration:none}
  @media screen and (max-width:600px){
    .wrap{padding:24px 8px !important}
    .body{padding:30px 20px !important}
    .btn{display:block !important;text-align:center}
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="marque">
    ${B.logo ? `<img src="${esc(B.logo)}" alt="${esc(B.name)}"/>` : `<h1>${esc(B.name)}<span style="color:#7A756D">.</span></h1>`}
    <p>Espace client</p>
  </div>
  <div class="body">${body}</div>
  <div class="pied">
    <p>© ${annee} ${esc(B.name)}${B.email ? ` &nbsp;·&nbsp; <a href="mailto:${esc(B.email)}">${esc(B.email)}</a>` : ""}</p>
  </div>
</div>
</body>
</html>`;
}

/** Habillage MARIAGE — éditorial : papier crème, monogramme du couple,
 *  titre centré, ornement filet + losange, bouton bordé façon faire-part.
 *  Monogramme et ornement en TABLEAUX avec styles en ligne : les clients
 *  mail (Outlook en tête) ne comprennent ni flexbox ni les classes
 *  seules. Les mêmes classes que l'habillage standard sont définies
 *  (code-box, amount-box, shoot-card…) pour que TOUS les gabarits
 *  restent lisibles, factures et tournages compris. */
function layoutMariage(body, B) {
  const mono = CURRENT_MONO
    ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto 26px"><tr>
         <td style="width:62px;height:62px;border:1px solid #d9cfc0;border-radius:50%;text-align:center;vertical-align:middle;
                    font-family:Georgia,serif;font-size:16px;letter-spacing:.06em;color:${B.accent}">${CURRENT_MONO}</td>
       </tr></table>`
    : "";
  const ornement = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px"><tr>
      <td style="width:50%;border-top:1px solid #e4dbcc;font-size:0;line-height:0">&nbsp;</td>
      <td style="width:36px;text-align:center;font-size:9px;color:#c9bda8;line-height:1;padding:0 6px">&#9670;</td>
      <td style="width:50%;border-top:1px solid #e4dbcc;font-size:0;line-height:0">&nbsp;</td>
    </tr></table>`;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{margin:0;padding:0;background:#f2ede4;font-family:Georgia,serif;color:#2a2620}
  .wrap{max-width:580px;margin:40px auto;background:#fdfbf7;border-radius:16px;overflow:hidden;
        box-shadow:0 4px 32px rgba(42,38,32,.10)}
  .header{background:${B.logo ? "#ffffff" : B.accent};padding:${B.logo ? "26px 40px" : "32px 40px"};
          text-align:center;${B.logo ? `border-bottom:3px solid ${B.accent};` : ""}}
  .header h1{margin:0;color:#e8d8be;font-size:13px;letter-spacing:.25em;
             text-transform:uppercase;font-weight:400;font-family:sans-serif}
  .header img{max-height:44px;max-width:220px;display:block;margin:0 auto}
  .body{padding:48px 44px}
  h2{margin:0 0 18px;font-size:27px;color:#2a2620;font-weight:400;line-height:1.3;text-align:center;letter-spacing:.01em}
  p{margin:0 0 16px;font-size:15.5px;line-height:1.85;color:#4a4540}
  .btn{display:inline-block;margin:26px 0 8px;padding:15px 38px;background:#fdfbf7;
       color:${B.accent} !important;text-decoration:none;border:1px solid ${B.accent};border-radius:2px;
       font-family:Georgia,serif;font-size:13px;letter-spacing:.18em;text-transform:uppercase}
  .code-box{display:inline-block;margin:16px 0;padding:12px 28px;background:#f5f0e8;
            border-radius:6px;font-family:monospace;font-size:20px;letter-spacing:.18em;
            color:#2a2620;border:1px solid #e4dbcc}
  .amount-box{display:inline-block;margin:16px 0;padding:14px 36px;background:#f5f0e8;
              border-radius:6px;font-family:Georgia,serif;font-size:28px;letter-spacing:.04em;
              color:#2a2620;border:1px solid #e4dbcc}
  .ref{display:inline-block;font-family:monospace;font-size:13px;letter-spacing:.12em;
       background:#f5f0e8;border:1px solid #e4dbcc;padding:4px 12px;border-radius:4px;color:#4a4540}
  .note{font-size:12.5px;color:#a39786;line-height:1.7;font-style:italic;text-align:center}
  .shoot-card{margin:20px 0;padding:22px 26px;background:#f9f5ee;border-left:2px solid ${B.accent};
              border-radius:0 8px 8px 0}
  .shoot-kicker{font-family:sans-serif;font-size:11px;color:#a09078;
                text-transform:uppercase;letter-spacing:.2em;font-weight:600}
  .shoot-title{font-family:Georgia,serif;font-size:20px;color:#2a2620;margin-top:6px;line-height:1.3}
  .shoot-meta{font-family:sans-serif;font-size:13px;color:#4a4540;margin-top:14px;line-height:1.8}
  .shoot-meta strong{color:#2a2620}
  blockquote{border-left:2px solid #e4dbcc;margin:16px 0;padding:12px 20px;
             background:#f9f5ee;border-radius:0 8px 8px 0;font-style:italic;color:#4a4540}
  .footer{padding:26px 40px;border-top:1px solid #f0e9dd;text-align:center;
          font-size:11px;font-family:sans-serif;color:#b3a893;letter-spacing:.12em;text-transform:uppercase}
  .footer a{color:#b3a893;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">${B.logo
    ? `<img src="${esc(B.logo)}" alt="${esc(B.name)}"/>`
    : `<h1>${esc(B.name)}</h1>`}</div>
  <div class="body">
    ${mono}
    ${ornement}
    ${body}
  </div>
  <div class="footer">
    ${esc(B.name)}${B.email ? ` &nbsp;·&nbsp; <a href="mailto:${esc(B.email)}">${esc(B.email)}</a>` : ""}
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
      <div class="shoot-title">${esc(s?.title ?? "")}</div>
      <div class="shoot-meta">
        <strong>📅 Date&nbsp;:</strong> ${esc(shootDateFR(s))}<br/>
        ${s?.time_label ? `<strong>🕐 Horaires&nbsp;:</strong> ${esc(s.time_label)}<br/>` : ""}
        ${s?.location ? `<strong>📍 Lieu&nbsp;:</strong> ${esc(s.location)}` : ""}
      </div>
    </div>`;
}
// ─────────────────────────────────────────────────────────────────
// Constructeurs d'emails par type
// ─────────────────────────────────────────────────────────────────
function buildWelcome(client) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  return {
    subject: `Votre espace privé ${B.name}`,
    html: layout(`
      <h2>Bienvenue dans votre espace privé</h2>
      <p>Bonjour ${prenom},</p>
      <p>Votre espace personnel ${esc(B.name)} est prêt. Vous pouvez y accéder à tout moment avec votre code&nbsp;:</p>
      <div style="text-align:center">
        <div class="code-box">${esc(client.code)}</div>
      </div>
      <div style="text-align:center">
        <a class="btn" href="${esc(CURRENT_ESPACE)}">Accéder à mon espace</a>
      </div>
      <p class="note">Conservez ce code précieusement — il vous sera demandé à chaque connexion.</p>
    `)
  };
}
function buildNewMedia(client, media, extra) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  const typeLabel = media?.type === "video" ? "film" : "contenu";
  const title = esc(media?.title ?? "un nouveau contenu");
  const url = esc(extra?.loginUrl ?? CURRENT_ESPACE);
  return {
    subject: `Nouveau ${typeLabel} disponible — ${B.name}`,
    html: layout(`
      <h2>Un nouveau ${typeLabel} est disponible</h2>
      <p>Bonjour ${prenom},</p>
      <p>Nous avons mis à disposition <strong>${title}</strong> dans votre espace personnel.</p>
      <div style="text-align:center">
        <a class="btn" href="${url}">Voir mon espace</a>
      </div>
      <p class="note">Votre code d'accès : <strong>${esc(client.code)}</strong></p>
    `)
  };
}
// ── event_ready ──────────────────────────────────────────────────
function buildStrategyReady(client, strategy) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  const titre = esc(strategy?.subtitle || strategy?.title || "Votre stratégie de contenu");
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
        <a class="btn" href="${esc(CURRENT_ESPACE)}">Consulter ma stratégie</a>
      </div>
    `)
  };
}
function buildEventReady(client, extra) {
  const B = brandOf(client);
  const { hasPhotos, hasVideo, deliveryUrl } = extra ?? {};
  const prenom = esc(client.greeting ?? client.partner1 ?? client.name ?? "chers clients");
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
  const coupleLabel = esc(client.partner1 && client.partner2 ? `${client.partner1} & ${client.partner2}` : client.partner1 ?? client.name ?? "");
  const phrase = coupleLabel ? `C'est avec une immense joie que nous vous remettons ${contenu} — les souvenirs de <strong>${coupleLabel}</strong>.` : `${contenu.charAt(0).toUpperCase() + contenu.slice(1)} est désormais disponible dans votre espace personnel.`;
  const url = esc(deliveryUrl || CURRENT_ESPACE);
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
        Votre code d'accès : <strong>${esc(client.code)}</strong><br/>
        Vous pouvez partager ce lien avec vos proches en leur communiquant votre code.
      </p>
    `)
  };
}
// ── invoice_ready ────────────────────────────────────────────────
function buildInvoiceReady(client, extra) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  const ref = esc(extra?.reference ?? "");
  const loginUrl = esc(extra?.loginUrl ?? CURRENT_ESPACE);
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
        Votre code d'accès : <strong>${esc(client.code)}</strong><br/>
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
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  const loginUrl = CURRENT_ESPACE;
  const ref = esc(invoice?.reference ?? "");
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
        Votre code d'accès : <strong>${esc(client.code)}</strong><br/>
        Une question ou un imprévu ? Répondez simplement à cet email.
      </p>
    `)
  };
}
// ── shoot_scheduled ──────────────────────────────────────────────
function buildShootScheduled(client, extra) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  const isVideo = extra?.type === "video";
  const url = esc(extra?.loginUrl ?? CURRENT_ESPACE);
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
      <p class="note">Votre code d'accès : <strong>${esc(client.code)}</strong></p>
    `)
  };
}
// ── shoot_updated ────────────────────────────────────────────────
function buildShootUpdated(client, extra) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  const url = esc(extra?.loginUrl ?? CURRENT_ESPACE);
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
      <p class="note">Votre code d'accès : <strong>${esc(client.code)}</strong></p>
    `)
  };
}
// ── shoot_reminder ───────────────────────────────────────────────
// `extra.daysBefore` est envoyé par le cron (7 ou 1) pour adapter le libellé.
function buildShootReminder(client, extra) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.name ?? "cher client");
  const days = extra?.daysBefore ?? null;
  const isVideo = extra?.type === "video";
  const url = esc(extra?.loginUrl ?? CURRENT_ESPACE);
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
      <p class="note">Votre code d'accès : <strong>${esc(client.code)}</strong></p>
    `)
  };
}
function buildAdminNewComment(client, media, comment) {
  const B = brandOf(client);
  return {
    subject: `💬 Commentaire de ${client?.name ?? "votre client"}`,
    html: layout(`
      <h2>Nouveau commentaire client</h2>
      <p><strong>${esc(client?.name ?? "Un client")}</strong> a laissé un commentaire
         sur <em>${esc(media?.title ?? "un média")}</em>&nbsp;:</p>
      <blockquote>${esc(comment)}</blockquote>
      <div style="text-align:center">
        <a class="btn" href="${esc(CURRENT_CONSOLE)}">
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
      <p><strong>${esc(client?.name ?? "Votre client")}</strong> a ${action}
         <em>${esc(media?.title ?? "un média")}</em>.</p>
      <div style="text-align:center">
        <a class="btn" href="${esc(CURRENT_CONSOLE)}">
          Ouvrir l'espace admin
        </a>
      </div>
    `)
  };
}
// ─────────────────────────────────────────────────────────────────
// Anti-bombardement + journal d'audit (table notifications)
// ─────────────────────────────────────────────────────────────────
/** Nombre d'emails déjà envoyés à ce client dans la fenêtre glissante. */
// ── Nouveaux gabarits (22/07/2026) : livraison de galerie, film prêt,
// fin d'accès Découverte, reçu de paiement — plus l'alerte locataire. ──

/** ① Galerie publiée — LE moment de livraison du produit.
 *  S'adapte au CONTENU (photos seules / film seul / les deux) et à
 *  l'UNIVERS : en mariage, gabarit éditorial façon faire-part (modèle
 *  fourni par Gil le 22/07/2026) avec photo de couverture de l'album. */
function buildGalleryReady(client, gallery, url, photoUrl) {
  const B = brandOf(client);
  // Un couple se salue à deux : « Chers Éléa & David »
  const prenom = esc(client.partner1 && client.partner2
    ? `${client.partner1} & ${client.partner2}`
    : (client.greeting ?? client.partner1 ?? client.name ?? "chers clients"));
  const titre = esc(gallery?.title || "Votre galerie");
  const kind = gallery?.kind || "photos";
  const aPhotos = kind === "photos" || kind === "mixte";
  const aFilm = kind === "video" || kind === "mixte";
  const sujet = kind === "video" ? `Votre film est prêt — ${B.name}`
    : kind === "mixte" ? `Vos photos & votre film vous attendent — ${B.name}`
    : `Vos photos vous attendent — ${B.name}`;
  const photoHtml = photoUrl
    ? `<img src="${esc(photoUrl)}" alt="" width="492"
           style="width:100%;height:auto;display:block;border-radius:3px;margin:0 0 30px"/>`
    : "";

  // ── Habillage standard (communication, neutre) : concis, efficace ──
  if (CURRENT_THEME !== "mariage") {
    const contenu = kind === "video" ? "votre film" : kind === "mixte" ? "vos photos et votre film" : "vos photos";
    return {
      subject: `Votre galerie « ${gallery?.title || ""} » est en ligne — ${B.name}`,
      html: layout(`
        ${photoHtml}
        <h2>${titre} vous attend</h2>
        <p>Bonjour ${prenom},</p>
        <p>C'est le moment que l'on préfère&nbsp;: ${contenu} ${kind === "video" ? "est" : "sont"} en ligne,
           dans une galerie préparée pour vous.</p>
        <div style="text-align:center">
          <a class="btn" href="${esc(url)}">Découvrir ma galerie</a>
        </div>
        <p class="note">Ce lien est personnel — vous pouvez le transmettre à vos proches
           pour qu'ils en profitent aussi.</p>
      `)
    };
  }

  // ── Habillage MARIAGE : éditorial, sections numérotées si besoin ──
  const num = (n) => (aPhotos && aFilm ? `${n}.&nbsp;` : "");
  const sectionPhotos = aPhotos ? `
    <div style="border-top:1px solid #eee5d8;margin-top:34px;padding:36px 0 8px;text-align:center">
      <h3 style="font-family:Georgia,serif;font-size:15px;font-weight:normal;letter-spacing:.2em;
                 text-transform:uppercase;color:#2a2620;margin:0 0 12px">${num("I")}La galerie photographique</h3>
      <p style="font-size:14px;line-height:1.7;color:#8a8272;margin:0 0 24px">
        Vos images en haute définition, prêtes à être explorées, partagées et conservées pour toujours.</p>
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
        <td align="center" bgcolor="${B.accent}" style="border-radius:2px">
          <a href="${esc(url)}" target="_blank"
             style="display:inline-block;padding:14px 32px;font-family:Helvetica,Arial,sans-serif;font-size:12px;
                    color:#fdfbf7;text-decoration:none;letter-spacing:.2em;text-transform:uppercase">Découvrir les photos</a>
        </td></tr></table>
    </div>` : "";
  const sectionFilm = aFilm ? `
    <div style="border-top:1px solid #eee5d8;margin-top:34px;padding:36px 0 8px;text-align:center">
      <h3 style="font-family:Georgia,serif;font-size:15px;font-weight:normal;letter-spacing:.2em;
                 text-transform:uppercase;color:#2a2620;margin:0 0 12px">${num("II")}Le film</h3>
      <p style="font-size:14px;line-height:1.7;color:#8a8272;margin:0 0 24px">
        Installez-vous confortablement, montez le son, et laissez-vous transporter.</p>
      <table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto"><tr>
        <td align="center" style="border:1px solid ${B.accent};border-radius:2px">
          <a href="${esc(url)}" target="_blank"
             style="display:inline-block;padding:13px 32px;font-family:Helvetica,Arial,sans-serif;font-size:12px;
                    color:${B.accent};text-decoration:none;letter-spacing:.2em;text-transform:uppercase">Visionner le film</a>
        </td></tr></table>
    </div>` : "";
  const rituel = `
    <div style="background:#f9f5ee;border-left:3px solid #dcd5c6;padding:24px 26px;margin:40px 0 8px;text-align:left">
      <div style="font-family:Georgia,serif;font-size:17px;font-style:italic;color:#2a2620;margin-bottom:10px">
        Le rituel de découverte</div>
      <p style="font-size:14px;line-height:1.7;color:#6b6357;margin:0">
        Ne vous précipitez pas. Pour cette première fois, attendez la fin de la journée&nbsp;:
        coupez vos notifications, choisissez votre plus grand écran${aFilm ? ", montez le son" : ""},
        et laissez les souvenirs traverser l'écran.</p>
    </div>`;
  const infos = `
    <p style="font-size:13px;line-height:1.8;color:#8a8272;text-align:center;margin:28px 0 0">
      <strong style="color:#635c50">Téléchargement&nbsp;:</strong> pensez à sauvegarder vos souvenirs
      sur votre ordinateur et un disque externe.<br/>
      <strong style="color:#635c50">Partage&nbsp;:</strong> ce lien est personnel —
      transmettez-le à vos proches pour qu'ils en profitent aussi.</p>`;
  const signature = `
    <p style="font-family:Georgia,serif;font-size:19px;font-style:italic;color:#2a2620;text-align:center;margin:38px 0 8px">
      Avec toute notre affection,</p>
    <p style="text-align:center;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.25em;
              text-transform:uppercase;color:#2a2620;margin:0">${esc(B.name)}</p>`;

  return {
    subject: sujet,
    html: layout(`
      ${photoHtml}
      <h2 style="font-style:italic">${titre}</h2>
      <p>Chers ${prenom},</p>
      <p>Le moment est venu. Derrière ${aPhotos ? "chaque image de cette galerie" : "chaque plan de ce film"},
         il y a un instant vrai de votre journée — un regard suspendu, un éclat de rire, une promesse.</p>
      <p>Ce fut un privilège d'en être les témoins. Aujourd'hui, nous vous remettons vos
         souvenirs&nbsp;: ils sont à vous, pour toujours.</p>
      ${sectionPhotos}
      ${sectionFilm}
      ${rituel}
      ${infos}
      ${signature}
    `)
  };
}

/** ② Film prêt (fin d'encodage — envoyé par le worker) */
function buildVideoReady(client, extra, url) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.partner1 ?? client.name ?? "chers clients");
  const titre = esc(extra?.title || "Votre film");
  return {
    subject: `Votre film est prêt ✨ — ${B.name}`,
    html: layout(`
      <h2>Votre film est prêt</h2>
      <p>Bonjour ${prenom},</p>
      <p>«&nbsp;${titre}&nbsp;» est maintenant disponible en qualité optimale,
         prêt à être regardé (et re-regardé).</p>
      <div style="text-align:center">
        <a class="btn" href="${esc(url)}">Voir mon film</a>
      </div>
    `)
  };
}

/** ③ Fin d'accès offre Découverte (J-15 / J-3) — protège des mauvaises surprises */
function buildAccessExpiring(client, extra, url) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.partner1 ?? client.name ?? "chers clients");
  const dateLabel = esc(extra?.dateLabel || "");
  const jours = Number(extra?.days) || 0;
  return {
    subject: jours <= 3
      ? `Plus que ${jours} jours pour profiter de votre espace — ${B.name}`
      : `Votre espace reste ouvert jusqu'au ${extra?.dateLabel || ""} — ${B.name}`,
    html: layout(`
      <h2>Pensez à télécharger vos souvenirs</h2>
      <p>Bonjour ${prenom},</p>
      <p>Votre espace personnel restera accessible jusqu'au <strong>${dateLabel}</strong>.
         D'ici là, prenez un moment pour télécharger vos photos et films et les garder précieusement.</p>
      <div style="text-align:center">
        <a class="btn" href="${esc(url)}">Ouvrir mon espace</a>
      </div>
      <p class="note">Une question&nbsp;? Répondez simplement à cet email.</p>
    `)
  };
}

/** ④ Reçu de paiement — la facture vient de passer à « payée » */
function buildInvoicePaid(client, invoice) {
  const B = brandOf(client);
  const prenom = esc(client.greeting ?? client.partner1 ?? client.name ?? "cher client");
  const montant = Number.parseFloat(invoice?.amount ?? 0).toLocaleString("fr-FR");
  return {
    subject: `Paiement bien reçu — facture ${invoice?.reference || ""} · ${B.name}`,
    html: layout(`
      <h2>Merci, votre paiement est bien enregistré</h2>
      <p>Bonjour ${prenom},</p>
      <p>Nous confirmons la réception de votre règlement pour
         «&nbsp;${esc(invoice?.description || "")}&nbsp;».</p>
      <div style="text-align:center">
        <span class="amount-box">${esc(montant)}&nbsp;€</span><br/>
        <span class="ref">${esc(invoice?.reference || "")}</span>
      </div>
      <p class="note">Conservez cet email&nbsp;: il fait office de confirmation de paiement.</p>
    `)
  };
}

/** ⑦ Alerte LOCATAIRE : l'espace d'un de ses clients ferme bientôt */
function buildAdminClientExpiring(client, extra) {
  const B = brandOf(client);
  const dateLabel = esc(extra?.dateLabel || "");
  const jours = Number(extra?.days) || 0;
  const url = esc(extra?.url || CURRENT_CONSOLE);
  return {
    subject: `⏳ L'espace de ${client?.name || "votre client"} ferme dans ${jours} jours`,
    html: layout(`
      <h2>L'espace de ${esc(client?.name || "votre client")} ferme bientôt</h2>
      <p>Cet espace (offre Découverte) atteindra ses 90&nbsp;jours le <strong>${dateLabel}</strong>.
         Passé cette date, votre client n'y aura plus accès.</p>
      <p>Deux options&nbsp;:</p>
      <p>• <strong>Passez à une offre supérieure</strong> (Paramètres → Abonnement)&nbsp;:
         l'accès redevient illimité, pour tous vos clients.<br/>
      • Ou assurez-vous que votre client a bien téléchargé ses fichiers
         ${client?.client_email ? "— il vient d'être prévenu par email de son côté" : "(il n'a pas d'email renseigné, pensez à le prévenir)"}.</p>
      <div style="text-align:center">
        <a class="btn" href="${url}">Ouvrir ma console</a>
      </div>
    `)
  };
}

async function recentCount(clientId) {
  const since = new Date(Date.now() - RL_WINDOW_MIN * 60000).toISOString();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notifications?client_id=eq.${clientId}&created_at=gte.${since}&select=id`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Prefer: "count=exact", Range: "0-0" } }
  );
  const total = parseInt((res.headers.get("content-range") || "").split("/")[1] || "0", 10);
  return Number.isNaN(total) ? 0 : total;
}
/** Un envoi portant CETTE clé a-t-il déjà réussi ?
 *  Le cron transmettait `dedupe_key` (« inv:<id>:j-3 »…) depuis toujours,
 *  et son commentaire affirmait qu'elle était « gérée par notify-client » —
 *  elle ne l'était pas. Résultat : deux exécutions du cron le même jour
 *  envoyaient DEUX fois la même relance au client. Constaté et corrigé le
 *  22/07/2026. En cas de doute (erreur réseau), on n'empêche pas l'envoi :
 *  mieux vaut un doublon rare qu'une relance perdue. */
async function alreadySent(dedupeKey) {
  if (!dedupeKey) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/notifications?payload->>dedupe_key=eq.${encodeURIComponent(dedupeKey)}&sent_at=not.is.null&select=id&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const rows = await res.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0;
  } catch (_) { return false; }
}

/** Trace chaque envoi (sent_at null = échec). Best effort — jamais bloquant. */
async function logNotification(clientId, kind, payload, ok) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify({ client_id: clientId, kind, payload, sent_at: ok ? new Date().toISOString() : null }),
    });
  } catch (_) { /* le journal ne doit jamais faire échouer un envoi */ }
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
    const { kind, client_id, media_id, invoice_id, strategy_id, gallery_id, reminder_type, extra, comment } = body;
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
      // Logo de l'agence dans l'en-tête. https OBLIGATOIRE : une URL http
      // serait bloquée par la plupart des clients mail (contenu mixte) et
      // afficherait une image cassée en haut de chaque envoi.
      logo: /^https:\/\//i.test(agency.logo_url || "") ? agency.logo_url : null,
      // Le slug pilote les destinations des boutons (voir brandOf)
      slug: agency.slug || null,
      site: agency.slug === "timelesshouse" ? DEFAULT_BRAND.site : null
    } : DEFAULT_BRAND;

    // La fonction est PUBLIQUE (verify_jwt=false : appelée par l'admin avec la
    // clé anon ET par le client anonyme via son code). On ne peut donc pas
    // exiger de JWT — mais tout envoi DOIT cibler un client réel. Cela ferme le
    // relais d'emails « à zéro prérequis » (spam admin sans aucun identifiant)
    // et borne l'abus à des UUID valides. Le HTML est intégralement échappé.
    if (!client_id || !client) {
      return new Response(JSON.stringify({ error: "client_id manquant ou introuvable." }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    // Anti-bombardement : au-delà de RL_MAX emails vers ce client sur la
    // fenêtre, on refuse (protège la boîte du client, le coût Resend et la
    // réputation d'envoi). Le mode dry_run (test) n'est pas compté.
    if (!body.dry_run && (await recentCount(client.id)) >= RL_MAX) {
      return new Response(JSON.stringify({ ok: true, skipped: "rate_limited" }), {
        status: 429, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
    // Anti-doublon par clé : un rappel identique n'est jamais renvoyé,
    // même si le cron est rejoué (test manuel, double planification…).
    if (!body.dry_run && (await alreadySent(body.dedupe_key))) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_sent" }), {
        status: 200, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }
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
      "invoice_paid",
      "shoot_scheduled",
      "shoot_updated",
      "shoot_reminder",
      "strategy_ready",
      "gallery_ready",
      "video_ready",
      "access_expiring"
    ];
    // URL de l'espace du client (porte de connexion à la marque de l'agence)
    const espaceUrl = !agency || agency.slug === "timelesshouse"
      ? "https://timelesshouse.org/app"
      : `https://${agency.slug}.laloge.house`;
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
        // Sécurité : le média doit appartenir AU client visé.
        if (media && media.client_id !== client.id) {
          return new Response(JSON.stringify({ error: "Ce média n'appartient pas à ce client." }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
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
        // Sécurité : la facture doit appartenir AU client visé.
        if (invoice.client_id !== client.id) {
          return new Response(JSON.stringify({ error: "Cette facture n'appartient pas à ce client." }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
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
        // Sécurité : la stratégie doit appartenir AU client visé (sinon un
        // appelant pourrait exfiltrer le contenu d'un autre espace).
        if (strategy.client_id !== client.id) {
          return new Response(JSON.stringify({ error: "Cette stratégie n'appartient pas à ce client." }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
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
      } else if (kind === "gallery_ready") {
        const gallery = gallery_id ? await sbGet("galleries", gallery_id) : null;
        if (!gallery) {
          return new Response(JSON.stringify({ error: "Galerie introuvable (gallery_id manquant ou invalide)." }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
        // Sécurité : la galerie doit appartenir AU client visé.
        if (gallery.client_id !== client.id) {
          return new Response(JSON.stringify({ error: "Cette galerie n'appartient pas à ce client." }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
        // Partage coupé ou sans code = lien mort : on n'envoie pas un
        // email vers le vide. ⚠️ La colonne du code de partage s'appelle
        // access_code (galleries.code n'existe pas — leçon du 22/07 :
        // le lien partait en « ?c=undefined », galerie introuvable).
        if (gallery.share_enabled === false || !gallery.access_code) {
          return new Response(JSON.stringify({ ok: true, skipped: "gallery_share_disabled" }), {
            status: 200, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
        const galerieUrl = !agency || agency.slug === "timelesshouse"
          ? `https://timelesshouse.org/galerie?c=${gallery.access_code}`
          : `https://${agency.slug}.laloge.house/galerie?c=${gallery.access_code}`;
        // Photo de couverture pour l'email : celle choisie par le locataire
        // (config.cover = id de photo), sinon la première de la galerie.
        // url_view = taille d'affichage (l'original serait trop lourd).
        let photoUrl = null;
        if (gallery.kind !== "video") {
          const enTetes = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
          const premiere = async (filtre) => {
            const r = await fetch(`${SUPABASE_URL}/rest/v1/gallery_photos?${filtre}&select=url_view,url_grid&limit=1`, { headers: enTetes });
            const rows = await r.json().catch(() => []);
            return rows?.[0] || null;
          };
          let p = gallery.config?.cover ? await premiere(`id=eq.${gallery.config.cover}`) : null;
          if (!p) p = await premiere(`gallery_id=eq.${gallery.id}&order=position.asc`);
          photoUrl = p?.url_view || p?.url_grid || null;
          if (photoUrl && !/^https:\/\//i.test(photoUrl)) photoUrl = null; // http = image cassée en mail
        }
        built = buildGalleryReady(client, gallery, galerieUrl, photoUrl);
      } else if (kind === "video_ready") {
        built = buildVideoReady(client, extra ?? {}, (extra && extra.url) || espaceUrl);
      } else if (kind === "access_expiring") {
        built = buildAccessExpiring(client, extra ?? {}, espaceUrl);
      } else if (kind === "invoice_paid") {
        const facture = invoice_id ? await sbGet("invoices", invoice_id) : null;
        if (!facture) {
          return new Response(JSON.stringify({ error: "Facture introuvable (invoice_id manquant ou invalide)." }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
        if (facture.client_id !== client.id) {
          return new Response(JSON.stringify({ error: "Cette facture n'appartient pas à ce client." }), {
            status: 400, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
        // On n'envoie un reçu QUE pour une facture réellement payée.
        if (facture.status !== "payée") {
          return new Response(JSON.stringify({ ok: true, skipped: "invoice_not_paid" }), {
            status: 200, headers: { ...CORS, "Content-Type": "application/json" }
          });
        }
        built = buildInvoicePaid(client, facture);
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
      try { await sendEmail(outgoing); await logNotification(client.id, kind, body, true); }
      catch (e) { await logNotification(client.id, kind, body, false); throw e; }
    // ── Emails vers l'admin ────────────────────────────────────────
    } else if ([
      "admin_new_comment",
      "admin_media_approved",
      "admin_changes_requested",
      "admin_client_expiring"
    ].includes(kind)) {
      const media = media_id ? await sbGet("media", media_id) : null;
      let built;
      if (kind === "admin_new_comment") {
        built = buildAdminNewComment(client, media, comment ?? "");
      } else if (kind === "admin_client_expiring") {
        built = buildAdminClientExpiring(client, extra ?? {});
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
      try { await sendEmail(outgoing); await logNotification(client.id, kind, body, true); }
      catch (e) { await logNotification(client.id, kind, body, false); throw e; }
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
