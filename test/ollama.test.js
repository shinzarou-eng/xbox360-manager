// LE CLIENT DU MOTEUR LOCAL. On ne teste pas contre un vrai Ollama : on ne peut
// ni provoquer un modele absent, ni couper un flux au milieu. Meme raison que
// test/aide-ftp.js, qui double une console FTP.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const O = require('../lib/ollama');

function fauxOllama(routes) {
  return new Promise((resoudre) => {
    const srv = http.createServer((req, rep) => {
      const r = routes[req.url];
      if (!r) { rep.writeHead(404); return rep.end('{}'); }
      r(req, rep);
    });
    srv.listen(0, '127.0.0.1', () => resoudre({ srv, port: srv.address().port }));
  });
}

function lireCorps(req) {
  return new Promise((r) => { const m = []; req.on('data', (x) => m.push(x)); req.on('end', () => r(Buffer.concat(m).toString('utf8'))); });
}

// Le titre disait « aucune configuration ne peut le changer », et c est ce qui a fait
// croire DEUX fois que ce point etait ferme : le test n asserte que la CONSTANTE
// exportee, donc il ne regarde pas d ou elle vient. La propriete est desormais portee
// par un GARDE-FOU DE SOURCE, dans `test/ui-quality.test.js` : « l hote du moteur ne
// peut pas venir d une configuration ». Le titre ci-dessous dit maintenant ce que
// celui-ci verifie, et rien de plus.
test('HOTE vaut 127.0.0.1 : la constante exportee porte l adresse de la boucle locale', () => {
  assert.strictEqual(O.HOTE, '127.0.0.1');
});

test('moteur absent : on rend une raison, on ne LEVE pas', async () => {
  const r = await O.disponible(1); // port 1 : personne n ecoute
  assert.strictEqual(r.ok, false);
  assert.ok(r.raison && r.raison.length > 0, 'la raison doit etre lisible par un humain');
});

test('moteur present : la version est rendue', async () => {
  const f = await fauxOllama({
    '/api/version': (req, rep) => { rep.writeHead(200, { 'Content-Type': 'application/json' }); rep.end('{"version":"0.34.2"}'); },
  });
  const r = await O.disponible(f.port);
  assert.deepStrictEqual(r, { ok: true, version: '0.34.2' });
  f.srv.close();
});

test('aucun modele installe : la liste est vide, ce n est pas une erreur', async () => {
  const f = await fauxOllama({
    '/api/tags': (req, rep) => { rep.writeHead(200, { 'Content-Type': 'application/json' }); rep.end('{"models":[]}'); },
  });
  const r = await O.modeles(f.port);
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.noms, []);
  f.srv.close();
});

test('discuter : le flux est rendu au fil de l eau et le texte est assemble', async () => {
  const f = await fauxOllama({
    '/api/chat': async (req, rep) => {
      const corps = JSON.parse(await lireCorps(req));
      assert.strictEqual(corps.stream, true, 'le flux doit etre demande');
      assert.strictEqual(corps.think, false, 'la reflexion doit etre coupee (mesure : 5x plus lent)');
      assert.strictEqual(corps.options.num_ctx, 8192, 'le contexte tient dans 12 282 Mio a 8192');
      rep.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      rep.write('{"message":{"content":"Bon"},"done":false}\n');
      rep.write('{"message":{"content":"jour"},"done":false}\n');
      rep.end('{"message":{"content":"."},"done":true,"eval_count":3}\n');
    },
  });
  const morceaux = [];
  const r = await O.discuter({ port: f.port, modele: 'm', messages: [{ role: 'user', content: 'x' }], aFlux: (t) => morceaux.push(t) });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.texte, 'Bonjour.');
  assert.deepStrictEqual(morceaux, ['Bon', 'jour', '.']);
  f.srv.close();
});

test('une ligne illisible ne fait pas tout perdre : on garde ce qui a ete lu', async () => {
  const f = await fauxOllama({
    '/api/chat': (req, rep) => {
      rep.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      rep.end('{"message":{"content":"Bonjour"},"done":false}\nPAS DU JSON\n{"done":true}\n');
    },
  });
  const r = await O.discuter({ port: f.port, modele: 'm', messages: [] });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.texte, 'Bonjour');
  f.srv.close();
});

test('une derniere ligne SANS retour a la ligne final est quand meme traitee', async () => {
  // Defaut trouve par un relecteur sur l'instrument de mesure, et il serait plus
  // couteux ici : sans le reliquat, le dernier morceau de TEXTE serait perdu et
  // la reponse arriverait tronquee, en silence.
  const f = await fauxOllama({
    '/api/chat': (req, rep) => {
      rep.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      rep.end('{"message":{"content":"Bonjour"},"done":false}\n{"message":{"content":" la"},"done":true,"eval_count":7}');
    },
  });
  const r = await O.discuter({ port: f.port, modele: 'm', messages: [] });
  assert.strictEqual(r.texte, 'Bonjour la', 'le dernier morceau ne doit pas etre perdu');
  assert.strictEqual(r.jetons, 7, 'le `done` de la derniere ligne doit etre lu lui aussi');
  f.srv.close();
});

test('schema : le contenu JSON est rendu en OBJET, pas en texte', async () => {
  let corps = null;
  const f = await fauxOllama({
    '/api/chat': async (req, rep) => {
      corps = JSON.parse(await lireCorps(req));
      rep.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      rep.end('{"message":{"content":"{\\"choix\\":\\"1\\"}"},"done":true}\n');
    },
  });
  const r = await O.discuter({ port: f.port, modele: 'm', messages: [], schema: { type: 'object' } });
  f.srv.close();   // ferme AVANT d asserter : un rouge doit rendre la main
  assert.deepStrictEqual(r.objet, { choix: '1' });
  // I3 : la sortie structuree ne depend pas que de la lecture cote client, elle
  // depend entierement de la TRANSMISSION du schema au moteur. Sans cette ligne,
  // supprimer `corps.format = options.schema` laissait les 8 tests verts. Le corps
  // est releve puis asserte APRES le retour du client : une assertion qui leverait
  // dans le gestionnaire laisserait la requete sans reponse (constat M6, parque).
  assert.deepStrictEqual(corps.format, { type: 'object' }, 'le schema doit etre transmis au moteur dans corps.format');
});

// ---------- Fix round 1 (relecture de la tache 3) ----------
// C1 : `lireTout` n ecoutait pas l erreur de la reponse, donc `disponible()` et
// `modeles()` PENDAIENT definitivement quand la connexion mourait entre les
// en-tetes et la fin du corps. Ni le minuteur de 600 s ni `req.on('error')` ne
// pouvaient plus rien : le socket etait deja detruit. Ces deux tests sont les
// seuls du fichier qui distinguent « rendu » de « pendu » -- sans la course
// contre un minuteur, un retour au defaut ne rougit pas, il ne dit plus rien.

test('connexion coupee en plein corps : on rend une raison, on ne pend pas', async () => {
  const f = await fauxOllama({
    '/api/version': (req, rep) => {
      // Les en-tetes et un DEBUT de corps partent, puis le pair coupe : le client
      // a bien recu un 200, donc `req.on('error')` ne verra jamais rien.
      rep.writeHead(200, { 'Content-Type': 'application/json' });
      rep.write('{"version":"0.34');
      setTimeout(() => rep.socket.destroy(), 50);
    },
  });
  // Course contre un minuteur : c est la seule facon de distinguer « rendu » de
  // « pendu ». Un `await` nu attendrait pour toujours et ne dirait rien. Le
  // minuteur est ETEINT apres la course : sans cela, un test vert laisserait un
  // `setTimeout` de 5 s en vie et ferait payer ces 5 s a TOUTE la suite.
  let minuteurId;
  const minuteur = new Promise((r) => { minuteurId = setTimeout(() => r('PENDU'), 5000); });
  const r = await Promise.race([O.disponible(f.port), minuteur]);
  clearTimeout(minuteurId);
  f.srv.close();   // ferme AVANT d asserter : un rouge ne doit pas laisser un serveur ouvert
  assert.notStrictEqual(r, 'PENDU', 'disponible() ne doit JAMAIS pendre : un client qui pend est pire qu un client qui leve');
  assert.strictEqual(r.ok, false);
  assert.ok(r.raison && r.raison.length > 0, 'la raison doit etre lisible par un humain');
});

test('connexion coupee en plein corps : la liste des modeles ne pend pas non plus', async () => {
  // Meme defaut, meme `lireTout` : deux fonctions sur trois ne doivent pas pendre.
  const f = await fauxOllama({
    '/api/tags': (req, rep) => {
      rep.writeHead(200, { 'Content-Type': 'application/json' });
      rep.write('{"models":[{"name":"gem');
      setTimeout(() => rep.socket.destroy(), 50);
    },
  });
  let minuteurId;
  const minuteur = new Promise((r) => { minuteurId = setTimeout(() => r('PENDU'), 5000); });
  const r = await Promise.race([O.modeles(f.port), minuteur]);
  clearTimeout(minuteurId);
  f.srv.close();
  assert.notStrictEqual(r, 'PENDU', 'modeles() ne doit JAMAIS pendre');
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.noms, [], 'un echec rend une liste vide, jamais autre chose');
  assert.ok(r.raison && r.raison.length > 0);
});

// I2 : la liste VIDE etait le seul cas teste, donc `(o.models || []).map((m) => m.name)`
// n etait jamais parcouru -- renommer le champ lu restait vert et rendait
// `[undefined]` sur le vrai moteur. Le cas non vide ferme ce trou.

test('modeles : les noms sont lus sur le champ `name` de chaque entree', async () => {
  const f = await fauxOllama({
    '/api/tags': (req, rep) => {
      rep.writeHead(200, { 'Content-Type': 'application/json' });
      rep.end('{"models":[{"name":"gemma4:12b-it-q4_K_M","size":123},{"name":"qwen2.5:7b","size":456}]}');
    },
  });
  const r = await O.modeles(f.port);
  f.srv.close();   // ferme AVANT d asserter : un rouge doit rendre la main, pas laisser un serveur ouvert
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.noms, ['gemma4:12b-it-q4_K_M', 'qwen2.5:7b']);
});

// I1 : le test de l hote n assertait que la CONSTANTE exportee, pas son usage.
// Un hote lu dans une configuration dont le repli vaut 127.0.0.1 serait passe au
// vert. On passe donc des options d hote inconnues : si l hote etait lu quelque
// part, la requete partirait ailleurs (DNS en echec) et le serveur factice, qui
// n ecoute que sur 127.0.0.1, ne recevrait RIEN.

test('l hote ne peut pas etre detourne par une option : la requete part sur HOTE', async () => {
  const vues = [];
  const f = await fauxOllama({
    '/api/version': (req, rep) => { vues.push(req.url); rep.writeHead(200, { 'Content-Type': 'application/json' }); rep.end('{"version":"0.34.2"}'); },
    '/api/tags': (req, rep) => { vues.push(req.url); rep.writeHead(200, { 'Content-Type': 'application/json' }); rep.end('{"models":[]}'); },
    '/api/chat': (req, rep) => { vues.push(req.url); rep.writeHead(200, { 'Content-Type': 'application/x-ndjson' }); rep.end('{"message":{"content":"ok"},"done":true}\n'); },
  });
  // `hote` et `host` ne sont pas des options du module : elles doivent etre ignorees.
  const a = await O.disponible(f.port, { hote: 'exemple.invalid', host: 'exemple.invalid' });
  const b = await O.modeles(f.port);
  const c = await O.discuter({ port: f.port, modele: 'm', messages: [], hote: 'exemple.invalid', host: 'exemple.invalid' });
  f.srv.close();
  assert.strictEqual(a.ok, true, 'disponible() doit joindre HOTE, pas l hote fourni');
  assert.strictEqual(b.ok, true, 'modeles() doit joindre HOTE');
  assert.strictEqual(c.ok, true, 'discuter() doit joindre HOTE, pas l hote fourni');
  assert.deepStrictEqual(vues, ['/api/version', '/api/tags', '/api/chat'], 'le serveur de la boucle locale doit avoir recu les TROIS requetes');
});
