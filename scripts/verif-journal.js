// Verifie la lecture du journal d'Aurora par FTP, sur une fausse console.
// Le serveur doit tourner sur 4360.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { ServeurFtp } = require('../test/aide-ftp');

const PORT = 2143;
const API = 'http://127.0.0.1:4360';
const RACINE = path.join(os.tmpdir(), 'x360-log-fausse');

const req = (m, c, corps) => new Promise((res, rej) => {
  const u = new URL(API + c);
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: m, headers: corps ? { 'Content-Type': 'application/json' } : {} },
    rs => { let d = ''; rs.on('data', x => d += x); rs.on('end', () => { try { res(JSON.parse(d)); } catch { res({ brut: d }); } }); });
  r.on('error', rej);
  if (corps) r.write(JSON.stringify(corps));
  r.end();
});

(async () => {
  fs.rmSync(RACINE, { recursive: true, force: true });
  for (const d of ['Game/User/Scripts/Utility', 'Game/Logs', 'Usb0/Aurora/Logs']) {
    fs.mkdirSync(path.join(RACINE, d), { recursive: true });
  }
  fs.writeFileSync(path.join(RACINE, 'Game/Aurora.xex'), 'x');
  fs.writeFileSync(path.join(RACINE, 'Usb0/Aurora/Aurora.xex'), 'x');

  const lignes = ['[10/03/2026 14:22:31] Aurora 0.7b.2 starting', '[10/03/2026 14:22:32] Loading sources from Hdd1:/Games'];
  for (let i = 0; i < 120; i++) lignes.push('[10/03/2026 14:2' + (i % 10) + ':0' + (i % 10) + '] ERROR: cover download failed for 4D5307E' + (i % 10));
  lignes.push('[10/03/2026 14:31:00] ERROR: plugin FTPd failed to start');
  lignes.push('[10/03/2026 14:31:05] WARNING: slow read on Hdd1');
  lignes.push('[10/03/2026 14:32:00] CRITICAL: settings.db corrupted, using defaults');
  fs.writeFileSync(path.join(RACINE, 'Game/Logs/Aurora.log'), lignes.join('\r\n'));

  const fausse = new ServeurFtp(RACINE, { user: 'xboxftp', pass: 'xboxftp' });
  await fausse.demarrer(PORT);

  const cfgAvant = (await req('GET', '/api/config')).console || {};
  const restaurer = async () => {
    try { await req('POST', '/api/ftp/disconnect', {}); } catch {}
    try { await req('POST', '/api/config', { console: cfgAvant }); } catch {}
    try { await fausse.arreter(); } catch {}
    fs.rmSync(RACINE, { recursive: true, force: true });
  };

  const cx = await req('POST', '/api/ftp/connect', { host: '127.0.0.1', port: PORT, user: 'xboxftp', pass: 'xboxftp' });
  if (cx.error) { console.log('ECHEC connexion : ' + cx.error); await restaurer(); process.exit(1); }

  const r = await req('GET', '/api/aurora-log');
  console.log('=== journal lu par FTP ===');
  console.log('  trouve  : ' + r.trouve + '   ' + (r.distant || r.raison || ''));
  if (r.trouve) {
    console.log('  verdict : ' + r.verdict + '   erreurs ' + r.erreurs + ', critiques ' + r.critiques + ', avertissements ' + r.avertissements);
    console.log('  motifs (' + r.motifs.length + ') :');
    for (const m of r.motifs) console.log('    [' + m.niveau.padEnd(13) + '] x' + String(m.compte).padStart(3) + '  ' + m.motif.slice(0, 62));
    console.log('  pistes (' + r.conseils.length + ') :');
    for (const p of r.conseils) console.log('    ' + p.quoi + ' (x' + p.combien + ') : ' + p.conseil);
  }
  const ok = r.trouve && r.erreurs === 121 && r.critiques === 1 && r.avertissements === 1 && r.motifs.length === 4 && r.conseils.length === 4;
  console.log('\n=== VERDICT : ' + (ok ? 'OK' : 'DEFAILLANT') + ' ===');
  await restaurer();
  process.exit(ok ? 0 : 1);
})();
