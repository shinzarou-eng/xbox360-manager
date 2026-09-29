// L'ETAT AGREGE DE LA CONSOLE, LE LANCEMENT VERIFIE, LES VOLUMES ANNOTES.
//
// Les cas qui cassaient en vrai, eprouves ici sur le VRAI texte de server.js
// (extrait et evalue, jamais recopie) :
//   - la vue affichait « connectee » alors que la session FTP etait morte ;
//   - magicboot acceptait « Usb0:\... » sur une cle montee en Usb1 : le
//     lancement « reussissait » dans le vide et le retour dashboard passait
//     pour un crash de jeu ;
//   - « Usb0 » et « Hdd1 » se ressemblaient dans l'explorateur : on installait
//     les GOD sur le mauvais support.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const srv = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extrait(debut, fin, nom) {
  const d = srv.indexOf(debut), f = srv.indexOf(fin);
  assert.ok(d > 0 && f > d, nom + ' doit etre trouvable dans server.js');
  return srv.slice(d, f);
}

// --- marquerVolumes : l'annotation des volumes a la racine -------------------
const VOL_SRC = extrait('function marquerVolumes', '// Au-dela', 'marquerVolumes');

test('marquerVolumes : HddX, Flash, Game et le support contenu ont leur role a la racine', () => {
  const VOL_ROLES = new Map();
  const cfg = { console: { racine: '/Hdd1' } };
  const f = new Function('cfg', 'VOL_ROLES', VOL_SRC + '\nreturn marquerVolumes;')(cfg, VOL_ROLES);
  const entrees = [
    { name: 'Hdd1', dir: true, path: '/Hdd1' },
    { name: 'Usb0', dir: true, path: '/Usb0' },
    { name: 'Flash', dir: true, path: '/Flash' },
    { name: 'HddX', dir: true, path: '/HddX' },
    { name: 'Game', dir: true, path: '/Game' },
    { name: 'default.xex', dir: false, path: '/default.xex' }
  ];
  f(entrees, '/');
  const roles = Object.fromEntries(entrees.filter(e => e.role).map(e => [e.name, e.role]));
  assert.strictEqual(roles.Hdd1, 'contenu', 'cfg.console.racine doit nommer le support contenu');
  assert.strictEqual(roles.Flash, 'systeme');
  assert.strictEqual(roles.HddX, 'xbox1');
  assert.strictEqual(roles.Game, 'aurora');
  assert.ok(!('Usb0' in roles), 'un volume inconnu ne porte pas de role invente');
  assert.ok(!entrees[5].role, 'un fichier ne porte jamais de role');
});

test('marquerVolumes : naviguer dans un volume APPREND son role, la racine le restitue', () => {
  const VOL_ROLES = new Map();
  const cfg = { console: {} };
  const f = new Function('cfg', 'VOL_ROLES', VOL_SRC + '\nreturn marquerVolumes;')(cfg, VOL_ROLES);
  // On visite /Usb0, qui contient « Games » -> « jeux » appris.
  f([{ name: 'Games', dir: true, path: '/Usb0/Games' }], '/Usb0');
  assert.strictEqual(VOL_ROLES.get('/Usb0'), 'jeux');
  // On visite /Hdd1, qui contient « Content » -> « contenu » appris.
  f([{ name: 'Content', dir: true, path: '/Hdd1/Content' }], '/Hdd1');
  assert.strictEqual(VOL_ROLES.get('/Hdd1'), 'contenu');
  // Retour a la racine : les roles appris s'affichent.
  const racine = [
    { name: 'Usb0', dir: true, path: '/Usb0' },
    { name: 'Hdd1', dir: true, path: '/Hdd1' }
  ];
  f(racine, '/');
  assert.strictEqual(racine[0].role, 'jeux');
  assert.strictEqual(racine[1].role, 'contenu');
});

// --- ftpAssure / ftpOp / ftpErreurMorte : la session qui se rouvre -----------
const FTPX_SRC = extrait('let RECONNECTE_EN_COURS = null;', '// Un chemin LOCAL', 'ftpAssure/ftpOp');
function chargeFtp() {
  const env = {
    FTP: null, Ftp: null, cfg: { console: { user: 'xboxftp' } }, secrets: {},
    // La file d'operations et le transfert actif vivent en module dans server.js ;
    // l'extrait les lit — il faut les fournir au scope evalue.
    FTP_JOBS: new Map(), FTP_ACTIF: null
  };
  const src = FTPX_SRC + '\nreturn { ftpAssure, ftpOp, ftpErreurMorte, ftpErreurDesalignee, setFTP: v => { FTP = v; }, getFTP: () => FTP };';
  const api = new Function('FTP', 'Ftp', 'cfg', 'secrets', 'FTP_JOBS', 'FTP_ACTIF', src)(env.FTP, env.Ftp, env.cfg, env.secrets, env.FTP_JOBS, env.FTP_ACTIF);
  return { api, env };
}

test('ftpErreurMorte : une coupure se rejoue, une erreur metier jamais', () => {
  const { api } = chargeFtp();
  assert.ok(api.ftpErreurMorte(new Error('connexion fermee par le serveur')));
  assert.ok(api.ftpErreurMorte(new Error('ECONNRESET')));
  assert.ok(!api.ftpErreurMorte(new Error('550 Fichier introuvable')),
    'un 550 dit quelque chose — le rejouer supposerait que le serveur a menti');
  assert.ok(!api.ftpErreurMorte(new Error('530 Mot de passe refuse')));
});

test('ftpAssure : une session FERMEE par nous ne revient pas toute seule', async () => {
  const { api } = chargeFtp();
  await assert.rejects(() => api.ftpAssure(), e => e.code === 'FTP_OFF',
    'FTP null = volontaire — la rouvrir desobeirait au bouton DECONNECTER');
});

test('ftpAssure : une session MORTE se rouvre avec les identifiants sauves', async () => {
  const { api, env } = chargeFtp();
  env.cfg.console.user = 'xboxftp';
  env.secrets.ftpPass = 'aaaaaa';
  let ouvertAvec = null;
  // Doublure de classe : on n'ouvre rien, on enregistre juste les identifiants.
  const FauxFtp = function (opts) {
    this.hote = opts.host; this.port = opts.port;
    this.ouvrir = async (u, p) => { ouvertAvec = { u, p }; this.estVivante = () => true; };
    this.fermer = async () => {};
  };
  // La session ancienne : vivante=false.
  const vieille = { hote: '192.168.1.34', port: 21, estVivante: () => false, fermer: async () => {} };
  const src = FTPX_SRC + '\nreturn { ftpAssure, getFTP: () => FTP };';
  const api2 = new Function('FTP', 'Ftp', 'cfg', 'secrets', src)(vieille, FauxFtp, env.cfg, env.secrets);
  const c = await api2.ftpAssure();
  assert.strictEqual(c.hote, '192.168.1.34', 'la session se rouvre sur la meme console');
  assert.deepStrictEqual(ouvertAvec, { u: 'xboxftp', p: 'aaaaaa' },
    'le mot de passe vient de secrets.json — l\'UI ne le possede pas');
  assert.strictEqual(api2.getFTP(), c, 'FTP globale doit pointer la nouvelle session');
});

test('ftpOp : une commande qui meurt en plein vol est rejouee UNE fois', async () => {
  const { api } = chargeFtp();
  const vivante = { hote: 'h', port: 21, estVivante: () => true, fermer: async () => {} };
  const src = FTPX_SRC + '\nreturn { ftpOp, setFTP: v => { FTP = v; } };';
  const api3 = new Function('FTP', 'Ftp', 'cfg', 'secrets', 'FTP_JOBS', 'FTP_ACTIF', src)(vivante, null, { console: {} }, {}, new Map(), null);
  let essais = 0;
  const r = await api3.ftpOp(c => { essais++; if (essais === 1) throw new Error('connexion fermee'); return 'ok:' + c.hote; });
  assert.strictEqual(r, 'ok:h');
  assert.strictEqual(essais, 2, 'un seul rejeu — pas de boucle');
  essais = 0;
  await assert.rejects(() => api3.ftpOp(() => { essais++; throw new Error('550 non'); }),
    () => (assert.strictEqual(essais, 1, 'erreur metier : jamais rejouee'), true));
});

// --- /api/console/etat : le bandeau ne ment plus -----------------------------
const ETAT_SRC = extrait("if (u.pathname === '/api/console/etat')", "if (u.pathname === '/api/xbdm/lancer'", 'console/etat');
function runEtat({ hote = '', ftp = null, xbdmErr = null, xbdm = null, jobs = [] }) {
  const u = { pathname: '/api/console/etat' };
  const cfg = { console: { host: hote, port: 21 } };
  const FTP_JOBS = new Map(jobs.map(j => [j.id, j]));
  const Xbdm = { statut: (h, cb) => xbdmErr ? cb(xbdmErr) : cb(null, xbdm) };
  const ftpPublic = j => ({ id: j.id, etat: j.etat });
  let retour;
  const json = v => { retour = v; return v; };
  const fn = new Function('u', 'cfg', 'FTP', 'FTP_JOBS', 'Xbdm', 'json', 'ftpPublic', ETAT_SRC);
  fn(u, cfg, ftp, FTP_JOBS, Xbdm, json, ftpPublic);
  return retour;
}

test('console/etat : aucune console reglee -> adresse vide, rien d\'invente', () => {
  const r = runEtat({ hote: '' });
  assert.strictEqual(r.ftp.connecte, false);
  assert.strictEqual(r.xbdm.disponible, false);
  assert.strictEqual(r.figee, false, 'une console jamais reglee n\'est pas « figee »');
  assert.deepStrictEqual(r.races, []);
});

test('console/etat : FTP mort + XBDM muet = « figee », le verdit que l\'ecran donnait deja', () => {
  const r = runEtat({ hote: '192.168.1.34', ftp: { estVivante: () => false, hote: '192.168.1.34', port: 21 }, xbdmErr: new Error('timeout') });
  assert.strictEqual(r.ftp.connecte, false);
  assert.strictEqual(r.xbdm.disponible, false);
  assert.strictEqual(r.figee, true, 'les DEUX canaux muets = la console a freeze, pas un refus reseau');
});

test('console/etat : FTP vivant + titre en cours -> le bandeau sait quoi afficher', () => {
  const r = runEtat({
    hote: '192.168.1.34',
    ftp: { estVivante: () => true, hote: '192.168.1.34', port: 21, systeme: 'Aurora FTP' },
    xbdm: { disponible: true, nom: 'Jtag', titre: 'Aurora', version: '1' },
    jobs: [{ id: 'ftp1', etat: 'actif' }]
  });
  assert.strictEqual(r.ftp.connecte, true);
  assert.strictEqual(r.ftp.systeme, 'Aurora FTP');
  assert.strictEqual(r.xbdm.titre, 'Aurora');
  assert.strictEqual(r.figee, false);
  assert.strictEqual(r.races.length, 1, 'les jobs voyagent dans la MEME reponse — un seul sondage');
});

// --- /api/xbdm/lancer-verifie : le chemin est prouve avant le lancement -------
const LANCER_SRC = extrait("if (u.pathname === '/api/xbdm/lancer-verifie'", "if (u.pathname === '/api/xbdm/reboot'", 'lancer-verifie');
async function runLancer({ chemin, ftpVivant = false, entrees = null, listeErreur = null, magicbootErr = null }) {
  const u = { pathname: '/api/xbdm/lancer-verifie' };
  const req = { method: 'POST' };
  const cfg = { console: { host: '192.168.1.34' } };
  const FTP = ftpVivant ? { estVivante: () => true } : { estVivante: () => false };
  const ftpOp = fn => listeErreur ? Promise.reject(listeErreur) : fn({ liste: async () => entrees || [] });
  const Xbdm = { magicboot: (h, c, cb) => cb(magicbootErr) };
  let retour;
  const json = v => { retour = v; return v; };
  // La route est `return body(async b => { ... })` : notre `body` propage la
  // promesse du handler pour que l'await du test voie le json final.
  const body = fn => fn({ chemin });
  const fn2 = new Function('u', 'req', 'cfg', 'FTP', 'ftpOp', 'Xbdm', 'json', 'body', LANCER_SRC);
  await fn2(u, req, cfg, FTP, ftpOp, Xbdm, json, body);
  return retour;
}

test('lancer-verifie : un chemin qui n\'est pas un .xex/.xbe DOS est refuse', async () => {
  const r = await runLancer({ chemin: '/Hdd1/Games/jeu' });
  assert.match(r.error, /xex|xbe/i);
});

test('lancer-verifie : FTP absent -> on lance quand meme, en l\'annoncant', async () => {
  const r = await runLancer({ chemin: 'Hdd1:\\Games\\jeu\\default.xex', ftpVivant: false });
  assert.strictEqual(r.ok, true, 'XBDM est independant du FTP — pas de raison de bloquer');
  assert.match(r.avertissement, /non verifie/i);
});

test('lancer-verifie : volume non monte -> erreur CLAIRE, pas un lancement dans le vide', async () => {
  const r = await runLancer({ chemin: 'Usb0:\\Games\\jeu\\default.xbe', ftpVivant: true, listeErreur: new Error('550 No such directory') });
  assert.match(r.error, /Usb0/);
  assert.match(r.error, /volume|monte/i);
});

test('lancer-verifie : dossier la mais fichier absent -> le nom est dans l\'erreur', async () => {
  const r = await runLancer({
    chemin: 'Hdd1:\\Games\\jeu\\default.xex', ftpVivant: true,
    entrees: [{ name: 'autre.xex', dir: false }, { name: 'Media', dir: true }]
  });
  assert.match(r.error, /default\.xex/);
  assert.match(r.error, /introuvable/i);
});

test('lancer-verifie : fichier present -> magicboot part, verdict remis au client', async () => {
  const r = await runLancer({
    chemin: 'Hdd1:\\Games\\jeu\\default.xex', ftpVivant: true,
    entrees: [{ name: 'default.xex', dir: false }]
  });
  assert.strictEqual(r.ok, true);
});

test('lancer-verifie : la casse du nom de fichier ne trompe pas la verification', async () => {
  const r = await runLancer({
    chemin: 'Hdd1:\\Games\\jeu\\DEFAULT.XEX', ftpVivant: true,
    entrees: [{ name: 'default.xex', dir: false }]
  });
  assert.strictEqual(r.ok, true, 'le serveur FTP de la console est insensible a la casse');
});
