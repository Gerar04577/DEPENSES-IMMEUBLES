// ==========================================================
// graph-auth.js — OAuth 2.0 + PKCE pour Microsoft Graph
// Codé à la main, sans librairie ni CDN (même principe que VeroS
// et Gestion Loyers). Compte Microsoft personnel uniquement.
// ==========================================================
//
// À REMPLIR PAR GÉRARD après création de l'inscription Entra
// "Dépenses Immeubles" (comptes personnels uniquement) :
//   - GRAPH_CLIENT_ID : l'ID d'application (client)
//   - REDIRECT_URI     : l'URL GitHub Pages exacte de l'app
//
const GRAPH_CLIENT_ID = "745262b4-1b37-47de-ab19-491d7e1258a1";
const GRAPH_REDIRECT_URI = window.location.origin + window.location.pathname;
const GRAPH_AUTHORITY = "https://login.microsoftonline.com/consumers";
const GRAPH_SCOPES = "Files.ReadWrite offline_access";

const LS_REFRESH_TOKEN = "di-graph-refresh-token";
const SS_ACCESS_TOKEN = "di-graph-access-token";
const SS_ACCESS_EXP = "di-graph-access-exp";
const SS_PKCE_VERIFIER = "di-graph-pkce-verifier";
const SS_STATE = "di-graph-state";

const GraphAuth = (() => {

  function estConnecte() {
    return !!(sessionStorage.getItem(SS_ACCESS_TOKEN) || localStorage.getItem(LS_REFRESH_TOKEN));
  }

  // ---- PKCE helpers ----
  function genererChaineAleatoire(longueur = 64) {
    const array = new Uint8Array(longueur);
    crypto.getRandomValues(array);
    return Array.from(array, b => ("0" + b.toString(16)).slice(-2)).join("").slice(0, longueur);
  }

  async function sha256Base64Url(texte) {
    const encoder = new TextEncoder();
    const data = encoder.encode(texte);
    const hash = await crypto.subtle.digest("SHA-256", data);
    let binaire = "";
    new Uint8Array(hash).forEach(b => binaire += String.fromCharCode(b));
    return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // ---- Démarrage du flux de connexion (redirection) ----
  async function connecter() {
    const verifier = genererChaineAleatoire(64);
    const challenge = await sha256Base64Url(verifier);
    const state = genererChaineAleatoire(24);

    sessionStorage.setItem(SS_PKCE_VERIFIER, verifier);
    sessionStorage.setItem(SS_STATE, state);

    const params = new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      response_type: "code",
      redirect_uri: GRAPH_REDIRECT_URI,
      response_mode: "query",
      scope: GRAPH_SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256"
    });

    window.location.href = `${GRAPH_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  // ---- Retour de redirection : échange du code contre un token ----
  async function traiterRetourRedirection() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) return false;

    const stateAttendu = sessionStorage.getItem(SS_STATE);
    if (state !== stateAttendu) {
      console.error("État PKCE invalide — abandon");
      return false;
    }
    const verifier = sessionStorage.getItem(SS_PKCE_VERIFIER);

    const body = new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: GRAPH_REDIRECT_URI,
      code_verifier: verifier
    });

    const resp = await fetch(`${GRAPH_AUTHORITY}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!resp.ok) {
      console.error("Échec échange code->token", await resp.text());
      return false;
    }
    const data = await resp.json();
    enregistrerTokens(data);

    // nettoyer l'URL (retirer code/state) sans recharger la page
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("session_state");
    window.history.replaceState({}, document.title, url.pathname + url.hash);
    return true;
  }

  function enregistrerTokens(data) {
    sessionStorage.setItem(SS_ACCESS_TOKEN, data.access_token);
    sessionStorage.setItem(SS_ACCESS_EXP, String(Date.now() + (data.expires_in - 60) * 1000));
    if (data.refresh_token) {
      localStorage.setItem(LS_REFRESH_TOKEN, data.refresh_token);
    }
  }

  // ---- Rafraîchissement silencieux via refresh_token ----
  async function rafraichirToken() {
    const refreshToken = localStorage.getItem(LS_REFRESH_TOKEN);
    if (!refreshToken) return false;

    const body = new URLSearchParams({
      client_id: GRAPH_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: GRAPH_SCOPES
    });

    const resp = await fetch(`${GRAPH_AUTHORITY}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!resp.ok) {
      localStorage.removeItem(LS_REFRESH_TOKEN);
      return false;
    }
    const data = await resp.json();
    enregistrerTokens(data);
    return true;
  }

  // ---- Jeton d'accès valide, rafraîchi si besoin ----
  async function obtenirAccessToken() {
    const exp = Number(sessionStorage.getItem(SS_ACCESS_EXP) || 0);
    const token = sessionStorage.getItem(SS_ACCESS_TOKEN);
    if (token && Date.now() < exp) return token;

    const ok = await rafraichirToken();
    if (!ok) throw new Error("Session OneDrive expirée — reconnexion nécessaire");
    return sessionStorage.getItem(SS_ACCESS_TOKEN);
  }

  // ---- Initialisation silencieuse au chargement de la page ----
  async function initSilencieux() {
    const traite = await traiterRetourRedirection();
    if (traite) return true;

    if (sessionStorage.getItem(SS_ACCESS_TOKEN)) return true;
    if (localStorage.getItem(LS_REFRESH_TOKEN)) {
      return await rafraichirToken();
    }
    return false;
  }

  function deconnecter() {
    sessionStorage.removeItem(SS_ACCESS_TOKEN);
    sessionStorage.removeItem(SS_ACCESS_EXP);
    localStorage.removeItem(LS_REFRESH_TOKEN);
  }

  async function obtenirMailUtilisateur() {
    const token = await obtenirAccessToken();
    console.log("obtenirMailUtilisateur - token:", token ? "présent" : "absent");
    if (!token) {
      console.log("pas de token pour récupérer le mail");
      return null;
    }
    try {
      const resp = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { "Authorization": `Bearer ${token}` }
      });
      console.log("Microsoft Graph /me response:", resp.status);
      if (!resp.ok) {
        console.log("erreur Microsoft Graph:", resp.status, resp.statusText);
        return null;
      }
      const data = await resp.json();
      const mail = data.userPrincipalName || data.mail;
      console.log("Mail récupéré:", mail);
      return mail;
    } catch (err) {
      console.error("Erreur récupération mail:", err);
      return null;
    }
  }

  return { connecter, deconnecter, estConnecte, obtenirAccessToken, initSilencieux, obtenirMailUtilisateur };
})();

window.GraphAuth = GraphAuth;

// Force update: 2026-08-09 v6 - debug logging pour mail
