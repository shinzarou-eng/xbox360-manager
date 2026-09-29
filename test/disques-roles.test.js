// Tests des roles de disque.
//
// Le choix du disque n'est pas cosmetique : un disque FAT32 refuse tout fichier
// de plus de 4 Go, et une image Xbox 360 en fait 7 a 8. L'application le savait
// deja, mais ne le disait qu'APRES l'echec.
const { test } = require('node:test');
const assert = require('node:assert');
const D = require('../lib/disques');

const GO = 1073741824;

test('disques : chaque disque dit a quoi il sert', () => {
  const R = D.decrire({
    disques: [{ letter: 'H', free: 800 * GO, total: 1000 * GO, auto: true },
              { letter: 'D', free: 400 * GO, total: 1000 * GO }],
    fsTypes: { 'H:': 'NTFS', 'D:': 'NTFS' },
    cfg: { games: 'H:\\Games', drop: 'D:\\_A_TRIER', content: 'D:\\Content' }
  });
  const h = R.disques.find(x => x.letter === 'H');
  const d = R.disques.find(x => x.letter === 'D');
  assert.deepStrictEqual(h.roles, ['jeux']);
  assert.deepStrictEqual(d.roles.sort(), ['contenu', 'depot']);
  assert.match(h.resume, /NTFS/);
  assert.match(h.resume, /Jeux installés/, 'le resume doit NOMMER le role');
  assert.match(d.resume, /Dépôt/);
});

test('disques : un chemin profond remonte bien a sa racine', () => {
  // « H:\Games\4D5307E6\00007000 » est sur H:, pas sur une racine inventee.
  assert.strictEqual(D.racineDe('H:\\Games\\4D5307E6'), 'H:');
  assert.strictEqual(D.racineDe('h:/Games'), 'H:');
  assert.strictEqual(D.racineDe('C:\\'), 'C:');
  assert.strictEqual(D.racineDe(''), '');
  const R = D.decrire({
    disques: [{ letter: 'H', free: 1, total: 2 }],
    cfg: { games: 'H:\\Games\\Deep\\Path' }
  });
  assert.deepStrictEqual(R.disques[0].roles, ['jeux']);
});

test('disques : le piege FAT32 est dit AVANT, pas apres l echec', () => {
  // C'est la raison d'etre de ce module : l'application connaissait la limite,
  // mais ne l'annoncait qu'au moment ou le telechargement echouait.
  const R = D.decrire({
    disques: [{ letter: 'E', free: 30 * GO, total: 32 * GO }],
    fsTypes: { 'E:': 'FAT32' },
    cfg: {}
  });
  assert.strictEqual(R.disques[0].grosFichiers, false);
  assert.match(R.disques[0].avertissement, /4 Go/);
  assert.match(R.disques[0].avertissement, /7 à 8/, 'on explique POURQUOI ca compte');
});

test('disques : NTFS et exFAT acceptent les gros fichiers', () => {
  for (const fs of ['NTFS', 'exFAT', 'ext4', 'btrfs']) {
    const R = D.decrire({ disques: [{ letter: 'X', free: 500 * GO, total: GO }], fsTypes: { 'X:': fs } });
    assert.strictEqual(R.disques[0].grosFichiers, true, fs + ' doit accepter les gros fichiers');
    assert.strictEqual(R.disques[0].avertissement, null);
  }
  // Un systeme INCONNU ne doit ni promettre ni interdire.
  const inconnu = D.decrire({ disques: [{ letter: 'Y', free: GO, total: GO }] }).disques;
  assert.strictEqual(inconnu[0].grosFichiers, null);
  assert.strictEqual(inconnu[0].avertissement, null);
});

test('disques : le disque systeme est marque, et jamais conseille', () => {
  const R = D.decrire({
    disques: [{ letter: 'C', free: 200 * GO, total: 1000 * GO }, { letter: 'H', free: 800 * GO, total: 1000 * GO }],
    fsTypes: { 'C:': 'NTFS', 'H:': 'NTFS' },
    cfg: {}, systeme: 'C'
  });
  assert.strictEqual(R.disques.find(x => x.letter === 'C').systeme, true);
  assert.deepStrictEqual(R.disques.find(x => x.letter === 'C').roles, ['systeme']);
  // On ne propose pas d'installer des jeux sur le disque systeme.
  const c = D.conseiller(R.disques, 'jeux');
  assert.ok(!c.some(x => x.letter === 'C'), 'le disque systeme ne doit pas etre propose');
});


test('disques : le conseil CLASSE, il ne decide pas', () => {
  const DJ = D.decrire({
    disques: [
      { letter: 'E', free: 30 * GO, total: 32 * GO },
      { letter: 'H', free: 800 * GO, total: 1000 * GO },
      { letter: 'F', free: 10 * GO, total: 500 * GO }
    ],
    fsTypes: { 'E:': 'FAT32', 'H:': 'NTFS', 'F:': 'NTFS' },
    cfg: {}
  });
  const c = D.conseiller(DJ.disques, 'jeux');
  // Un disque FAT32 ne doit jamais arriver premier pour des jeux, meme s'il est
  // le seul « libre » : il ne peut pas porter les fichiers.
  assert.strictEqual(c[0].letter, 'H');
  assert.strictEqual(c[c.length - 1].letter, 'E');
  assert.ok(c.find(x => x.letter === 'E').raisons.some(r => /4 Go/.test(r)));
  // Et on explique POURQUOI, pas seulement combien.
  assert.ok(c[0].raisons.some(r => /gros fichiers/.test(r)));
});

test('disques : un disque qui porte deja l usage est prefere', () => {
  // On ne disperse pas : si le depot est deja sur D:, le prochain depot va sur D:.
  const DJ = D.decrire({
    disques: [{ letter: 'D', free: 100 * GO, total: 500 * GO }, { letter: 'H', free: 900 * GO, total: 1000 * GO }],
    fsTypes: { 'D:': 'NTFS', 'H:': 'NTFS' },
    cfg: { drop: 'D:\\_A_TRIER' }
  });
  const c = D.conseiller(DJ.disques, 'depot');
  assert.strictEqual(c[0].letter, 'D');
  assert.ok(c[0].raisons.some(r => /porte déjà/.test(r)), 'la raison doit etre donnee');
});

test('disques : un disque non utilise le dit', () => {
  const R = D.decrire({ disques: [{ letter: 'Z', free: 5 * GO, total: 10 * GO }], fsTypes: { 'Z:': 'NTFS' }, cfg: {} });
  assert.deepStrictEqual(R.disques[0].roles, []);
  assert.match(R.disques[0].resume, /non utilisé/);
});

test('disques : les tailles se lisent en un coup d oeil', () => {
  assert.strictEqual(D.fmt(0), '0 o');
  assert.strictEqual(D.fmt(500), '500 o');
  assert.strictEqual(D.fmt(2 * 1024 * 1024), '2 Mo');
  assert.match(D.fmt(5 * GO), /^5\.0 Go$/);
  assert.match(D.fmt(2 * 1024 * GO), /^2\.0 To$/);
});


test('disques : un role configure sur un disque ABSENT est signale', () => {
  // Sans cela, le disque debranche disparait de la liste et l'utilisateur lit
  // « D: non utilise » alors que l'application cherche encore ses jeux sur un H:
  // qui n'est plus la. Le manque serait invisible, donc impossible a corriger.
  const R = D.decrire({
    disques: [{ letter: 'D', free: 400 * GO, total: 1000 * GO }],
    fsTypes: { 'D:': 'NTFS' },
    cfg: { games: 'H:\\Games', drop: 'H:\\_A_TRIER' }
  });
  assert.strictEqual(R.absents.length, 1);
  assert.strictEqual(R.absents[0].cle, 'H:');
  assert.deepStrictEqual(R.absents[0].roles.sort(), ['depot', 'jeux']);
  assert.match(R.absents[0].roleTexte, /Jeux installés/);
  // Et un disque present ne doit PAS etre declare absent.
  assert.deepStrictEqual(D.decrire({ disques: [{ letter: 'D', free: GO, total: GO }], cfg: { games: 'D:\\Games' } }).absents, []);
});

test('disques : le role Aurora est reconnu, et les libelles courts tiennent', () => {
  // E:\Aurora porte Aurora, ses scripts et ses plugins : le role le PLUS important
  // de la clef, et le seul que l'application taisait — elle n'affichait que
  // « Homebrew · Emulateurs ».
  const R = D.decrire({
    disques: [{ letter: 'E', free: 101 * GO, total: 115 * GO }],
    fsTypes: { 'E:': 'FAT32' },
    cfg: { homebrew: 'E:\\Homebrew', emulators: 'E:\\Emulators' },
    aurora: ['E:\\Aurora']
  });
  const e = R.disques[0];
  assert.ok(e.roles.includes('aurora'), 'le disque d Aurora doit porter le role');
  assert.ok(e.roles.includes('homebrew') && e.roles.includes('emulateurs'));
  assert.match(e.roleTexte, /Aurora/, 'le libelle long nomme Aurora');
  assert.match(e.roleCourt, /Aurora/, 'et le court aussi');

  // LE COURT DOIT ETRE PLUS COURT QUE LE LONG, sinon il ne sert a rien : c'est
  // la longueur qui poussait la liste hors de la fenetre.
  assert.ok(e.roleCourt.length < e.roleTexte.length,
    'le libelle court (' + e.roleCourt + ') doit etre plus court que ' + e.roleTexte);

  // Et sur la clef complete : trois roles, libelle court sous 30 caracteres.
  const R2 = D.decrire({
    disques: [{ letter: 'E', free: 101 * GO, total: 115 * GO }],
    fsTypes: { 'E:': 'FAT32' },
    cfg: { homebrew: 'E:\\Homebrew', emulators: 'E:\\Emulators', games: 'E:\\Games' },
    aurora: ['E:\\Aurora']
  });
  // PLAFOND MESURE, pas invente : le selecteur fait 270 px et la police environ
  // 6,5 px par caractere, soit ~41 — moins la lettre, l'espace libre et le
  // separateur. Au-dela, la fin du libelle passe sous le bord.
  assert.ok(R2.disques[0].roleCourt.length <= 34,
    'libelle court trop long pour 270 px : ' + R2.disques[0].roleCourt
    + ' (' + R2.disques[0].roleCourt.length + ' caracteres)');
});

test('disques : chaque role a un libelle court', () => {
  // Un role sans libelle court retomberait sur son nom technique : « emulateurs »
  // s'afficherait tel quel dans le menu.
  const tousLesRoles = ['jeux', 'depot', 'contenu', 'homebrew', 'emulateurs', 'aurora', 'systeme'];
  const R = D.decrire({
    disques: [{ letter: 'Z', free: 10 * GO, total: 20 * GO }],
    fsTypes: { 'Z:': 'NTFS' },
    cfg: { games: 'Z:\\Games', drop: 'Z:\\_A_TRIER', content: 'Z:\\Content', homebrew: 'Z:\\Homebrew', emulators: 'Z:\\Emulators' },
    aurora: ['Z:\\Aurora']
  });
  const roles = R.disques[0].roles;
  for (const r of roles) {
    assert.ok(tousLesRoles.includes(r), 'role inattendu : ' + r);
  }
  // Le libelle court ne doit jamais etre le nom technique.
  for (const r of roles) {
    const court = R.disques[0].roleCourt;
    assert.ok(!court.includes(r + ' '), 'le nom technique « ' + r + ' » ne doit pas apparaitre tel quel');
  }
});

test('disques : la CONSOLE ne lit que le FAT32, et ca se dit', () => {
  // DEUX QUESTIONS DIFFERENTES, longtemps confondues :
  //   « puis-je ecrire ici ? »      NTFS et exFAT : parfait. FAT32 : 4 Go max.
  //   « la console lira-t-elle ? »  FAT32 UNIQUEMENT.
  //
  // Un disque NTFS rempli de jeux s'affichait donc « Jeux installes · Contenu »,
  // sans le moindre avertissement, et la console n'y voyait RIEN. C'est le defaut
  // qu'on traque partout ailleurs : une action qui a l'air d'avoir reussi.
  const cas = [
    ['NTFS', false, true],
    ['exFAT', false, true],
    ['FAT32', true, false]
  ];
  for (const [fs, lisible, gros] of cas) {
    const d = D.decrire({
      disques: [{ letter: 'X', free: 500 * GO, total: 1000 * GO }],
      fsTypes: { 'X:': fs }, cfg: { games: 'X:\\Games' }
    }).disques[0];
    assert.strictEqual(d.consoleLit, lisible, fs + ' : la console ' + (lisible ? 'lit' : 'ne lit pas'));
    assert.strictEqual(d.grosFichiers, gros, fs + ' : gros fichiers');
  }
  // Et l'avertissement dit POURQUOI, pas seulement « attention ».
  const ntfs = D.decrire({ disques: [{ letter: 'X', free: GO, total: GO }], fsTypes: { 'X:': 'NTFS' }, cfg: { games: 'X:\\Games' } }).disques[0];
  assert.match(ntfs.avertissement, /FAT32/, 'on nomme le format qu\'il faut');
  assert.match(ntfs.avertissement, /RIEN/, 'et la consequence, sans la macher');
});

test('disques : un disque NTFS SANS contenu Xbox ne declenche rien', () => {
  // Avertir sur un disque de sauvegarde en NTFS serait du bruit, et le bruit fait
  // ignorer les vrais avertissements. Seul le contenu Xbox trahit l'intention.
  const R = D.decrire({
    disques: [{ letter: 'D', free: 400 * GO, total: 1000 * GO }],
    fsTypes: { 'D:': 'NTFS' },
    cfg: {}
  });
  assert.strictEqual(R.disques[0].consoleLit, false);
  assert.strictEqual(R.disques[0].avertissement, null, 'aucun avertissement sans contenu Xbox');

  // Mais des qu'il en porte, on le dit.
  const avec = D.decrire({
    disques: [{ letter: 'D', free: 400 * GO, total: 1000 * GO }],
    fsTypes: { 'D:': 'NTFS' },
    cfg: { games: 'D:\\Games' }
  }).disques[0];
  assert.match(avec.avertissement, /console/);
});

test('disques : un systeme inconnu ne conclut RIEN', () => {
  // `fsTypes` peut etre vide (remplissage asynchrone). Conclure « illisible »
  // ferait crier au loup sur un disque parfaitement correct.
  const d = D.decrire({ disques: [{ letter: 'Y', free: GO, total: GO }], cfg: { games: 'Y:\\Games' } }).disques[0];
  assert.strictEqual(d.consoleLit, null, 'sans type connu, on ne conclut pas');
  assert.strictEqual(d.avertissement, null);
});
