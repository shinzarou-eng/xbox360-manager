// Client FTP — eprouve contre un serveur ECONTRE en process (test/aide-ftp.js).
//
// Un client de protocole ne se teste pas contre une vraie console : on ne peut ni
// choisir le format des listes, ni provoquer un refus, ni verifier la sequence des
// commandes. Les cas couverts ici sont ceux qui cassent en vrai :
//   - la banniere sur PLUSIEURS lignes (un client naif lit « 220- » et se
//     desynchronise pour tout le reste de la session) ;
//   - l'absence d'EPSV (beaucoup de serveurs Xbox ne l'ont pas) ;
//   - une reponse PASV avec une IP inutilisable (console derriere un NAT) ;
//   - l'absence de MLSD, et une liste au format Unix puis DOS.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { Ftp, joinFtp, messageLisible } = require('../lib/ftp');
const { ServeurFtp } = require('./aide-ftp');

function bac() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'x360-ftp-'));
  fs.writeFileSync(path.join(d, 'default.xex'), Buffer.alloc(2048, 7));
  fs.writeFileSync(path.join(d, 'jeu accentué.iso'), Buffer.from('contenu iso'));
  fs.mkdirSync(path.join(d, 'DLC'));
  fs.writeFileSync(path.join(d, 'DLC', 'pack.bin'), Buffer.alloc(512, 3));
  return d;
}

async function avecServeur(opts, fn) {
  const racine = bac();
  const srv = await new ServeurFtp(racine, opts).demarrer();
  const c = new Ftp({ host: '127.0.0.1', port: srv.port, timeout: 8000 });
  try { return await fn(c, srv, racine); }
  finally { try { await c.fermer(); } catch {} await srv.arreter(); fs.rmSync(racine, { recursive: true, force: true }); }
}

test('connexion : la banniere sur PLUSIEURS lignes ne desynchronise pas', async () => {
  await avecServeur({ banniereMultiple: true }, async c => {
    await c.ouvrir('xboxftp', 'xboxftp');
    // si la banniere avait ete mal lue, ce PWD recevrait la fin de la banniere
    assert.strictEqual(await c.pwd(), '/');
  });
});

test('connexion : mot de passe refuse, avec le message du serveur', async () => {
  await avecServeur({}, async c => {
    await assert.rejects(() => c.ouvrir('xboxftp', 'faux'), e => {
      assert.match(e.message, /mot de passe/i, 'le refus du serveur doit remonter tel quel : ' + e.message);
      return true;
    });
  });
});

test('connexion refusee : message clair, pas un plantage', async () => {
  const c = new Ftp({ host: '127.0.0.1', port: 1, timeout: 3000 });
  await assert.rejects(() => c.ouvrir('a', 'b'), e => {
    assert.match(e.message, /FTP :/, 'message : ' + e.message);
    return true;
  });
});

test('listing en MLSD quand le serveur l annonce', async () => {
  await avecServeur({ mlsd: true, epsv: true }, async (c, srv) => {
    await c.ouvrir('xboxftp', 'xboxftp');
    assert.strictEqual(c.mlsd, true, 'FEAT annonce MLSD');
    const l = await c.liste('/');
    const noms = l.map(x => x.name).sort();
    assert.deepStrictEqual(noms, ['DLC', 'default.xex', 'jeu accentué.iso']);
    const dossier = l.find(x => x.name === 'DLC');
    assert.strictEqual(dossier.dir, true);
    const iso = l.find(x => x.name === 'jeu accentué.iso');
    assert.strictEqual(iso.dir, false);
    assert.strictEqual(iso.size, 'contenu iso'.length);
    // ON SE DEPLACE, PUIS ON LISTE SANS ARGUMENT. FtpDll (Aurora) ignore le
    // chemin passe a LIST : « LIST /Game » ne ramenait jamais Game, et
    // l'interface affichait « /Game/Game/Game » pendant que la liste ne bougeait
    // pas. On verifie donc que le chemin passe par CWD, et JAMAIS par la commande
    // de listing.
    assert.ok(srv.commandes.includes('CWD /'), 'le chemin doit passer par CWD : ' + srv.commandes.join(' | '));
    assert.ok(srv.commandes.includes('MLSD'), 'la commande de listing doit etre MLSD');
    assert.ok(!srv.commandes.some(x => /^(MLSD|LIST) \S/.test(x)), 'la commande de listing ne doit porter AUCUN chemin');
  });
});

test('repli sur LIST quand MLSD est refuse', async () => {
  await avecServeur({ mlsd: false, epsv: true }, async (c, srv) => {
    await c.ouvrir('xboxftp', 'xboxftp');
    assert.strictEqual(c.mlsd, false, 'FEAT n annonce pas MLSD : on ne l essaie meme pas');
    const l = await c.liste('/');
    assert.ok(l.some(x => x.name === 'default.xex' && x.size === 2048), 'format Unix analyse');
    assert.ok(srv.commandes.includes('LIST'));
    assert.ok(!srv.commandes.some(x => /^LIST \S/.test(x)), 'LIST ne porte aucun chemin');
  });
});

test('repli : MLSD annonce mais refuse a l usage', async () => {
  // Le serveur annonce MLSD puis repond 500 : le client doit retomber sur LIST
  // sans laisser la session dans un etat incoherent.
  await avecServeur({ mlsd: true, epsv: true }, async (c, srv) => {
    await c.ouvrir('xboxftp', 'xboxftp');
    const avant = srv.commandes.length;
    srv.mlsd = false;                       // il ne repondra plus a MLSD
    const l = await c.liste('/');
    assert.ok(l.length >= 3, 'la liste doit revenir malgre le refus');
    assert.ok(srv.commandes.slice(avant).includes('LIST'), 'repli sur LIST');
  });
});

test('repli sur PASV, meme avec une IP annoncee inutilisable', async () => {
  // Le serveur de test annonce 10.0.0.99 dans sa reponse PASV : le client doit
  // garder l'hote du canal de controle, sinon il ne se connecte nulle part.
  await avecServeur({ epsv: false, mlsd: true }, async (c, srv) => {
    await c.ouvrir('xboxftp', 'xboxftp');
    const l = await c.liste('/');
    assert.ok(l.length >= 3, 'la liste passe par PASV');
    assert.ok(srv.commandes.includes('EPSV'), 'EPSV est essaye d abord');
    assert.ok(srv.commandes.includes('PASV'), 'puis PASV');
  });
});

test('envoyer un fichier (STOR) et le relire (RETR)', async () => {
  await avecServeur({}, async (c, srv, racine) => {
    await c.ouvrir('xboxftp', 'xboxftp');
    const local = path.join(racine, 'envoi.bin');
    const contenu = Buffer.alloc(300 * 1024);
    for (let i = 0; i < contenu.length; i++) contenu[i] = i % 251;
    fs.writeFileSync(local, contenu);

    const vus = [];
    await c.envoyer(local, '/Content/0000000000000000/4D5307E6/00000002/pack.bin', (e, t) => vus.push([e, t]));
    const arrive = path.join(racine, 'Content', '0000000000000000', '4D5307E6', '00000002', 'pack.bin');
    assert.ok(fs.existsSync(arrive), 'le fichier doit arriver, dossiers crees au besoin');
    assert.strictEqual(fs.readFileSync(arrive).length, contenu.length);
    assert.ok(vus.length > 0, 'la progression doit etre rapportee');
    assert.strictEqual(vus[vus.length - 1][0], contenu.length);
    assert.strictEqual(vus[vus.length - 1][1], contenu.length);

    const retour = path.join(racine, 'retour.bin');
    const vus2 = [];
    const r = await c.telecharger('/Content/0000000000000000/4D5307E6/00000002/pack.bin', retour, (x, y) => vus2.push([x, y]));
    assert.ok(fs.readFileSync(retour).equals(contenu), 'le contenu doit etre identique');
    assert.strictEqual(r.total, contenu.length);
    assert.ok(vus2.length > 0, 'progression du telechargement');
  });
});

test('transfert en BINAIRE, jamais en ASCII', async () => {
  // Sans TYPE I, un serveur traduit les fins de ligne et corrompt le fichier.
  await avecServeur({}, async (c, srv) => {
    await c.ouvrir('xboxftp', 'xboxftp');
    const i = srv.commandes.length;
    await c.telecharger('/default.xex', path.join(os.tmpdir(), 'x360-xex-' + process.pid + '.tmp'));
    const faites = srv.commandes.slice(i);
    assert.ok(faites.includes('TYPE I'), 'TYPE I doit preceder le transfert : ' + faites.join(' | '));
    fs.rmSync(path.join(os.tmpdir(), 'x360-xex-' + process.pid + '.tmp'), { force: true });
  });
});

test('creer, renommer, supprimer', async () => {
  await avecServeur({}, async (c, srv) => {
    await c.ouvrir('xboxftp', 'xboxftp');
    await c.mkd('/Nouveau');
    assert.ok(srv.commandes.includes('MKD /Nouveau'));
    await c.renommer('/Nouveau', '/Renomme');
    assert.ok(fs.existsSync(path.join(srv.racine, 'Renomme')));
    await c.supprimerDossier('/Renomme');
    assert.ok(!fs.existsSync(path.join(srv.racine, 'Renomme')));
  });
});

test('un fichier absent donne l erreur du serveur, pas un silence', async () => {
  await avecServeur({}, async c => {
    await c.ouvrir('xboxftp', 'xboxftp');
    await assert.rejects(
      () => c.telecharger('/inexistant.iso', path.join(os.tmpdir(), 'x360-abs.tmp')),
      e => { assert.match(e.message, /introuvable/i, 'message : ' + e.message); return true; }
    );
  });
});

test('les trois formats de liste sont analyses', async () => {
  const c = new Ftp({ host: 'x', port: 1 });
  // MLSD
  const a = c._analyser('type=dir;size=0;modify=20240102030405; Mes Jeux\r\ntype=file;size=1234;modify=20240102030405; halo 3.iso\r\n', '/');
  assert.strictEqual(a.length, 2);
  assert.strictEqual(a[0].name, 'Mes Jeux');
  assert.strictEqual(a[0].dir, true);
  assert.strictEqual(a[1].size, 1234);
  assert.strictEqual(a[1].path, '/halo 3.iso');
  // Unix (le nom peut contenir des espaces)
  const b = c._analyser('-rw-r--r-- 1 xboxftp xboxftp 4096 Jan 01 12:00 mon jeu.iso\r\ndrwxr-xr-x 1 x x 0 Jan 01 12:00 DLC\r\n', '/Games');
  assert.strictEqual(b.length, 2);
  assert.strictEqual(b[0].name, 'mon jeu.iso');
  assert.strictEqual(b[0].path, '/Games/mon jeu.iso');
  assert.strictEqual(b[1].dir, true);
  // DOS
  const d = c._analyser('01-02-24  12:00PM       <DIR>          Content\r\n01-02-24  12:00PM             12345   pack.bin\r\n', '/');
  assert.strictEqual(d.length, 2);
  assert.strictEqual(d[0].dir, true);
  assert.strictEqual(d[1].name, 'pack.bin');
  assert.strictEqual(d[1].size, 12345);
  // Les entrees techniques sont ignorees.
  assert.deepStrictEqual(c._analyser('type=cdir;modify=20240102030405; .\r\ntype=pdir;modify=20240102030405; ..\r\n', '/'), []);
});

test('une reponse multiligne est lue en entier', async () => {
  // FEAT repond « 211- » puis des lignes, puis « 211 ». Le client doit rendre la
  // reponse complete et laisser la session alignee.
  await avecServeur({}, async c => {
    await c.ouvrir('xboxftp', 'xboxftp');
    const r = await c.commande('FEAT');
    assert.strictEqual(r.code, 211);
    assert.match(r.texte, /MLSD/);
    assert.strictEqual(await c.pwd(), '/', 'la session reste alignee');
  });
});

test('joinFtp ne produit jamais de double slash', () => {
  assert.strictEqual(joinFtp('/', 'Hdd1'), '/Hdd1');
  assert.strictEqual(joinFtp('/Hdd1/', 'Content'), '/Hdd1/Content');
  assert.strictEqual(joinFtp('/Hdd1', '/Content'), '/Hdd1/Content');
  assert.strictEqual(joinFtp('', 'Hdd1'), '/Hdd1');
});

test('un echec reseau est traduit en quelque chose d actionnable', () => {
  // « connect ECONNREFUSED 127.0.0.1:2129 » ne dit pas a l'utilisateur que le
  // serveur FTP de sa console est simplement arrete, ni ou l'allumer. C'est
  // exactement le message qu'il a fallu expliquer a la main.
  const cas = [
    ['connect ECONNREFUSED 127.0.0.1:2129', /rien n'écoute|serveur FTP de la console est activé/i],
    ['connect EHOSTUNREACH 192.168.1.34:21', /injoignable|même réseau/i],
    ['getaddrinfo ENOTFOUND xbox', /introuvable/i],
    ['FTP : delai depasse (20000 ms) sur USER', /aucune réponse|pare-feu/i],
    ['FTP : connexion fermee par 192.168.1.34', /coupé la connexion|une seule session/i],
    ['FTP 530 sur PASS : Login failed', /mot de passe refusé|nom d'utilisateur, lui, est accepté/i],
  ];
  for (const [brut, attendu] of cas) {
    const msg = messageLisible(new Error(brut), '127.0.0.1', 2129);
    assert.match(msg, attendu, brut + ' -> ' + msg);
    assert.ok(msg.length > 30, 'le message doit expliquer, pas juste constater : ' + msg);
  }
  // la reponse BRUTE de la console est jointe : c'est le seul indice quand elle
  // explique elle-meme son refus (« Login failed: input = <md5>, pass = <md5> »)
  {
    const msg = messageLisible(new Error('FTP 530 sur PASS : Login failed: input = 443D, pass = 0B4E'), '10.0.0.1', 21);
    assert.match(msg, /0B4E/, 'la reponse du serveur doit etre conservee : ' + msg);
  }
  // un cas imprevu remonte tel quel : c'est la seule information diagnostique
  assert.strictEqual(messageLisible(new Error('FTP 500 sur TRUC : bizarre'), 'h', 1), 'FTP 500 sur TRUC : bizarre');
});

test('ftp : les DEUX couples d identifiants par defaut sont cites', () => {
  // Le guide Aurora FR 2026 donne `xbox` / `xbox` comme valeurs par defaut du
  // plugin FTP d'Aurora. Le serveur FtpDll, lui, utilise `xboxftp` — c'est ce que
  // la console de l'utilisateur a. N'en citer qu'un envoie la moitie des gens sur
  // une fausse piste : ils concluent a une panne alors qu'ils ont le mauvais couple.
  const { messageLisible } = require('../lib/ftp');
  const mdp = messageLisible(new Error('FTP 530 Login incorrect'), '192.168.1.42', 21);
  assert.match(mdp, /xbox \/ xbox/, 'le couple du plugin Aurora doit etre cite');
  assert.match(mdp, /xboxftp \/ xboxftp/, 'et celui de FtpDll aussi');

  const user = messageLisible(new Error('FTP 332 Need account for login'), '192.168.1.42', 21);
  assert.match(user, /xbox/, 'les deux valeurs doivent etre citees');
  assert.match(user, /xboxftp/);

  // La reponse BRUTE de la console reste jointe : c'est le seul indice sur ce qui
  // a ete refuse exactement.
  assert.match(mdp, /530/, 'la reponse de la console doit rester lisible');
});

test('ftp : une connexion coupee dit les trois causes du guide', () => {
  // Le guide est precis sur les coupures : session unique, Wi-Fi qui lache sur les
  // gros fichiers (il conseille le cable Ethernet), envoi trop gros d'un coup.
  const { messageLisible } = require('../lib/ftp');
  const m = messageLisible(new Error('ECONNRESET'), '192.168.1.42', 21);
  assert.match(m, /UNE seule session/i, 'la session unique d abord');
  assert.match(m, /Ethernet/i, 'le cable, que le guide conseille');
  assert.match(m, /un par un/i, 'et l envoi paquet par paquet');
});

test('estVivante : la socket de controle dit si la session tient encore', async () => {
  // Le serveur FtpDll coupe volontiers la session entre deux clics, en silence :
  // sans cette verification, l'interface affichait « connectee » sur une session
  // morte et chaque commande suivante echouait en « connexion fermee ».
  await avecServeur({}, async c => {
    assert.strictEqual(c.estVivante(), false, 'pas connectee -> pas vivante');
    await c.ouvrir('xboxftp', 'xboxftp');
    assert.strictEqual(c.estVivante(), true, 'session ouverte -> vivante');
    c.sock.destroy();                          // la coupure que la console provoque
    assert.strictEqual(c.estVivante(), false, 'socket detruite -> morte');
  });
});
