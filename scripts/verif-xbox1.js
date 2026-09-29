// Verifie le diagnostic Xbox 1 sur trois consoles simulees : sans partition,
// avec partition mais emulateur incomplet, et tout en place.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { ServeurFtp } = require('../test/aide-ftp');

const API = 'http://127.0.0.1:4360';
const req = (m, c, corps) => new Promise((res, rej) => {
  const u = new URL(API + c);
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: m, headers: corps ? { 'Content-Type': 'application/json' } : {} },
    rs => { let d = ''; rs.on('data', x => d += x); rs.on('end', () => { try { res(JSON.parse(d)); } catch { res({ brut: d }); } }); });
  r.on('error', rej);
  if (corps) r.write(JSON.stringify(corps));
  r.end();
});

async function scenario(nom, port, construire) {
  const racine = path.join(os.tmpdir(), 'x360-x1-' + port);
  fs.rmSync(racine, { recursive: true, force: true });
  construire(racine);
  const fausse = new ServeurFtp(racine, { user: 'xboxftp', pass: 'xboxftp' });
  await fausse.demarrer(port);
  const cfgAvant = (await req('GET', '/api/config')).console || {};
  await req('POST', '/api/ftp/connect', { host: '127.0.0.1', port, user: 'xboxftp', pass: 'xboxftp' });
  const r = await req('GET', '/api/xbox1');
  console.log('\n=== ' + nom + ' ===');
  console.log('  partition HddX : ' + r.partitionExiste);
  console.log('  etat           : ' + r.etat);
  console.log('  emulateur      : ' + r.emulateurInstalle + (r.fichiersPresents !== undefined ? '  (' + r.fichiersPresents + '/' + r.fichiersAttendus + ' fichiers)' : ''));
  console.log('  jeux Xbox 1    : ' + r.jeux);
  for (const c of (r.conseils || []).slice(0, 3)) console.log('    - ' + c);
  await req('POST', '/api/ftp/disconnect', {});
  await fausse.arreter();
  await req('POST', '/api/config', { console: cfgAvant });
  fs.rmSync(racine, { recursive: true, force: true });
  return r;
}

(async () => {
  // 1. Disque non officiel : pas de partition HddX.
  const a = await scenario('sans partition', 2151, (r) => {
    fs.mkdirSync(path.join(r, 'Usb0/Games/Halo'), { recursive: true });
    fs.writeFileSync(path.join(r, 'Usb0/Games/Halo/default.xbe'), 'x');
  });
  // 2. Partition presente, emulateur incomplet.
  const b = await scenario('emulateur incomplet', 2152, (r) => {
    fs.mkdirSync(path.join(r, 'HddX/Compatibility'), { recursive: true });
    for (let i = 0; i < 7; i++) fs.writeFileSync(path.join(r, 'HddX/Compatibility/f' + i + '.bin'), 'x');
    fs.mkdirSync(path.join(r, 'Usb0/Games/Conker'), { recursive: true });
    fs.writeFileSync(path.join(r, 'Usb0/Games/Conker/default.xbe'), 'x');
  });
  // 3. Tout en place, et un jeu Xbox 360 qui ne doit PAS compter comme Xbox 1.
  const c = await scenario('tout en place', 2153, (r) => {
    fs.mkdirSync(path.join(r, 'HddX/Compatibility'), { recursive: true });
    for (let i = 0; i < 23; i++) fs.writeFileSync(path.join(r, 'HddX/Compatibility/f' + i + '.bin'), 'x');
    for (const j of ['Halo', 'Conker', 'Panzer Dragoon']) {
      fs.mkdirSync(path.join(r, 'Usb0/Games', j), { recursive: true });
      fs.writeFileSync(path.join(r, 'Usb0/Games', j, 'default.xbe'), 'x');
    }
    fs.mkdirSync(path.join(r, 'Usb0/Games/Forza'), { recursive: true });
    fs.writeFileSync(path.join(r, 'Usb0/Games/Forza/default.xex'), 'x');
  });

  const ok = a.etat === 'sans-partition'
    && b.etat === 'incomplete' && b.jeux === 1
    && c.etat === 'prete' && c.jeux === 3;
  console.log('\n=== VERDICT : ' + (ok ? 'OK' : 'DEFAILLANT') + ' ===');
  if (!ok) console.log('  attendu : sans-partition / incomplete(1) / prete(3)');
  process.exit(ok ? 0 : 1);
})();
