// Tests de lib/tu.js — le moteur Title Update.
// C'est le differenciateur du projet : une TU n'est active que pour le MediaID
// du disque installe. Une erreur ici ne se voit pas — elle bloque silencieusement
// les DLC sur la console. Les reponses XboxUnity sont synthetiques : les tests
// tournent hors ligne et ne dependent pas d'un service tiers.
const test = require('node:test');
const assert = require('node:assert');

const { parseTuInfo, allUpdates, compatibleUpdates, bestFor, bestOverall, isKnownMedia, diagnose } = require('../lib/tu');

// Reponse XboxUnity reelle : les TU sont sous MediaIDS[].Updates[] (PAS sous
// `Updates` racine), et `Size` est en KILOOCTETS.
const doc = () => ({
  MediaIDS: [
    { MediaID: '6D88AE4F', Updates: [
      { TitleUpdateID: 'aaa-1', Version: 1, Size: '1024' },
      { TitleUpdateID: 'aaa-5', Version: 5, Size: '2048' },
      { TitleUpdateID: 'aaa-3', Version: 3, Size: '512' }
    ] },
    { MediaID: 'CAA468A3', Updates: [
      { TitleUpdateID: 'bbb-5', Version: 5, Size: '4096' }
    ] }
  ]
});

// --- lecture ---------------------------------------------------------------

test('parseTuInfo : normalise les MediaID et leurs mises a jour', () => {
  const p = parseTuInfo(doc());
  assert.strictEqual(p.mediaIds.length, 2);
  assert.deepStrictEqual(p.mediaIds.map(g => g.media), ['6D88AE4F', 'CAA468A3']);
});

test('parseTuInfo : convertit Size des KILOOCTETS en octets', () => {
  const p = parseTuInfo(doc());
  const u = p.mediaIds[0].updates.find(x => x.tuid === 'aaa-5');
  assert.strictEqual(u.size, 2048 * 1024, 'XboxUnity publie des Ko');
});

test('parseTuInfo : trie par version DECROISSANTE', () => {
  const versions = parseTuInfo(doc()).mediaIds[0].updates.map(u => u.version);
  assert.deepStrictEqual(versions, [5, 3, 1]);
});

test('parseTuInfo : chaque mise a jour porte son MediaID', () => {
  for (const g of parseTuInfo(doc()).mediaIds) {
    for (const u of g.updates) assert.strictEqual(u.media, g.media,
      'une TU doit connaitre son MediaID : c\'est ce qui conditionne la compatibilite');
  }
});

test('parseTuInfo : entree vide ou invalide -> structure vide, sans lever', () => {
  for (const mauvais of [null, undefined, {}, { MediaIDS: null }, { MediaIDS: [] }]) {
    assert.deepStrictEqual(parseTuInfo(mauvais), { mediaIds: [] });
  }
});

test('parseTuInfo : ignore les MediaID invalides et les TU sans identifiant', () => {
  const p = parseTuInfo({ MediaIDS: [
    { MediaID: 'pasunhex', Updates: [{ TitleUpdateID: 'x', Version: 1 }] },
    { MediaID: '415607D3', Updates: [{ Version: 2 }, { TitleUpdateID: 'ok', Version: 1 }] }
  ] });
  assert.strictEqual(p.mediaIds.length, 1, 'le MediaID invalide doit etre ecarte');
  assert.strictEqual(p.mediaIds[0].updates.length, 1, 'la TU sans identifiant doit etre ecartee');
  assert.strictEqual(p.mediaIds[0].updates[0].tuid, 'ok');
});

test('parseTuInfo : un groupe sans mise a jour est ecarte', () => {
  const p = parseTuInfo({ MediaIDS: [{ MediaID: '415607D3', Updates: [] }] });
  assert.strictEqual(p.mediaIds.length, 0);
});

test('parseTuInfo : accepte un MediaID en minuscules et le normalise', () => {
  const p = parseTuInfo({ MediaIDS: [{ MediaID: '6d88ae4f', Updates: [{ TitleUpdateID: 'a', Version: 1 }] }] });
  assert.strictEqual(p.mediaIds[0].media, '6D88AE4F');
});

// --- compatibilite : le coeur du sujet -------------------------------------

test('compatibleUpdates : ne rend QUE les TU du MediaID demande', () => {
  const c = compatibleUpdates(parseTuInfo(doc()), '6D88AE4F');
  assert.deepStrictEqual(c.map(u => u.tuid).sort(), ['aaa-1', 'aaa-3', 'aaa-5']);
  assert.ok(!c.some(u => u.tuid === 'bbb-5'), 'la TU de l\'autre disque ne doit jamais apparaitre');
});

test('compatibleUpdates : MediaID inconnu -> aucune TU', () => {
  assert.deepStrictEqual(compatibleUpdates(parseTuInfo(doc()), 'DEADBEEF'), []);
  assert.deepStrictEqual(compatibleUpdates(parseTuInfo(doc()), null), []);
  assert.deepStrictEqual(compatibleUpdates(parseTuInfo(doc()), 'nimportequoi'), []);
});

test('bestFor : la version la plus HAUTE du bon MediaID', () => {
  assert.strictEqual(bestFor(parseTuInfo(doc()), '6D88AE4F').version, 5);
  assert.strictEqual(bestFor(parseTuInfo(doc()), 'CAA468A3').version, 5);
});

test('bestFor : ne propose JAMAIS la TU d un autre disque (le bug a ne pas reproduire)', () => {
  // 6D88AE4F n'a pas de version 9 : la seule v9 appartient a un autre MediaID
  const p = parseTuInfo({ MediaIDS: [
    { MediaID: '6D88AE4F', Updates: [{ TitleUpdateID: 'moi-2', Version: 2 }] },
    { MediaID: 'CAA468A3', Updates: [{ TitleUpdateID: 'autre-9', Version: 9 }] }
  ] });
  const best = bestFor(p, '6D88AE4F');
  assert.strictEqual(best.tuid, 'moi-2', 'proposer autre-9 bloquerait les DLC sur la console');
  assert.notStrictEqual(best.version, 9);
});

test('bestFor : aucun MediaID correspondant -> null (surtout pas un repli)', () => {
  assert.strictEqual(bestFor(parseTuInfo(doc()), 'DEADBEEF'), null);
});

test('bestOverall : la plus haute version tous MediaID confondus', () => {
  assert.strictEqual(bestOverall(parseTuInfo(doc())).version, 5);
  assert.strictEqual(bestOverall(parseTuInfo(doc())).tuid, 'aaa-5');
});

test('isKnownMedia : distingue un disque reference d un inconnu', () => {
  const p = parseTuInfo(doc());
  assert.strictEqual(isKnownMedia(p, '6D88AE4F'), true);
  assert.strictEqual(isKnownMedia(p, 'DEADBEEF'), false);
});

// --- verdict ---------------------------------------------------------------

test('diagnose : TU compatible non installee -> mise a jour disponible', () => {
  const d = diagnose({ parsed: parseTuInfo(doc()), mediaId: '6D88AE4F', installedTuids: [] });
  assert.strictEqual(d.state, 'update-available');
  assert.strictEqual(d.best.tuid, 'aaa-5');
  assert.strictEqual(d.updateAvailable, true);
});

test('diagnose : la meilleure TU compatible est installee -> a jour', () => {
  const d = diagnose({ parsed: parseTuInfo(doc()), mediaId: '6D88AE4F', installedTuids: ['aaa-5'] });
  assert.strictEqual(d.state, 'up-to-date');
  assert.strictEqual(d.updateAvailable, false);
});

test('diagnose : TU installee pour un AUTRE MediaID -> wrong-media', () => {
  // Le cas reel documente : la TU v5 CAA468A3 installee sur un disque 6D88AE4F,
  // et AUCUNE TU publiee pour 6D88AE4F. La console ignore la TU et les DLC
  // restent bloques, sans le moindre message. C'est exactement ce qu'il faut
  // signaler, et c'est le seul cas ou l'etat vaut 'wrong-media' : s'il existait
  // une TU compatible disponible, c'est cette information-la qui primerait.
  const p = parseTuInfo({ MediaIDS: [
    { MediaID: 'CAA468A3', Updates: [{ TitleUpdateID: 'mauvaise-5', Version: 5 }] }
  ] });
  const d = diagnose({ parsed: p, mediaId: '6D88AE4F', installedTuids: ['mauvaise-5'] });
  assert.strictEqual(d.state, 'wrong-media');
  assert.strictEqual(d.installedWrong, true, 'la console ignore cette TU');
  assert.strictEqual(d.updateAvailable, false);
  assert.strictEqual(d.best, null, 'rien de compatible a proposer');
});

test('diagnose : MediaID inconnu -> unknown et rien de propose', () => {
  const d = diagnose({ parsed: parseTuInfo(doc()), mediaId: null, installedTuids: [] });
  assert.strictEqual(d.state, 'unknown');
  assert.strictEqual(d.pending, true);
  assert.strictEqual(d.best, null, 'on ne propose rien tant qu\'on ne sait pas quel disque est installe');
});

test('diagnose : aucune TU publiee -> no-updates', () => {
  assert.strictEqual(diagnose({ parsed: parseTuInfo({}), mediaId: '6D88AE4F' }).state, 'no-updates');
  assert.strictEqual(diagnose({ parsed: null, mediaId: '6D88AE4F' }).state, 'no-updates');
});

test('diagnose : des TU existent mais pour d autres disques -> no-compatible', () => {
  const p = parseTuInfo({ MediaIDS: [{ MediaID: 'CAA468A3', Updates: [{ TitleUpdateID: 'x', Version: 1 }] }] });
  const d = diagnose({ parsed: p, mediaId: '6D88AE4F', installedTuids: [] });
  assert.strictEqual(d.state, 'no-compatible');
  assert.strictEqual(d.best, null, 'aucune TU ne doit etre proposee pour ce disque');
});

test('diagnose : un fichier de TU present vaut installation (installation manuelle)', () => {
  const d = diagnose({ parsed: parseTuInfo(doc()), mediaId: '6D88AE4F', installedTuids: [], tuFiles: 1 });
  assert.strictEqual(d.state, 'up-to-date', 'la TU est sur le disque : ne pas la reproposer');
});

test('diagnose : la disponibilite d une MAJ l emporte sur wrong-media (priorite du serveur)', () => {
  // les deux faits sont vrais ; on verrouille l'ordre existant pour ne pas
  // changer le comportement de l'assistant par accident
  const p = parseTuInfo({ MediaIDS: [
    { MediaID: '6D88AE4F', Updates: [{ TitleUpdateID: 'bonne-7', Version: 7 }] },
    { MediaID: 'CAA468A3', Updates: [{ TitleUpdateID: 'mauvaise-5', Version: 5 }] }
  ] });
  const d = diagnose({ parsed: p, mediaId: '6D88AE4F', installedTuids: ['mauvaise-5'] });
  assert.strictEqual(d.updateAvailable, true);
  assert.strictEqual(d.installedWrong, true);
  assert.strictEqual(d.state, 'update-available');
});

test('diagnose : coherence des faits exposes dans tous les cas', () => {
  const cas = [
    { parsed: parseTuInfo(doc()), mediaId: '6D88AE4F' },
    { parsed: parseTuInfo(doc()), mediaId: 'DEADBEEF' },
    { parsed: parseTuInfo(doc()), mediaId: null },
    { parsed: parseTuInfo({}), mediaId: '6D88AE4F' },
    { parsed: null, mediaId: null },
    { parsed: parseTuInfo(doc()), mediaId: '6D88AE4F', installedTuids: ['aaa-5'], tuFiles: 3 }
  ];
  for (const c of cas) {
    const d = diagnose(c);
    assert.ok(['unknown', 'no-updates', 'up-to-date', 'update-available', 'wrong-media', 'no-compatible'].includes(d.state),
      'etat inconnu : ' + d.state);
    // si un best est propose, il DOIT etre compatible avec le disque
    if (d.best && c.mediaId) {
      assert.strictEqual(d.best.media, c.mediaId,
        'best propose une TU d\'un autre MediaID : la console l\'ignorerait');
    }
  }
});
