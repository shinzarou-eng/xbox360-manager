#!/usr/bin/env node
// Rend le symbole `#x-logo` de public/index.html en PNG transparents a toutes
// les tailles de l'icone Windows, puis les empaquette dans desktop/assets/
// icone.ico via desktop/assets/ico.js.
//
// Le logo a UNE seule source : le symbole dans index.html. Ce script n'en
// contient pas de copie — il lit la page, extrait le symbole et son degrade,
// et le fait dessiner par le meme moteur que l'app.
//
// Usage : node scripts/icon-render.js
//   (un navigateur en debug doit ecouter sur :9444 — meme recette que uicheck)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PORT = Number(process.env.UICHECK_PORT || 9444);
const TAILLES = [16, 24, 32, 48, 64, 128, 256];
const RACINE = path.join(__dirname, '..');
const SORTIE = path.join(RACINE, 'desktop', 'assets');
const ICO = path.join(SORTIE, 'icone.ico');

function httpJson(chemin, methode) {
  return new Promise((resolve, reject) => {
    const rq = require('http').request({ host: '127.0.0.1', port: PORT, path: chemin, method: methode || 'GET' }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    rq.on('error', reject);
    rq.setTimeout(4000, () => rq.destroy(new Error('timeout')));
    rq.end();
  });
}

function extraire(html, id, balise) {
  const m = html.match(new RegExp('<' + balise + ' id="' + id + '"[\\s\\S]*?</' + balise + '>'));
  if (!m) throw new Error('symbole ' + id + ' introuvable dans index.html');
  return m[0];
}

(async () => {
  const html = fs.readFileSync(path.join(RACINE, 'public', 'index.html'), 'utf8');
  const grad = extraire(html, 'xg-silver', 'radialGradient');
  const logo = extraire(html, 'x-logo', 'symbol');
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='SZ' height='SZ' viewBox='0 0 64 64'>"
    + '<defs>' + grad + '</defs>' + logo.replace('<symbol id="x-logo" viewBox="0 0 64 64">', '').replace('</symbol>', '') + '</svg>';

  const cible = await httpJson('/json/new?about:blank', 'PUT');
  if (!cible || !cible.webSocketDebuggerUrl) { console.error('Aucun onglet de debug sur :' + PORT); process.exit(1); }
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; ws.onerror = r; setTimeout(r, 5000); });
  let mid = 0;
  const envoyer = (method, params) => new Promise(res => {
    const id = ++mid;
    const to = setTimeout(() => res(null), 8000);
    const h = ev => { try { const m = JSON.parse(ev.data); if (m.id === id) { clearTimeout(to); ws.removeEventListener('message', h); res(m.result || {}); } } catch {} };
    ws.addEventListener('message', h);
    try { ws.send(JSON.stringify({ id, method, params })); } catch { res(null); }
  });
  const evalJs = expression => envoyer('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });

  const pngs = [];
  for (const s of TAILLES) {
    await envoyer('Emulation.setDeviceMetricsOverride', { width: s, height: s, deviceScaleFactor: 1, mobile: false });
    await envoyer('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    await evalJs("document.documentElement.innerHTML='<body style=\"margin:0\">" + svg.replace(/SZ/g, String(s)) + "</body>';document.body.style.margin='0';'ok'");
    await new Promise(r => setTimeout(r, 150));
    const r2 = await envoyer('Page.captureScreenshot', { format: 'png' });
    if (!r2 || !r2.data) { console.error('capture ' + s + ' refusee'); process.exit(1); }
    const f = path.join(SORTIE, 'icon-' + s + '.png');
    fs.writeFileSync(f, Buffer.from(r2.data, 'base64'));
    pngs.push(f);
    console.log('  ' + s + 'x' + s + '  ' + path.basename(f));
  }
  try { ws.close(); } catch {}
  try { await httpJson('/json/close/' + cible.id); } catch {}

  execFileSync(process.execPath, [path.join(SORTIE, 'ico.js'), ICO, ...pngs], { stdio: 'inherit' });
  pngs.forEach(f => { try { fs.unlinkSync(f); } catch {} });
  console.log('termine.');
})().catch(e => { console.error(e.message || e); process.exit(1); });
