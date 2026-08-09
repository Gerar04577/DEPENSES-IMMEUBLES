# Dépenses Immeubles — v1

Application indépendante (aucun lien technique avec VeroS ni Gestion Loyers).
Suit les dépenses de travaux par studio/appartement, par immeuble, avec
totaux par immeuble et total général. Justificatifs (facture/photo)
téléversés directement dans OneDrive.

## Ce qui est fait dans cette v1
- Saisie manuelle complète : immeuble, studio/appartement, date, montant,
  nature, fournisseur, statut (payé / à payer), description, justificatif joint
- Liste filtrable (recherche, statut, tri) et onglets par immeuble
- Totaux par immeuble + total général, mis à jour en temps réel
- Sauvegarde OneDrive dans `Immobilier 2025-2026/DEPENSES-IMMEUBLES/depenses-data.json`
- Justificatifs sauvés dans `Immobilier 2025-2026/DEPENSES-IMMEUBLES/justificatifs/`
- Repli automatique en local (localStorage) si pas connecté à OneDrive
- Vérification par relecture après chaque sauvegarde (même principe que Gestion Loyers)

## Pas encore fait (à discuter pour une v2)
- Lecture automatique des dépenses depuis les dossiers "Travaux..." déjà
  présents dans OneDrive (nécessite l'OCR — Tesseract.js, comme pour
  Gestion Loyers) : reconnaître un montant/une date sur une photo de facture
- Justificatifs de plus de 4 Mo (upload simple limité pour l'instant ;
  possible avec une "session d'upload" Graph si besoin)

## Étapes pour mettre l'app en ligne (comme VeroS / Gestion Loyers)

### 1. Inscription Entra (une seule fois)
1. https://entra.microsoft.com > Applications > Inscriptions d'applications > Nouvelle inscription
2. Nom : `Dépenses Immeubles`
3. Types de comptes pris en charge : **Comptes Microsoft personnels uniquement**
4. Type de plateforme de redirection : **SPA (application monopage)**
5. URI de redirection : `https://gerar04577.github.io/DEPENSES-IMMEUBLES/`
   *(à ajuster si tu choisis un autre nom de dépôt GitHub)*
6. Une fois créée : copier l'**ID d'application (client)**
7. API autorisées > Ajouter une autorisation > Microsoft Graph > Déléguées >
   cocher `Files.ReadWrite` et `offline_access` > Ajouter les autorisations

### 2. Coller le Client ID dans le code
Dans `graph-auth.js`, remplacer :
```
const GRAPH_CLIENT_ID = "COLLER_ICI_LE_CLIENT_ID_ENTRA";
```
par ton vrai Client ID.

### 3. Dépôt GitHub + Pages
1. Créer un dépôt public, ex. `DEPENSES-IMMEUBLES`
2. Déposer tous les fichiers de ce dossier à la racine du dépôt
3. Settings > Pages > Deploy from branch > `main` / `root`
4. L'app sera disponible à `https://gerar04577.github.io/DEPENSES-IMMEUBLES/`
   → vérifier que cette URL correspond bien à celle mise dans l'inscription Entra (étape 1.5)

### 4. Premier test
1. Ouvrir l'URL sur iPhone ou PC
2. "Se connecter à OneDrive" > se connecter avec ton compte Microsoft personnel
3. Ajouter une dépense de test, vérifier qu'elle apparaît bien dans
   `Immobilier 2025-2026/DEPENSES-IMMEUBLES/depenses-data.json` sur OneDrive

### 5. Accès pour ton fils et Véronique
Même règle que VeroS : ils doivent d'abord ajouter un raccourci vers le
dossier partagé "Immobilier 2025-2026" depuis onedrive.live.com (Partagé >
"Ajouter un raccourci à Mes fichiers"), puis se connecter dans l'app avec
leur propre compte Microsoft.
