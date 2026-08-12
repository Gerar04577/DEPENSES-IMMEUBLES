// ==========================================================
// graph-storage.js — lecture/écriture OneDrive (Microsoft Graph)
// Dossier utilisé : "Immobilier 2025-2026/DEPENSES-IMMEUBLES"
// (dans le dossier partagé, au même niveau que "VeroS" et
// "GESTION-LOYERS" — voir /areas/veros.md et /areas/loyers-percus-pwa.md)
// VERSION: v38
// ==========================================================

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DOSSIER_RACINE = "Immobilier 2025-2026";
const DOSSIER_APP = "DEPENSES-IMMEUBLES";
const SOUS_DOSSIER_JUSTIFICATIFS = "justificatifs";
const FICHIER_DONNEES = "depenses-data.json";

const GraphStorage = (() => {

  function encoderChemin(chemin) {
    return chemin.split("/").map(encodeURIComponent).join("/");
  }

  async function appelGraph(url, options = {}) {
    const token = await GraphAuth.obtenirAccessToken();
    const resp = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });
    return resp;
  }

  // ---- S'assure qu'un dossier existe (le crée sinon), par chemin complet ----
  async function assurerDossier(cheminParent, nomDossier) {
    const url = `${GRAPH_BASE}/me/drive/root:/${encoderChemin(cheminParent)}:/children`;
    const resp = await appelGraph(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: nomDossier,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail"
      })
    });
    // 409 = le dossier existe déjà, ce qui est le résultat voulu
    if (resp.ok || resp.status === 409) return true;
    throw new Error(`Impossible de créer le dossier ${nomDossier} (${resp.status})`);
  }

  async function assurerArborescence() {
    await assurerDossier(DOSSIER_RACINE, DOSSIER_APP);
    await assurerDossier(`${DOSSIER_RACINE}/${DOSSIER_APP}`, SOUS_DOSSIER_JUSTIFICATIFS);
    // Créer factures-scannees dans justificatifs
    await assurerDossier(`${DOSSIER_RACINE}/${DOSSIER_APP}/${SOUS_DOSSIER_JUSTIFICATIFS}`, "factures-scannees");
  }

  // ---- Dépenses (fichier JSON unique) ----
  async function chargerDepenses() {
    const chemin = `${DOSSIER_RACINE}/${DOSSIER_APP}/${FICHIER_DONNEES}`;
    const url = `${GRAPH_BASE}/me/drive/root:/${encoderChemin(chemin)}:/content`;
    const resp = await appelGraph(url);
    if (resp.status === 404) return [];
    if (!resp.ok) throw new Error(`Échec lecture des dépenses (${resp.status})`);
    return await resp.json();
  }

  async function sauvegarderDepenses(depenses) {
    await assurerArborescence();
    const chemin = `${DOSSIER_RACINE}/${DOSSIER_APP}/${FICHIER_DONNEES}`;
    const url = `${GRAPH_BASE}/me/drive/root:/${encoderChemin(chemin)}:/content`;
    const resp = await appelGraph(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(depenses, null, 2),
      keepalive: true  // garde la connexion ouverte même si l'app/page se ferme (iOS)
    });
    if (!resp.ok) throw new Error(`Échec sauvegarde des dépenses (${resp.status})`);

    // vérification par relecture (même principe que Gestion Loyers)
    const relu = await chargerDepenses();
    if (JSON.stringify(relu) !== JSON.stringify(depenses)) {
      throw new Error("Vérification après sauvegarde non concordante");
    }
    return true;
  }

  // ---- Justificatifs (upload simple, jusqu'à 4 Mo) ----
  async function televerserJustificatif(file, expenseId) {
    await assurerArborescence();
    if (file.size > 4 * 1024 * 1024) {
      throw new Error("Fichier trop volumineux (max 4 Mo pour l'instant)");
    }
    const nomFichier = `${expenseId}_${file.name}`.replace(/[\\/:*?"<>|]/g, "_");
    const chemin = `${DOSSIER_RACINE}/${DOSSIER_APP}/${SOUS_DOSSIER_JUSTIFICATIFS}/${nomFichier}`;
    const url = `${GRAPH_BASE}/me/drive/root:/${encoderChemin(chemin)}:/content`;

    const resp = await appelGraph(url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file
    });
    if (!resp.ok) throw new Error(`Échec envoi du justificatif (${resp.status})`);
    const item = await resp.json();
    return { nom: file.name, webUrl: item.webUrl, itemId: item.id };
  }

  // Upload facture scannée avec nommage explicite (date, fournisseur, montant)
  async function sauvegarderFactureScannee(fileData, fileName, dateFacture, fournisseur, montantTTC) {
    await assurerArborescence(); // Assure que factures-scannees existe déjà
    
    // Créer un nom de fichier explicite et trouvable par recherche
    // Format: YYYY-MM-DD_FOURNISSEUR_MONTANT_EUR.extension
    const montantStr = montantTTC ? montantTTC.toString().replace(".", ",") : "0";
    const nomFichier = `${dateFacture}_${(fournisseur || "UNKNOWN").toUpperCase().replace(/[\\/:*?"<>|€]/g, "_")}_${montantStr}_EUR_${fileName}`;
    const chemin = `${DOSSIER_RACINE}/${DOSSIER_APP}/${SOUS_DOSSIER_JUSTIFICATIFS}/factures-scannees/${nomFichier}`;
    const url = `${GRAPH_BASE}/me/drive/root:/${encoderChemin(chemin)}:/content`;

    console.log("Upload facture OneDrive:", { dateFacture, fournisseur, montantTTC, nomFichier, chemin });
    
    const resp = await appelGraph(url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: fileData
    });
    if (!resp.ok) throw new Error(`Échec upload facture scannée (${resp.status})`);
    const item = await resp.json();
    console.log("✓ Facture uploadée avec succès:", nomFichier);
    return { nom: nomFichier, webUrl: item.webUrl, itemId: item.id };
  }

  return { chargerDepenses, sauvegarderDepenses, televerserJustificatif, sauvegarderFactureScannee, assurerArborescence };
})();

window.GraphStorage = GraphStorage;
