// ════════════════════════════════════════════════════════════════
//  Supabase Edge Function : list-gallery
//  Liste les photos d'un client depuis Cloudinary SANS numérotation.
//
//  Sécurité : la clé secrète Cloudinary reste côté serveur (jamais
//  exposée au navigateur du client). Le front n'envoie que le code
//  d'accès du client ; la fonction résout cloudName + rootFolder
//  depuis Supabase, puis interroge l'API Cloudinary.
//
//  Secrets Supabase requis :
//    CLOUDINARY_API_KEY
//    CLOUDINARY_API_SECRET
//    (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés auto)
//
//  Déploiement :
//    supabase functions deploy list-gallery
//    supabase secrets set CLOUDINARY_API_KEY=xxx CLOUDINARY_API_SECRET=yyy
// ════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Cache mémoire léger (la fonction reste "chaude" quelques minutes).
// Évite de retaper Cloudinary à chaque ouverture de galerie.
const cache = new Map<string, { at: number; data: unknown }>();
const CACHE_MS = 5 * 60 * 1000; // 5 min

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { code } = await req.json().catch(() => ({}));
    if (!code || typeof code !== "string") {
      return json({ error: "Code client manquant" }, 400);
    }

    // 1 — Résout le client + sa config galerie depuis Supabase
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: client, error: cErr } = await sb
      .from("clients")
      .select("id, code, active")
      .eq("code", code)
      .eq("active", true)
      .maybeSingle();

    if (cErr || !client) return json({ error: "Client introuvable" }, 404);

    const { data: page } = await sb
      .from("event_pages")
      .select("config")
      .eq("client_id", client.id)
      .eq("page_type", "photos")
      .maybeSingle();

    if (!page) return json({ error: "Galerie non configurée" }, 404);

    const cfg = page.config || {};
    const cloudName: string = cfg.cloudName;
    const rootFolder: string = (cfg.rootFolder || "").replace(/\/+$/, "");
    if (!cloudName || !rootFolder) {
      return json({ error: "cloudName ou rootFolder manquant dans la config" }, 400);
    }

    // 2 — Cache
    const cacheKey = `${cloudName}::${rootFolder}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      return json(hit.data);
    }

    // 3 — Interroge Cloudinary (Search API) — pagination automatique
    const apiKey = Deno.env.get("CLOUDINARY_API_KEY")!;
    const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET")!;
    const auth = "Basic " + btoa(`${apiKey}:${apiSecret}`);
    const searchUrl =
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/search`;

    let allResources: any[] = [];
    let nextCursor: string | undefined;
    let guard = 0;

    do {
      const body: Record<string, unknown> = {
        // Couvre les 2 modes Cloudinary (dossier fixe / dossier dynamique)
        expression: `folder:"${rootFolder}/*" OR asset_folder:"${rootFolder}/*"`,
        sort_by: [{ public_id: "asc" }],
        max_results: 500,
        with_field: ["context"],
      };
      if (nextCursor) body.next_cursor = nextCursor;

      const r = await fetch(searchUrl, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const txt = await r.text();
        return json({ error: "Erreur Cloudinary", detail: txt }, 502);
      }

      const data = await r.json();
      allResources = allResources.concat(data.resources || []);
      nextCursor = data.next_cursor;
      guard++;
    } while (nextCursor && guard < 20); // garde-fou : max 10 000 photos

    // 4 — Regroupe par sous-dossier immédiat = catégorie
    //     public_id "Photos_ezla-davy/preparatifs/IMG_001"
    //       → rootFolder = "Photos_ezla-davy"
    //       → catégorie  = "preparatifs"
    const buckets = new Map<string, any[]>();

    for (const res of allResources) {
      // Le dossier réel : asset_folder (mode dynamique) sinon dérivé du public_id
      let folderPath: string =
        res.asset_folder ||
        (res.public_id || "").split("/").slice(0, -1).join("/");

      // Retire le rootFolder en préfixe pour ne garder que la catégorie
      let rel = folderPath;
      if (rel.startsWith(rootFolder + "/")) rel = rel.slice(rootFolder.length + 1);
      else if (rel === rootFolder) rel = "";
      const category = rel.split("/")[0] || "_racine_";

      if (!buckets.has(category)) buckets.set(category, []);
      buckets.get(category)!.push({
        publicId: res.public_id,
        width: res.width || null,
        height: res.height || null,
        format: res.format || "jpg",
      });
    }

    const categories = Array.from(buckets.entries())
      .map(([folder, images]) => ({
        folder,
        // Nom lisible par défaut : "preparatifs" → "Preparatifs"
        name: folder === "_racine_"
          ? "Galerie"
          : folder.charAt(0).toUpperCase() + folder.slice(1).replace(/[-_]/g, " "),
        count: images.length,
        images,
      }))
      .sort((a, b) => a.folder.localeCompare(b.folder));

    const payload = {
      cloudName,
      rootFolder,
      total: allResources.length,
      categories,
    };

    cache.set(cacheKey, { at: Date.now(), data: payload });
    return json(payload);
  } catch (e) {
    return json({ error: "Erreur serveur", detail: String(e) }, 500);
  }
});
