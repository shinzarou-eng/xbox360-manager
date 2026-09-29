'use strict';
// LE MOTEUR LOCAL. Un client HTTP sur le module `http` natif : zero dependance,
// comme lib/ftp.js.
//
// L'HOTE EST FIGE A LA BOUCLE LOCALE, et ce n'est pas un detail de style :
// c'est la promesse "ca reste sur mon PC" rendue verifiable par un test. Si
// l'hote etait lu dans config.json, une valeur suffirait a envoyer l'etat de la
// machine -- noms de jeux, chemins, journaux -- a une machine inconnue.
//
// Toutes les fonctions rendent {ok:false, raison} au lieu de LEVER : la route
// qui appelle ne doit jamais tomber parce que le moteur n'est pas la.

const http = require('http');

const HOTE = '127.0.0.1';
const PORT_DEFAUT = 11434;
const NUM_CTX = 8192;     // mesure : 8,4 Go de VRAM sur 12 282 Mio a 8192
const DELAI_MS = 600000;  // le premier chargement du modele a coute 74 s (mesure)

function demander(port, chemin, corps, surReponse) {
  return new Promise((resoudre, rejeter) => {
    const donnees = corps ? Buffer.from(JSON.stringify(corps), 'utf8') : null;
    const req = http.request({
      host: HOTE, port: port || PORT_DEFAUT, path: chemin,
      method: donnees ? 'POST' : 'GET',
      headers: donnees
        ? { 'Content-Type': 'application/json', 'Content-Length': donnees.length }
        : {},
      timeout: DELAI_MS,
    }, (rep) => {
      // `surReponse` rend une promesse : on l ADOPTE en la passant a `resoudre`.
      // Sans cette adoption, ni `resoudre` ni `rejeter` n est appele quand la
      // reponse arrive normalement : la promesse reste EN ATTENTE pour toujours,
      // `await demander(...)` ne revient jamais, et le client ne leve pas -- il
      // PEND. C est le pire des deux mondes, puisque le contrat du module est de
      // rendre {ok:false} au lieu de lever. Mesure : sonde-demander.js rendait
      // "MINUTEUR" alors que le serveur avait bien repondu 200.
      //
      // CONTRAT IMPLICITE, a lire avant d'ecrire un autre `surReponse` : il DOIT
      // rendre une promesse qui se regle TOUJOURS (resolution ou rejet). Des que
      // l adoption a eu lieu, la promesse exterieure appartient a la promesse
      // adoptee : le `rejeter(e)` du `req.on('error')` plus bas ne peut PLUS RIEN
      // regler. Un gestionnaire qui rend une promesse non reglable -- ou rien du
      // tout, le cas d'un `async` qui oublie son `return` -- reproduit donc le
      // pend SILENCIEUX, sans aucun signal, exactement le defaut que cette
      // adoption vient de corriger. Les trois `surReponse` du module respectent ce
      // contrat : `lireTout` (qui ecoute aussi l erreur de la reponse) et le
      // gestionnaire de flux de `discuter` (qui a son `rep.on('error', rejeter)`).
      try { resoudre(surReponse(rep)); } catch (e) { rejeter(e); }
    });
    req.on('timeout', () => { req.destroy(new Error('le moteur n a pas repondu a temps')); });
    req.on('error', (e) => rejeter(e));
    if (donnees) req.write(donnees);
    req.end();
  });
}

function lireTout(rep) {
  // On ECOUTE L ERREUR DE LA REPONSE, et ce n'est pas une precaution de style :
  // quand le pair coupe entre les en-tetes et la fin du corps, le socket est
  // detruit, donc NI le minuteur de DELAI_MS NI le `req.on('error')` de
  // `demander` ne peuvent plus regler cette promesse -- le client ne levait pas,
  // il PENDAIT, definitivement et en silence. Mesure : `disponible()` et
  // `modeles()` rendaient "PENDU" (course contre un minuteur de 5 s) alors que
  // `discuter`, qui a son `rep.on('error', rejeter)`, degradait proprement.
  return new Promise((resoudre, rejeter) => {
    const m = [];
    rep.on('data', (x) => m.push(x));
    rep.on('end', () => resoudre(Buffer.concat(m).toString('utf8')));
    // A noter : l'erreur n'est emise QUE s'il existe un ecouteur. Son absence
    // etait donc aussi la raison pour laquelle l'erreur n'arrivait pas du tout.
    rep.on('error', rejeter);
  });
}

function messageDe(e) {
  const m = String((e && e.message) || e);
  if (/ECONNREFUSED|refused|Aucune connexion/i.test(m)) return 'le moteur local ne repond pas sur ' + HOTE;
  if (/timeout|delai|timed out/i.test(m)) return 'le moteur local n a pas repondu a temps';
  return m;
}

async function disponible(port) {
  try {
    const texte = await demander(port, '/api/version', null, (rep) => {
      if (rep.statusCode !== 200) { rep.resume(); return Promise.reject(new Error('HTTP ' + rep.statusCode)); }
      return lireTout(rep);
    });
    const o = JSON.parse(texte);
    return { ok: true, version: o.version };
  } catch (e) {
    return { ok: false, raison: messageDe(e) };
  }
}

async function modeles(port) {
  try {
    const texte = await demander(port, '/api/tags', null, (rep) => {
      if (rep.statusCode !== 200) { rep.resume(); return Promise.reject(new Error('HTTP ' + rep.statusCode)); }
      return lireTout(rep);
    });
    const o = JSON.parse(texte);
    return { ok: true, noms: (o.models || []).map((m) => m.name) };
  } catch (e) {
    return { ok: false, noms: [], raison: messageDe(e) };
  }
}

// Le flux est en NDJSON : une ligne = un objet. On assemble au fil de l eau, et
// une ligne illisible est IGNOREE au lieu de tout perdre -- un modele qui
// derive sur un morceau ne doit pas faire perdre les 200 jetons d avant.
async function discuter(o) {
  const options = o || {};
  try {
    const corps = {
      model: options.modele,
      messages: options.messages || [],
      stream: true,
      think: false,
      keep_alive: options.keepAlive || '5m',
      options: { num_ctx: NUM_CTX },
    };
    if (options.schema) corps.format = options.schema;
    let texte = '';
    let tampon = '';
    let evalCount = null;
    // UNE SEULE facon de traiter une ligne, appelee pour les lignes terminees ET
    // pour le reliquat final. Sans ce reliquat, un flux dont la derniere ligne
    // n'est pas terminee par \n perdrait son dernier morceau de TEXTE et son
    // `done` : la reponse serait tronquee en silence. Defaut trouve par un
    // relecteur sur l'instrument de mesure, applique ici ou il coute le plus.
    const traiter = (l) => {
      if (!l.trim()) return;
      let obj;
      try { obj = JSON.parse(l); } catch (e) { return; }   // ligne illisible : ignoree
      const c = (obj.message && obj.message.content) || '';
      if (c) { texte += c; if (options.aFlux) options.aFlux(c); }
      if (obj.done) evalCount = obj.eval_count;
    };
    await demander(options.port, '/api/chat', corps, (rep) => new Promise((resoudre, rejeter) => {
      if (rep.statusCode !== 200) {
        rep.resume();
        return rejeter(new Error('le moteur a repondu HTTP ' + rep.statusCode));
      }
      rep.setEncoding('utf8');
      rep.on('data', (bloc) => {
        tampon += bloc;
        const lignes = tampon.split('\n');
        tampon = lignes.pop();
        lignes.forEach(traiter);
      });
      rep.on('end', () => { traiter(tampon); resoudre(); });
      rep.on('error', rejeter);
    }));
    const propre = texte.replace(/<\|channel>thought\s*<channel\|>/g, '').trim();
    const r = { ok: true, texte: propre, jetons: evalCount };
    if (options.schema) {
      try { r.objet = JSON.parse(propre); } catch (e) { r.objet = null; }
    }
    return r;
  } catch (e) {
    return { ok: false, raison: messageDe(e) };
  }
}

module.exports = { HOTE, PORT_DEFAUT, NUM_CTX, disponible, modeles, discuter };
