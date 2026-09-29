'use strict';
// L'ACCES DEPUIS LE RESEAU : UN CODE D'APPAIRAGE, PUIS UN JETON DE SESSION.
//
// L'application supprime et deplace des fichiers, lit les disques et pilote la
// console. Tant qu'elle n'ecoutait que la boucle locale, cela ne regardait
// personne. Des qu'elle ecoute le reseau, la question change de nature : sur un
// Wi-Fi, « les autres » sont les invitees, les objets connectes et tout appareil
// compromis.
//
// CE QUE CE CODE EST, ET CE QU'IL N'EST PAS. C'est un code d'APPAIRAGE : il
// s'affiche a l'ecran de la machine, donc quiconque voit cet ecran peut s'appairer.
// Ce n'est pas un mot de passe, et le presenter comme tel serait un mensonge
// rassurant. Ce qu'il protege, c'est l'acces depuis le RESEAU, pas depuis la piece.
//
// 6 chiffres = 10^6 combinaisons. Sans limite d'essais, cela se force en minutes :
// le limiteur n'est donc pas un confort, c'est ce qui donne sa valeur au code.
//
// Ce module est PUR : il ne lit ni fichier ni horloge sans qu'on les lui donne.
// Les tests peuvent donc eprouver le verrouillage et l'expiration sans attendre.

const crypto = require('crypto');

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;   // 30 jours
const MAX_SESSIONS = 5;                         // au-dela, on oublie la plus vieille
const MAX_ESSAIS = 5;
const FENETRE_MS = 15 * 60 * 1000;              // 5 essais par quart d'heure
const COOKIE = 'x360acces';

// `crypto.randomInt` et non `Math.random` : un code d'acces tire par un generateur
// previsible se devine sans forcer quoi que ce soit.
function nouveauCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function nouveauJeton() {
  return crypto.randomBytes(32).toString('hex');
}

// COMPARAISON A TEMPS CONSTANT. `a === b` s'arrete au premier caractere different :
// le temps de reponse dit alors combien de chiffres sont justes, et un code se
// devine chiffre par chiffre. On hache d'abord, parce que `timingSafeEqual` LEVE
// sur deux longueurs differentes — et lever, c'est encore repondre trop vite.
function memeSecret(a, b) {
  const h = s => crypto.createHash('sha256').update(String(s == null ? '' : s), 'utf8').digest();
  return crypto.timingSafeEqual(h(a), h(b));
}

// LA BOUCLE LOCALE EST DE CONFIANCE — c'est la machine de l'utilisateur, celui qui
// a lance le serveur. 127.0.0.0/8 en entier, pas seulement 127.0.0.1, et la forme
// IPv6 mappee que Node rend quand la socket est en double pile.
// TOUT LE RESTE EST DISTANT, y compris une adresse absente : on echoue FERME.
function estLocal(adresse) {
  const a = String(adresse || '');
  if (a === '::1') return true;
  const v4 = a.startsWith('::ffff:') ? a.slice(7) : a;
  return /^127\./.test(v4);
}

// LE LIMITEUR D'ESSAIS. Fenetre glissante, par cle (l'adresse distante).
function creerLimiteur({ max = MAX_ESSAIS, fenetre = FENETRE_MS, maintenant = Date.now } = {}) {
  const essais = new Map();
  const recents = cle => {
    const t = maintenant();
    const l = (essais.get(cle) || []).filter(x => t - x < fenetre);
    if (l.length) essais.set(cle, l); else essais.delete(cle);
    return l;
  };
  return {
    autorise(cle) { return recents(cle).length < max; },
    // Combien de temps attendre avant de pouvoir reessayer, en millisecondes.
    attente(cle) {
      const l = recents(cle);
      if (l.length < max) return 0;
      return Math.max(0, fenetre - (maintenant() - l[0]));
    },
    echec(cle) { const l = recents(cle); l.push(maintenant()); essais.set(cle, l); return l.length; },
    reussite(cle) { essais.delete(cle); },
    reste(cle) { return Math.max(0, max - recents(cle).length); }
  };
}

// LES SESSIONS. Un jeton opaque, pas le code : le telephone ne transporte jamais
// le code apres l'appairage, et regenerer le code ne demande donc pas de changer
// de mecanisme — il suffit de fermer les sessions.
function creerSessions({ duree = SESSION_MS, max = MAX_SESSIONS, maintenant = Date.now } = {}) {
  let liste = [];
  const vivantes = () => {
    const t = maintenant();
    liste = liste.filter(s => s && typeof s.j === 'string' && s.exp > t);
    return liste;
  };
  return {
    charger(v) { liste = Array.isArray(v) ? v.slice() : []; vivantes(); return liste.length; },
    pourSauver() { return vivantes(); },
    ouvrir() {
      vivantes();
      const j = nouveauJeton();
      liste.push({ j, exp: maintenant() + duree });
      // On garde les plus RECENTES : oublier la plus ancienne deconnecte un
      // appareil oublie plutot que l'appareil qu'on vient d'appairer.
      if (liste.length > max) liste = liste.slice(liste.length - max);
      return j;
    },
    valide(jeton) {
      if (!jeton) return false;
      return vivantes().some(s => memeSecret(s.j, jeton));
    },
    fermerTout() { liste = []; return 0; },
    nombre() { return vivantes().length; }
  };
}

// LES ADRESSES PAR LESQUELLES ON EST JOIGNABLE. « 0.0.0.0 » n'est pas une adresse
// ou l'on va, c'est une facon d'ecouter partout : sans cette liste, l'utilisateur
// n'a aucun moyen de deviner quoi taper sur son telephone.
// Pure : on lui passe `os.networkInterfaces()`, donc testable sans reseau.
function adressesLocales(interfaces) {
  const out = [];
  for (const cartes of Object.values(interfaces || {})) {
    for (const c of cartes || []) {
      // IPv4 seulement : une adresse IPv6 locale (fe80::) n'est pas tapable, et
      // `internal` ecarte la boucle locale — ce n'est pas une adresse de reseau.
      if (!c || c.family !== 'IPv4' || c.internal) continue;
      if (!out.includes(c.address)) out.push(c.address);
    }
  }
  return out.sort();
}

module.exports = {
  COOKIE, SESSION_MS, MAX_ESSAIS, FENETRE_MS,
  nouveauCode, nouveauJeton, memeSecret, estLocal, adressesLocales,
  creerLimiteur, creerSessions
};
