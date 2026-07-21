// ════════════════════════════════════════════════════════════
// 🧾 GENERATE-INVOICE-PDF — Edge Function Supabase (Deno)
// ════════════════════════════════════════════════════════════
// Génère le PDF d'une facture (mise en page fidèle au modèle
// facture.net de TimelessHouse), l'uploade sur Backblaze B2
// (API compatible S3) puis écrit l'URL dans invoices.pdf_url.
//
// SÉCURITÉ
//   • Appelable UNIQUEMENT par un admin authentifié Supabase :
//     le JWT de session est vérifié via auth.getUser().
//     → Déployer SANS --no-verify-jwt (vérification par défaut),
//       et envoyer le token de session (pas la clé anon) côté admin.
//   • Les clés B2 vivent dans les secrets Supabase, jamais ici.
//
// SECRETS REQUIS (supabase secrets set ...)
//   B2_KEY_ID       → keyID de l'Application Key Backblaze
//   B2_APP_KEY      → applicationKey Backblaze
//   B2_BUCKET       → "timelesshouse-org"
//   B2_ENDPOINT     → ex: "https://s3.eu-central-003.backblazeb2.com"
//   B2_PUBLIC_BASE  → (optionnel) base des URLs publiques, ex:
//                     "https://files.timelesshouse.org" (Cloudflare).
//                     Par défaut : URL S3 path-style du bucket public.
//   BRAND_FONT_URL  → (optionnel) URL d'un .ttf (ex: Cormorant
//                     Garamond) pour les titres. Sinon Times Roman.
//
// PAYLOAD : { "invoice_id": "<uuid>" }
// RETOUR  : { "ok": true, "pdf_url": "https://…" }
// ════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3.620.0";

// ── Identité émetteur (modifiable ici, une seule source de vérité) ──
const EMETTEUR = {
  societe:   "TimelessHouse",
  contact:   "Gil-Ephrem AFFANOU (Timeless House)",
  adresse:   ["247 Boulevard John Kennedy", "91100 Corbeil-Essonnes"],
  pays:      "France",
  numero:    "949664791",
  telephone: "0667142851",
  email:     "service@timelesshouse.org",
  site:      "https://timelesshouse.org",
};
const RIB = {
  iban:      "FR7628233000018042851569353",
  bic:       "REVOFRP2",
  titulaire: "Gil-Ephrem AFFANOU",
};
const CONDITIONS = {
  reglement: "Fin de mois",
  mode:      "Virement bancaire",
  tva:       "TVA non applicable, articles 293 B du CGI et 223-21 du CIBS",
};

// ── Palette TimelessHouse ──
const INK    = rgb(0.094, 0.106, 0.125); // graphite #181b20
const MUTED  = rgb(0.42, 0.40, 0.36);    // stone
const IVORY  = rgb(0.953, 0.937, 0.902); // bandeau clair
const ACCENT = rgb(0.910, 0.847, 0.745); // ivoire chaud #e8d8be
const LINE   = rgb(0.80, 0.77, 0.72);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const eur = (n: number) =>
  new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";

const frDate = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")   return json({ error: "Méthode non autorisée" }, 405);

  try {
    // ── 1. Authentification : seul un admin connecté peut générer ──
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Non autorisé : connectez-vous à l'admin." }, 401);

    // ── 2. Charger la facture + le client (service role) ──
    const { invoice_id } = await req.json().catch(() => ({}));
    if (!invoice_id) return json({ error: "invoice_id manquant" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: inv, error: invErr } = await admin
      .from("invoices")
      .select("*, clients(name, greeting, billing_address, billing_company_number, billing_phone, client_email)")
      .eq("id", invoice_id)
      .single();
    if (invErr || !inv) return json({ error: "Facture introuvable" }, 404);

    let shootLine = "";
    if (inv.shoot_id) {
      const { data: shoot } = await admin
        .from("shoots").select("title, date_iso, date_day, month_label, year")
        .eq("id", inv.shoot_id).maybeSingle();
      if (shoot) {
        const d = shoot.date_iso
          ? frDate(new Date(shoot.date_iso + "T12:00:00"))
          : [shoot.date_day, shoot.month_label, shoot.year].filter(Boolean).join(" ");
        shootLine = d ? `Tournage prévu le ${d}` : `Tournage : ${shoot.title || ""}`;
      }
    }

    // ── 3. Construire le PDF ──
    const pdfBytes = await buildInvoicePdf(inv, shootLine);

    // ── 4. Upload Backblaze B2 (S3) ──
    const endpoint = (Deno.env.get("B2_ENDPOINT") || "").replace(/\/$/, "");
    const bucket   = Deno.env.get("B2_BUCKET") || "";
    const keyId    = Deno.env.get("B2_KEY_ID") || "";
    const appKey   = Deno.env.get("B2_APP_KEY") || "";
    if (!endpoint || !bucket || !keyId || !appKey) {
      return json({ error: "Secrets B2 manquants (B2_ENDPOINT, B2_BUCKET, B2_KEY_ID, B2_APP_KEY)." }, 500);
    }
    const region = endpoint.match(/s3\.([a-z0-9-]+)\.backblazeb2\.com/)?.[1] || "us-east-1";

    const s3 = new S3Client({
      endpoint,
      region,
      forcePathStyle: true,
      credentials: { accessKeyId: keyId, secretAccessKey: appKey },
    });

    const objectKey = `factures/${slugify(inv.reference)}.pdf`;
    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: pdfBytes,
      ContentType: "application/pdf",
      CacheControl: "no-cache", // une régénération doit être visible immédiatement
    }));

    const publicBase = (Deno.env.get("B2_PUBLIC_BASE") || `${endpoint}/${bucket}`).replace(/\/$/, "");
    const pdfUrl = `${publicBase}/${objectKey}`;

    // ── 5. Écrire l'URL dans la facture ──
    const { error: upErr } = await admin
      .from("invoices")
      .update({ pdf_url: pdfUrl, pdf_generated_at: new Date().toISOString() })
      .eq("id", invoice_id);
    if (upErr) return json({ error: "PDF uploadé mais mise à jour BDD échouée : " + upErr.message }, 500);

    return json({ ok: true, pdf_url: pdfUrl });
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});

// ════════════════════════════════════════════════════════════
// Mise en page A4 — fidèle au modèle facture.net TimelessHouse
// ════════════════════════════════════════════════════════════
async function buildInvoicePdf(inv: any, shootLine: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // Police de titrage : marque (si BRAND_FONT_URL) sinon Times (serif)
  let serif;
  const fontUrl = Deno.env.get("BRAND_FONT_URL");
  if (fontUrl) {
    try {
      const ttf = await (await fetch(fontUrl)).arrayBuffer();
      serif = await doc.embedFont(ttf);
    } catch (_) { /* fallback ci-dessous */ }
  }
  if (!serif) serif = await doc.embedFont(StandardFonts.TimesRoman);
  const body     = await doc.embedFont(StandardFonts.Helvetica);
  const bodyBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]); // A4
  const M = 48;                                // marge
  const W = 595.28 - M * 2;
  let y = 841.89 - 56;

  const text = (s: string, x: number, yy: number, opts: any = {}) =>
    page.drawText(s ?? "", { x, y: yy, size: opts.size ?? 9.5, font: opts.font ?? body, color: opts.color ?? INK, ...opts });

  const client = inv.clients || {};
  const emissionDate = inv.date_label ||
    frDate(inv.created_at ? new Date(inv.created_at) : new Date());

  // ── En-tête ──
  text(`Facture ${inv.reference}`, M, y, { font: serif, size: 26 });
  y -= 18;
  text(emissionDate, M, y, { size: 10.5, color: MUTED });
  // Filet accent sous l'en-tête
  page.drawRectangle({ x: M, y: y - 14, width: W, height: 2, color: ACCENT });
  y -= 38;

  // ── Blocs Émetteur / Destinataire ──
  const colW = (W - 16) / 2;
  const blockTop = y;
  const drawBlock = (x: number, title: string, rows: [string, string][]) => {
    let by = blockTop;
    text(title.toUpperCase(), x, by, { font: bodyBold, size: 8.5, color: MUTED });
    by -= 16;
    for (let [label, value] of rows) {
      if (!value) continue;
      for (const lineStr of String(value).split("\n")) {
        text(label ? `${label} :` : "", x, by, { size: 8.5, color: MUTED });
        text(lineStr, x + 92, by, { size: 9.5, font: label === "Société" ? bodyBold : body });
        label = ""; // les lignes suivantes d'une même valeur n'ont pas de libellé
        by -= 13;
      }
    }
    return by;
  };

  const yLeft = drawBlock(M, "Émetteur", [
    ["Société",            EMETTEUR.societe],
    ["Contact",            EMETTEUR.contact],
    ["Adresse",            EMETTEUR.adresse.join("\n")],
    ["Pays",               EMETTEUR.pays],
    ["N° d'entreprise",    EMETTEUR.numero],
    ["Téléphone",          EMETTEUR.telephone],
    ["Email",              EMETTEUR.email],
    ["Site",               EMETTEUR.site],
  ]);
  const yRight = drawBlock(M + colW + 16, "Destinataire", [
    ["Société",            client.name || ""],
    ["Adresse",            client.billing_address || ""],
    ["Pays",               client.billing_address ? "France" : ""],
    ["N° d'entreprise",    client.billing_company_number || ""],
    ["Téléphone",          client.billing_phone || ""],
    ["Email",              client.client_email || ""],
  ]);
  y = Math.min(yLeft, yRight) - 22;

  // ── Conditions & RIB ──
  text("CONDITIONS", M, y, { font: bodyBold, size: 8.5, color: MUTED }); y -= 15;
  text(`Conditions de règlement : ${CONDITIONS.reglement}`, M, y); y -= 13;
  text(`Mode de règlement : ${CONDITIONS.mode}`, M, y); y -= 13;
  if (inv.due_date) {
    text(`Échéance : ${frDate(new Date(inv.due_date + "T12:00:00"))}`, M, y); y -= 13;
  }
  y -= 10;
  text("RIB", M, y, { font: bodyBold, size: 8.5, color: MUTED }); y -= 15;
  text(`IBAN : ${RIB.iban}`, M, y); y -= 13;
  text(`BIC : ${RIB.bic}`, M, y); y -= 13;
  text(`Titulaire : ${RIB.titulaire}`, M, y); y -= 28;

  // ── Tableau Détail ──
  text("DÉTAIL", M, y, { font: bodyBold, size: 8.5, color: MUTED }); y -= 18;
  const amount = parseFloat(inv.amount || 0);
  const cols = { type: M + 10, desc: M + 70, pu: M + W - 170, qte: M + W - 95, total: M + W - 10 };

  // Ligne d'en-tête sur fond ivoire
  page.drawRectangle({ x: M, y: y - 6, width: W, height: 20, color: IVORY });
  text("Type", cols.type, y, { font: bodyBold, size: 8.5 });
  text("Description", cols.desc, y, { font: bodyBold, size: 8.5 });
  text("Prix unitaire", cols.pu, y, { font: bodyBold, size: 8.5 });
  text("Qté", cols.qte, y, { font: bodyBold, size: 8.5 });
  const totalHeader = "Total";
  text(totalHeader, cols.total - bodyBold.widthOfTextAtSize(totalHeader, 8.5), y, { font: bodyBold, size: 8.5 });
  y -= 22;

  // Ligne de prestation (description repliée sur ~58 caractères)
  const descFull = [inv.description, shootLine].filter(Boolean).join(", ");
  const descLines: string[] = [];
  let cur = "";
  for (const word of String(descFull).split(" ")) {
    if ((cur + " " + word).trim().length > 58) { descLines.push(cur.trim()); cur = word; }
    else cur += " " + word;
  }
  if (cur.trim()) descLines.push(cur.trim());

  text("Service", cols.type, y);
  descLines.forEach((l, i) => text(l, cols.desc, y - i * 12));
  text(eur(amount), cols.pu, y);
  text("1", cols.qte, y);
  const totalStr = eur(amount);
  text(totalStr, cols.total - body.widthOfTextAtSize(totalStr, 9.5), y);
  y -= Math.max(descLines.length, 1) * 12 + 8;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.6, color: LINE });
  y -= 16;

  // Mention TVA + Total
  text(CONDITIONS.tva, M, y, { size: 8.5, color: MUTED });
  const totalLabel = "Total";
  const totalVal = eur(amount);
  text(totalLabel, cols.pu, y, { font: serif, size: 13 });
  text(totalVal, cols.total - bodyBold.widthOfTextAtSize(totalVal, 13), y, { font: bodyBold, size: 13 });
  y -= 10;
  page.drawRectangle({ x: cols.pu, y: y - 2, width: M + W - cols.pu, height: 1.5, color: ACCENT });

  // Statut « payée » (tampon discret)
  if (inv.status === "payée") {
    const stamp = "RÉGLÉE";
    text(stamp, M + W - bodyBold.widthOfTextAtSize(stamp, 10) , y - 26, {
      font: bodyBold, size: 10, color: rgb(0.18, 0.55, 0.38),
    });
  }

  // ── Pied de page ──
  const footer = `Facture ${inv.reference} — Page 1 sur 1`;
  text(footer, (595.28 - body.widthOfTextAtSize(footer, 8)) / 2, 36, { size: 8, color: MUTED });

  return await doc.save();
}
