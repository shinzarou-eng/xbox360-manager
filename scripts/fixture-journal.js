// Capture l'ecran Homebrew avec le journal Aurora et les plugins.
// Le serveur doit tourner sur 4360.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { ServeurFtp } = require('../test/aide-ftp');

const PORT = 2144;
const API = 'http://127.0.0.1:4360';
const RACINE = path.join(os.tmpdir(), 'x360-log-shot');

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
  for (const d of ['Game/User/Scripts/Utility', 'Game/Logs', 'Game/Plugins/FTPDll', 'Usb0/Aurora/Plugins/Neighborhood', 'Usb0/Emulators/Snes9x', 'Usb0/Roms/NES']) {
    fs.mkdirSync(path.join(RACINE, d), { recursive: true });
  }
  for (const f of ['Game/Aurora.xex', 'Game/Plugins/FTPDll/FTPDll.xex', 'Usb0/Aurora/Aurora.xex',
    'Usb0/Aurora/Plugins/Neighborhood/Neighborhood.xex', 'Usb0/Emulators/Snes9x/default.xex']) {
    fs.writeFileSync(path.join(RACINE, f), 'x');
  }
  const l = ['[10/03/2026 14:22:31] Aurora 0.7b.2 starting'];
  for (let i = 0; i < 90; i++) l.push('[10/03/2026 14:3' + (i % 10) + ':00] ERROR: cover download failed for 4D5307E' + (i % 10));
  l.push('[10/03/2026 14:40:00] ERROR: plugin FTPd failed to start');
  l.push('[10/03/2026 14:41:00] CRITICAL: settings.db corrupted, using defaults');
  fs.writeFileSync(path.join(RACINE, 'Game/Logs/Aurora.log'), l.join('\r\n'));

  const fausse = new ServeurFtp(RACINE, { user: 'xboxftp', pass: 'xboxftp' });
  await fausse.demarrer(PORT);
  const cfgAvant = (await req('GET', '/api/config')).console || {};
  const restaurer = async () => {
    try { await req('POST', '/api/ftp/disconnect', {}); } catch {}
    try { await req('POST', '/api/config', { console: cfgAvant }); } catch {}
    try { await fausse.arreter(); } catch {}
    fs.rmSync(RACINE, { recursive: true, force: true });
  };
  console.log('fausse console prete sur ' + PORT);
  console.log('  /Game/Plugins/FTPDll, /Usb0/Aurora/Plugins/Neighborhood');
  console.log('  /Game/Logs/Aurora.log : 90 erreurs de jaquette + plugin + settings.db');
  process.on('SIGTERM', restaurer);
  process.on('SIGINT', restaurer);
  // On laisse la console ouverte pour la sonde.
  fs.writeFileSync(path.join(os.tmpdir(), 'x360-log-shot.pid'), String(process.pid));
  setInterval(() => {}, 10000);
})();
