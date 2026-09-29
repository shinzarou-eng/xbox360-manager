// Simule « on branche un disque » avec `subst`, qui cree une lettre de lecteur
// pour de vrai. On fabrique un disque Xbox minimal (Games + Content + Aurora),
// on le branche, on regarde ce que l'application en fait, puis on le retire.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const LETTRE = process.argv[2] || 'X';
const RACINE = path.join(os.tmpdir(), 'x360-faux-disque');
const API = 'http://127.0.0.1:4360';

const req = c => new Promise((res, rej) => {
  http.get(API + c, r => { let d = ''; r.on('data', x => d += x); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res({ brut: d }); } }); }).on('error', rej);
});
const dormir = ms => new Promise(r => setTimeout(r, ms));

// Un vrai paquet GOD minimal : magic « LIVE » en 0, TitleID en 0x360, nom en 0x412.
// Le TitleID est stocke en 4 OCTETS BRUTS, pas en texte : l'ecrire en ASCII
// faisait relire « 34443533 » (« 4D53 ») au lieu de « 4D5307E6 ».
function paquetGod(tid, nom, taille) {
  const b = Buffer.alloc(taille);
  b.write('LIVE', 0, 'ascii');
  Buffer.from(tid, 'hex').copy(b, 0x360);
  b.write(nom, 0x412, 'utf16le');
  return b;
}

function fabriquer() {
  fs.rmSync(RACINE, { recursive: true, force: true });
  const ecrire = (rel, buf) => { const f = path.join(RACINE, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
  // Un jeu GOD dans Games\<TID>\00007000\<hash>
  ecrire(path.join('Games', '555307D4', '00007000', 'A1B2C3D4E5F60718'), paquetGod('555307D4', 'Assassin\'s Creed', 512 * 1024));
  // Un jeu GOD dans Content\0000000000000000\<TID>\00007000\<hash>
  ecrire(path.join('Content', '0000000000000000', '4D5307E6', '00007000', '1122334455667788'), paquetGod('4D5307E6', 'Halo 3', 512 * 1024));
  // Les marqueurs qui font reconnaitre un disque Xbox
  fs.mkdirSync(path.join(RACINE, 'Aurora'), { recursive: true });
  fs.writeFileSync(path.join(RACINE, 'launch.ini'), 'default = Hdd:\\Aurora\\default.xex\r\n');
  fs.mkdirSync(path.join(RACINE, '_A_TRIER'), { recursive: true });
  // Les APPLICATIONS : la console les range ailleurs que les jeux, et le disque
  // de l'utilisateur en contient — c'est ce qui doit etre detecte a chaud.
  ecrire(path.join('Homebrew', 'XeXMenu', 'default.xex'), Buffer.from('XEX2'));
  ecrire(path.join('Homebrew', 'DashLaunch', 'default.xex'), Buffer.from('XEX2'));
  ecrire(path.join('Emulators', 'RetroArch', 'default.xex'), Buffer.from('XEX2'));
  ecrire(path.join('ROMS', 'snes', 'jeu.sfc'), Buffer.alloc(1024));
}

(async () => {
  console.log('=== fabrication d un disque Xbox dans ' + RACINE + ' ===');
  fabriquer();
  console.log('  Games\\555307D4\\00007000\\A1B2C3D4E5F60718  (Assassin\'s Creed)');
  console.log('  Content\\0000000000000000\\4D5307E6\\00007000\\1122334455667788  (Halo 3)');
  console.log('  Aurora\\  launch.ini  _A_TRIER\\');
  console.log('  Homebrew\\XeXMenu  Homebrew\\DashLaunch  Emulators\\RetroArch  ROMS\\snes\\');

  const avant = await req('/api/events?depuis=0');
  console.log('\n=== etat avant branchement ===');
  console.log('  dernier evenement : ' + avant.dernier + ' | supports auto : ' + JSON.stringify(avant.auto));
  const base = avant.dernier;

  console.log('\n=== on BRANCHE le disque (' + LETTRE + ':) ===');
  try { execFileSync('subst', [LETTRE + ':', RACINE]); } catch (e) { console.log('  subst a echoue : ' + e.message); process.exit(1); }
  console.log('  subst ' + LETTRE + ': -> ' + RACINE);

  let ev = null;
  for (let i = 0; i < 20; i++) {
    await dormir(700);
    const s = await req('/api/events?depuis=' + base);
    const e = (s.evenements || []).find(x => x.lettre === LETTRE);
    if (e) { ev = e; break; }
  }
  console.log('  evenement recu : ' + JSON.stringify(ev));

  console.log('\n=== la bibliotheque a-t-elle charge les jeux du disque ? ===');
  await dormir(500);
  const jeux = await req('/api/games');
  const duDisque = (jeux || []).filter(g => String(g.path).toUpperCase().startsWith(LETTRE + ':'));
  console.log('  ' + duDisque.length + ' jeu(x) venant de ' + LETTRE + ':');
  for (const g of duDisque) console.log('    ' + g.name + '  (' + g.tid + ', ' + g.format + ')  ' + g.path);

  console.log('\n=== les APPLICATIONS du disque sont-elles chargees ? ===');
  const hb = await req('/api/homebrew');
  const duDisqueHb = (hb || []).filter(a => String(a.path).toUpperCase().startsWith(LETTRE + ':'));
  console.log('  ' + duDisqueHb.length + ' application(s) venant de ' + LETTRE + ':');
  for (const a of duDisqueHb) console.log('    ' + a.name + '  [' + a.kind + ']  ' + a.path);

  console.log('\n=== on DEBRANCHE ===');
  const apresBranchement = await req('/api/events?depuis=0');
  try { execFileSync('subst', [LETTRE + ':', '/d']); } catch (e) { console.log('  subst /d : ' + e.message); }
  let ev2 = null;
  for (let i = 0; i < 20; i++) {
    await dormir(700);
    const s = await req('/api/events?depuis=' + apresBranchement.dernier);
    const e = (s.evenements || []).find(x => x.lettre === LETTRE && x.action === 'retire');
    if (e) { ev2 = e; break; }
  }
  console.log('  evenement recu : ' + JSON.stringify(ev2));

  const jeux2 = await req('/api/games');
  const restants = (jeux2 || []).filter(g => String(g.path).toUpperCase().startsWith(LETTRE + ':'));
  console.log('  jeux du disque encore en bibliotheque : ' + restants.length);

  const final = await req('/api/events?depuis=0');
  console.log('  supports auto restants : ' + JSON.stringify(final.auto));
  fs.rmSync(RACINE, { recursive: true, force: true });
  console.log('\n  nettoye.');
})();
