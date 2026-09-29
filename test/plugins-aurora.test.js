// Tests de la compatibilite des plugins Aurora.
//
// Le point le plus important : on ne declare JAMAIS un plugin casse sans source.
// La table « non fonctionnels » du guide est vide — inventer une liste ferait
// desinstaller des plugins qui marchent.
const { test } = require('node:test');
const assert = require('node:assert');
const P = require('../lib/plugins-aurora');

test('plugins : la liste suit le guide, et sa version de reference', () => {
  assert.strictEqual(P.VERSION_REFERENCE, 'Aurora 0.7b.2', 'le guide teste sur cette version');
  assert.strictEqual(P.PLUGINS.length, 5);
  const parId = Object.fromEntries(P.PLUGINS.map(p => [p.id, p]));
  assert.strictEqual(parId.ftpd.nom, 'FTPd');
  assert.strictEqual(parId.ftpd.auteur, 'Swizzy');
  assert.strictEqual(parId.ftpd.version, '1.0.3');
  assert.strictEqual(parId.ftpd.statut, 'ok');
  assert.strictEqual(parId.unity.statut, 'ok');
  assert.strictEqual(parId.f3.statut, 'ok');
  assert.strictEqual(parId.neighborhood.statut, 'inconnu');
  assert.strictEqual(parId.connectx.statut, 'inconnu');
});

test('plugins : AUCUN plugin n est declare casse, parce que le guide n en signale aucun', () => {
  // C'est la faute la plus facile et la plus couteuse ici : accuser un plugin qui
  // marche ferait desinstaller quelque chose d'utile.
  const casses = P.PLUGINS.filter(p => p.statut === 'casse');
  assert.deepStrictEqual(casses, [], 'le guide ne signale aucun plugin non fonctionnel');
  // Et un dossier inconnu ne doit jamais devenir « casse ».
  assert.strictEqual(P.statut('UnPluginBizarre').statut, 'inconnu');
  assert.notStrictEqual(P.statut('UnPluginBizarre').marque, P.STATUTS.casse.marque);
});

test('plugins : le dossier se reconnait malgre les variantes d ecriture', () => {
  // Sur la console de l'utilisateur le dossier s'appelle « FTPDll », le guide dit
  // « FTPd » : le meme plugin. Comparer a la lettre le raterait.
  assert.strictEqual(P.parDossier('FTPDll').id, 'ftpd');
  assert.strictEqual(P.parDossier('FTPd').id, 'ftpd');
  assert.strictEqual(P.parDossier('ftpd').id, 'ftpd');
  assert.strictEqual(P.parDossier('FTPd-1.0.3').id, 'ftpd');
  assert.strictEqual(P.parDossier('F3').id, 'f3');
  assert.strictEqual(P.parDossier('Neighborhood').id, 'neighborhood');
  assert.strictEqual(P.parDossier(''), null);
  assert.strictEqual(P.parDossier('RetroArch'), null);
});

test('plugins : un plugin connu rend son auteur, sa version et sa note', () => {
  const s = P.statut('FTPDll');
  assert.strictEqual(s.connu, true);
  assert.strictEqual(s.nom, 'FTPd');
  assert.strictEqual(s.marque, 'OK');
  assert.match(s.conseil, /0\.7b\.2/, 'on dit sur quelle version c\'est teste');
});

test('plugins : un plugin inconnu dit qu il est NON TESTE, pas casse', () => {
  const s = P.statut('Mystere');
  assert.strictEqual(s.connu, false);
  assert.strictEqual(s.marque, 'NON TESTE');
  assert.match(s.note, /pas dans la liste/);
  // Et on donne le moyen de revenir en arriere : c'est tout l'interet.
  assert.match(s.conseil, /supprime son dossier par FTP/);
});

test('plugins : la procedure de depannage existe et passe par le FTP', () => {
  // L'application sert a INSTALLER des plugins : elle doit dire comment s'en
  // sortir quand Aurora ne demarre plus. Sans cela, l'utilisateur se retrouve
  // avec un dashboard mort et aucun moyen de le savoir.
  assert.ok(P.DEPANNAGE.etapes.length >= 4);
  const t = P.DEPANNAGE.etapes.join(' ');
  assert.match(t, /FTP/, 'on se connecte en FTP, meme quand Aurora ne demarre plus');
  assert.match(t, /Plugins/, 'on supprime le dossier du plugin');
  assert.match(t, /Data\/cache/, 'puis le cache');
  assert.match(t, /settings\.db/, 'et settings.db en dernier recours');
  // L'ordre compte : on ne supprime PAS settings.db en premier, on perdrait tout.
  const iCache = t.indexOf('Data/cache');
  const iDb = t.indexOf('settings.db');
  assert.ok(iCache < iDb, 'le cache se tente AVANT settings.db');
});

test('plugins : les statuts portent la legende du guide', () => {
  assert.strictEqual(P.STATUTS.ok.texte, 'Fonctionne correctement');
  assert.match(P.STATUTS.partiel.texte, /partiellement/);
  assert.match(P.STATUTS.casse.texte, /plante|incompatible/);
  assert.match(P.STATUTS.inconnu.texte, /Non teste/);
  // La gravite sert au tri : ok < inconnu < casse.
  assert.ok(P.STATUTS.ok.gravite < P.STATUTS.inconnu.gravite);
  assert.ok(P.STATUTS.inconnu.gravite < P.STATUTS.casse.gravite);
});
