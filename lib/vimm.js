'use strict';
// LES DEUX VAULTS XBOX 360 DE VIMM, ET L'URL DE RECHERCHE QUI VA AVEC.
//
// Mesure du 2026-09-20 : Vimm's Vault heberge DEUX vaults Xbox 360, pas un.
// `Xbox360` est celui des DISQUES (Redump, 3697 media) ; `X360-D` s'intitule
// « Xbox 360 (Digital) » (No-Intro, 17109 media) et contient, ecrit dans les
// noms et dans les badges de ses lignes, des DLC, des Title Updates et des jeux
// XBLIG. Meme HTML, meme page d'item `/vault/<id>` : seul le code systeme change.
//
// Ce module est PUR : il ne fait aucun reseau, il construit des URL. C'est ce qui
// permet de le tester sans toucher a vimm.net.

// La LISTE BLANCHE, et pas un passe-plat.
//
// L'application est un gestionnaire Xbox 360 : les deux vaults ci-dessus sont les
// siens. Accepter n'importe quel code ferait deux degats :
//   - une faute de frappe (`X360D`, `Xbox 360`, `x360-d `) rendrait le vault des
//     DISQUES sans le dire — quelqu'un qui cherche un DLC recevrait des disques,
//     et rien dans la reponse ne le lui apprendrait ;
//   - un code que le site ne connait pas fait repondre 404 (« Error: Search
//     criteria is too small »), le parseur n'en tire aucune ligne, et la route
//     rend une liste VIDE sans explication — le pire resultat possible, celui qui
//     fait croire a un vault integre qui ne trouve rien.
// D'ou : un code inconnu est REFUSE, pas remplace.
const DEFAUT = 'Xbox360';
const SYSTEMES = ['Xbox360', 'X360-D'];

// Rend le code CANONIQUE du systeme, ou `null` si le code est inconnu.
// Absent ou vide -> le vault des disques : c'est le comportement d'avant ce
// parametre, et les appelants existants n'envoient rien.
// La casse ne compte pas (`x360-d` designe le meme vault que `X360-D`) mais c'est
// la forme du SITE qui sort, parce que c'est elle qui part dans l'URL.
function systeme(brut) {
  if (brut === null || brut === undefined) return DEFAUT;
  const s = String(brut).trim();
  if (!s) return DEFAUT;
  const bas = s.toLowerCase();
  const connu = SYSTEMES.find(x => x.toLowerCase() === bas);
  return connu || null;
}

// L'URL de la page de resultats. Ordre des parametres INCHANGE (`p`, `system`,
// `q`) : c'est celui de la route d'origine, et la requete par defaut doit rester
// identique au caractere pres a ce qu'elle etait.
function urlListe(sys, q) {
  return 'https://vimm.net/vault/?p=list&system=' + encodeURIComponent(sys) + '&q=' + encodeURIComponent(q || '');
}

// ---------- LES DEUX BADGES D'UNE LIGNE : TYPE ET DISPONIBILITE ----------
//
// Mesure du 2026-09-20, HTML recopie tel quel sur `q=halo` (X360-D) :
//
//   <a href= "/vault/126614">Tiger Woods PGA Tour 12: The Masters</a>&nbsp;
//   <b class="redBorder" style="cursor:default" title="Title Update">TU</b>
//   ... <span class="redBorder" title="Download unavailable - Please upload it!">&#x26a0;</span>
//
// Le TYPE et la DISPONIBILITE sont donc dans l'attribut `title` d'un element
// `class="redBorder"` FRERE du lien, pas dans le texte de l'ancre : c'est
// pourquoi le `name` rendu ne les portait pas, et pourquoi rien ne distinguait un
// DLC d'un Title Update (le badge n'affiche qu'une abbreviation : TU, DLC, A).
//
// Vocabulaire des types releve : Addon, DLC, Title Update, Prototype, Demo,
// Translated, Unlicensed, Bonus Disc, Xbox Live Indie Games. Le vault des disques
// en porte aussi, mais d'un autre vocabulaire (Prototype, Demo, Translated,
// Bonus Disc) — jamais « DLC ».
//
// LA DISPONIBILITE EST LA PLUS URGENTE DES DEUX. Un item CATALOGUE n'est pas
// forcement HEBERGE : « 17109 of 17434 known media » veut dire indexe par
// No-Intro, pas disponible. Compte des lignes sans fichier sur les pages
// mesurees : 5 sur 6 pour « WWE 2K17 », 2 sur 5 pour « Tiger Woods PGA Tour 12 »,
// 4 sur 125 pour « map pack », 0 sur 46 pour « halo ». La fiche le confirme : le
// media de l'un de ces items annonce « 0 KB ». Sans ce champ, une ligne morte est
// indiscernable d'une ligne telechargeable et l'utilisateur ne le decouvre
// qu'apres deux clics.
//
// Le titre de l'avertissement commence par « Download unavailable » ; tout autre
// titre d'un badge rouge est le type. On cherche les DEUX attributs sur la meme
// balise plutot que de dependre de l'ordre des attributs (`class` avant `title`
// aujourd'hui, rien ne le garantit demain) et on ne se fie pas au nom de la
// balise : le type est un `<b>`, l'avertissement un `<span>`, et c'est un detail
// de mise en forme, pas un contrat.
const RE_INDISPO = /^\s*download unavailable/i;
const RE_BADGE = /<[a-zA-Z][^>]*>/g;
const RE_CLASSE_BADGE = /class\s*=\s*"[^"]*\bredBorder\b/;
const RE_TITRE = /\btitle\s*=\s*"([^"]*)"/;
function badges(row) {
  let type = '', available = true;
  for (const t of row.matchAll(RE_BADGE)) {
    const tag = t[0];
    if (!RE_CLASSE_BADGE.test(tag)) continue;
    const ti = (tag.match(RE_TITRE) || [])[1];
    if (!ti) continue;
    if (RE_INDISPO.test(ti)) { available = false; continue; }
    if (!type) type = ti;
  }
  return { type, available };
}

// Le parseur de la page de resultats. Il vivait dans `server.js` ; il est ici
// parce qu'il est PUR (aucun reseau, aucune E/S) et que c'est ce module qui sait
// tout du vault — c'est aussi ce qui permet de le tester sur du HTML recopie sans
// toucher a vimm.net.
//
// `type` et `available` sont ADDITIFS : les cinq champs d'origine (id, name,
// regions, ver, langs) gardent leur nom, leur valeur et leur ordre. Un
// consommateur qui les ignore ne voit aucune difference — c'est verifie sur le
// vault des disques, et c'est voulu : ajouter les champs a un seul des deux
// vaults serait une asymetrie, donc un piege pour la suite.
function parseListe(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const a = row.match(/href=\s*"\s*\/?vault\/(?!999999)(\d+)"[^>]*>([^<]+)<\/a>/);
    if (!a) continue;
    const flags = [...row.matchAll(/flag[^>]*title="([^"]+)"/g)].map(x => x[1]).join(' ');
    const ver = (row.match(/width:85px[^>]*>([^<]*)<\/td>/) || [])[1] || '';
    const langs = (row.match(/font-size:10pt[^>]*>([^<]*)<\/td>/) || [])[1] || '';
    out.push(Object.assign({
      id: a[1],
      name: a[2].replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').trim(),
      regions: flags,
      ver: ver.trim(),
      langs: langs.trim()
    }, badges(row)));
  }
  return out;
}

module.exports = { DEFAUT, SYSTEMES, systeme, urlListe, parseListe };
