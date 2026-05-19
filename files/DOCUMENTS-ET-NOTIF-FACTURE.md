# Espace Documents + Notification « Facture prête »

Deux ajouts à l'espace client, livrés sur le même modèle que vos modules existants
(Médias / Factures / Tournages).

---

## 1. Ce qui a été ajouté

### 📁 Module Documents
- Nouvelle table `documents` + colonne `documents_enabled` sur `clients`.
- **Admin** : onglet « Documents » dans la fiche client (ajouter / modifier /
  supprimer), avec catégories **Contrat · Charte graphique · Devis · Brief · Autre**.
  Toggle d'activation dans le formulaire client (comme Médias/Factures).
- **Espace client** : nouvelle entrée « Documents » (menu latéral + barre mobile +
  raccourci tableau de bord), avec filtre par catégorie et téléchargement.
- Les fichiers sont référencés par **URL** (comme vos PDF de factures et vos médias).

### 🔔 Bouton « Notifier le client » sur les factures
- Sur chaque facture (vue admin), un bouton **Envoyer** prévient le client par email
  que sa facture est disponible, avec un **lien direct vers la connexion**
  (`/index.html#clients` → la modale d'accès s'ouvre automatiquement).
- N'apparaît que si le client a un email renseigné (même logique que la notif Médias).

---

## 2. Déploiement (2 étapes)

### Étape A — Base de données
Supabase → SQL Editor → coller **`migration-documents.sql`** → Run.
(Fichier idempotent : peut être relancé sans risque. Pour une nouvelle install,
`schema.sql` contient déjà tout.)

### Étape B — Remplacer les 4 fichiers
- `communication-admin.html`
- `communication-app.jsx`
- `communication-dashboard.html`
- `schema.sql`

> Astuce hébergement des fichiers : créez un bucket **public** « documents »
> dans Supabase Storage, déposez vos PDF/images, copiez l'URL publique et
> collez-la dans le champ « URL du fichier » du formulaire admin.

---

## 3. ⚠️ Fonction Edge `notify-client` — à compléter

Le bouton facture utilise un nouveau `kind: 'invoice_ready'`. Comme pour
`welcome`, `event_ready` et `new_media`, votre fonction Edge Supabase doit gérer
ce cas, sinon le bouton affiche un message d'erreur clair (rien n'est cassé).

Ajoutez ce bloc dans le `switch (kind)` (ou équivalent) de votre fonction
`supabase/functions/notify-client/index.ts`. Le payload reçu est :

```jsonc
{
  "kind": "invoice_ready",
  "client_id": "<uuid>",
  "extra": { "reference": "FAC-2026-042", "amount": 3200, "loginUrl": "https://…/index.html#clients" }
}
```

Snippet (adaptez le nom de votre client d'envoi d'email — Resend ici, comme
vos autres `kind`) :

```ts
case "invoice_ready": {
  // `client` est déjà chargé depuis la table clients via client_id
  const ref     = body.extra?.reference ?? "";
  const amount  = body.extra?.amount ?? null;
  const loginUrl = body.extra?.loginUrl ?? "https://VOTRE-DOMAINE/index.html#clients";
  const montant = amount != null
    ? new Intl.NumberFormat("fr-FR").format(amount) + " €"
    : "";

  subject = `Votre facture ${ref} est disponible`;
  html = `
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:auto;color:#1c1d21">
      <h2 style="font-weight:400">Bonjour ${client.greeting || client.name},</h2>
      <p>Votre facture <strong>${ref}</strong>${montant ? ` (${montant})` : ""}
         est disponible dans votre espace client.</p>
      <p style="margin:28px 0">
        <a href="${loginUrl}"
           style="background:#1c1d21;color:#fff;text-decoration:none;
                  padding:14px 28px;border-radius:999px;font-weight:600;display:inline-block">
          Consulter ma facture
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">
        Saisissez votre code d'accès habituel pour vous connecter.
      </p>
      <p style="color:#9ca3af;font-size:12px">${client.agency_name || "TimelessHouse"}</p>
    </div>`;
  break;
}
```

Puis redéployez : `supabase functions deploy notify-client`.

(Si votre fonction a un fallback générique pour les `kind` inconnus, l'email
partira déjà — ce snippet ne fait qu'en soigner le texte.)
