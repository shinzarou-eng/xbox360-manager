// UN 503 DE VIMM DOIT ETRE REPRIS, PAS TRANSFORME EN ECHEC DEFINITIF.
//
// LE DEFAUT MESURE (2026-09-20, en-tetes EXACTS de l'application : User-Agent,
// `Referer: https://vimm.net/vault/78774` et le cookie de session persiste) :
//   - l'url persistee, jeton de 25 min, rend 503 avec un corps de 43 octets
//     (« This server is overloaded. Try back later. ») ;
//   - une url FRAICHE, jeton neuf obtenu par `GET /api/vimmfiles?id=78774`,
//     rend EXACTEMENT le meme 503, meme corps.
// Donc ni le jeton, ni le creneau, ni le redemarrage : le CDN est sature.
//
// Et le code faisait de cette panne PASSAGERE un etat PERMANENT : le 503 tombait
// dans `finish('error', 'HTTP ' + code)` — un code nu, sans explication, que
// l'utilisateur ne pouvait ni comprendre ni rejouer. Pire, le deblocage
// automatique (liberation du creneau puis reprise) etait cable sur le 429, que
// Vimm n'a jamais renvoye ici : il ne se declenchait donc JAMAIS.
//
// CE QUE CE FICHIER EXECUTE, ET PAS CE QU'IL RECOPIE : le texte REEL de `start()`,
// de la politique de reprise et de `telechargementsIa()` est extrait de
// `server.js` et evalue. Seuls leurs COLLABORATEURS sont doubles (reseau local,
// horloge, destination, fin de transfert) — meme motif que
// `test/dl-destination.test.js` et `test/enchainement.test.js`.
//
// LE RESEAU, LUI, EST VRAI : un serveur HTTP sur 127.0.0.1, le vrai `http.get` de
// Node, la vraie socket, le vrai `Range`. Un 503 simule par une doublure de
// fonction ne prouverait rien du chemin qui a echoue.
//
// LE TEMPS EST DOUBLE : les delais sont bien ceux du produit (20/40/80/160 s),
// mais l'horloge les ENREGISTRE au lieu de les attendre, et c'est le test qui
// decide quand le temps passe. Sans cela le fichier durerait 5 minutes et
// personne ne le lancerait.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

// Les fins de ligne sont NORMALISEES avant l'extraction : le fichier est en CRLF
// aujourd'hui et git le repassera en LF a la prochaine ecriture. Une ancre qui
// contiendrait `\r\n` casserait a ce moment-la, sans rapport avec le sujet.
const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8').replace(/\r\n/g, '\n');

// --- 1. La politique de reprise (texte reel de server.js) --------------------
const pDebut = srv.indexOf('// ---------- Surcharge passagere');
const pFin = srv.indexOf('function pumpDl()');
assert.ok(pDebut > 0 && pFin > pDebut, 'le bloc de la surcharge Vimm doit etre trouvable dans server.js');
const politiqueSrc = srv.slice(pDebut, pFin);

// --- 2. `start()` : la tentative HTTP et sa reprise (texte reel) -------------
const sDebut = srv.indexOf('  const start = () => {');
const sFin = srv.indexOf('\n  start();\n}', sDebut);
assert.ok(sDebut > 0 && sFin > sDebut, 'la fonction start() doit etre trouvable dans server.js');
const startSrc = srv.slice(sDebut, sFin);

// --- 3. `telechargementsIa()` : ce que l'interface VOIT (texte reel) ---------
const tDebut = srv.indexOf('function telechargementsIa() {');
// `+ 2` : l'ancre est le `\n}` qui SUIT le corps, donc la tranche s'arrete juste
// avant l'accolade fermante. Sans elle, la declaration est inachevee et
// `new Function` leve une SyntaxError — qui ne dit rien du sujet.
const tFin = srv.indexOf('\n}', tDebut);
assert.ok(tDebut > 0 && tFin > tDebut, 'telechargementsIa doit etre trouvable dans server.js');
const teleSrc = srv.slice(tDebut, tFin + 2);

// Le francais tel quel : c'est la langue de reference des appels T().
const T = fr => fr;
// La reconnaissance d'hote est doublee pour qu'une url locale JOUE le role d'un
// CDN Vimm. C'est le seul mensonge du banc, et il est nomme : ce qui est en cause
// ici est la REPONSE (503, 429), pas la lecture du nom d'hote.
const vimmHostFaux = u => (/127\.0\.0\.1/.test(u || '') ? 'dl2.vimm.net' : null);

// La politique, evaluee UNE fois : c'est elle qui decide des delais et du budget.
const POL = new Function('T', 'vimmHost',
  politiqueSrc + '\nreturn { delaiReprise, planReprise, noteReprise, msgSurchargeEpuisee, estSurcharge, REPRISE_TENTATIVES };'
)(T, vimmHostFaux);

// --- La politique, seule ------------------------------------------------------

test('reprise : le 503 d un CDN Vimm se reprend, le 429 et les autres non', () => {
  const vimm = 'http://127.0.0.1:9/';
  const ailleurs = 'https://archive.org/download/x/y.iso';
  const cur = {};
  assert.ok(POL.planReprise(cur, vimm, { statusCode: 503 }), 'un 503 Vimm doit declencher une reprise');
  assert.strictEqual(POL.planReprise(cur, ailleurs, { statusCode: 503 }), null,
    'un 503 d un AUTRE hote n est pas une surcharge de Vimm : l appelant garde son traitement');
  assert.strictEqual(POL.planReprise(cur, vimm, { statusCode: 429 }), null,
    'LE 429 N EST PAS UNE SURCHARGE : il a son propre remede (cancel.php), on ne fusionne pas les deux');
  assert.strictEqual(POL.planReprise(cur, vimm, { statusCode: 502 }), null,
    'le 502 n a pas ete mesure sur Vimm : on ne devine pas une famille de codes');
  assert.strictEqual(POL.planReprise(cur, vimm, { statusCode: 504 }), null, 'idem pour le 504');
  assert.strictEqual(POL.planReprise(cur, vimm, { statusCode: 200 }), null, 'une reponse valide n est pas un refus');
  assert.strictEqual(POL.planReprise(cur, vimm, { statusCode: 416 }), null, 'ni un 416, traite ailleurs');
});

test('reprise : les delais DOUBLENT, sont bornes, et ne martelent pas', () => {
  // Les valeurs sont LUES sur les constantes du produit, jamais recopiees.
  const fixe = t => n => POL.delaiReprise(n, () => t);
  const bas = fixe(0), haut = fixe(1), milieu = fixe(0.5);
  assert.deepStrictEqual([1, 2, 3, 4].map(bas), [15000, 30000, 60000, 120000], 'bornes hautes du jitter');
  assert.deepStrictEqual([1, 2, 3, 4].map(haut), [25000, 50000, 100000, 200000], 'bornes basses du jitter');
  assert.deepStrictEqual([1, 2, 3, 4].map(milieu), [20000, 40000, 80000, 160000], 'la cadence annoncee');
  // ILS DOUBLENT : une cadence reguliere est precisement ce qui aggrave une
  // saturation, et l'application s'est deja fait limiter.
  for (let n = 1; n < 4; n++) {
    assert.ok(bas(n + 1) >= 2 * bas(n), 'le delai doit au moins doubler au rang ' + (n + 1));
  }
  // LE PREMIER DELAI EST LOIN DE CELUI DU 429 (2 s) : le 429 se repare par une
  // action locale, le 503 seulement par le temps.
  assert.ok(bas(1) >= 10000, 'le premier delai ne doit pas etre un hoquet de reseau');
  // LA PATIENCE TOTALE EST BORNEE, et c'est le chiffre que le message annonce.
  const total = [1, 2, 3, 4].reduce((s, n) => s + milieu(n), 0);
  assert.strictEqual(total, 300000, 'la patience totale doit valoir 5 minutes');
  assert.strictEqual(POL.REPRISE_TENTATIVES, 5, '1 essai + 4 reprises');
  // Et le jitter est bien la, sans sortir des bornes.
  for (let n = 1; n <= 4; n++) {
    const d = POL.delaiReprise(n);
    assert.ok(d >= bas(n) && d <= haut(n), 'delai hors bornes au rang ' + n + ' : ' + d);
  }
});

test('reprise : le budget est borne, et epuise il rend un verdict franc', () => {
  const cur = {};
  const vimm = 'http://127.0.0.1:9/';
  for (let n = 1; n <= POL.REPRISE_TENTATIVES - 1; n++) {
    const p = POL.planReprise(cur, vimm, { statusCode: 503 });
    assert.ok(p && p.attendre > 0, 'la reprise ' + n + ' doit attendre');
    assert.strictEqual(p.n, n);
    cur.reprises = p.n;
  }
  assert.deepStrictEqual(POL.planReprise(cur, vimm, { statusCode: 503 }), { epuise: true },
    'au-dela du budget, on ne reprend plus : on le DIT');
  // Le verdict dit ce qui s'est passe, et que rien n'est perdu.
  const msg = POL.msgSurchargeEpuisee();
  assert.match(msg, /503/, 'le message doit nommer le code — lu : ' + msg);
  assert.match(msg, /toujours surcharg/, 'il doit dire que Vimm l est RESTE — lu : ' + msg);
  assert.match(msg, /plus tard/, 'et qu il faut reessayer plus tard — lu : ' + msg);
  assert.match(msg, /conserv/, 'et que les octets recus sont conserves — lu : ' + msg);
  assert.notStrictEqual(msg, 'HTTP 503', 'un code nu n est pas une explication');
});

// --- Le banc : un vrai serveur HTTP, une horloge qui ENREGISTRE --------------

// Le corps MESURE, a l'octet : 43 octets, c'est le chiffre du rapport.
const CORPS_503 = 'This server is overloaded. Try back later.\n';
const PARTIEL = 1000;   // octets deja sur le disque : la reprise doit les GARDER
const RESTE = 500;      // ce que le CDN accepte encore de servir

// `codes` est la suite des codes rendus ; le dernier se repete au-dela.
function fauxCdn(codes, corps) {
  return new Promise(resoudre => {
    const reqs = [];
    const srvHttp = http.createServer((req, rep) => {
      const i = reqs.length;
      reqs.push({ range: req.headers.range || null });
      const code = codes[Math.min(i, codes.length - 1)];
      if (code === 503) {
        rep.writeHead(503, { 'Content-Type': 'text/plain' });
        return rep.end(CORPS_503);
      }
      if (code !== 200 && code !== 206) { rep.writeHead(code); return rep.end('refus'); }
      rep.writeHead(code, { 'Content-Length': String(corps.length) });
      rep.end(corps);
    });
    srvHttp.listen(0, '127.0.0.1', () => {
      const port = srvHttp.address().port;
      resoudre({ srv: srvHttp, reqs, url: 'http://127.0.0.1:' + port + '/?mediaId=74497&token=X' });
    });
  });
}

function monter() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-reprise-'));
  const item = {
    id: '1789931694330_7081',
    url: '',
    name: 'Castlevania - Lords of Shadow (Disc 1).iso',
    status: 'active', received: 0, total: 0, error: null,
    headers: { 'User-Agent': 'UA-VIMM', Referer: 'https://vimm.net/vault/78774', Cookie: 'AWSUSER_ID=x' }
  };
  const cur = { item, req: null, out: null, dir: racine, dest: null, lastB: 0, lastT: Date.now(), vimm: true };
  const dlCurs = new Map([[item.id, cur]]);
  const attentes = [];        // l'horloge : { ms, fn } — ENREGISTRE, n'attend pas
  const fins = [];            // ce que `finish` a recu
  let libre = 0;              // combien de fois `cancel.php` a ete demande
  let resoudre = null;
  const fini = new Promise(r => { resoudre = r; });

  // `finish` est fabrique AVANT l'evaluation, sinon la fonction evaluee ne le
  // verrait pas : elle le lit dans sa portee.
  const finish = (st, err) => {
    fins.push({ st: st, err: err || null });
    dlCurs.delete(item.id);            // comme le vrai `finish`
    if (resoudre) resoudre();
  };

  const start = new Function(
    'fs', 'path', 'http', 'https', 'item', 'cur', 'dlCurs', 'T', 'finish',
    'iaHdrs', 'vimmHost', 'vimmRelease', 'pickDlDir', 'freeSpace', 'fmt', 'startGroup', 'setTimeout',
    politiqueSrc + '\n' + startSrc + '\nreturn start;'
  )(
    fs, path, http, https, item, cur, dlCurs, T, finish,
    () => ({ 'User-Agent': 'XboxManager/2.0' }),
    vimmHostFaux,
    (host, hdrs, cb) => { libre++; if (cb) cb(); },
    () => ({ fat32block: false, dir: cur.dir, redirected: false }),
    () => -1,
    n => String(n),
    () => {},
    // L'horloge doublee : elle note le delai DEMANDE par le produit et rend la
    // main. C'est le test qui decide quand le temps passe.
    (fn, ms) => { attentes.push({ fn: fn, ms: ms }); return attentes.length; }
  );

  const fichier = path.join(racine, item.name);
  fs.writeFileSync(fichier, Buffer.alloc(PARTIEL, 7));   // le partiel deja recu
  return {
    racine, item, cur, dlCurs, attentes, fins, fini, start, fichier,
    libre: () => libre,
    fin: () => { try { fs.rmSync(racine, { recursive: true, force: true }); } catch {} }
  };
}

// Attend qu'une condition soit vraie, sans dormir plus que necessaire.
function jusqua(pred, quoi) {
  return new Promise((resoudre, rejeter) => {
    const t0 = Date.now();
    const tic = () => {
      if (pred()) return resoudre();
      if (Date.now() - t0 > 5000) return rejeter(new Error('jamais arrive : ' + quoi));
      setTimeout(tic, 5);
    };
    tic();
  });
}

test('le corps mesure fait bien 43 octets', () => {
  // Le chiffre du rapport est verifie ici : sans cela, « 43 octets » serait une
  // affirmation recopiee que plus rien ne rattacherait au corps joue.
  assert.strictEqual(Buffer.byteLength(CORPS_503), 43);
});

// --- Les deux chemins, de bout en bout ---------------------------------------

test('503 puis 200 : le telechargement se TERMINE, il ne tombe pas en erreur', async () => {
  const b = monter();
  const s = await fauxCdn([503, 206], Buffer.alloc(RESTE, 3));
  b.item.url = s.url;
  try {
    b.start();
    await jusqua(() => s.reqs.length === 1, 'la premiere tentative');
    // LE SERVEUR A RECU la requete ne veut pas dire que le CLIENT a lu la
    // reponse : la decision se prend au retour de `http.get`, un tour plus tard.
    await jusqua(() => b.attentes.length + b.fins.length > 0, 'la decision apres le premier 503');
    assert.strictEqual(s.reqs[0].range, 'bytes=' + PARTIEL + '-',
      'la premiere tentative doit reprendre le partiel, pas repartir de zero');

    // L'ATTENTE EST NOMMEE, et elle porte un delai du produit (bornes du jitter
    // au premier rang : 15 a 25 s).
    assert.strictEqual(b.attentes.length, 1, 'un 503 doit programmer une reprise');
    assert.ok(b.attentes[0].ms >= 15000 && b.attentes[0].ms <= 25000,
      'le premier delai doit etre celui du produit — lu : ' + b.attentes[0].ms);
    assert.deepStrictEqual(b.fins, [], 'un 503 ne doit PAS terminer le transfert');

    b.attentes.shift().fn();                       // le temps passe, on reprend
    await jusqua(() => s.reqs.length === 2, 'la reprise');

    // LA REPRISE, PAS LE REDEMARRAGE : c'est tout l'enjeu. Un backoff qui repart
    // de zero effacerait les octets deja recus — pire que l'echec qu'on corrige.
    assert.strictEqual(s.reqs[1].range, 'bytes=' + PARTIEL + '-',
      'la reprise doit conserver le Range du partiel — lu : ' + s.reqs[1].range);

    await b.fini;
    assert.deepStrictEqual(b.fins.map(f => f.st), ['done'],
      'apres un 503 puis un 206, le transfert doit etre TERMINE — recu : ' + JSON.stringify(b.fins));
    assert.strictEqual(b.item.received, PARTIEL + RESTE, 'les octets recus s additionnent');
    assert.strictEqual(b.item.total, PARTIEL + RESTE);
    assert.strictEqual(fs.statSync(b.fichier).size, PARTIEL + RESTE,
      'le fichier doit contenir le partiel ET la suite');
    assert.strictEqual(b.item.error, null, 'aucune erreur ne doit etre posee');
  } finally { s.srv.close(); b.fin(); }
});

test('503 repete : les essais sont BORNES, et l echec final est honnete', async () => {
  const b = monter();
  const s = await fauxCdn([503], Buffer.alloc(0));   // surcharge permanente
  b.item.url = s.url;
  try {
    b.start();
    await jusqua(() => b.attentes.length > 0 || b.fins.length > 0, 'la decision apres le premier 503');

    // On fait passer le temps autant de fois qu'il le faut, et on note les
    // delais REELLEMENT demandes.
    const delais = [];
    for (let i = 0; i < 10 && b.attentes.length; i++) {
      const a = b.attentes.shift();
      delais.push(a.ms);
      a.fn();
      await jusqua(() => b.attentes.length > 0 || b.fins.length > 0, 'la tentative suivante');
    }
    await b.fini;

    // ON NE MARTELE PAS : 5 requetes en 5 minutes, pas une boucle.
    assert.strictEqual(s.reqs.length, POL.REPRISE_TENTATIVES,
      'le nombre de tentatives doit etre borne a ' + POL.REPRISE_TENTATIVES + ' — mesure : ' + s.reqs.length);
    assert.strictEqual(delais.length, POL.REPRISE_TENTATIVES - 1,
      'il doit y avoir exactement ' + (POL.REPRISE_TENTATIVES - 1) + ' attentes — mesure : ' + delais.length);
    // Les delais CROISSENT, et aucun n'est un hoquet de reseau.
    const bas = [15000, 30000, 60000, 120000], haut = [25000, 50000, 100000, 200000];
    for (let i = 0; i < delais.length; i++) {
      assert.ok(delais[i] >= bas[i] && delais[i] <= haut[i],
        'delai ' + (i + 1) + ' hors bornes : ' + delais[i]);
      if (i) assert.ok(delais[i] > delais[i - 1], 'les delais doivent croitre');
    }
    // L'ECHEC EST HONNETE : un seul verdict, qui explique et propose une suite.
    assert.deepStrictEqual(b.fins.map(f => f.st), ['error'], 'un seul echec, pas cinq');
    const msg = b.fins[0].err;
    assert.match(msg, /surcharg/i, 'le message doit dire la surcharge — lu : ' + msg);
    assert.match(msg, /conserv/i, 'et que le partiel est conserve — lu : ' + msg);
    assert.notStrictEqual(msg, 'HTTP 503', 'un code nu n est pas une explication');
    // ET RIEN N A ETE EFFACE : c'est ce qui rend RELANCER utile.
    assert.strictEqual(fs.statSync(b.fichier).size, PARTIEL,
      'le fichier partiel doit etre intact apres l echec');
    assert.strictEqual(b.item.received, PARTIEL, 'et les octets recus restent comptes');
  } finally { s.srv.close(); b.fin(); }
});

test('annule pendant l attente : la reprise ne ressuscite pas le transfert', async () => {
  // Un transfert qu'on peut annuler est la contrepartie d'un transfert qu'on
  // fait attendre. Si la reprise programmee repartait quand meme, elle
  // recreerait un telechargement dont la carte a disparu — donc que plus
  // personne ne pourrait arreter.
  const b = monter();
  const s = await fauxCdn([503], Buffer.alloc(0));
  b.item.url = s.url;
  try {
    b.start();
    await jusqua(() => s.reqs.length === 1 && b.attentes.length === 1, 'la tentative et son attente');

    b.dlCurs.delete(b.item.id);      // `killCur` de dlCtl : l'item sort des transferts en cours
    b.attentes.shift().fn();         // le delai expire MALGRE l'annulation

    await new Promise(r => setTimeout(r, 80));
    assert.strictEqual(s.reqs.length, 1,
      'aucune requete ne doit partir apres une annulation — mesure : ' + s.reqs.length);
    assert.deepStrictEqual(b.fins, [], 'et aucun verdict ne doit etre rendu');
  } finally { s.srv.close(); b.fin(); }
});

test('429 : le chemin du creneau occupe est INTACT, et distinct du 503', async () => {
  // Le 429 a son propre remede — liberer le creneau par `cancel.php`, puis
  // reprendre 2 s plus tard. Le fusionner avec le 503 enverrait un `cancel.php`
  // inutile a un serveur deja sature. On mesure donc les DEUX : la liberation a
  // bien lieu, et le delai reste celui du 429, pas celui de la surcharge.
  const b = monter();
  const s = await fauxCdn([429, 206], Buffer.alloc(RESTE, 3));
  b.item.url = s.url;
  try {
    b.start();
    const auDepart = b.libre();      // la liberation faite au demarrage du DL
    await jusqua(() => b.attentes.length > 0 || b.fins.length > 0, 'la decision apres le 429');

    assert.strictEqual(b.attentes.length, 1, 'le 429 doit programmer une reprise');
    const a = b.attentes.shift();
    a.fn();
    await jusqua(() => s.reqs.length === 2, 'la reprise apres liberation');
    await b.fini;

    assert.ok(b.libre() > auDepart, 'le 429 doit demander la LIBERATION du creneau');
    assert.strictEqual(a.ms, 2000,
      'le 429 doit garder son delai de 2 s, pas celui de la surcharge — lu : ' + a.ms);
    assert.deepStrictEqual(b.fins.map(f => f.st), ['done'], 'et le transfert doit aboutir');
    assert.strictEqual(s.reqs[1].range, 'bytes=' + PARTIEL + '-', 'en reprenant le partiel');
  } finally { s.srv.close(); b.fin(); }
});

// --- Ce que l'interface VOIT pendant l'attente -------------------------------

test('pendant l attente, l interface dit combien de temps, sans mentir apres coup', () => {
  // Le compte a rebours est CALCULE au sondage, pas ecrit dans l'item. Ecrit, il
  // serait persiste par le `saveDls` du compteur de vitesse : apres un
  // redemarrage, l'item remis en file annoncerait « nouvel essai dans 12 s »
  // alors que plus rien n'est programme — un mensonge qui survit a la panne
  // qu'il decrit.
  const item = { id: 'a', name: 'x.iso', status: 'active', note: 'Disque suivant — meme jeu que X' };
  const cur = { item: item, repriseJusqua: Date.now() + 12000 };
  const dls = [item, { id: 'b', name: 'y.iso', status: 'active', note: '' }];
  const dlCurs = new Map([['a', cur]]);
  const vue = new Function('dls', 'dlCurs', 'cfg', 'freeSpace', 'noteReprise',
    teleSrc + '\nreturn telechargementsIa;'
  )(dls, dlCurs, { drop: 'D:\\_A_TRIER' }, () => -1, POL.noteReprise);

  const out = vue();
  const a = out.items.find(d => d.id === 'a');
  // L'attente est VISIBLE, en clair et en francais : « nouvel essai dans N s ».
  assert.match(a.note, /nouvel essai dans \d+ s/, 'l attente doit etre annoncee — lu : ' + a.note);
  assert.match(a.note, /surcharg/i, 'et nommer la cause — lu : ' + a.note);
  assert.ok(/\d+ s$/.test(a.note), 'le compte a rebours doit finir la ligne — lu : ' + a.note);
  assert.ok(a.note.indexOf('Disque suivant') === 0,
    'la note d origine dit d ou vient le transfert : elle ne doit pas etre masquee — lu : ' + a.note);
  // L'item persiste n'a PAS ete touche : la preuve que rien de tout cela ne part
  // dans downloads.json.
  assert.strictEqual(item.note, 'Disque suivant — meme jeu que X', 'l item persiste ne doit pas etre modifie');
  assert.notStrictEqual(a, item, 'la vue est une copie, pas l item lui-meme');
  // Un transfert qui n'attend pas n'est pas touche du tout.
  assert.strictEqual(out.items.find(d => d.id === 'b'), dls[1],
    'sans attente en cours, l item est rendu tel quel');
  // Et l'attente s'efface toute seule : plus d'echeance, plus de note.
  cur.repriseJusqua = 0;
  assert.strictEqual(vue().items.find(d => d.id === 'a'), item, 'l attente finie ne doit rien laisser');
  // Le reste du contrat de la route est inchange.
  assert.strictEqual(out.drop, 'D:\\_A_TRIER');
  assert.strictEqual(out.dropFree, -1);
});
