#!/usr/bin/env node
// Collecte du dataset MediaID -> Title Update depuis XboxUnity.
//
//   node scripts/build-tu-dataset.js                 # toute la base de titres
//   node scripts/build-tu-dataset.js --limit 50      # essai sur 50 titres
//   node scripts/build-tu-dataset.js --refresh       # ignore le cache local
//   node scripts/build-tu-dataset.js --delay 500     # plus prudent sur le reseau
//
// Produit :
//   data/tu-index.json   structure complete (titres -> MediaID -> mises a jour)
//   data/tu-index.csv    une ligne par (titleid, mediaid, tuid)
//
// POURQUOI CE DATASET
// XboxUnity expose les TU par TitleID, mais jamais la correspondance qui compte
// reellement : « pour un disque de MediaID X, quelle TU est la bonne ». Cette
// table n'existe nulle part sous forme exploitable, et c'est elle qui determine
// si une Title Update sera active ou ignoree par la console.
//
// REPRISE SUR INCIDENT
// Chaque reponse brute est mise en cache dans data/.tu-cache/<TID>.json. Une
// collecte interrompue (reseau, Ctrl-C, IP bloquee temporairement) reprend ou
// elle s'etait arretee, sans reinterroger ce qui est deja la. On ne martele pas
// un service rendu benevolement : delai entre requetes, arret sur echecs repetes,
// User-Agent identifiable.
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const { entry, merge, toCsv, stats, emptyDataset } = require('../lib/dataset');

const ROOT = path.join(__dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', '.tu-cache');
const OUT_JSON = path.join(ROOT, 'data', 'tu-index.json');
const OUT_CSV = path.join(ROOT, 'data', 'tu-index.csv');
const GAMELIST = path.join(ROOT, 'ISO2GOD', 'gamelist_xbox360.csv');
const UA = 'xbox360-manager/dataset (+https://github.com/shinzarou-eng/xbox360-manager)';

function args() {
  const a = process.argv.slice(2);
  const val = (nom, def) => {
    const i = a.indexOf(nom);
    return i >= 0 && a[i + 1] ? a[i + 1] : def;
  };
  return {
    limit: parseInt(val('--limit', '0'), 10) || 0,
    delay: parseInt(val('--delay', '350'), 10),
    refresh: a.includes('--refresh'),
    maxEchecs: parseInt(val('--max-failures', '15'), 10)
  };
}

// TitleID + nom depuis la base de titres du projet (4 000+ entrees)
function titres() {
  const out = [];
  try {
    for (const ligne of fs.readFileSync(GAMELIST, 'utf8').split('\n')) {
      const p = ligne.split('\t');
      if (p.length >= 3 && /^[0-9A-Fa-f]{8}$/.test(p[0])) {
        out.push({ tid: p[0].toUpperCase(), name: (p[2] || '').trim() || null });
      }
    }
  } catch (e) {
    console.error('Base de titres illisible : ' + GAMELIST);
    console.error('Elle est fournie avec le projet (ISO2GOD/gamelist_xbox360.csv).');
    process.exit(1);
  }
  // dedoublonnage : la base peut contenir plusieurs entrees par TitleID (regions)
  const vu = new Map();
  for (const t of out) if (!vu.has(t.tid)) vu.set(t.tid, t);
  return [...vu.values()];
}

const cachePath = tid => path.join(CACHE_DIR, tid + '.json');
const ageJours = f => (Date.now() - fs.statSync(f).mtimeMs) / 86400000;

function lireCache(tid, refresh) {
  const f = cachePath(tid);
  try {
    if (!refresh && ageJours(f) < 7) return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {}
  return null;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const rq = (url.startsWith('https') ? https : http).get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('reponse illisible')); } });
    });
    rq.on('error', reject);
    rq.setTimeout(20000, () => rq.destroy(new Error('timeout')));
  });
}

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const opt = args();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });

  let liste = titres();
  if (opt.limit) liste = liste.slice(0, opt.limit);

  console.log('Dataset MediaID -> Title Update');
  console.log('  source  : xboxunity.net/Resources/Lib/TitleUpdateInfo.php');
  console.log('  titres  : ' + liste.length + (opt.limit ? ' (limite)' : '') + ', delai ' + opt.delay + ' ms');
  console.log('  cache   : ' + CACHE_DIR + (opt.refresh ? ' (ignore)' : ''));
  console.log('');

  let dataset = emptyDataset();
  let nouveaux = 0, caches = 0, sansTu = 0, echecs = 0, consecutifs = 0;
  const debut = Date.now();

  for (let i = 0; i < liste.length; i++) {
    const t = liste[i];
    let doc = lireCache(t.tid, opt.refresh);
    if (doc) { caches++; }
    else {
      try {
        doc = await fetchJson('https://xboxunity.net/Resources/Lib/TitleUpdateInfo.php?titleid=' + t.tid);
        fs.writeFileSync(cachePath(t.tid), JSON.stringify(doc));
        nouveaux++; consecutifs = 0;
        await dormir(opt.delay);
      } catch (e) {
        echecs++; consecutifs++;
        if (consecutifs >= opt.maxEchecs) {
          console.error('\nArret : ' + consecutifs + ' echecs consecutifs (' + e.message + ').');
          console.error('XboxUnity est peut-etre momentanement injoignable ou limite votre IP.');
          console.error('Relance la meme commande plus tard : la collecte reprendra ou elle en est.');
          break;
        }
        continue;
      }
    }

    const e = entry(t.tid, t.name, doc);
    if (!e) { sansTu++; continue; }
    dataset = merge(dataset, [e]);

    if ((i + 1) % 25 === 0 || i === liste.length - 1) {
      const s = stats(dataset);
      const pct = Math.round((i + 1) / liste.length * 100);
      process.stdout.write('\r  ' + String(pct).padStart(3) + '%  ' + s.titles + ' titres, ' + s.mediaIds +
        ' MediaID, ' + s.updates + ' MAJ  (' + nouveaux + ' recuperes, ' + caches + ' en cache)   ');
    }
  }

  dataset.generated = new Date().toISOString();
  const s = stats(dataset);
  console.log('\n');
  console.log('  titres avec TU      : ' + s.titles);
  console.log('  couples MediaID     : ' + s.mediaIds);
  console.log('  mises a jour        : ' + s.updates);
  console.log('  sans TU publiee     : ' + sansTu);
  console.log('  echecs reseau       : ' + echecs);
  console.log('  duree               : ' + Math.round((Date.now() - debut) / 1000) + ' s');

  if (!s.titles) {
    console.error('\nAucune donnee collectee : rien n\'a ete ecrit.');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(dataset, null, 1));
  fs.writeFileSync(OUT_CSV, toCsv(dataset));
  console.log('\n  ecrit : ' + OUT_JSON + '  (' + Math.round(fs.statSync(OUT_JSON).size / 1024) + ' Ko)');
  console.log('  ecrit : ' + OUT_CSV + '  (' + Math.round(fs.statSync(OUT_CSV).size / 1024) + ' Ko)');
}

main().catch(e => { console.error('Erreur : ' + e.message); process.exitCode = 1; });
