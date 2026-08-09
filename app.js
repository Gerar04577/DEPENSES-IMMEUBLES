// ==========================================================
// Dépenses Immeubles — app.js
// Application indépendante (pas de lien avec VeroS / Gestion Loyers)
// ==========================================================

const APP_VERSION = "v7";
document.getElementById("versionLabel").textContent = APP_VERSION;

// ---- Référentiel des 7 immeubles et de leurs unités ----
// (repris de l'arborescence réelle OneDrive "Immobilier 2025-2026")
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

// ---- État en mémoire ----
let depenses = [];      // tableau des dépenses
let filtreImmeuble = "tous";
let onedriveConnecte = false;
let timerBanniere = null;        // timer pour bannière d'avertissement toutes les 10 min
let reminderVisible = false;    // état de la bannière

// ---- Éléments DOM ----
const el = (id) => document.getElementById(id);
const buildingTabs = el("buildingTabs");
const expenseList = el("expenseList");
const totalsRow = el("totalsRow");
const modal = el("expenseModal");
const modalBackdrop = el("modalBackdrop");
const expenseForm = el("expenseForm");
const toastEl = el("toast");

// ==========================================================
// Initialisation
// ==========================================================
function init() {
  renderBuildingTabs();
  renderSelectOptions();
  chargerDonnees();
  attachEvents();
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
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    filtreImmeuble = btn.dataset.immeuble;
    render();
  });
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

// ==========================================================
// Bannière d'avertissement "N'oubliez pas d'enregistrer"
// ==========================================================
function afficherBanniere() {
  const banner = el("saveReminder");
  if (!banner) return;
  banner.style.display = "flex";
  reminderVisible = true;
  // réaffichage auto toutes les 10 min
  clearTimeout(timerBanniere);
  timerBanniere = setTimeout(afficherBanniere, 10 * 60 * 1000);
}

function fermerBanniere() {
  const banner = el("saveReminder");
  if (!banner) return;
  banner.style.display = "none";
  reminderVisible = false;
  // timer ne s'arrête pas — la bannière réapparaîtra dans 10 min
}

// ==========================================================
// Chargement / sauvegarde des données
// ==========================================================
async function chargerDonnees() {
  // afficher l'horodatage persistant si présent
  const lastSave = localStorage.getItem("depenses-immeubles-last-save");
  if (lastSave) {
    el("lastSaveLabel").textContent = "OneDrive confirmé " + lastSave;
  }

  // 1. essai OneDrive si connecté
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
  // 2. repli localStorage
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
    } catch (err) {
      console.error("Échec sauvegarde OneDrive:", err);
      el("saveBanner").style.display = "block";
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
  
  // Récupérer et afficher le mail
  if (connecte && window.GraphAuth) {
    el("userEmail").textContent = "Chargement...";
    GraphAuth.obtenirMailUtilisateur().then(mail => {
      if (mail) {
        el("userEmail").textContent = mail;
      } else {
        el("userEmail").textContent = "(mail non disponible)";
      }
    }).catch(err => {
      console.error("Erreur mail:", err);
      el("userEmail").textContent = "(erreur)";
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
  totalsRow.innerHTML = "";

  IMMEUBLES.forEach(imm => {
    const liste = depenses.filter(d => d.immeubleId === imm.id);
    const total = liste.reduce((s, d) => s + Number(d.montant || 0), 0);
    if (filtreImmeuble !== "tous" && filtreImmeuble !== imm.id) return;
    const card = document.createElement("div");
    card.className = "total-card";
    card.innerHTML = `
      <span class="label">${imm.nom}</span>
      <span class="amount">${formatMontant(total)}</span>
      <span class="count">${liste.length} dépense${liste.length > 1 ? "s" : ""}</span>
    `;
    totalsRow.appendChild(card);
  });

  const totalGeneral = depenses.reduce((s, d) => s + Number(d.montant || 0), 0);
  const grand = document.createElement("div");
  grand.className = "total-card grand";
  grand.innerHTML = `
    <span class="label">Total général</span>
    <span class="amount">${formatMontant(totalGeneral)}</span>
    <span class="count">${depenses.length} dépense${depenses.length > 1 ? "s" : ""}</span>
  `;
  totalsRow.appendChild(grand);
}

function renderListe() {
  let liste = depensesFiltreesImmeuble();

  const recherche = el("filterSearch").value.trim().toLowerCase();
  if (recherche) {
    liste = liste.filter(d =>
      (d.unite || "").toLowerCase().includes(recherche) ||
      (d.nature || "").toLowerCase().includes(recherche) ||
      (d.fournisseur || "").toLowerCase().includes(recherche) ||
      (d.description || "").toLowerCase().includes(recherche)
    );
  }

  const statut = el("filterStatut").value;
  if (statut !== "tous") liste = liste.filter(d => d.statut === statut);

  const tri = el("filterTri").value;
  liste = [...liste].sort((a, b) => {
    if (tri === "date-desc") return b.date.localeCompare(a.date);
    if (tri === "date-asc") return a.date.localeCompare(b.date);
    if (tri === "montant-desc") return b.montant - a.montant;
    if (tri === "montant-asc") return a.montant - b.montant;
    return 0;
  });

  expenseList.innerHTML = "";
  if (liste.length === 0) {
    expenseList.innerHTML = `<p class="empty-state">Aucune dépense ne correspond.</p>`;
    return;
  }

  liste.forEach(d => {
    const imm = IMMEUBLES.find(i => i.id === d.immeubleId);
    const card = document.createElement("div");
    card.className = "expense-card" + (d.statut === "à payer" ? " statut-a-payer" : "");
    card.dataset.id = d.id;
    card.innerHTML = `
      <span class="ref">#${d.id.slice(-5).toUpperCase()}</span>
      <div class="main">
        <div class="top-line">
          <span class="nature">${escapeHtml(d.nature)}</span>
          <span class="unite">${imm ? imm.nom : "?"} · ${escapeHtml(d.unite)}</span>
        </div>
        ${d.description ? `<div class="desc">${escapeHtml(d.description)}</div>` : ""}
        <div class="meta-line">
          <span>${formatDate(d.date)}</span>
          ${d.fournisseur ? `<span>${escapeHtml(d.fournisseur)}</span>` : ""}
        </div>
        ${d.justificatif ? `<div class="badge-justif">📎 ${escapeHtml(d.justificatif.nom)}</div>` : ""}
      </div>
      <div class="amount-col">
        <div class="amount">${formatMontant(d.montant)}</div>
        <span class="badge-statut ${d.statut === 'payé' ? 'paye' : 'a-payer'}">${d.statut}</span>
      </div>
    `;
    card.addEventListener("click", () => ouvrirModal(d));
    expenseList.appendChild(card);
  });
}

function formatMontant(v) {
  return Number(v || 0).toLocaleString("fr-BE", { style: "currency", currency: "EUR" });
}
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

// ==========================================================
// Modal / formulaire
// ==========================================================
let justificatifChoisi = null; // File sélectionné en attente d'upload

function ouvrirModal(depense) {
  expenseForm.reset();
  justificatifChoisi = null;
  el("justificatifCourant").innerHTML = "";

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
  } else {
    el("modalTitle").textContent = "Nouvelle dépense";
    el("fId").value = "";
    el("fDate").value = new Date().toISOString().slice(0, 10);
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
  const id = el("fId").value || ("dep_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7));

  const depenseExistante = depenses.find(d => d.id === id);
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
    justificatif: depenseExistante ? depenseExistante.justificatif : null
  };

  // upload du justificatif si un nouveau fichier a été choisi
  if (justificatifChoisi) {
    if (onedriveConnecte && window.GraphStorage) {
      showToast("Envoi du justificatif...");
      try {
        const meta = await GraphStorage.televerserJustificatif(justificatifChoisi, id);
        depense.justificatif = meta; // {nom, webUrl, itemId}
      } catch (err) {
        console.error("Échec envoi justificatif:", err);
        showToast("Justificatif non envoyé (connecte-toi à OneDrive)");
      }
    } else {
      showToast("Connecte-toi à OneDrive pour joindre un justificatif");
    }
  }

  if (depenseExistante) {
    Object.assign(depenseExistante, depense);
  } else {
    depenses.push(depense);
  }

  await sauvegarderDonnees();
  fermerModal();
  render();
  showToast("Dépense enregistrée");
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

  el("filterSearch").addEventListener("input", renderListe);
  el("filterStatut").addEventListener("change", renderListe);
  el("filterTri").addEventListener("change", renderListe);

  el("btnConnect").addEventListener("click", async () => {
    if (window.GraphAuth) {
      await GraphAuth.connecter();
    }
  });

  el("btnDisconnect").addEventListener("click", () => {
    if (window.GraphAuth) {
      GraphAuth.deconnecter();
      // Vider TOUT le localStorage
      localStorage.clear();
      sessionStorage.clear();
      // Recharger la page pour reset complet
      window.location.reload();
    }
  });

  // Bouton d'enregistrement manuel
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

  // Fermeture de la bannière d'avertissement
  el("btnCloseSaveReminder").addEventListener("click", fermerBanniere);

  window.addEventListener("beforeunload", (e) => {
    if (localStorage.getItem("depenses-immeubles-tentative-envoi")) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

// ==========================================================
// Reprise après fermeture iOS pendant un envoi
// ==========================================================
async function verifierReprise() {
  const tentative = localStorage.getItem("depenses-immeubles-tentative-envoi");
  if (tentative && window.GraphAuth && GraphAuth.estConnecte()) {
    try {
      const data = await GraphStorage.chargerDepenses();
      // si la dernière sauvegarde locale correspond aux données OneDrive, on considère l'envoi réussi
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
  
  // Afficher la bannière d'avertissement au démarrage
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

// Force update: 2026-08-09 v3 release

// Force update: 2026-08-09 v7 - hard reset déconnexion et debug mail + disconnect
