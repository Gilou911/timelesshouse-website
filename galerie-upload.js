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

  async function b2PutRetry(url, body, contentType, onProgress, disposition, tries = 3) {
    let lastErr;
    for (let i = 1; i <= tries; i++) {
      try { return await b2Put(url, body, contentType, onProgress, disposition); }
      catch (e) { lastErr = e; if (i < tries) await new Promise(r => setTimeout(r, 1500 * i)); }
    }
    throw lastErr;
  }

  // Seuil volontairement bas : un PUT unique de plusieurs Go n'a AUCUNE
  // reprise possible (une micro-coupure et tout est perdu), alors qu'un
  // morceau raté se réessaie seul. Indispensable pour un film de mariage.
  const MPU_SEUIL = 100 * 1024 * 1024;
  const MPU_PART  = 100 * 1024 * 1024;

  async function defaultUpload(file, key, onProgress) {
    const contentType = file.type || 'application/octet-stream';

    if (file.size <= MPU_SEUIL) {
      const { url, publicUrl, disposition } = await b2Sign({ action: 'sign-put', key, contentType, size: file.size });
      await b2PutRetry(url, file, contentType, onProgress, disposition);
      return publicUrl;
    }

    // Multipart — l'ETag de chaque morceau est exigé à la finalisation.
    const { uploadId } = await b2Sign({ action: 'mpu-create', key, contentType, size: file.size });
    try {
      const total = Math.ceil(file.size / MPU_PART);
      const parts = [];
      let envoyes = 0;
      for (let debut = 1; debut <= total; debut += 100) {
        const lot = [];
        for (let n = debut; n <= Math.min(debut + 99, total); n++) lot.push(n);
        const { urls } = await b2Sign({ action: 'mpu-sign-parts', key, uploadId, partNumbers: lot });
        for (const n of lot) {
          const bloc = file.slice((n - 1) * MPU_PART, Math.min(n * MPU_PART, file.size));
          const xhr = await b2PutRetry(urls[n], bloc, null, (p) => {
            if (onProgress) onProgress((envoyes + p * bloc.size) / file.size);
          });
          envoyes += bloc.size;
          parts.push({ PartNumber: n, ETag: (xhr.getResponseHeader('ETag') || '').replace(/"/g, '') });
        }
      }
      const { publicUrl } = await b2Sign({ action: 'mpu-complete', key, uploadId, parts, size: file.size });
      return publicUrl;
    } catch (err) {
      await b2Sign({ action: 'mpu-abort', key, uploadId }).catch(() => {});
      throw err;
    }
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

  /* Photo de COUVERTURE — un envoi à part, qui n'entre pas dans la galerie.
     Auparavant la couverture se choisissait dans une grille de vignettes
     de la galerie : intenable dès que le mariage compte quelques milliers
     de photos, et de toute façon la bonne image de couverture n'est pas
     toujours dans la livraison.
     Deux différences avec une photo de galerie :
       · aucune ligne `gallery_photos` — elle ne doit pas s'afficher dans
         la grille du client, seulement en couverture ;
       · pas d'original conservé. La couverture n'est jamais téléchargée
         par le client, stocker un RAW de 40 Mo pour ça se paierait sur
         le quota de l'agence sans rien apporter.
     Le résultat se range dans config.coverPhoto de la galerie. */
  async function uploadCoverPhoto({ client, file, onProgress }) {
    const src = await decodeGalleryImage(file);
    const width  = src.width  || src.naturalWidth  || null;
    const height = src.height || src.naturalHeight || null;
    const [viewBlob, gridBlob] = await Promise.all([
      galleryVariant(src, 2000, 0.82),   // plein écran
      galleryVariant(src, 1000, 0.80),   // aperçu et montée progressive
    ]);
    if (src.close) src.close();

    const dir = `weddings/${client.code}/couverture/${crypto.randomUUID()}`;
    const url_view = await envoyer(viewBlob, `${dir}/view.jpg`, (p) => onProgress?.(p * 0.75));
    const url_grid = await envoyer(gridBlob, `${dir}/grid.jpg`, (p) => onProgress?.(0.75 + p * 0.25));
    return { url_view, url_grid, width, height };
  }

  /* Envoi d'un fichier QUELCONQUE (film, master…) — c'est la même
     mécanique que les photos, sans les variantes ni la ligne en base.
     Exposé pour le concepteur : chez un locataire, une vidéo s'UPLOADE,
     on ne colle jamais un lien (règle de Gil). */
  async function uploadFichier(file, key, onProgress) {
    return await envoyer(file, key, onProgress);
  }

  return { uploadGalleryPhoto, uploadCoverPhoto, uploadFichier };
}

/** Nom de fichier sûr pour une clé B2 (accents, espaces, caractères exotiques). */
export function b2SafeName(nom) {
  return (nom || 'fichier')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(-80) || 'fichier';
}
