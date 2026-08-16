// ==========================================================
// Dépenses Immeubles — app.js v11
// Warranty Management + Scan Facture Integration
// ==========================================================

const APP_VERSION = "v57";
const SCAN_FACTURE_WEBHOOK = "https://hook.eu1.make.com/5ggr1j45di4au52v8ob81ilkiou15a9d";
const WEBHOOK_URL = "https://hook.eu1.make.com/4i6tmoshu6ou5rg98qngyfi3sidq8f0p";  // ← AJOUTER

// ---- Référentiel des 7 immeubles et de leurs unités ----
const IMMEUBLES = [
  { id: "biche", nom: "Biche", unites: [
    "STUDIO 1","STUDIO 2","STUDIO 3","STUDIO 4","STUDIO 5","STUDIO 6",
    "STUDIO 7","STUDIO 8","STUDIO 9","STUDIO 10","STUDIO 11","APPARTEMENT",
    "TRAVAUX DANS L'IMMEUBLE"
  ]},
  { id: "nimy", nom: "Nimy", unites: [
    "Studio 1","Studio 2","Studio 3","Studio 4","Studio 5","Studio 6",
    "Studio 7","Studio 8 (Appartement)","Studio 9","Studio 10","Studio 11","RDC Commercial",
    "TRAVAUX DANS L'IMMEUBLE"
  ]},
  { id: "ptg", nom: "Petite Guirlande (PTG)", unites: [
    "Appartement 1er étage arrière","Appartement 3","Appartement RDC Guirlande",
    "Duplex","RDC Commercial","Studio 4","Studio 5","Studio 6","Studio 7","Studio 8","Studio 9","Studio 10",
    "TRAVAUX DANS L'IMMEUBLE"
  ]},
  { id: "havre", nom: "Havré", unites: [ "1er Etage","RDC","TRAVAUX DANS L'IMMEUBLE" ]},
  { id: "egmont", nom: "Egmont", unites: [ "1er Etage","2e Etage","RDC","TRAVAUX DANS L'IMMEUBLE" ]},
  { id: "fermette", nom: "Pourcelet Fermette", unites: [ "Studio 1","Studio 2","Studio 3","Studio 4","TRAVAUX DANS L'IMMEUBLE" ]},
  { id: "vannes", nom: "Vannes", unites: [ "1er Etage","2e Etage","3e Etage","Garage","RDC","TRAVAUX DANS L'IMMEUBLE" ]}
];

const NATURES = [
  "Plomberie","Électricité","Chauffage","Peinture","Mobilier","Menuiserie",
  "Nettoyage","Serrurerie","Toiture / étanchéité","Électroménager","Autre"
];

const FOURNISSEURS_DEFAULTS = [
  "ELDI","ACTION","BRICO PLAN IT","LIDL","MEDIAMARKT","EXTRA","KRËFE",
  "Leroy Merlin","Brico Dépôt"
];

// ==========================================================
// Fonctions Webhook Make.com
// ==========================================================
async function chargerViaWebhook() {
  try {
    console.log("Chargement dépenses via webhook...");
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);  // 10s timeout
    
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import_depenses" }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Webhook erreur ${response.status}`);
    }

    const text = await response.text();
    console.log("Réponse webhook reçue, décodage...");
    
    // Décoder le base64
    const decoded = decodeURIComponent(escape(atob(text)));
    const data = JSON.parse(decoded);
    
    console.log("✓ Dépenses chargées via webhook:", data.length, "items");
    return data;
  } catch (err) {
    console.error("❌ Erreur webhook import:", err.message);
    throw err;
  }
}

async function sauvegarderViaWebhook(donnees) {
  try {
    console.log("Sauvegarde dépenses + justificatifs via webhook...");
    
    // Encoder les dépenses en base64
    const json = JSON.stringify(donnees);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    
    // Extraire justificatifs pour envoyer séparément
    const justificatifs = donnees
      .filter(d => d.justificatif)
      .map(d => ({
        idDépense: d.id,
        nom: d.justificatif.nom,
        webUrl: d.justificatif.webUrl,
        mimeType: d.justificatif.mimeType
      }));
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);  // 10s timeout
    
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        action: "save_depenses",
        data: base64,
        justificatifs: justificatifs
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Webhook erreur ${response.status}`);
    }

    console.log("✓ Dépenses + " + justificatifs.length + " justificatif(s) sauvegardés via webhook");
    return true;
  } catch (err) {
    console.error("❌ Erreur webhook save:", err.message);
    throw err;
  }
}

// ---- État en mémoire ----
let depenses = [];
let filtreImmeuble = "tous";
let currentView = "depenses"; // 'depenses' ou 'garanties'
let onedriveConnecte = false;
let timerBanniere = null;
let reminderVisible = false;
let fournisseursPersos = []; // fournisseurs custom (localStorage)

// ---- Éléments DOM ----
const el = (id) => document.getElementById(id);
const buildingTabs = el("buildingTabs");
const expenseList = el("expenseList");
const totalsRow = el("totalsRow");
const modal = el("expenseModal");
const modalBackdrop = el("modalBackdrop");
const expenseForm = el("expenseForm");
const toastEl = el("toast");

document.getElementById("versionLabel").textContent = APP_VERSION;

// ==========================================================
// Initialisation
// ==========================================================
function init() {
  chargerFournisseursPersos();
  renderBuildingTabs();
  renderSelectOptions();
  chargerDonnees();
  attachEvents();
}

function chargerFournisseursPersos() {
  const stored = localStorage.getItem("depenses-immeubles-fournisseurs");
  fournisseursPersos = stored ? JSON.parse(stored) : [];
}

function sauvegarderFournisseursPersos() {
  localStorage.setItem("depenses-immeubles-fournisseurs", JSON.stringify(fournisseursPersos));
}

function renderBuildingTabs() {
  IMMEUBLES.forEach(imm => {
    const btn = document.createElement("button");
    btn.className = "tab";
    btn.dataset.immeuble = imm.id;
    btn.textContent = imm.nom;
    buildingTabs.appendChild(btn);
  });
  
  buildingTabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    if (btn.dataset.view === "garanties") {
      switchView("garanties");
    } else if (btn.dataset.view === "recherche") {  // ← AJOUTER
      switchView("recherche");
    } else {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      filtreImmeuble = btn.dataset.immeuble;
      switchView("depenses");
    }
  });
}

function switchView(view) {
  currentView = view;
  el("expenseListPanel").style.display = view === "depenses" ? "block" : "none";
  el("warrantyPagePanel").style.display = view === "garanties" ? "block" : "none";
  el("searchPagePanel").style.display = view === "recherche" ? "block" : "none";  // ← AJOUTER
  el("totalsPanel").style.display = view === "depenses" ? "block" : "none";
  el("actionsPanel").style.display = view === "depenses" ? "block" : "none";
  
  document.querySelectorAll(".tab[data-view]").forEach(t => t.classList.remove("active"));
  if (view === "garanties") {
    el("tabGaranties").classList.add("active");
    renderWarrantyConsultation();
  } else if (view === "recherche") {  // ← AJOUTER
    el("tabRecherche").classList.add("active");
    renderRecherche();
  } else {
    document.querySelectorAll(".tab:not([data-view])").forEach(t => {
      if (t.dataset.immeuble === filtreImmeuble) t.classList.add("active");
    });
    render();
  }
}

function renderSelectOptions() {
  const selImm = el("fImmeuble");
  IMMEUBLES.forEach(imm => {
    const opt = document.createElement("option");
    opt.value = imm.id;
    opt.textContent = imm.nom;
    selImm.appendChild(opt);
  });
  selImm.addEventListener("change", renderUniteOptions);
  renderUniteOptions();

  const selNature = el("fNature");
  NATURES.forEach(n => {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    selNature.appendChild(opt);
  });
  
  // Remplir dropdown fournisseurs
  renderFournisseurOptions();
}

function renderUniteOptions() {
  const immId = el("fImmeuble").value;
  const imm = IMMEUBLES.find(i => i.id === immId) || IMMEUBLES[0];
  const selUnite = el("fUnite");
  selUnite.innerHTML = "";
  imm.unites.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    selUnite.appendChild(opt);
  });
}

function renderFournisseurOptions() {
  const sel = el("fFournisseurGarantie");
  if (!sel) return;
  
  sel.innerHTML = '<option value="">-- Sélectionner --</option>';
  
  const allFournisseurs = [...FOURNISSEURS_DEFAULTS, ...fournisseursPersos];
  allFournisseurs.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    sel.appendChild(opt);
  });
  
  const customOpt = document.createElement("option");
  customOpt.value = "custom";
  customOpt.textContent = "➕ Ajouter nouveau...";
  sel.appendChild(customOpt);
}

// ==========================================================
// Bannière d'avertissement
// ==========================================================
function afficherBanniere() {
  const banner = el("saveReminder");
  if (!banner) return;
  banner.style.display = "flex";
  reminderVisible = true;
  clearTimeout(timerBanniere);
  timerBanniere = setTimeout(afficherBanniere, 10 * 60 * 1000);
}

function fermerBanniere() {
  const banner = el("saveReminder");
  if (!banner) return;
  banner.style.display = "none";
  reminderVisible = false;
}

// ==========================================================
// Chargement / sauvegarde des données
// ==========================================================
async function chargerDonnees() {
  const lastSave = localStorage.getItem("depenses-immeubles-last-save");
  if (lastSave) {
    el("lastSaveLabel").textContent = "OneDrive confirmé " + lastSave;
  }

  // Charger via webhook Make.com
  try {
    const data = await chargerViaWebhook();
    depenses = data || [];
    onedriveConnecte = true;
    // majStatutConnexion(true); ← SUPPRIMER: économise crédits Microsoft Graph
    render();
    renderSauvegarde();
    return;
  } catch (err) {
    console.error("Échec webhook import, repli local:", err);
  }
  
  // Fallback: charger depuis localStorage
  const brut = localStorage.getItem("depenses-immeubles-data");
  depenses = brut ? JSON.parse(brut) : [];
  render();
}

async function sauvegarderDonnees() {
  localStorage.setItem("depenses-immeubles-data", JSON.stringify(depenses));
  const ts = new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  el("lastSaveLabel").textContent = "sauvegardé localement " + ts;

  // Sauvegarder via webhook Make.com
  marquerTentativeEnvoi();
  try {
    await sauvegarderViaWebhook(depenses);
    el("lastSaveLabel").textContent = "OneDrive confirmé " + ts;
    localStorage.setItem("depenses-immeubles-last-save", ts);
    el("saveBanner").style.display = "none";
    localStorage.removeItem("depenses-immeubles-tentative-envoi");
    showToast("✓ Sauvegardé sur OneDrive");
    renderSauvegarde();
    
    if (el("saveReminder").style.display === "flex") {
      el("saveReminder").style.display = "none";
      setTimeout(() => {
        if (el("saveReminder").style.display === "none") {
          el("saveReminder").style.display = "flex";
        }
      }, 5000);
    }
  } catch (err) {
    console.error("Échec sauvegarde webhook:", err);
    el("saveBanner").style.display = "block";
    showToast("⚠️ Erreur sauvegarde webhook");
  }
}

function marquerTentativeEnvoi() {
  localStorage.setItem("depenses-immeubles-tentative-envoi", new Date().toISOString());
}

function majStatutConnexion(connecte) {
  onedriveConnecte = connecte;
  el("connLabel").textContent = connecte ? "Connecté à OneDrive" : "";
  el("btnConnect").textContent = connecte ? "Reconnecter" : "Se connecter à OneDrive";
  el("userEmail").style.display = connecte ? "block" : "none";
  el("btnDisconnect").style.display = connecte ? "inline" : "none";
  
  if (connecte && window.GraphAuth) {
    el("userEmail").textContent = "Chargement...";
    GraphAuth.obtenirMailUtilisateur().then(mail => {
      if (mail) {
        el("userEmail").textContent = mail;
      } else {
        el("userEmail").textContent = "";
      }
    }).catch(err => {
      console.error("Erreur mail:", err);
      el("userEmail").textContent = "";
    });
  }
}

// ==========================================================
// Rendu
// ==========================================================
function render() {
  renderTotaux();
  renderListe();
  renderWarrantyConsultation();
  renderRecherche();
  renderSauvegarde();  // ← AJOUTER: Module Sauvegarde
}

function depensesFiltreesImmeuble() {
  if (filtreImmeuble === "tous") return depenses;
  return depenses.filter(d => d.immeubleId === filtreImmeuble);
}

function renderTotaux() {
  // Si un immeuble spécifique est sélectionné, afficher total de cet immeuble + total général
  if (filtreImmeuble && filtreImmeuble !== "tous") {
    const deps = depensesFiltreesImmeuble();
    const totalGeneral = deps.reduce((s, d) => s + d.montant, 0);
    const immeubleObj = IMMEUBLES.find(i => i.id === filtreImmeuble);
    const immeubleNom = immeubleObj ? immeubleObj.nom : filtreImmeuble;
    
    totalsRow.innerHTML = `
      <div class="total-box">
        <span class="total-label">💰 ${immeubleNom}</span>
        <span class="total-amount">${totalGeneral.toFixed(2)}€</span>
      </div>
      <div class="total-box total-box-highlight">
        <span class="total-label">TOTAL GÉNÉRAL</span>
        <span class="total-amount">${calculerTotalGeneral().toFixed(2)}€</span>
      </div>
    `;
  } else {
    // Afficher totaux par Immeuble si vue "tous"
    const toutesDepenses = [...depenses];
    const immeubles = [...new Set(toutesDepenses.map(d => d.immeubleId))].sort();
    
    let html = "";
    let totalGeneral = 0;
    
    // Totaux par immeuble
    immeubles.forEach(immeubleId => {
      const immeubleObj = IMMEUBLES.find(i => i.id === immeubleId);
      const immeubleNom = immeubleObj ? immeubleObj.nom : immeubleId;
      
      const total = toutesDepenses
        .filter(d => d.immeubleId === immeubleId)
        .reduce((s, d) => s + d.montant, 0);
      totalGeneral += total;
      html += `
        <div class="total-box">
          <span class="total-label">${immeubleNom}</span>
          <span class="total-amount">${total.toFixed(2)}€</span>
        </div>
      `;
    });
    
    // Total général
    html += `
      <div class="total-box total-box-highlight">
        <span class="total-label">TOTAL GÉNÉRAL</span>
        <span class="total-amount">${totalGeneral.toFixed(2)}€</span>
      </div>
    `;
    
    totalsRow.innerHTML = html;
  }
}

function calculerTotalGeneral() {
  return depenses.reduce((s, d) => s + d.montant, 0);
}

function renderListe() {
  const filtreStatut = el("filterStatut").value;
  const triOption = el("filterTri").value;

  let deps = depensesFiltreesImmeuble();

  if (filtreStatut !== "tous") {
    deps = deps.filter(d => d.statut === filtreStatut);
  }

  // Tri
  if (triOption === "date-asc") {
    deps.sort((a, b) => new Date(a.date) - new Date(b.date));
  } else if (triOption === "date-desc") {
    deps.sort((a, b) => new Date(b.date) - new Date(a.date));
  } else if (triOption === "montant-asc") {
    deps.sort((a, b) => a.montant - b.montant);
  } else if (triOption === "montant-desc") {
    deps.sort((a, b) => b.montant - a.montant);
  }

  expenseList.innerHTML = "";
  if (deps.length === 0) {
    expenseList.innerHTML = '<p class="empty-state">Aucune dépense trouvée.</p>';
    return;
  }

  deps.forEach(dep => {
    const itemDiv = document.createElement("div");
    itemDiv.className = "expense-item";
    const dateObj = new Date(dep.date + "T00:00:00");
    const dateFormatted = dateObj.toLocaleDateString("fr-BE");
    const immeubleValue = (dep.immeuble && dep.immeuble.trim()) ? dep.immeuble : "";
    const badgeHtml = immeubleValue ? `<span class="badge badge-${immeubleValue.toLowerCase()}">[${escapeHtml(immeubleValue)}]</span>` : "";
    itemDiv.innerHTML = `
      <div class="expense-header">
        <span class="expense-unite">${badgeHtml} ${escapeHtml(dep.unite)}</span>
        <span class="expense-date">${dateFormatted}</span>
        <span class="expense-montant">${dep.montant.toFixed(2)}€</span>
        <span class="expense-statut ${dep.statut === "payé" ? "statut-paye" : "statut-impaye"}">
          ${dep.statut === "payé" ? "✓ Payé" : "À payer"}
        </span>
      </div>
      <div class="expense-details">
        <span class="detail-nature"><strong>Nature:</strong> ${escapeHtml(dep.nature)}</span>
        ${dep.fournisseur ? `<span class="detail-fournisseur"><strong>Fournisseur:</strong> ${escapeHtml(dep.fournisseur)}</span>` : ""}
        ${dep.description ? `<span class="detail-desc"><strong>Description:</strong> ${escapeHtml(dep.description)}</span>` : ""}
        ${dep.garantie ? `<span class="detail-warranty">☑ Avec garantie</span>` : ""}
        ${dep.justificatif ? `<span class="detail-justif"><a href="${dep.justificatif.webUrl}" target="_blank" rel="noopener">📎 ${escapeHtml(dep.justificatif.nom)}</a></span>` : ""}
      </div>
    `;
    itemDiv.addEventListener("click", () => ouvrirModal(dep));
    expenseList.appendChild(itemDiv);
  });
}

// ==========================================================
// Consultation des Garanties
// ==========================================================
function renderWarrantyConsultation() {
  const garanties = depenses.filter(d => d.garantie);
  const actifs = [];
  const expiries = [];
  
  garanties.forEach(g => {
    const status = calculerStatusGarantie(g);
    if (status === "expire") {
      expiries.push({ ...g, status });
    } else {
      actifs.push({ ...g, status });
    }
  });

  // Remplir les dropdowns de filtres
  remplirFiltresGarantie(garanties);

  // Appliquer les filtres
  const filterFournisseur = el("filterFournisseur").value;
  const filterStudio = el("filterStudio").value;
  const filterStatusGarantie = el("filterStatusGarantie").value;

  let actifsFilters = actifs;
  let expiriesFilters = expiries;

  if (filterFournisseur) {
    actifsFilters = actifsFilters.filter(g => g.fournisseurGarantie === filterFournisseur);
    expiriesFilters = expiriesFilters.filter(g => g.fournisseurGarantie === filterFournisseur);
  }
  if (filterStudio) {
    actifsFilters = actifsFilters.filter(g => g.unite === filterStudio);
    expiriesFilters = expiriesFilters.filter(g => g.unite === filterStudio);
  }
  if (filterStatusGarantie === "actif") {
    expiriesFilters = [];
  } else if (filterStatusGarantie === "expire") {
    actifsFilters = [];
  }

  renderWarrantyList(actifsFilters, "actif");
  renderWarrantyList(expiriesFilters, "expire");
}

function remplirFiltresGarantie(garanties) {
  const fournisseurs = new Set(garanties.map(g => g.fournisseurGarantie).filter(Boolean));
  const studios = new Set(garanties.map(g => g.unite).filter(Boolean));

  const selFournisseur = el("filterFournisseur");
  const selStudio = el("filterStudio");

  selFournisseur.innerHTML = '<option value="">Tous les fournisseurs</option>';
  Array.from(fournisseurs).sort().forEach(f => {
    const opt = document.createElement("option");
    opt.value = f;
    opt.textContent = f;
    selFournisseur.appendChild(opt);
  });

  selStudio.innerHTML = '<option value="">Tous les studios/immeubles</option>';
  Array.from(studios).sort().forEach(s => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    selStudio.appendChild(opt);
  });
}

function calculerStatusGarantie(g) {
  if (!g.dateFinGarantie) return "actif";
  const today = new Date();
  const dateEnd = new Date(g.dateFinGarantie + "T23:59:59");
  const daysLeft = Math.ceil((dateEnd - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) return "expire";
  if (daysLeft < 30) return "expire-bientot";
  return "actif";
}

function renderWarrantyList(garanties, typeList) {
  let container, titleEl;
  
  if (typeList === "actif") {
    container = el("warrantyListActive");
    titleEl = el("warrantyActiveList");
  } else {
    container = el("warrantyListExpired");
    titleEl = el("warrantyExpiredList");
  }

  if (!container) return;

  if (garanties.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune garantie.</p>';
    titleEl.style.display = "none";
    return;
  }

  titleEl.style.display = "block";
  container.innerHTML = "";

  garanties.forEach(g => {
    const status = calculerStatusGarantie(g);
    const statusLabel = {
      "actif": "✓ Actif",
      "expire-bientot": "⚠️ Expire bientôt",
      "expire": "❌ Expiré"
    }[status];

    const itemDiv = document.createElement("div");
    itemDiv.className = "warranty-item";
    itemDiv.innerHTML = `
      <div class="warranty-item-field">
        <div class="warranty-item-label">Fournisseur</div>
        <div class="warranty-item-value">${escapeHtml(g.fournisseurGarantie || "-")}</div>
      </div>
      <div class="warranty-item-field">
        <div class="warranty-item-label">Studio</div>
        <div class="warranty-item-value">${escapeHtml(g.unite)}</div>
      </div>
      <div class="warranty-item-field">
        <div class="warranty-item-label">Matériel</div>
        <div class="warranty-item-value">${escapeHtml(g.nature)}</div>
      </div>
      <div class="warranty-item-field">
        <div class="warranty-item-label">Montant</div>
        <div class="warranty-item-value">${g.montant.toFixed(2)}€</div>
      </div>
      <div class="warranty-item-field">
        <div class="warranty-item-label">Début</div>
        <div class="warranty-item-value">${g.dateDebutGarantie || "-"}</div>
      </div>
      <div class="warranty-item-field">
        <div class="warranty-item-label">Fin</div>
        <div class="warranty-item-value">${g.dateFinGarantie || "-"}</div>
      </div>
      <div class="warranty-item-field">
        <div class="warranty-item-label">Jours restants</div>
        <div class="warranty-item-value">${status === "expire" ? "0" : Math.ceil((new Date(g.dateFinGarantie + "T23:59:59") - new Date()) / (1000 * 60 * 60 * 24))}</div>
      </div>
      <div class="warranty-item-field">
        <div class="warranty-item-label">Statut</div>
        <div class="warranty-status ${status}">${statusLabel}</div>
      </div>
    `;
    container.appendChild(itemDiv);
  });
}

// ==========================================================
// Recherche par menu déroulant
// ==========================================================
function renderRecherche() {
  const searchImmeuble = el("searchFilterImmeuble").value;
  const searchStudio = el("searchFilterStudio").value;
  const searchFournisseur = el("searchFilterFournisseur").value;
  const searchStatut = el("searchFilterStatut").value;

  // Pré-remplir les dropdowns
  remplirFiltresRecherche();

  // Filtrer les dépenses
  let resultats = depenses;

  if (searchImmeuble) {
    resultats = resultats.filter(d => d.immeubleId === searchImmeuble);
  }
  if (searchStudio) {
    resultats = resultats.filter(d => d.unite === searchStudio);
  }
  if (searchFournisseur) {
    resultats = resultats.filter(d => d.fournisseur === searchFournisseur);
  }
  if (searchStatut) {
    resultats = resultats.filter(d => d.statut === searchStatut);
  }

  // Afficher résultats
  const container = el("searchResultsList");
  container.innerHTML = "";

  if (resultats.length === 0) {
    container.innerHTML = `<p style="color: #999; text-align: center;">Aucun résultat</p>`;
    return;
  }

  resultats.forEach(d => {
    const immeubleObj = IMMEUBLES.find(i => i.id === d.immeubleId);
    const immeubleNom = immeubleObj ? immeubleObj.nom : d.immeubleId;
    const statusDisplay = d.statut === "payé" ? "✓ Payé" : "⏳ À payer";
    const garantieDisplay = d.garantie ? "☑ Garantie" : "";

    const itemDiv = document.createElement("div");
    itemDiv.style.cssText = "padding: 12px; margin-bottom: 8px; background: #f5f5f5; border-radius: 8px; border-left: 4px solid #8b6f47;";
    itemDiv.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 4px;">${immeubleNom} - ${d.unite}</div>
      <div style="font-size: 0.9em; color: #666;">
        ${d.nature} | ${d.montant.toFixed(2)}€ | ${statusDisplay} ${garantieDisplay}
      </div>
      <div style="font-size: 0.85em; color: #999;">
        ${d.fournisseur || "N/A"} | ${d.date}
      </div>
    `;
    container.appendChild(itemDiv);
  });
}

function remplirFiltresRecherche() {
  // Immeubles
  const immeubleSelect = el("searchFilterImmeuble");
  if (immeubleSelect.children.length === 1) {  // Seulement option par défaut
    IMMEUBLES.forEach(i => {
      const opt = document.createElement("option");
      opt.value = i.id;
      opt.textContent = i.nom;
      immeubleSelect.appendChild(opt);
    });
  }

  // Studios
  const studios = [...new Set(depenses.map(d => d.unite))].filter(Boolean);
  const studioSelect = el("searchFilterStudio");
  if (studioSelect.children.length === 1) {
    studios.forEach(s => {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      studioSelect.appendChild(opt);
    });
  }

  // Fournisseurs
  const fournisseurs = [...new Set(depenses.map(d => d.fournisseur))].filter(Boolean);
  const fournisseurSelect = el("searchFilterFournisseur");
  if (fournisseurSelect.children.length === 1) {
    fournisseurs.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      fournisseurSelect.appendChild(opt);
    });
  }
}

// ==========================================================
// MODULE: Sauvegarde & synchronisation
// ==========================================================
function renderSauvegarde() {
  // Afficher le timestamp de dernière sauvegarde
  const lastSave = localStorage.getItem("depenses-immeubles-last-save");
  const lastSaveEl = el("lastSaveTime");
  
  if (lastSave) {
    lastSaveEl.textContent = "☁️ Sauvegardé automatiquement le " + lastSave;
  } else {
    lastSaveEl.textContent = "⏳ En attente de première sauvegarde";
  }
}

// ==========================================================
// Modal / formulaire
// ==========================================================
let factureGarantieChoisi = null;

function ouvrirModal(depense) {
  expenseForm.reset();
  factureGarantieChoisi = null;
  el("warrantyFields").style.display = "none";
  el("newFournisseurField").style.display = "none";

  if (depense) {
    el("modalTitle").textContent = "Modifier la dépense";
    el("fId").value = depense.id;
    el("fImmeuble").value = depense.immeubleId;
    renderUniteOptions();
    el("fUnite").value = depense.unite;
    el("fDate").value = depense.date;
    el("fMontant").value = depense.montant;
    el("fNature").value = depense.nature;
    el("fStatut").value = depense.statut;
    el("fFournisseur").value = depense.fournisseur || "";
    el("fDescription").value = depense.description || "";
    // PHASE 2: Charger l'ID facture lié
    el("fIdFacture").value = depense.idFacture || "";
    el("btnSupprimerDepense").style.display = "inline-block";

    // Remplir les champs de garantie
    if (depense.garantie) {
      el("fGarantie").checked = true;
      el("warrantyFields").style.display = "block";
      el("fFournisseurGarantie").value = depense.fournisseurGarantie || "";
      el("fDateDebutGarantie").value = depense.dateDebutGarantie || "";
      el("fDateFinGarantie").value = depense.dateFinGarantie || "";
    }
  } else {
    el("modalTitle").textContent = "Nouvelle dépense";
    el("fId").value = "";
    el("fImmeuble").value = filtreImmeuble;  // ← AJOUTER: pré-remplir l'immeuble sélectionné!
    renderUniteOptions();
    el("fDate").value = new Date().toISOString().slice(0, 10);
    el("fGarantie").checked = false;
    // PHASE 2: Réinitialiser idFacture pour nouvelle dépense
    el("fIdFacture").value = "";
    el("btnSupprimerDepense").style.display = "none";
  }

  modal.classList.add("open");
  modalBackdrop.classList.add("open");
}

function fermerModal() {
  modal.classList.remove("open");
  modalBackdrop.classList.remove("open");
}

async function soumettreFormulaire(e) {
  e.preventDefault();
  e.stopPropagation();
  
  const btnSubmit = expenseForm.querySelector("button[type='submit']");
  if (btnSubmit) btnSubmit.disabled = true;
  
  const id = el("fId").value || ("dep_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7));
  const depenseExistante = depenses.find(d => d.id === id);

  let fournisseurGarantieValue = el("fFournisseurGarantie").value;
  if (fournisseurGarantieValue === "custom") {
    fournisseurGarantieValue = (el("fFournisseurNouveau").value || "").trim();
    if (fournisseurGarantieValue && !fournisseursPersos.includes(fournisseurGarantieValue)) {
      fournisseursPersos.push(fournisseurGarantieValue);
      sauvegarderFournisseursPersos();
      renderFournisseurOptions();
    }
  }

  const depense = {
    id,
    immeubleId: el("fImmeuble").value,
    unite: el("fUnite").value,
    date: el("fDate").value,
    montant: parseFloat(el("fMontant").value) || 0,
    nature: el("fNature").value,
    statut: el("fStatut").value,
    fournisseur: el("fFournisseur").value.trim(),
    description: el("fDescription").value.trim(),
    garantie: el("fGarantie").checked,
    fournisseurGarantie: fournisseurGarantieValue || null,
    dateDebutGarantie: el("fDateDebutGarantie").value || null,
    dateFinGarantie: el("fDateFinGarantie").value || null,
    // PHASE 2: Lier la dépense à sa facture via idFacture
    idFacture: el("fIdFacture").value || ""
  };

  // Scan Facture déjà fait lors du clic Scanner - données déjà remplies
  // Pas besoin de re-scanner pendant l'enregistrement!
  
  // Si c'est une garantie → montrer pop-up de vérification
  if (depense.garantie && depense.dateDebutGarantie) {
    fermerModal();
    afficherPopupVerification(depense);
    if (btnSubmit) btnSubmit.disabled = false;
    return;
  }
  
  // Sinon enregistrer directement
  if (depenseExistante) {
    Object.assign(depenseExistante, depense);
  } else {
    depenses.push(depense);
  }

  showToast("✓ Dépense enregistrée");
  
  try {
    await sauvegarderDonnees();
  } finally {
    render();  // ← APPELER TOUJOURS!
  }
  
  // PHASE 3: Afficher bouton "Retour" au lieu de "Enregistrer"
  if (btnSubmit) {
    btnSubmit.disabled = false;
    btnSubmit.style.display = "none";  // Masquer "Enregistrer"
  }
  el("btnRetour").style.display = "inline-block";  // Afficher "Retour"
  el("btnAnnuler").style.display = "none";  // Masquer "Annuler"
}

async function fileToBase64(file) {
  console.log("🔵 fileToBase64 DÉBUT - file:", file.name, "type:", file.type, "size:", file.size);
  
  if (file.type === "application/pdf") {
    console.log("  → Traitement PDF...");
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        console.log("  → reader.onload triggered");
        const result = reader.result;
        console.log("  → result length:", result.length);
        const commaIdx = result.indexOf(",");
        console.log("  → commaIdx:", commaIdx);
        const base64 = result.slice(commaIdx + 1);
        console.log("  → base64 length après slice:", base64.length);
        if (!base64 || base64.length === 0) {
          console.error("  ❌ ERREUR: base64 PDF est VIDE!");
        }
        resolve({ base64, mimeType: "application/pdf" });
      };
      reader.onerror = (err) => {
        console.error("  ❌ reader.onerror:", err);
        reject(new Error("Impossible de lire le fichier PDF."));
      };
      console.log("  → Appel readAsDataURL...");
      reader.readAsDataURL(file);
    });
  }

  console.log("  → Traitement IMAGE...");
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    console.log("  → objectUrl créé:", objectUrl);
    const img = new Image();
    img.onload = () => {
      console.log("  → img.onload triggered");
      let { width, height } = img;
      console.log("  → dimensions originales:", width, "x", height);
      const TAILLE_MAX_COTE = 1800;
      if (width > TAILLE_MAX_COTE || height > TAILLE_MAX_COTE) {
        console.log("  → Redimensionnement nécessaire...");
        if (width >= height) {
          height = Math.round(height * (TAILLE_MAX_COTE / width));
          width = TAILLE_MAX_COTE;
        } else {
          width = Math.round(width * (TAILLE_MAX_COTE / height));
          height = TAILLE_MAX_COTE;
        }
        console.log("  → nouvelles dimensions:", width, "x", height);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      console.log("  → Canvas créé:", width, "x", height);
      const ctx = canvas.getContext("2d");
      console.log("  → Context 2D obtenu");
      ctx.drawImage(img, 0, 0, width, height);
      console.log("  → Image dessinée sur canvas");
      URL.revokeObjectURL(objectUrl);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      console.log("  → dataUrl créé. Length:", dataUrl.length);
      const commaIdx = dataUrl.indexOf(",");
      console.log("  → commaIdx:", commaIdx);
      const base64 = dataUrl.slice(commaIdx + 1);
      console.log("  → base64 length après slice:", base64.length);
      if (!base64 || base64.length === 0) {
        console.error("  ❌ ERREUR: base64 IMAGE est VIDE après slice!");
      }
      console.log("✓ fileToBase64 FIN - base64 length:", base64.length);
      resolve({ base64, mimeType: "image/jpeg" });
    };
    img.onerror = () => {
      console.error("  ❌ img.onerror triggered");
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Impossible de lire l'image."));
    };
    console.log("  → Assignation img.src...");
    img.src = objectUrl;
  });
}

// PHASE 2: Générer ID facture unique (FOURNISSEUR-YYYY-MM-DD-NUMERO)
function genererIdFacture(fournisseur, dateFacture) {
  const fournisseurNorm = (fournisseur || "UNKNOWN").toUpperCase().replace(/[^A-Z0-9]/g, "").substring(0, 10);
  const dateStr = dateFacture || new Date().toISOString().split("T")[0];
  const numero = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return `${fournisseurNorm}-${dateStr}-${numero}`;
}

async function callScanFactureWebhook(file) {
  try {
    console.log("Scan Facture: envoi facture...", file.name);
    showToast("🔵 Scan Facture en cours...");
    
    // Afficher barre de progression
    showScanProgress(true);
    updateScanProgress(10, "Lecture du fichier...");
    
    // Convertir en Base64
    const { base64: imageBase64, mimeType } = await fileToBase64(file);
    console.log("✓ fileToBase64 terminé. imageBase64 length:", imageBase64 ? imageBase64.length : "NULL");
    
    if (!imageBase64) {
      console.error("❌ ERREUR: imageBase64 est vide/null!");
      showToast("❌ ERREUR: impossible de lire l'image");
      showScanProgress(false);
      return null;
    }
    
    updateScanProgress(35, "Préparation du payload...");
    
    // Créer payload JSON
    const payload = {
      action: "analyser",
      filename: mimeType === "application/pdf" ? "facture.pdf" : "facture.jpg",
      mimeType,
      imageBase64  // ← v39 marchait AVEC ÇA - pas base64Source!
    };
    
    const jsonBody = JSON.stringify(payload);
    updateScanProgress(50, "Envoi au serveur...");
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);  // 60 secondes
    
    const response = await fetch(SCAN_FACTURE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: jsonBody,
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    updateScanProgress(75, "Traitement des données...");
    console.log("Scan Facture: réponse", response.status);
    
    if (!response.ok) {
      console.error("Webhook error status:", response.status);
      showToast(`❌ Webhook erreur ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    updateScanProgress(85, "Extraction des informations...");
    console.log("📦 WEBHOOK RETOUR COMPLET:", JSON.stringify(data, null, 2));
    console.log("📦 WEBHOOK KEYS:", Object.keys(data));
    showToast("✅ Données reçues!");
    
    // Extraire les bonnes clés (avec .value)
    const result = {};
    
    // Date facture
    if (data.date && data.date.value) {
      let dateExtracted = data.date.value;
      const m = String(dateExtracted).trim().match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        const [, jour, mois, annee] = m;
        dateExtracted = `${annee}-${mois.padStart(2, "0")}-${jour.padStart(2, "0")}`;
      }
      result.invoiceDate = dateExtracted;
    }
    
    // Montant TTC
    if (data.ttc && data.ttc.value) {
      result.totalAmount = parseFloat(data.ttc.value);
    }
    
    // Fournisseur
    if (data.fournisseur && data.fournisseur.value) {
      result.supplierName = data.fournisseur.value;
    }
    
    // PHASE 2: Générer ID facture unique et pré-remplir le formulaire
    if (result.invoiceDate && result.supplierName) {
      result.invoiceId = genererIdFacture(result.supplierName, result.invoiceDate);
      console.log("✓ ID Facture généré:", result.invoiceId);
      el("fIdFacture").value = result.invoiceId;
      showToast(`✓ ID Facture: ${result.invoiceId}`);
    }
    
    // Upload facture si extraction OK (sans bloquer)
    console.log("🔍 Avant upload check:", { 
      invoiceDate: !!result.invoiceDate, 
      file: !!file, 
      onedriveConnecte, 
      GraphStorage: !!window.GraphStorage 
    });
    
    if (result.invoiceDate && file && onedriveConnecte && window.GraphStorage) {
      console.log("✓ Upload check PASSED - tentative upload...");
      try {
        const fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            console.log("✓ FileReader OK, size:", reader.result.byteLength);
            resolve(reader.result);
          };
          reader.onerror = () => reject(new Error("Impossible de lire"));
          reader.readAsArrayBuffer(file);
        });
        const extension = file.name.split('.').pop() || 'pdf';
        console.log("📤 Appel GraphStorage.sauvegarderFactureScannee...");
        await GraphStorage.sauvegarderFactureScannee(
          fileData, `facture.${extension}`, result.invoiceDate, result.supplierName, result.totalAmount
        );
        console.log("✓✓✓ Upload réussi!");
        showToast("✓ Facture sauvegardée dans OneDrive");
      } catch (err) {
        console.error("❌ ERREUR UPLOAD FACTURE:", err.message, err);
        // NE PAS afficher le message "sauvegardée" - l'upload a échoué!
        showToast(`❌ ERREUR: Facture non sauvegardée (${err.message})`);
      }
    } else {
      console.log("❌ Upload check FAILED - pas d'upload");
      let raison = "❌ Upload ÉCHOUÉ: ";
      if (!result.invoiceDate) raison += "Date manquante ";
      if (!file) raison += "Fichier manquant ";
      if (!onedriveConnecte) raison += "OneDrive déconnecté ";
      if (!window.GraphStorage) raison += "GraphStorage indisponible";
      showToast(raison);
      
      // AFFICHER la structure EXACTE reçue pour déboguer
      const keysStr = Object.keys(data).join(", ");
      console.log("⚠️ STRUCTURE REÇUE:", keysStr);
      showToast(`📦 Clés reçues: ${keysStr}`);
    }
    
    if (!result.invoiceDate) {
      console.error("❌ Extraction échouée: invoiceDate manquant");
      console.error("Données complètes reçues:", data);
      showToast("❌ Date non trouvée - vérifier console");
    }
    
    updateScanProgress(100, "Terminé! ✓");
    setTimeout(() => showScanProgress(false), 1500);
    return result.invoiceDate ? result : null;
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("Scan Facture: timeout (60s)");
      showToast("❌ Timeout: webhook ne répond pas (60s)");
    } else {
      console.error("Scan Facture webhook error:", err.message);
      showToast(`❌ Erreur: ${err.message}`);
    }
    return null;
  }
}

function supprimerDepenseCourante() {
  const id = el("fId").value;
  if (!id) return;
  if (!confirm("Supprimer définitivement cette dépense ?")) return;
  depenses = depenses.filter(d => d.id !== id);
  sauvegarderDonnees();
  fermerModal();
  render();
  showToast("Dépense supprimée");
}

// ==========================================================
// Toast
// ==========================================================
let toastTimer = null;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
}

// Barre de progression Scan Facture
function showScanProgress(show) {
  // Détecter quel scan est en cours (Normal ou Garantie)
  const warrantyFields = document.getElementById("warrantyFields");
  const isWarranty = warrantyFields && warrantyFields.style.display !== "none";
  
  const containerWarranty = document.getElementById("scanProgressContainer");
  const containerNormal = document.getElementById("scanProgressContainerNormal");
  
  if (isWarranty) {
    // Scan Garantie: afficher la barre Garantie
    if (containerWarranty) containerWarranty.style.display = show ? "block" : "none";
    if (containerNormal) containerNormal.style.display = "none";
  } else {
    // Scan Normal: afficher la barre Normal
    if (containerNormal) containerNormal.style.display = show ? "block" : "none";
    if (containerWarranty) containerWarranty.style.display = "none";
  }
}

function updateScanProgress(percent, label) {
  // Détecter quel scan est en cours (Normal ou Garantie) - MÊME détection que showScanProgress!
  const warrantyFields = document.getElementById("warrantyFields");
  const isWarranty = warrantyFields && warrantyFields.style.display !== "none";
  
  let bar, percentText, labelText;
  
  if (isWarranty) {
    // Scan Garantie: chercher les éléments Garantie
    bar = document.getElementById("scanProgressBar");
    percentText = document.getElementById("scanProgressPercent");
    labelText = document.getElementById("scanProgressLabel");
  } else {
    // Scan Normal: chercher les éléments Normal
    bar = document.getElementById("scanProgressBarNormal");
    percentText = document.getElementById("scanProgressPercentNormal");
    labelText = document.getElementById("scanProgressLabelNormal");
  }
  
  // Mettre à jour les éléments trouvés
  if (bar) bar.style.width = percent + "%";
  if (percentText) percentText.textContent = percent + "%";
  if (labelText) labelText.textContent = label;
  
  console.log(`Scan progress: ${percent}% - ${label}`);
}

// ==========================================================
// Utilitaires
// =========================================================
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// ==========================================================
// Pop-up de vérification Scan Facture
// ==========================================================
let warrantyScanData = null; // Données du dernier scan

function afficherPopupVerification(depense) {
  warrantyScanData = null;
  
  const content = el("verifyContent");
  content.innerHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-weight: bold; width: 40%;">Date d'achat (facture):</td>
        <td style="padding: 12px;">${depense.date}</td>
      </tr>
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-weight: bold;">Montant TTC:</td>
        <td style="padding: 12px;">${depense.montant.toFixed(2)}€</td>
      </tr>
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-weight: bold;">Fournisseur:</td>
        <td style="padding: 12px;">${depense.fournisseurGarantie || "—"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #ddd;">
        <td style="padding: 12px; font-weight: bold;">Date début garantie:</td>
        <td style="padding: 12px;">${depense.dateDebutGarantie || "—"}</td>
      </tr>
      <tr>
        <td style="padding: 12px; font-weight: bold;">Date fin garantie:</td>
        <td style="padding: 12px;">${depense.dateFinGarantie || "—"}</td>
      </tr>
    </table>
    <div style="background: #fffacd; padding: 12px; border-radius: 6px; margin-top: 16px; border-left: 3px solid #ffd700;">
      <strong>⚠️ Vérifie ces données avant de confirmer!</strong>
    </div>
  `;
  
  warrantyScanData = depense;
  
  el("verifyModal").classList.add("open");
  el("verifyBackdrop").classList.add("open");
}

function fermerPopupVerification() {
  el("verifyModal").classList.remove("open");
  el("verifyBackdrop").classList.remove("open");
  warrantyScanData = null;
}

function attachEventsVerification() {
  el("btnCloseVerify").addEventListener("click", fermerPopupVerification);
  el("verifyBackdrop").addEventListener("click", fermerPopupVerification);
  
  el("btnCancelVerify").addEventListener("click", fermerPopupVerification);
  
  el("btnConfirmVerify").addEventListener("click", async () => {
    if (!warrantyScanData) return;
    
    // Enregistrer pour vrai AVANT de fermer la popup!
    const depense = warrantyScanData;
    const depenseExistante = depenses.find(d => d.id === depense.id);
    
    if (depenseExistante) {
      Object.assign(depenseExistante, depense);
    } else {
      depenses.push(depense);
    }
    
    fermerPopupVerification();  // ← FERMER APRÈS avoir enregistré!
    fermerModal();
    showToast("✓ Garantie enregistrée");
    
    try {
      await sauvegarderDonnees();
    } finally {
      render();  // ← APPELER TOUJOURS, même si OneDrive échoue!
    }
  });
}

// ==========================================================
// Événements
// ==========================================================
function attachEvents() {
  el("btnNouvelleDepense").addEventListener("click", () => ouvrirModal(null));
  el("btnCloseModal").addEventListener("click", fermerModal);
  el("btnAnnuler").addEventListener("click", fermerModal);
  el("btnRetour").addEventListener("click", afficherDialogueRetour);
  modalBackdrop.addEventListener("click", fermerModal);
  expenseForm.addEventListener("submit", soumettreFormulaire);
  el("btnSupprimerDepense").addEventListener("click", supprimerDepenseCourante);

  // Gestion warranty toggle
  el("fGarantie").addEventListener("change", (e) => {
    el("warrantyFields").style.display = e.target.checked ? "block" : "none";
  });

  // Bouton Scan Facture (Warranty)
  el("btnScanFactureWarranty").addEventListener("click", (e) => {
    e.preventDefault();
    el("fFactureGarantie").click();
  });

  el("fFactureGarantie").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    el("fGarantie").checked = true;  // ← COCHER GARANTIE!
    el("warrantyFields").style.display = "block";  // ← AFFICHER les champs de garantie!
    
    // STOCKER le fichier pour upload ultérieur
    factureGarantieChoisi = file;
    
    showToast("📄 Scan en cours...");
    const scanResult = await callScanFactureWebhook(file);
    
    if (scanResult) {
      // Remplir les champs automatiquement (COMME SCAN NORMAL + DATES GARANTIE!)
      if (scanResult.invoiceDate) {
        el("fDate").value = scanResult.invoiceDate; // Date d'achat
        el("fDateDebutGarantie").value = scanResult.invoiceDate; // Date début garantie (= date achat)
        
        // Calculer date fin (+2 ans)
        const dateEnd = new Date(scanResult.invoiceDate);
        dateEnd.setFullYear(dateEnd.getFullYear() + 2);
        el("fDateFinGarantie").value = dateEnd.toISOString().split("T")[0];
      }
      
      if (scanResult.totalAmount) {
        el("fMontant").value = scanResult.totalAmount.toFixed(2);
      }
      
      if (scanResult.supplierName) {
        el("fFournisseur").value = scanResult.supplierName; // Champ Normal (pas Garantie!)
      }
      
      // Générer et pré-remplir ID Facture (COMME NORMAL!)
      if (scanResult.invoiceId) {
        el("fIdFacture").value = scanResult.invoiceId;
        showToast(`✓ ID Facture: ${scanResult.invoiceId}`);
      }
      
      // Afficher résultat
      const resultDiv = el("scanResultWarranty");
      let messageFacture = "";
      if (onedriveConnecte) {
        messageFacture = `<br><small style="color: #2f7a55;">✓ Facture sauvegardée automatiquement dans OneDrive</small>`;
      } else {
        messageFacture = `<br><small style="color: #d97706;">⚠ Facture non sauvegardée (OneDrive non connecté)</small>`;
      }
      
      resultDiv.innerHTML = `
        <div style="background: #e4f3ea; padding: 12px; border-radius: 6px; border-left: 3px solid #2f7a55;">
          <strong>✓ Facture scannée avec succès!</strong><br>
          <small>Date: ${scanResult.invoiceDate} | Montant: ${scanResult.totalAmount?.toFixed(2) || "?"} € | Fournisseur: ${scanResult.supplierName || "?"}</small>
          ${messageFacture}
        </div>
      `;
      
      // Masquer le message vert après 60 secondes
      setTimeout(() => {
        resultDiv.innerHTML = "";
      }, 60000);
      
      showToast("✓ Données extraites — Vérifier avant enregistrement");
    } else {
      showToast("⚠️ Scan Facture indisponible — Remplis manuellement");
      el("scanResultWarranty").innerHTML = `
        <div style="background: #fff8e1; padding: 12px; border-radius: 6px; border-left: 3px solid #f57f17;">
          <strong>⚠️ Scan Facture indisponible</strong><br>
          <small>Remplis les champs manuellement ci-dessous.</small>
        </div>
      `;
    }
  });

  // PHASE 2: Scanner Facture pour dépenses NORMALES
  el("btnScanFactureNormal").addEventListener("click", (e) => {
    e.preventDefault();
    el("fFactureNormale").click();
  });

  el("fFactureNormale").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    showToast("📄 Scan en cours...");
    const scanResult = await callScanFactureWebhook(file);
    
    if (scanResult) {
      // Remplir les champs automatiquement
      if (scanResult.invoiceDate) {
        el("fDate").value = scanResult.invoiceDate; // Date d'achat
      }
      
      if (scanResult.totalAmount) {
        el("fMontant").value = scanResult.totalAmount.toFixed(2);
      }
      
      if (scanResult.supplierName) {
        el("fFournisseur").value = scanResult.supplierName;
      }
      
      // Générer et pré-remplir ID Facture
      if (scanResult.invoiceId) {
        el("fIdFacture").value = scanResult.invoiceId;
        showToast(`✓ ID Facture: ${scanResult.invoiceId}`);
      }
      
      // Afficher résultat (message vert avec détails)
      const resultDiv = el("scanResultNormal");
      let messageFacture = "";
      if (onedriveConnecte) {
        messageFacture = `<br><small style="color: #2f7a55;">✓ Facture sauvegardée automatiquement dans OneDrive</small>`;
      } else {
        messageFacture = `<br><small style="color: #d97706;">⚠ Facture non sauvegardée (OneDrive non connecté)</small>`;
      }
      
      resultDiv.innerHTML = `
        <div style="background: #e4f3ea; padding: 12px; border-radius: 6px; border-left: 3px solid #2f7a55;">
          <strong>✓ Facture scannée avec succès!</strong><br>
          <small>Date: ${scanResult.invoiceDate} | Montant: ${scanResult.totalAmount?.toFixed(2) || "?"} € | Fournisseur: ${scanResult.supplierName || "?"}</small>
          ${messageFacture}
        </div>
      `;
      
      // Masquer le message vert après 60 secondes
      setTimeout(() => {
        resultDiv.innerHTML = "";
      }, 60000);
      
      showToast("✓ Données extraites — Vérifier avant enregistrement");
    } else {
      showToast("⚠️ Scan Facture indisponible — Remplis manuellement");
    }
  });

  el("fFournisseurGarantie").addEventListener("change", (e) => {
    if (e.target.value === "custom") {
      el("newFournisseurField").style.display = "block";
    } else {
      el("newFournisseurField").style.display = "none";
    }
  });

  el("fDateDebutGarantie").addEventListener("change", () => {
    const dateDebut = el("fDateDebutGarantie").value;
    if (dateDebut) {
      const dateEnd = new Date(dateDebut + "T00:00:00");
      dateEnd.setFullYear(dateEnd.getFullYear() + 2);
      el("fDateFinGarantie").value = dateEnd.toISOString().split("T")[0];
    }
  });

  el("btnConnect").addEventListener("click", async () => {
    if (window.GraphAuth) {
      await GraphAuth.connecter();
    }
  });

  el("btnDisconnect").addEventListener("click", () => {
    if (window.GraphAuth) {
      GraphAuth.deconnecter();
      localStorage.clear();
      sessionStorage.clear();
      // majStatutConnexion(false); ← SUPPRIMER: économise crédits Microsoft Graph
      showToast("Déconnecté. Reconnexion en cours...");
      setTimeout(() => {
        GraphAuth.connecter();
      }, 1000);
    }
  });

  el("btnEnregistrerMaintenant").addEventListener("click", async () => {
    const btn = el("btnEnregistrerMaintenant");
    btn.disabled = true;
    btn.textContent = "Enregistrement...";
    try {
      await sauvegarderDonnees();
      showToast("✓ Données enregistrées");
    } catch (err) {
      showToast("Erreur lors de l'enregistrement");
    }
    btn.disabled = false;
    btn.textContent = "💾 Enregistrer maintenant";
  });

  // ← AJOUTER: Buttons du MODULE Sauvegarde
  el("btnSaveManualOneDrive").addEventListener("click", async () => {
    const btn = el("btnSaveManualOneDrive");
    btn.disabled = true;
    btn.textContent = "Préparation...";
    try {
      // Export via Share Sheet iOS (OneDrive)
      const data = JSON.stringify(depenses, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "depenses-immeubles.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("✓ Fichier prêt pour partage");
    } catch (err) {
      showToast("✗ Erreur préparation fichier");
      console.error(err);
    }
    btn.disabled = false;
    btn.textContent = "⬇️ Sauvegarde manuelle OneDrive";
  });

  el("btnSaveAutoOneDrive").addEventListener("click", async () => {
    const btn = el("btnSaveAutoOneDrive");
    btn.disabled = true;
    btn.textContent = "Sauvegarde...";
    try {
      await sauvegarderDonnees();
      showToast("✓ Sauvegardé sur OneDrive");
    } catch (err) {
      showToast("✗ Erreur sauvegarde");
      console.error(err);
    }
    btn.disabled = false;
    btn.textContent = "☁️ Sauvegarde automatique OneDrive";
  });

  el("btnImportFile").addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      try {
        const file = e.target.files[0];
        const text = await file.text();
        const imported = JSON.parse(text);
        depenses = imported;
        localStorage.setItem("depenses-immeubles-data", JSON.stringify(depenses));
        const ts = new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });
        localStorage.setItem("depenses-immeubles-last-save", ts);
        render();
        showToast("✓ Données importées");
      } catch (err) {
        showToast("✗ Erreur import fichier");
        console.error(err);
      }
    };
    input.click();
  });

  el("btnCloseSaveReminder").addEventListener("click", fermerBanniere);

  window.addEventListener("beforeunload", (e) => {
    if (localStorage.getItem("depenses-immeubles-tentative-envoi")) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  
  // ← AJOUTER: Event listeners pour les filtres DÉPENSES
  el("filterStatut").addEventListener("change", render);
  el("filterTri").addEventListener("change", render);
  
  // ← AJOUTER: Event listeners pour les filtres RECHERCHE
  el("searchFilterImmeuble").addEventListener("change", renderRecherche);
  el("searchFilterStudio").addEventListener("change", renderRecherche);
  el("searchFilterFournisseur").addEventListener("change", renderRecherche);
  el("searchFilterStatut").addEventListener("change", renderRecherche);
  
  // ← AJOUTER: Event listeners pour les filtres GARANTIES
  el("filterFournisseur").addEventListener("change", renderWarrantyConsultation);
  el("filterStudio").addEventListener("change", renderWarrantyConsultation);
  el("filterStatusGarantie").addEventListener("change", renderWarrantyConsultation);
  
  // Événements du pop-up de vérification
  attachEventsVerification();
}

// ==========================================================
// Reprise après fermeture iOS
// ==========================================================
async function verifierReprise() {
  const tentative = localStorage.getItem("depenses-immeubles-tentative-envoi");
  if (tentative) {
    try {
      const data = await chargerViaWebhook();
      const local = localStorage.getItem("depenses-immeubles-data");
      if (local && JSON.stringify(data) === local) {
        localStorage.removeItem("depenses-immeubles-tentative-envoi");
      } else {
        el("saveBanner").style.display = "block";
      }
    } catch (err) {
      el("saveBanner").style.display = "block";
    }
  }
}

// ==========================================================
// PHASE 3: Dialogue de confirmation avant retour
// ==========================================================
function afficherDialogueRetour() {
  const confirmed = confirm("⚠️ Avez-vous enregistré la dépense?\n\nCette action fermera la formulaire. Cliquez OK pour retourner à l'accueil.");
  
  if (confirmed) {
    // Réinitialiser les boutons
    el("btnEnregistrer").style.display = "inline-block";
    el("btnRetour").style.display = "none";
    el("btnAnnuler").style.display = "inline-block";
    
    // Fermer la modale et retour à l'accueil
    fermerModal();
    render();  // Rafraîchir la liste des dépenses
  }
}

// ==========================================================
// Démarrage

// ==========================================================
// Startup - DOMContentLoaded handler
// ==========================================================
document.addEventListener("DOMContentLoaded", async () => {
  init();
  afficherBanniere();
  
  if (window.GraphAuth) {
    const dejaConnecte = await GraphAuth.initSilencieux();
    if (dejaConnecte) {
      // majStatutConnexion(true); ← SUPPRIMER: économise crédits Microsoft Graph
      await chargerDonnees();
      await verifierReprise();
    }
  }
});
