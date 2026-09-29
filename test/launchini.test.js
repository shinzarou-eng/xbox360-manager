// launch.ini de DashLaunch.
//
// C'est le fichier le plus sensible du disque : `Default` designe ce qui se lance
// au demarrage. Un chemin invalide, et la console demarre sur RIEN. Les tests
// portent donc surtout sur ce qu'on ne doit PAS casser : l'edition ne doit
// jamais detruire les commentaires, l'ordre, ni les clefs inconnues — le
// launch.ini d'origine EST la documentation de l'utilisateur.
const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib/launchini');

// Extrait reduit mais fidele du fichier officiel (launch.xex V3.0, par cOz).
const REEL = [
  '; launch.xex V3.0 config file',
  '; parsed by simpleIni http://code.jellycan.com/simpleini/',
  '; internal hard disk    Hdd:\\',
  '; usb memory stick      Usb:\\',
  '',
  '[Paths]',
  'BUT_A = ',
  'BUT_B = ',
  'BUT_X = Hdd:\\Content\\0000000000000000\\C0DE9999\\00080000\\C0DE99990F586558',
  'Default = ',
  '',
  '; Default is what loads when you hold no buttons',
  '; leave this blank if you want NXE as default',
  'Guide = ',
  '',
  '[Plugins]',
  'plugin1 = Hdd:\\xbdm.xex',
  'plugin2 = ',
  '',
  '[Settings]',
  '; if not present default is TRUE',
  'nxemini = true',
  'liveblock = true',
  '; if not set this value will be FALSE',
  'fakelive = false',
  ''
].join('\n');

test('lire : sections, valeurs, et ce qui vient du catalogue', () => {
  const ini = L.lire(REEL);
  assert.deepStrictEqual(ini.sections, ['Paths', 'Plugins', 'Settings']);
  assert.strictEqual(ini.valeurs['Paths.BUT_X'], 'Hdd:\\Content\\0000000000000000\\C0DE9999\\000080000'.replace('000080000', '00080000') + '\\C0DE99990F586558');
  assert.strictEqual(ini.valeurs['Paths.Default'], '', 'une valeur vide est une valeur');
  assert.strictEqual(ini.valeurs['Plugins.plugin1'], 'Hdd:\\xbdm.xex');
  const opt = ini.options.find(o => o.section === 'Settings' && o.cle === 'nxemini');
  assert.strictEqual(opt.connu, true);
  assert.strictEqual(opt.type, 'bool');
  assert.strictEqual(opt.defaut, 'true', 'le defaut vient du commentaire officiel');
});

test('ecrire : les commentaires, l ordre et les clefs inconnues survivent', () => {
  // C'est LA regle : le launch.ini d'origine est la documentation. Le reecrire
  // proprement la detruirait.
  const ini = L.lire(REEL + 'MaClefPerso = garde-moi\n');
  const apres = L.ecrire(ini, { 'Paths.Default': 'Hdd:\\Aurora\\Aurora.xex', 'Settings.liveblock': 'false' });
  assert.match(apres, /; launch\.xex V3\.0 config file/, 'l\'en-tete est conserve');
  assert.match(apres, /; leave this blank if you want NXE as default/, 'les commentaires sont conserves');
  assert.match(apres, /; if not present default is TRUE/, 'y compris ceux au milieu');
  assert.match(apres, /MaClefPerso = garde-moi/, 'une clef inconnue n\'est jamais perdue');
  assert.match(apres, /^Default = Hdd:\\Aurora\\Aurora\.xex$/m);
  assert.match(apres, /^liveblock = false$/m);
  // L'ordre des sections ne bouge pas
  assert.ok(apres.indexOf('[Paths]') < apres.indexOf('[Plugins]'));
  assert.ok(apres.indexOf('[Plugins]') < apres.indexOf('[Settings]'));
});

test('ecrire : une clef absente est AJOUTEE dans sa section, pas ailleurs', () => {
  const ini = L.lire(REEL);
  const apres = L.ecrire(ini, { 'Plugins.plugin3': 'Hdd:\\JRPC2.xex' });
  const lignes = apres.split('\n');
  const iP = lignes.findIndex(l => l.trim() === '[Plugins]');
  const iS = lignes.findIndex(l => l.trim() === '[Settings]');
  const i3 = lignes.findIndex(l => l.startsWith('plugin3'));
  assert.ok(i3 > iP && i3 < iS, 'plugin3 est entre [Plugins] et [Settings]');
  assert.match(apres, /^plugin3 = Hdd:\\JRPC2\.xex$/m);
});

test('ecrire : une section absente est creee, sans toucher au reste', () => {
  const ini = L.lire(REEL);
  const apres = L.ecrire(ini, { 'Externals.ftpport': '21' });
  assert.match(apres, /^\[Externals\]$/m);
  assert.match(apres, /^ftpport = 21$/m);
  assert.match(apres, /; launch\.xex V3\.0 config file/, 'l\'en-tete tient toujours');
});

test('ecrire : vider une valeur laisse la clef, pas de suppression', () => {
  // Supprimer la LIGNE ferait disparaitre le commentaire qui la documente.
  const ini = L.lire(REEL);
  const apres = L.ecrire(ini, { 'Paths.BUT_X': '' });
  assert.match(apres, /^BUT_X = $/m);
  assert.match(apres, /^\[Paths\]$/m);
});

test('diagnostic : un appareil inconnu est une ERREUR', () => {
  // DashLaunch n accepte que ses prefixes d appareil. Se tromper, et le chemin
  // ne designe rien — au mieux le titre ne se lance pas.
  const avis = L.diagnostic(L.lire(REEL.replace('Hdd:\\xbdm.xex', 'D:\\xbdm.xex')));
  const e = avis.find(a => a.cle === 'Plugins.plugin1');
  assert.ok(e, 'le chemin invalide doit etre signale');
  assert.strictEqual(e.niveau, 'err');
  assert.match(e.texte, /Appareil inconnu/);
});

test('diagnostic : un Default renseigne previent qu il n y a plus de secours', () => {
  const avis = L.diagnostic(L.lire(L.ecrire(L.lire(REEL), { 'Paths.Default': 'Hdd:\\Aurora\\Aurora.xex' })));
  const a = avis.find(x => x.cle === 'Paths.Default');
  assert.ok(a);
  assert.strictEqual(a.niveau, 'info');
  assert.match(a.texte, /dashboard officiel/);
  // Default vide : aucun avertissement, c'est le cas normal
  assert.ok(!L.diagnostic(L.lire(REEL)).some(x => x.cle === 'Paths.Default'));
});

test('diagnostic : les contraintes croisees du fichier officiel', () => {
  // Ces regles sont ecrites noir sur blanc dans les commentaires de cOz.
  // On les pose avec ecrire(), pour qu'elles atterrissent dans la BONNE section —
  // un ajout en fin de fichier tomberait dans la derniere section lue.
  const poser = (paires, base) => L.ecrire(L.lire(base || REEL), paires);

  const faux = L.lire(poser({ 'Settings.fakelive': 'true', 'Settings.liveblock': 'false' }));
  assert.ok(L.diagnostic(faux).some(a => /force liveblock/.test(a.texte)), 'fakelive force liveblock');
  // ...et si liveblock est deja a true, il n'y a rien a signaler
  assert.ok(!L.diagnostic(L.lire(poser({ 'Settings.fakelive': 'true' }))).some(a => /force liveblock/.test(a.texte)));

  const auto = L.lire(poser({ 'Settings.autofake': 'true' }));
  assert.ok(L.diagnostic(auto).some(a => /aucun TitleID/.test(a.texte)), 'autofake sans TitleID ne sert a rien');
  // avec un TitleID, plus d'avertissement
  const autoOk = L.lire(poser({ 'Settings.autofake': 'true', 'Settings.autofake0': '0x4D5307E6' }));
  assert.ok(!L.diagnostic(autoOk).some(a => /aucun TitleID/.test(a.texte)));

  const swap = L.lire(poser({ 'Settings.autoswap': 'true' }));
  assert.ok(L.diagnostic(swap).some(a => /FSD/.test(a.texte)), 'autoswap avec FSD est deconseille');

  const strong = L.lire(poser({ 'Settings.livestrong': 'true' }));
  assert.ok(L.diagnostic(strong).some(a => /Aurora/.test(a.texte)), 'livestrong casse les jaquettes');

  const temp = L.lire(poser({ 'Settings.shuttemps': 'true', 'Settings.autooff': 'true' }));
  assert.ok(L.diagnostic(temp).some(a => /desactive autooff/.test(a.texte)), 'shuttemps annule autooff');
});

test('diagnostic : les valeurs de forme invalide', () => {
  const poser = paires => L.ecrire(L.lire(REEL), paires);
  assert.ok(L.diagnostic(L.lire(poser({ 'Externals.ftpport': '99999' }))).some(a => a.cle === 'Externals.ftpport' && a.niveau === 'err'));
  assert.ok(L.diagnostic(L.lire(poser({ 'Externals.ftpport': '21' }))).every(a => a.cle !== 'Externals.ftpport'), '21 est valide');
  assert.ok(L.diagnostic(L.lire(poser({ 'Settings.region': '7fff' }))).some(a => a.cle === 'Settings.region' && a.niveau === 'err'), 'le 0x est obligatoire');
  assert.ok(L.diagnostic(L.lire(poser({ 'Settings.region': '0x7fff' }))).every(a => a.cle !== 'Settings.region'), '0x7fff est valide');
  assert.ok(L.diagnostic(L.lire(REEL.replace('nxemini = true', 'nxemini = oui'))).some(a => a.cle === 'Settings.nxemini' && a.niveau === 'err'));
});

test('diagnostic : une clef hors catalogue est SIGNALEE, pas rejetee', () => {
  // DashLaunch ignore ce qu'il ne connait pas ; l'editeur doit le conserver ET
  // le dire, sinon l'utilisateur croit que sa ligne sert a quelque chose.
  const avis = L.diagnostic(L.lire(REEL + '\nMaClefPerso = x\n'));
  const a = avis.find(x => /hors catalogue/.test(x.texte));
  assert.ok(a);
  assert.match(a.texte, /MaClefPerso/);
  assert.strictEqual(a.niveau, 'info');
});

test('les prefixes d appareil sont ceux de DashLaunch', () => {
  assert.deepStrictEqual(L.APPAREILS, ['Hdd', 'Usb', 'UsbMu', 'Mu', 'FlashMu', 'IntMu', 'MmcMu', 'Dvd', 'Sfc']);
  for (const d of L.APPAREILS) assert.ok(L.RE_CHEMIN.test(d + ':\\x.xex'), d + ' doit etre accepte');
  // La casse ne compte pas : DashLaunch compare sans y preter attention.
  assert.ok(L.RE_CHEMIN.test('hdd:\\x.xex'));
  assert.ok(!L.RE_CHEMIN.test('C:\\x.xex'));
});

test('diagnostic : une clef en double est SIGNALEE (la premiere gagne)', () => {
  // simpleIni refuse les clefs multiples. Dans un fichier de 80 lignes
  // commentees, la deuxieme est invisible — et sans effet.
  const avis = L.diagnostic(L.lire(REEL.replace('nxemini = true', 'nxemini = true\nnxemini = false')));
  const a = avis.find(x => x.cle === 'Settings.nxemini' && /plusieurs fois/.test(x.texte));
  assert.ok(a, 'le doublon doit etre signale');
  assert.strictEqual(a.niveau, 'warn');
  // et c'est bien la PREMIERE valeur qui est retenue
  assert.strictEqual(L.lire(REEL.replace('nxemini = true', 'nxemini = true\nnxemini = false')).valeurs['Settings.nxemini'], 'true');
});
