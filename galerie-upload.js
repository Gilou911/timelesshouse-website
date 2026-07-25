/* ════════════════════════════════════════════════════════════
   📸 PIPELINE PHOTO DE GALERIE — module PARTAGÉ
   ════════════════════════════════════════════════════════════
   Une photo de galerie part sur B2 en 3 fichiers sous
   weddings/<code>/galerie/<slug-catégorie>/<uuid>/ :
     · original.jpg — le fichier intact (téléchargement client)
     · view.jpg     — ≤ 2000 px de large, JPEG q0.82 (lightbox)
     · grid.jpg     — ≤ 1000 px de large, JPEG q0.80 (grille)
   puis une ligne `gallery_photos` porte les URLs publiques.

   Ce module est la SEULE source de vérité de ce pipeline : la console
   (communication-admin.jsx) et le concepteur (galerie-studio.html)
   l'importent tous les deux. Avant, chacun aurait porté sa copie —
   et le jour où une variante change de taille, l'une des deux aurait
   continué à produire l'ancien format sans que personne ne le voie.

   Dépendances injectées (chaque page a déjà son client Supabase) :
     creerPipelinePhotos({ sb, supabaseUrl, uploadFile? })
   `uploadFile(file|blob, key, onProgress) → publicUrl` est optionnel :
   la console passe le sien (qui sait aussi faire du multipart pour ses
   films) ; par défaut le module fait un PUT signé simple — largement
   suffisant pour des photos, avec reprise sur coupure.
   ════════════════════════════════════════════════════════════ */

// slug ASCII pour dériver un nom de sous-dossier depuis un libellé de
// catégorie — DOIT rester identique à celui de la console : il façonne
// les clés B2 des photos déjà en ligne.
export const slugifyCategorie = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Décode une image (EXIF respecté) — createImageBitmap, sinon <img>.
async function decodeGalleryImage(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    return await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error(`Image illisible : ${file.name || 'fichier'}`));
      im.src = URL.createObjectURL(file);
    });
  }
}

// Variante JPEG ≤ maxW px de large (jamais agrandie).
function galleryVariant(source, maxW, quality) {
  const w = source.width || source.naturalWidth, h = source.height || source.naturalHeight;
  const r = Math.min(1, maxW / w);
  const cw = Math.max(1, Math.round(w * r)), ch = Math.max(1, Math.round(h * r));
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  canvas.getContext('2d').drawImage(source, 0, 0, cw, ch);
  return new Promise((resolve, reject) => canvas.toBlob(
    (b) => b ? resolve(b) : reject(new Error('Génération de variante échouée')),
    'image/jpeg', quality));
}

export function creerPipelinePhotos({ sb, supabaseUrl, uploadFile }) {
  // ── Transport par défaut : PUT signé simple, avec reprise ──
  async function b2Sign(payload) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error('Session admin expirée — reconnecte-toi.');
    const res = await fetch(`${supabaseUrl}/functions/v1/b2-sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Signature B2 échouée (${res.status})`);
    return json;
  }

  function b2Put(url, body, contentType, onProgress, disposition) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      // Content-Type / Content-Disposition : signés côté fonction — ils
      // doivent repartir À L'IDENTIQUE, sinon la signature est invalide.
      if (contentType) xhr.setRequestHeader('Content-Type', contentType);
      if (disposition) xhr.setRequestHeader('Content-Disposition', disposition);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300)
        ? resolve(xhr)
        : reject(new Error(`Upload B2 échoué (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Upload B2 échoué — réseau ou CORS du bucket'));
      xhr.send(body);
    });
  }

  async function defaultUpload(file, key, onProgress) {
    // Une « photo » de plus de 100 Mo n'en est pas une — et le PUT unique
    // n'a pas de reprise par morceaux : on refuse clairement plutôt que
    // d'échouer à 98 %.
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('Photo trop lourde (plus de 100 Mo) — vérifiez le fichier.');
    }
    const contentType = file.type || 'image/jpeg';
    const { url, publicUrl, disposition } = await b2Sign({ action: 'sign-put', key, contentType, size: file.size });
    let lastErr;
    for (let i = 1; i <= 3; i++) {
      try { await b2Put(url, file, contentType, onProgress, disposition); return publicUrl; }
      catch (e) { lastErr = e; if (i < 3) await new Promise(r => setTimeout(r, 1500 * i)); }
    }
    throw lastErr;
  }

  const envoyer = uploadFile || defaultUpload;

  // Uploade UNE photo (original + 2 variantes) et insère sa ligne.
  // onProgress(0..1) — l'original pèse le plus lourd : 70/20/10.
  // `client_id` reste rempli en plus de `gallery_id` : get_client_gallery
  // (brique 11) et event-photos.html continuent de fonctionner à l'identique.
  async function uploadGalleryPhoto({ client, gallery, category, position, file, onProgress }) {
    const src = await decodeGalleryImage(file);
    const width  = src.width  || src.naturalWidth  || null;
    const height = src.height || src.naturalHeight || null;
    const [viewBlob, gridBlob] = await Promise.all([
      galleryVariant(src, 2000, 0.82),
      galleryVariant(src, 1000, 0.80),
    ]);
    if (src.close) src.close();

    const dir = `weddings/${client.code}/galerie/${slugifyCategorie(category) || 'galerie'}/${crypto.randomUUID()}`;
    const url_original = await envoyer(file,     `${dir}/original.jpg`, (p) => onProgress?.(p * 0.7));
    const url_view     = await envoyer(viewBlob, `${dir}/view.jpg`,     (p) => onProgress?.(0.7 + p * 0.2));
    const url_grid     = await envoyer(gridBlob, `${dir}/grid.jpg`,     (p) => onProgress?.(0.9 + p * 0.1));

    const { error } = await sb.from('gallery_photos').insert({
      client_id: client.id, gallery_id: gallery?.id || null, category, position,
      width, height, url_original, url_view, url_grid,
    });
    if (error) throw new Error(error.message);
  }

  return { uploadGalleryPhoto };
}
