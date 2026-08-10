// ==========================================================
// Dépenses Immeubles — app.js v11
// Warranty Management + Scan Facture Integration
// ==========================================================

const APP_VERSION = "v14";
const SCAN_FACTURE_WEBHOOK = "https://hook.eu1.make.com/5ggr1j45di4au52v8ob81ilkiou15a9d";

// ---- Référentiel des 7 immeubles et de leurs unités ----
const IMMEUBLES = [
  { id: "biche", nom: "Biche", unites: [
    "STUDIO 1","STUDIO 2","STUDIO 3","STUDIO 4","STUDIO 5","STUDIO 6",
    "STUDIO 7","STUDIO 8","STUDIO 9","STUDIO 10","STUDIO 11","APPARTEMENT"
  ]},
  { id: "nimy", nom: "Nimy", unites: [
    "Studio 1","Studio 2","Studio 3","Studio 4","Studio 5","Studio 6",
    "Studio 7","Studio 8 (Appartement)","Studio 9","Studio 10","Studio 11","RDC Commercial"
  ]},
  { id: "ptg", nom: "Petite Guirlande (PTG)", unites: [
    "Appartement 1er étage arrière","Appartement 3","Appartement RDC Guirlande",
    "Duplex","RDC Commercial","Studio 4","Studio 5","Studio 6","Studio 7","Studio 8","Studio 9","Studio 10"
  ]},
  { id: "havre", nom: "Havré", unites: [ "1er Etage","RDC" ]},
  { id: "egmont", nom: "Egmont", unites: [ "1er Etage","2e Etage","RDC" ]},
  { id: "fermette", nom: "Pourcelet Fermette", unites: [ "Studio 1","Studio 2","Studio 3","Studio 4" ]},
  { id: "vannes", nom: "Vannes", unites: [ "1er Etage","2e Etage","3e Etage","Garage","RDC" ]}
];

const NATURES = [
  "Plomberie","Électricité","Chauffage","Peinture","Mobilier","Menuiserie",
  "Nettoyage","Serrurerie","Toiture / étanchéité","Électroménager","Autre"
];

const FOURNISSEURS_DEFAULTS = [
  "ELDI","ACTION","BRICO PLAN IT","LIDL","MEDIAMARKT","EXTRA","KRËFE",
  "Leroy Merlin","Brico Dépôt"
];

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
  el("totalsPanel").style.display = view === "depenses" ? "block" : "none";
  el("actionsPanel").style.display = view === "depenses" ? "block" : "none";
  
  document.querySelectorAll(".tab[data-view]").forEach(t => t.classList.remove("active"));
  if (view === "garanties") {
    el("tabGaranties").classList.add("active");
    renderWarrantyConsultation();
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

  if (window.GraphAuth && GraphAuth.estConnecte()) {
    try {
      const data = await GraphStorage.chargerDepenses();
      depenses = data || [];
      onedriveConnecte = true;
      majStatutConnexion(true);
      render();
      return;
    } catch (err) {
      console.error("Échec lecture OneDrive, repli local:", err);
    }
  }
  const brut = localStorage.getItem("depenses-immeubles-data");
  depenses = brut ? JSON.parse(brut) : [];
  render();
}

async function sauvegarderDonnees() {
  localStorage.setItem("depenses-immeubles-data", JSON.stringify(depenses));
  const ts = new Date().toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  el("lastSaveLabel").textContent = "sauvegardé localement " + ts;

  if (onedriveConnecte && window.GraphStorage) {
    marquerTentativeEnvoi();
    try {
      await GraphStorage.sauvegarderDepenses(depenses);
      el("lastSaveLabel").textContent = "OneDrive confirmé " + ts;
      localStorage.setItem("depenses-immeubles-last-save", ts);
      el("saveBanner").style.display = "none";
      localStorage.removeItem("depenses-immeubles-tentative-envoi");
      showToast("✓ Sauvegardé sur OneDrive");
      
      if (el("saveReminder").style.display === "flex") {
        el("saveReminder").style.display = "none";
        setTimeout(() => {
          if (el("saveReminder").style.display === "none") {
            el("saveReminder").style.display = "flex";
          }
        }, 5000);
      }
    } catch (err) {
      console.error("Échec sauvegarde OneDrive:", err);
      el("saveBanner").style.display = "block";
      showToast("⚠️ Erreur sauvegarde OneDrive");
    }
  } else {
    localStorage.setItem("depenses-immeubles-last-save", ts);
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
}

function depensesFiltreesImmeuble() {
  if (filtreImmeuble === "tous") return depenses;
  return depenses.filter(d => d.immeubleId === filtreImmeuble);
}

function renderTotaux() {
  const deps = depensesFiltreesImmeuble();
  const totalPayé = deps.filter(d => d.statut === "payé").reduce((s, d) => s + d.montant, 0);
  const totalNonPayé = deps.filter(d => d.statut === "à payer").reduce((s, d) => s + d.montant, 0);
  const totalGeneral = deps.reduce((s, d) => s + d.montant, 0);

  totalsRow.innerHTML = `
    <div class="total-box">
      <span class="total-label">Payé</span>
      <span class="total-amount">${totalPayé.toFixed(2)}€</span>
    </div>
    <div class="total-box">
      <span class="total-label">À payer</span>
      <span class="total-amount">${totalNonPayé.toFixed(2)}€</span>
    </div>
    <div class="total-box total-box-highlight">
      <span class="total-label">TOTAL</span>
      <span class="total-amount">${totalGeneral.toFixed(2)}€</span>
    </div>
  `;
}

function renderListe() {
  const searchTxt = el("filterSearch").value.toLowerCase();
  const filtreStatut = el("filterStatut").value;
  const triOption = el("filterTri").value;

  let deps = depensesFiltreesImmeuble();

  if (searchTxt) {
    deps = deps.filter(d =>
      d.unite.toLowerCase().includes(searchTxt) ||
      d.nature.toLowerCase().includes(searchTxt) ||
      (d.fournisseur && d.fournisseur.toLowerCase().includes(searchTxt)) ||
      (d.description && d.description.toLowerCase().includes(searchTxt))
    );
  }

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
    itemDiv.innerHTML = `
      <div class="expense-header">
        <span class="expense-unite">${escapeHtml(dep.unite)}</span>
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
// Modal / formulaire
// ==========================================================
let justificatifChoisi = null;
let factureGarantieChoisi = null;

function ouvrirModal(depense) {
  expenseForm.reset();
  justificatifChoisi = null;
  factureGarantieChoisi = null;
  el("justificatifCourant").innerHTML = "";
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
    el("btnSupprimerDepense").style.display = "inline-block";
    
    if (depense.justificatif) {
      el("justificatifCourant").innerHTML =
        `Actuel : <a href="${depense.justificatif.webUrl}" target="_blank" rel="noopener">${escapeHtml(depense.justificatif.nom)}</a>`;
    }

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
    el("fDate").value = new Date().toISOString().slice(0, 10);
    el("fGarantie").checked = false;
    renderUniteOptions();
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
    justificatif: depenseExistante ? depenseExistante.justificatif : null,
    garantie: el("fGarantie").checked,
    fournisseurGarantie: fournisseurGarantieValue || null,
    dateDebutGarantie: el("fDateDebutGarantie").value || null,
    dateFinGarantie: el("fDateFinGarantie").value || null
  };

  // Upload justificatif
  if (justificatifChoisi) {
    if (onedriveConnecte && window.GraphStorage) {
      showToast("Envoi du justificatif...");
      try {
        const meta = await GraphStorage.televerserJustificatif(justificatifChoisi, id);
        depense.justificatif = meta;
      } catch (err) {
        console.error("Échec envoi justificatif:", err);
        showToast("Justificatif non envoyé (connecte-toi à OneDrive)");
      }
    } else {
      showToast("Connecte-toi à OneDrive pour joindre un justificatif");
    }
  }

  // Scan Facture (garantie) — amélioration avec fallback
  if (depense.garantie && factureGarantieChoisi) {
    showToast("📄 Lecture facture (Scan Facture)...");
    try {
      const dateExtracted = await callScanFactureWebhook(factureGarantieChoisi);
      if (dateExtracted) {
        depense.dateDebutGarantie = dateExtracted;
        // Calculer fin garantie
        const dateEnd = new Date(dateExtracted);
        dateEnd.setFullYear(dateEnd.getFullYear() + 2);
        depense.dateFinGarantie = dateEnd.toISOString().split("T")[0];
        showToast("✓ Dates garantie calculées automatiquement");
      } else {
        console.warn("Scan Facture: pas de date extraite");
        showToast("⚠️ Scan Facture indisponible — remplis les dates manuellement");
      }
    } catch (err) {
      console.error("Échec Scan Facture webhook:", err.message);
      showToast("⚠️ Scan Facture indisponible — remplis les dates manuellement");
    }
  }

  // Si c'est une garantie → montrer pop-up de vérification
  if (depense.garantie && depense.dateDebutGarantie) {
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

  fermerModal();
  showToast("✓ Dépense enregistrée");
  await sauvegarderDonnees();
  render();
  
  if (btnSubmit) btnSubmit.disabled = false;
}

async function fileToBase64(file) {
  if (file.type === "application/pdf") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const commaIdx = result.indexOf(",");
        resolve({ base64: result.slice(commaIdx + 1), mimeType: "application/pdf" });
      };
      reader.onerror = () => reject(new Error("Impossible de lire le fichier PDF."));
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const TAILLE_MAX_COTE = 1800;
      if (width > TAILLE_MAX_COTE || height > TAILLE_MAX_COTE) {
        if (width >= height) {
          height = Math.round(height * (TAILLE_MAX_COTE / width));
          width = TAILLE_MAX_COTE;
        } else {
          width = Math.round(width * (TAILLE_MAX_COTE / height));
          height = TAILLE_MAX_COTE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
      const commaIdx = dataUrl.indexOf(",");
      resolve({ base64: dataUrl.slice(commaIdx + 1), mimeType: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Impossible de lire l'image."));
    };
    img.src = objectUrl;
  });
}

async function callScanFactureWebhook(file) {
  try {
    console.log("Scan Facture: envoi facture...", file.name);
    
    // Convertir en Base64
    const { base64: imageBase64, mimeType } = await fileToBase64(file);
    console.log("✓ fileToBase64 terminé. imageBase64 length:", imageBase64 ? imageBase64.length : "NULL");
    console.log("✓ mimeType:", mimeType);
    
    if (!imageBase64) {
      console.error("❌ ERREUR: imageBase64 est vide/null!");
      return null;
    }
    
    // Créer payload JSON (comme Scan Facture)
    const payload = {
      action: "analyser",
      filename: mimeType === "application/pdf" ? "facture.pdf" : "facture.jpg",
      mimeType,
      base64Source: imageBase64
    };
    
    console.log("✓ Payload créé. Clés présentes:", Object.keys(payload));
    console.log("✓ base64Source présent dans payload?", "base64Source" in payload);
    console.log("✓ base64Source length:", payload.base64Source ? payload.base64Source.length : "NULL");
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    
    console.log("→ Envoi webhook...", SCAN_FACTURE_WEBHOOK);
    
    const jsonBody = JSON.stringify(payload);
    console.log("✓ JSON stringifié. Length:", jsonBody.length);
    console.log("✓ Premiers 200 char du JSON:", jsonBody.slice(0, 200));
    
    const response = await fetch(SCAN_FACTURE_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeout);
    console.log("Scan Facture: réponse", response.status);
    
    if (!response.ok) {
      console.error("Webhook error status:", response.status);
      return null;
    }
    
    const data = await response.json();
    console.log("Scan Facture: données reçues", data);
    
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
      console.log("✓ Date facture:", dateExtracted);
    }
    
    // Montant TTC
    if (data.ttc && data.ttc.value) {
      result.totalAmount = parseFloat(data.ttc.value);
      console.log("✓ Montant TTC:", result.totalAmount);
    }
    
    // Fournisseur
    if (data.fournisseur && data.fournisseur.value) {
      result.supplierName = data.fournisseur.value;
      console.log("✓ Fournisseur:", result.supplierName);
    }
    
    return result.invoiceDate ? result : null;
  } catch (err) {
    if (err.name === "AbortError") {
      console.error("Scan Facture: timeout (15s)");
    } else {
      console.error("Scan Facture webhook error:", err.message);
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

// ==========================================================
// Utilitaires
// ==========================================================
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
  
  el("verifyModal").style.display = "block";
  el("verifyBackdrop").style.display = "block";
}

function fermerPopupVerification() {
  el("verifyModal").style.display = "none";
  el("verifyBackdrop").style.display = "none";
  warrantyScanData = null;
}

function attachEventsVerification() {
  el("btnCloseVerify").addEventListener("click", fermerPopupVerification);
  el("verifyBackdrop").addEventListener("click", fermerPopupVerification);
  
  el("btnCancelVerify").addEventListener("click", fermerPopupVerification);
  
  el("btnConfirmVerify").addEventListener("click", async () => {
    if (!warrantyScanData) return;
    
    fermerPopupVerification();
    
    // Enregistrer pour vrai
    const depense = warrantyScanData;
    const depenseExistante = depenses.find(d => d.id === depense.id);
    
    if (depenseExistante) {
      Object.assign(depenseExistante, depense);
    } else {
      depenses.push(depense);
    }
    
    fermerModal();
    showToast("✓ Garantie enregistrée");
    await sauvegarderDonnees();
    render();
  });
}

// ==========================================================
// Événements
// ==========================================================
function attachEvents() {
  el("btnNouvelleDepense").addEventListener("click", () => ouvrirModal(null));
  el("btnCloseModal").addEventListener("click", fermerModal);
  el("btnAnnuler").addEventListener("click", fermerModal);
  modalBackdrop.addEventListener("click", fermerModal);
  expenseForm.addEventListener("submit", soumettreFormulaire);
  el("btnSupprimerDepense").addEventListener("click", supprimerDepenseCourante);

  el("fJustificatif").addEventListener("change", (e) => {
    justificatifChoisi = e.target.files[0] || null;
  });

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
    
    showToast("📄 Scan en cours...");
    const scanResult = await callScanFactureWebhook(file);
    
    if (scanResult) {
      // Remplir les champs automatiquement
      if (scanResult.invoiceDate) {
        el("fDate").value = scanResult.invoiceDate; // Date d'achat
        el("fDateDebutGarantie").value = scanResult.invoiceDate; // Date début garantie
        
        // Calculer date fin (+2 ans)
        const dateEnd = new Date(scanResult.invoiceDate);
        dateEnd.setFullYear(dateEnd.getFullYear() + 2);
        el("fDateFinGarantie").value = dateEnd.toISOString().split("T")[0];
      }
      
      if (scanResult.totalAmount) {
        el("fMontant").value = scanResult.totalAmount.toFixed(2);
      }
      
      if (scanResult.supplierName) {
        // Chercher le fournisseur dans la liste
        const options = Array.from(el("fFournisseurGarantie").options);
        const found = options.find(opt => opt.text === scanResult.supplierName);
        if (found) {
          el("fFournisseurGarantie").value = found.value;
        } else {
          el("fFournisseurGarantie").value = ""; // Laisser blank si pas trouvé
        }
      }
      
      // Afficher résultat
      const resultDiv = el("scanResultWarranty");
      resultDiv.innerHTML = `
        <div style="background: #e4f3ea; padding: 12px; border-radius: 6px; border-left: 3px solid #2f7a55;">
          <strong>✓ Facture scannée avec succès!</strong><br>
          <small>Date: ${scanResult.invoiceDate} | Montant: ${scanResult.totalAmount?.toFixed(2) || "?"} € | Fournisseur: ${scanResult.supplierName || "?"}</small>
        </div>
      `;
      
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

  el("fFactureGarantie").addEventListener("change", (e) => {
    factureGarantieChoisi = e.target.files[0] || null;
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

  el("filterSearch").addEventListener("input", renderListe);
  el("filterStatut").addEventListener("change", renderListe);
  el("filterTri").addEventListener("change", renderListe);

  el("filterFournisseur").addEventListener("change", renderWarrantyConsultation);
  el("filterStudio").addEventListener("change", renderWarrantyConsultation);
  el("filterStatusGarantie").addEventListener("change", renderWarrantyConsultation);

  el("btnConnect").addEventListener("click", async () => {
    if (window.GraphAuth) {
      await GraphAuth.connecter();
    }
  });

  el("btnDisconnect").addEventListener("click", async () => {
    if (window.GraphAuth) {
      GraphAuth.deconnecter();
      localStorage.clear();
      sessionStorage.clear();
      majStatutConnexion(false);
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

  el("btnCloseSaveReminder").addEventListener("click", fermerBanniere);

  window.addEventListener("beforeunload", (e) => {
    if (localStorage.getItem("depenses-immeubles-tentative-envoi")) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  
  // Événements du pop-up de vérification
  attachEventsVerification();
}

// ==========================================================
// Reprise après fermeture iOS
// ==========================================================
async function verifierReprise() {
  const tentative = localStorage.getItem("depenses-immeubles-tentative-envoi");
  if (tentative && window.GraphAuth && GraphAuth.estConnecte()) {
    try {
      const data = await GraphStorage.chargerDepenses();
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
// Démarrage
// ==========================================================
document.addEventListener("DOMContentLoaded", async () => {
  init();
  afficherBanniere();
  
  if (window.GraphAuth) {
    const dejaConnecte = await GraphAuth.initSilencieux();
    if (dejaConnecte) {
      majStatutConnexion(true);
      await chargerDonnees();
      await verifierReprise();
    }
  }
});

// Force update: 2026-08-10 v11 - warranty management with Scan Facture integration
