// Index local du catalogue ZapTeaM (ZTM) heberge sur archive.org.
//
// POURQUOI UN INDEX ECRIT SUR LE DISQUE, ET PAS UNE RECHERCHE EN LIGNE.
// Mesure du 2026-09-20 (`advancedsearch.php`) : archive.org n'indexe PAS les noms
// de fichiers. `q=Dark.Souls.1.DLC.RF.X360-ZTM` rend numFound=0, et `q=ZTM` rend
// 232 resultats sans rapport (« Zero To Mastery » : cours de deep learning). Un
// release ZTM est donc impossible a trouver par une requete : la seule voie est
// de lire les items du deposant et de filtrer EN LOCAL. Ces items portent 3 200
// releases a eux seuls, et une recherche est frappee lettre par lettre : on lit
// donc l'index, on ne relit pas archive.org a chaque frappe.
//
// MEME FORME QUE LES AUTRES INDEX DE L'APPLICATION. Une entree par fichier, avec
// EXACTEMENT les clefs de `dlc_index/msx360gcdlc.json` (ecrit par
// `loadCollection`, server.js) : `{ name, size, url, col, colId }`. Une entree
// ZTM se lit donc avec le meme code qu'une entree DLC, et un test le verifie sur
// le fichier reel.
//
// UNE DIFFERENCE ASSUMEE : l'enveloppe porte la DATE DE CONSTRUCTION. Le
// materiel ZTM date de 2022 (`publicdate` de l'item DLC) : la fraicheur doit etre
// DITE, jamais supposee. Un tableau nu ne peut pas la porter, et la date de
// modification d'un fichier se perd a la premiere copie ou restauration.
//
// CE QUE CE MODULE NE FAIT PAS, ET QUI EST DIT AILLEURS : il ne telecharge rien
// et n'authentifie rien. Le listage d'archive.org est anonyme (`metadata/<id>`
// repond 200 sans cookie) ; le TELECHARGEMENT, lui, exige un compte
// (`access-restricted-item: true`, collection `loggedin`, 5 HEAD mesures -> 302
// puis 401). Ce module ne joint donc JAMAIS le cookie : il vit dans
// `secrets.json`, cote serveur, et seules les URLs archive.org de la file de
// telechargement le recoivent (`iaHdrs`, server.js).
const fs = require('fs');
const path = require('path');
const https = require('https');

const DEPOSANT = 'zapteam@hotmail.co.uk';
const DOSSIER = path.join(__dirname, '..', 'dlc_index');
const FICHIER = path.join(DOSSIER, 'zapteam.json');
// Le nom d'une release ZTM. Mesure sur 3 240 fichiers : l'extension est `.rar` a
// 100 %, et AUCUN nom ne contient `.iso`. Un `.rar` de 5 Gio peut contenir une
// image ISO complete OU une arborescence XEX extraite : le metadata d'archive.org
// ne liste pas le contenu d'une archive, donc on ne l'affirme pas.
const MOTIF_RELEASE = /-ZTM\.rar$/i;
const PLATEFORMES = ['X360', 'XBLA'];
const TIMEOUT = 12000;   // meme ordre que HTTP_TIMEOUT de server.js
const PARALLELE = 6;     // 14 documents metadata : 3 tours au pire, sous les 20 s
                         // de `chercherTout`

// ---------- Lecture d'un nom de release -------------------------------------
// Le nom EST la donnee : `Nom.<REGION>.<X360|XBLA>-ZTM.rar` pour un jeu,
// `Nom.DLC.<REGION>.<X360|XBLA>-ZTM.rar` pour un DLC.

// Les tokens du nom, suffixe de release retire. `tokensDe('Zuma.RF.XBLA-ZTM.rar')`
// rend `['Zuma','RF','XBLA']`.
function tokensDe(nom) {
  return String(nom || '').replace(/-ZTM\.rar$/i, '').split('.').filter(Boolean);
}

// LE SEUL DISCRIMINANT ENTRE UN JEU ET UN DLC, et il est mesure : sur les
// 3 240 releases, 866 portent le token `DLC` (865 des 866 noms de l'item DLC,
// plus une anomalie de 166 149 octets) et 0 des 2 374 noms de jeux le portent.
// `RF` (732 jeux, 814 DLC), `X360` et `XBLA` apparaissent dans LES DEUX familles
// et ne discriminent donc rien : `Crysis.1.RF.X360-ZTM.rar` est un jeu,
// `Dark.Souls.1.DLC.RF.X360-ZTM.rar` est un DLC.
//
// On compare un TOKEN, pas une sous-chaine : « DLCs » ou un titre qui contient
// « DLC » au milieu d'un mot ne doivent pas basculer un jeu en DLC.
function estDlc(nom) {
  return tokensDe(nom).some(t => t.toLowerCase() === 'dlc');
}

// `'jeu'` ou `'dlc'`. Une seule fonction decide, et le type voyage avec le
// resultat : l'interface n'a pas a reinterpreter un nom de fichier.
const typeDe = nom => estDlc(nom) ? 'dlc' : 'jeu';

// La region occupe la place juste avant la plateforme : `USA` dans
// `007.Blood.Stone.USA.X360-ZTM.rar`. On ne la devine PAS dans une liste de
// valeurs connues : une region inedite serait alors rendue comme absente, alors
// que la place, elle, est tenue. Ce qui est exige, c'est la FORME d'une region —
// 2 a 5 lettres —, et c'est mesure : sur les 3 239 releases, 4 noms n'ont RIEN
// dans cette place et le token y est un numero ou un mot trop long
// (`Doom.1.XBLA-ZTM.rar`, `Zeno.Clash.2.XBLA-ZTM.rar`,
// `War.World.Tactical.Combat.XBLA-ZTM.rar`,
// `Walking.Dead.Michonne.Collection.XBLA-ZTM.rar`). Les annoncer comme des
// regions serait inventer ; on rend la chaine vide.
// `RF` s'y trouve aussi (1547 releases) — sa signification n'est pas etablie (la
// source plausible a refuse l'acces automatise, 403), donc on rend la VALEUR,
// sans la traduire ni l'expliquer.
const MOTIF_REGION = /^[A-Za-z]{2,5}$/;
function regionDe(nom) {
  const t = tokensDe(nom);
  if (t.length >= 2 && PLATEFORMES.includes(t[t.length - 1].toUpperCase())) {
    const r = t[t.length - 2];
    return MOTIF_REGION.test(r) ? r : '';
  }
  return '';
}

function plateformeDe(nom) {
  const t = tokensDe(nom);
  const d = t.length ? t[t.length - 1].toUpperCase() : '';
  return PLATEFORMES.includes(d) ? d : '';
}

// ---------- Recherche locale -------------------------------------------------
// Correspondance par MOT ENTIER, comme la source `dossier-local` et comme le
// score de pertinence de l'interface : chercher « dark » ne doit pas remonter
// « darkness », et « crysis 1 » doit trouver `Crysis.1.RF.X360-ZTM.rar`.
function motsDe(q) {
  return String(q || '').toLowerCase().split(/[^a-z0-9]+/)
    // UN CHIFFRE SEUL COMPTE. « Halo 3 » et « Halo 4 » sont deux jeux, et
    // « Crysis 1 » ne doit pas ramener « Crysis 2 » : une recherche qui perd le
    // numero rend une liste ou l'utilisateur ne peut plus choisir. Le bareme des
    // DLC du serveur (`lib/pertinence-dlc.js`) fait deja cette distinction, et un
    // test l'y exige (« un numero distingue les episodes »). Une LETTRE seule
    // reste ecartee : « a » ne discrimine rien et ramenerait la moitie du
    // catalogue.
    .filter(m => m.length > 1 || /^[0-9]$/.test(m));
}

function correspond(nom, mots) {
  const bas = String(nom).toLowerCase();
  return mots.every(m => new RegExp('(^|[^a-z0-9])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(bas));
}

// Filtre les entrees de l'index. `opts.type` ('jeu' | 'dlc') restreint a une
// famille ; `opts.max` borne la reponse (une requete « 1 » peut viser large).
function filtrer(entrees, q, opts) {
  const o = opts || {};
  const mots = motsDe(q);
  if (!mots.length) return [];
  const max = o.max || 200;
  const veut = o.type === 'jeu' || o.type === 'dlc' ? o.type : null;
  const out = [];
  for (const e of entrees || []) {
    if (out.length >= max) break;
    if (!correspond(e.name, mots)) continue;
    if (veut && typeDe(e.name) !== veut) continue;
    out.push(e);
  }
  return out;
}

// ---------- Etat de l'index ---------------------------------------------------
// Ce que l'interface A LE DROIT de dire : quand l'index a ete construit, combien
// de releases il porte, et lesquelles. Les comptes sont RECALCULES depuis les
// entrees, jamais recopies : un compteur stocke peut mentir apres une edition.
function etat(index) {
  if (!index || !Array.isArray(index.items)) return null;
  let jeux = 0, dlc = 0, octets = 0;
  for (const e of index.items) {
    if (typeDe(e.name) === 'dlc') dlc++; else jeux++;
    octets += Number(e.size) || 0;
  }
  return {
    construit: index.construit || null,
    fichiers: index.items.length,
    jeux, dlc, octets,
    items: Array.isArray(index.itemsLus) ? index.itemsLus.length : 0,
    echecs: Array.isArray(index.echecs) ? index.echecs : [],
    // Les items Xbox 360 du meme deposant ECARTES du perimetre (guides, pack de
    // jaquettes, notices). Ils sont nommes pour que l'interface puisse le dire :
    // « 3239 releases » sans dire ce qui a ete laisse de cote serait trompeur.
    ecartes: Array.isArray(index.ecartes) ? index.ecartes : []
  };
}

// Lit l'index du disque. Rend `null` si le fichier est absent, illisible ou
// informe : un index corrompu doit mener a une RECONSTRUCTION, pas a une
// exception au milieu d'une recherche.
//
// Le document est garde en memoire, valide par la taille et la date du fichier :
// une recherche est frappee lettre par lettre, et relire 650 Ko de JSON a chaque
// frappe serait payer le parsing onze fois pour un seul resultat. La
// reconstruction vide ce cache explicitement — la date de modification d'un
// fichier reecrit dans la meme milliseconde ne suffit pas a distinguer deux
// index de meme taille.
let _memoire = null;
function lireIndex() {
  try {
    const st = fs.statSync(FICHIER);
    const cle = st.size + ':' + st.mtimeMs;
    if (_memoire && _memoire.cle === cle) return _memoire.doc;
    const doc = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
    if (!doc || !Array.isArray(doc.items)) return null;
    _memoire = { cle, doc };
    return doc;
  } catch { return null; }
}

// ---------- Construction ------------------------------------------------------
function fetchJson(url, cb, hops) {
  const rq = https.get(url, { headers: { 'User-Agent': 'XboxManager/2.0' } }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if ((hops || 0) >= 5) return cb(new Error('trop de redirections'));
      return fetchJson(new URL(res.headers.location, url).href, cb, (hops || 0) + 1);
    }
    if (res.statusCode !== 200) { res.resume(); return cb(new Error('HTTP ' + res.statusCode + ' — ' + url)); }
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      let j;
      try { j = JSON.parse(d); } catch (e) { return cb(e); }
      cb(null, j);
    });
  });
  rq.on('error', cb);
  rq.setTimeout(TIMEOUT, () => rq.destroy(new Error('timeout ' + TIMEOUT + 'ms — ' + url)));
}

// `n` taches a la fois, resultats dans l'ordre de la liste. Une tache qui echoue
// rend `{ erreur }` : un item illisible ne doit pas emporter les dix autres —
// mais il doit etre NOMME dans l'index, sinon l'index serait partiel en silence.
function enParallele(liste, n, iter, cb) {
  const out = new Array(liste.length);
  let suivant = 0, finis = 0;
  if (!liste.length) return cb(out);
  const suivantTache = () => {
    if (suivant >= liste.length) return;
    const i = suivant++;
    iter(liste[i], (r) => {
      out[i] = r;
      if (++finis === liste.length) cb(out);
      else suivantTache();
    });
  };
  for (let k = 0; k < Math.min(n, liste.length); k++) suivantTache();
}

// La recherche qui decouvre les items du deposant. C'est le SEUL usage
// d'`advancedsearch` : decouvrir des identifiants, jamais chercher un titre.
const URL_ITEMS = 'https://archive.org/advancedsearch.php?q=uploader%3A' +
  encodeURIComponent(DEPOSANT) + '&fl%5B%5D=identifier&fl%5B%5D=title&rows=100&output=json';

// LE PERIMETRE, ET IL EST MESURE. Le deposant sert 14 items Xbox 360, mais
// seuls 11 annoncent une « Game Collection » — ce sont eux qui portent des jeux
// et des DLC, et ce sont exactement ceux que la recherche ZTM a mesures.
// Les trois autres sont HORS SUJET pour une ludotheque :
//   `mx369gg-xbox360-ztm`     238 guides officiels Prima (`...PRiMA.OFFiCiAL.GUiDE-ZTM.rar`)
//   `mx360ldip`                61 « Lego Dimensions Instructions Pack »
//   `Microsoft-Xbox-360-Game-Cover-Pack`  0 release (des jaquettes)
// Ils passeraient tous le filtre des noms (meme suffixe `-ZTM.rar`) : chercher
// « crysis » remontait `Crysis.1.PRiMA.OFFiCiAL.GUiDE-ZTM.rar` presente comme un
// jeu. On garde donc les items dont le TITRE annonce une Game Collection, et on
// ECARTE les autres en les NOMMANT dans l'index — un perimetre silencieux serait
// un mensonge par omission.
const MOTIF_PERIMETRE = /game\s+collection/i;
const estDansPerimetre = titre => MOTIF_PERIMETRE.test(String(titre || ''));

// L'etiquette d'un item, telle que son TITRE l'annonce : « Microsoft Xbox 360 -
// Game Collection XEX [Part 1] » -> `XEX`, « ... [DLC] » -> `DLC`. Elle dit
// d'ou vient la release sans rien inventer sur son contenu.
function etiquetteItem(titre) {
  const t = String(titre || '');
  for (const e of ['DLC', 'XBLA', 'GOD', 'Kinect', 'Other']) {
    if (new RegExp('\\[' + e + '\\]', 'i').test(t)) return e;
  }
  if (/XEX/i.test(t)) return 'XEX';
  return 'archive.org';
}

let enCours = null;   // construction en vol : une frappe par lettre ne doit pas
                      // lancer douze fois les memes douze requetes

// Construit l'index : 1 requete de decouverte + 1 `metadata` par item « Game
// Collection » du deposant (11 mesures le 2026-09-20), puis filtrage local des
// noms de fichiers. Ecrit le fichier seulement si au moins une release a ete
// trouvee : ecraser un index complet par un index vide (archive.org
// injoignable, filtre de titre casse) serait une perte.
function construireIndex(cb) {
  fetchJson(URL_ITEMS, (e, doc) => {
    if (e) return cb(e);
    const docs = (doc && doc.response && doc.response.docs) || [];
    // Le deposant est multi-plateformes (Xbox Original, PS Vita, PS1, Dreamcast,
    // Wii : 33 items). On ne garde que l'Xbox 360, et le TITRE le dit —
    // « Microsoft Xbox 360 - Game Collection ... ». Puis, dans l'Xbox 360, on ne
    // garde que les Game Collections (voir MOTIF_PERIMETRE) : les guides, le pack
    // de jaquettes et le pack de notices ne sont pas des jeux.
    const docs360 = docs.filter(d => /xbox\s*360/i.test(d.title || ''));
    const items = docs360.filter(d => estDansPerimetre(d.title));
    if (!items.length) return cb(new Error('aucun item Xbox 360 chez ' + DEPOSANT + ' (' + docs.length + ' items vus)'));
    const ecartes = docs360.filter(d => !estDansPerimetre(d.title))
      .map(d => ({ id: d.identifier, titre: d.title || '' }));
    enParallele(items, PARALLELE, (it, suite) => {
      fetchJson('https://archive.org/metadata/' + encodeURIComponent(it.identifier), (e2, m) => {
        if (e2) return suite({ id: it.identifier, erreur: e2.message });
        const etiquette = etiquetteItem(it.title);
        const fichiers = ((m && m.files) || [])
          .filter(f => MOTIF_RELEASE.test(f.name || '') && !String(f.name).startsWith('__'))
          .map(f => ({
            name: f.name,
            size: parseInt(f.size || '0', 10) || 0,
            url: 'https://archive.org/download/' + it.identifier + '/' + encodeURIComponent(f.name),
            col: etiquette,
            colId: it.identifier
          }));
        suite({ id: it.identifier, titre: it.title, etiquette, fichiers });
      });
    }, (res) => {
      const entries = [];
      const lus = [], echecs = [];
      for (const r of res) {
        if (!r) continue;
        if (r.erreur) { echecs.push(r.id); continue; }
        lus.push({ id: r.id, titre: r.titre, etiquette: r.etiquette, fichiers: r.fichiers.length });
        for (const f of r.fichiers) entries.push(f);
      }
      entries.sort((a, b) => a.name.localeCompare(b.name));
      const index = {
        construit: new Date().toISOString(),
        deposant: DEPOSANT,
        hote: 'archive.org',
        itemsLus: lus,
        echecs,
        ecartes,
        items: entries
      };
      if (entries.length) {
        try {
          fs.mkdirSync(DOSSIER, { recursive: true });
          // Ecriture en deux temps : une coupure au milieu laisserait un index
          // tronque, que la prochaine lecture prendrait pour un index valide.
          const tmp = FICHIER + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(index));
          fs.renameSync(tmp, FICHIER);
          _memoire = null;   // l'index en memoire ne vaut plus rien
        } catch (e3) { return cb(new Error('index non ecrit : ' + e3.message)); }
      }
      cb(null, index, { itemsVus: docs.length, itemsXbox: items.length, itemsLus: lus.length, echecs, ecartes });
    });
  });
}

// Lit l'index, ou le construit s'il manque. Une seule construction a la fois :
// les appels concurrents attendent le meme resultat.
function lireOuConstruire(cb, force) {
  if (!force) {
    const l = lireIndex();
    if (l) return cb(null, l, { source: 'index' });
  }
  if (enCours) { enCours.push(cb); return; }
  enCours = [cb];
  const fini = (e, index, info) => {
    const attente = enCours || [];
    enCours = null;
    for (const f of attente) f(e, index, info);
  };
  construireIndex((e, index, info) => fini(e, index, info));
}

module.exports = {
  DEPOSANT, DOSSIER, FICHIER, MOTIF_RELEASE,
  tokensDe, estDlc, typeDe, regionDe, plateformeDe, etiquetteItem,
  motsDe, correspond, filtrer, etat,
  lireIndex, lireOuConstruire, construireIndex,
  _enParallele: enParallele
};
