// ==========================================================
// graph-storage.js — lecture/écriture OneDrive (Microsoft Graph)
// Dossier utilisé : "Immobilier 2025-2026/DEPENSES-IMMEUBLES"
// (dans le dossier partagé, au même niveau que "VeroS" et
// "GESTION-LOYERS" — voir /areas/veros.md et /areas/loyers-percus-pwa.md)
// VERSION: v40 → nettoyé 16 août 2026 (fonctions mortes retirées)
// Ne sert plus qu'au scan/OCR (sauvegarderFactureScannee) —
// le reste (dépenses, justificatifs manuels) passe par Make.com
// ==========================================================

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DOSSIER_RACINE = "Immobilier 2025-2026";
const DOSSIER_APP = "DEPENSES-IMMEUBLES";
const SOUS_DOSSIER_JUSTIFICATIFS = "justificatifs";

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

  // Upload facture scannée avec nommage explicite (date, fournisseur, montant)
  async function sauvegarderFactureScannee(fileData, fileName, dateFacture, fournisseur, montantTTC) {
    try {
      await assurerArborescence(); // Assure que factures-scannees existe déjà
      // Délai replication Microsoft Graph (documentation officielle recommande 5-10s)
      await new Promise(resolve => setTimeout(resolve, 10000));
    } catch (err) {
      console.error("❌ ERREUR assurerArborescence:", err);
      throw err;
    }

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

  return { sauvegarderFactureScannee, assurerArborescence };
})();

window.GraphStorage = GraphStorage;
