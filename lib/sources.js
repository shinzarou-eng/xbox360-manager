// Registre de sources de contenu.
//
// POURQUOI CE MODULE
// Les sources etaient cablees en dur dans le serveur : archive.org ici, Vimm
// la-bas, chacune avec son endpoint et sa logique de parsing. Consequences :
// il fallait modifier le coeur du programme pour ajouter une source, et la
// nature des sources disponibles etait une decision de l'auteur, pas de
// l'utilisateur.
//
// Ici, une source est un fichier autonome dans sources/ qui respecte un contrat.
// La charge utile (le repertoire de l'utilisateur, un partage reseau, un
// service public) devient une affaire de configuration, et le coeur du
// programme reste un gestionnaire de bibliotheque.
//
// CONTRAT — un module de sources/ exporte :
//   id           identifiant unique, slug (obligatoire)
//   nom          nom affiche dans l'interface (obligatoire)
//   description  une phrase expliquant d'ou viennent les donnees (obligatoire)
//   nature       'libre'      : contenu libre ou fourni par l'utilisateur
//                'utilisateur': fichiers que l'utilisateur possede deja
//                'tiers'      : service externe (l'utilisateur reste responsable)
//   search(q, opts, cb)  -> cb(err, [{ id, titre, taille }])            (obligatoire)
//   files(itemId, cb)    -> cb(err, [{ nom, taille, url|path }])        (optionnel)
//
// DEUX FONCTIONS FACULTATIVES DE PLUS, pour les sources qui tiennent leur
// catalogue dans un INDEX ECRIT PAR L'APPLICATION (voir lib/ztm.js) :
//   etatIndex()          -> { construit, fichiers, ... } | null   (sans reseau)
//   rafraichirIndex(cb)  -> cb(err, etat)                          (reconstruit)
// Elles ne sont pas dans `metadonnees` : ce sont des ACTIONS, pas de la
// description, et une source qui n'a pas d'index n'en a pas besoin. Le serveur les
// relaie par une route generique — il ne connait aucun catalogue en particulier.
//
// Le chargement est DEFENSIF : une source cassee est signalee et ignoree, elle
// n'empeche ni le demarrage du serveur ni le chargement des autres sources.
// C'est le point qui compte si l'on veut que des contributeurs ajoutent des
// fichiers sans pouvoir casser l'application.
const fs = require('fs');
const path = require('path');

const NATURES = ['libre', 'utilisateur', 'tiers'];
const ID_VALIDE = /^[a-z0-9][a-z0-9-]{1,30}$/;

// Verifie le contrat. Rend { ok: true } ou { ok: false, raison }.
function valider(mod, nomFichier) {
  if (!mod || typeof mod !== 'object') return { ok: false, raison: 'n\'exporte pas d\'objet' };
  if (!mod.id || typeof mod.id !== 'string') return { ok: false, raison: 'champ `id` manquant' };
  if (!ID_VALIDE.test(mod.id)) return { ok: false, raison: '`id` invalide (minuscules, chiffres et tirets uniquement) : ' + mod.id };
  if (!mod.nom || typeof mod.nom !== 'string') return { ok: false, raison: 'champ `nom` manquant' };
  if (!mod.description || typeof mod.description !== 'string') return { ok: false, raison: 'champ `description` manquant' };
  if (typeof mod.search !== 'function') return { ok: false, raison: 'fonction `search` manquante' };
  if (mod.nature !== undefined && !NATURES.includes(mod.nature)) {
    return { ok: false, raison: '`nature` doit valoir ' + NATURES.join(' | ') };
  }
  if (mod.files !== undefined && typeof mod.files !== 'function') return { ok: false, raison: '`files` doit etre une fonction' };
  return { ok: true };
}

// Charge les sources d'un dossier. Ne leve jamais : rend la liste des modules
// valides, plus le detail de ce qui a ete rejete (pour pouvoir le dire a
// l'utilisateur au lieu d'echouer en silence).
function charger(dossier) {
  const sources = [];
  const rejets = [];
  let fichiers = [];
  try {
    fichiers = fs.readdirSync(dossier).filter(f => f.endsWith('.js')).sort();
  } catch (e) {
    return { sources, rejets: [{ fichier: dossier, raison: 'dossier illisible : ' + e.message }] };
  }

  const vus = new Map();
  for (const f of fichiers) {
    const complet = path.join(dossier, f);
    let mod;
    try {
      mod = require(complet);
    } catch (e) {
      rejets.push({ fichier: f, raison: 'erreur de chargement : ' + e.message });
      continue;
    }
    const v = valider(mod, f);
    if (!v.ok) { rejets.push({ fichier: f, raison: v.raison }); continue; }
    if (vus.has(mod.id)) {
      rejets.push({ fichier: f, raison: 'identifiant deja utilise par ' + vus.get(mod.id) });
      continue;
    }
    vus.set(mod.id, f);
    sources.push({
      id: mod.id,
      nom: mod.nom,
      description: mod.description,
      nature: mod.nature || 'tiers',
      peutListerFichiers: typeof mod.files === 'function',
      search: mod.search,
      files: mod.files,
      // Facultatives, et transportees telles quelles : le chargeur ne doit pas
      // devenir le recenseur de ce qu'une source peut faire de plus.
      etatIndex: typeof mod.etatIndex === 'function' ? mod.etatIndex : null,
      rafraichirIndex: typeof mod.rafraichirIndex === 'function' ? mod.rafraichirIndex : null
    });
  }
  sources.sort((a, b) => a.id.localeCompare(b.id));
  return { sources, rejets };
}

// Metadonnees seules : ce qu'on expose a l'interface, sans les fonctions
// (donc serialisable en JSON).
const metadonnees = sources => sources.map(s => ({
  id: s.id, nom: s.nom, description: s.description,
  nature: s.nature, peutListerFichiers: s.peutListerFichiers
}));

const parId = (sources, id) => sources.find(s => s.id === id) || null;

// Interroge plusieurs sources en parallele. Une source qui echoue ou depasse le
// delai ne bloque pas les autres : on rend ce qu'on a, avec les erreurs a part.
function chercherTout(sources, q, opts, cb) {
  const resultats = [];
  const erreurs = [];
  const limite = (opts && opts.timeout) || 20000;
  let restant = sources.length;
  if (!restant) return cb(null, { resultats, erreurs });

  const fini = () => { if (--restant === 0) cb(null, { resultats, erreurs }); };

  for (const s of sources) {
    let termine = false;
    const uneFois = (err, items) => {
      if (termine) return; // une source mal ecrite ne doit pas compter deux fois
      termine = true;
      clearTimeout(minuteur);
      if (err) erreurs.push({ source: s.id, erreur: err.message || String(err) });
      else if (Array.isArray(items)) {
        for (const it of items) resultats.push({ ...it, source: s.id });
      }
      fini();
    };
    const minuteur = setTimeout(() => uneFois(new Error('delai depasse (' + limite + ' ms)')), limite);
    try { s.search(q, opts || {}, uneFois); }
    catch (e) { uneFois(e); }
  }
}

module.exports = { charger, valider, metadonnees, parId, chercherTout, NATURES, ID_VALIDE };
