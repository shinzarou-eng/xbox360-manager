// Sonde de la boite de dialogue : ce qu'un test sur la feuille ne peut PAS voir.
//
// Un test sur style.css ne voit qu'une regle INCOMPLETE, jamais une regle ABSENTE.
// Ici on mesure la boite REELLEMENT rendue, dans le navigateur, et surtout on
// verifie la propriete la plus importante du lot : qu'une fermeture SANS reponse
// (Echap, bouton B, clic sur le fond) RESOLVE la promesse avec la valeur sure.
// Sans cela l'appelant resterait suspendu pour toujours.
//
// Le navigateur doit DEJA ecouter (voir la recette dans CONTRIBUTING.md) : cette
// sonde n'en lance aucun et n'ouvre jamais de boite d'erreur.
const http = require('http');

const CDP = process.env.UICHECK_PORT || 9444;
const PAGE = process.env.UICHECK_URL || 'http://127.0.0.1:4360/';

const attendre = ms => new Promise(r => setTimeout(r, ms));
const json = chemin => new Promise((ok, ko) => {
  const rq = http.request({ host: '127.0.0.1', port: CDP, path: chemin }, res => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => { try { ok(JSON.parse(d)); } catch (e) { ko(e); } });
  });
  rq.on('error', ko); rq.setTimeout(3000, () => rq.destroy(new Error('timeout'))); rq.end();
});

async function onglet() {
  const liste = await json('/json/list');
  const page = liste.find(c => c.type === 'page');
  if (!page) throw new Error('aucun onglet de page : lancer le navigateur (recette CONTRIBUTING.md)');
  return page.webSocketDebuggerUrl;
}

async function evaluer(ws, expr) {
  // La reponse CDP est { id, result: { result: { type, value }, exceptionDetails } } :
  // la valeur est a `result.result.value`. Lire `result.value` rend `undefined` en
  // silence — la mesure paraissait alors « absente » au lieu d'erronde.
  const m = await ws(expr);
  const r = m.result || {};
  if (r.exceptionDetails) {
    throw new Error('exception dans la page : '
      + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description
        : r.exceptionDetails.text));
  }
  return r.result ? r.result.value : undefined;
}

function client(url) {
  return new Promise((ok, ko) => {
    const ws = new WebSocket(url);
    let id = 0; const attente = new Map();
    ws.addEventListener('open', () => ok(expr => {
      const n = ++id;
      return new Promise((res, rej) => {
        attente.set(n, res);
        ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate',
          params: { expression: expr, awaitPromise: true, returnByValue: true } }));
        const t = setTimeout(() => { if (attente.delete(n)) rej(new Error('pas de reponse du navigateur')); }, 20000);
        const fin = attente.get(n);
        attente.set(n, m => { clearTimeout(t); fin(m); });
      });
    }));
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data);
      if (m.id && attente.has(m.id)) { attente.get(m.id)(m); attente.delete(m.id); }
    });
    ws.addEventListener('error', () => ko(new Error('WebSocket refusé')));
  });
}

(async () => {
  const url = await onglet();
  console.log('onglet CDP trouve');
  const ws = await client(url);
  console.log('WebSocket ouvert');
  // On NE navigue PAS : une navigation detruit le contexte d'execution et la
  // reponse de la requete en cours ne revient jamais. L'onglet est deja sur l'app
  // (sinon on le dit et on s'arrete).
  const sur = await evaluer(ws, 'location.href');
  console.log('page : ' + sur);
  if (!String(sur).startsWith(PAGE.replace(/\/$/, ''))) {
    throw new Error('l onglet n est pas sur ' + PAGE + ' (il est sur ' + sur + ')');
  }
  const pret = await evaluer(ws, "typeof confirmer === 'function' && typeof saisir === 'function'");
  if (pret !== true) throw new Error('confirmer() / saisir() absents de la page : recharger l onglet');
  console.log('helpers presents, mesure...');
  // On mesure par PETITS ALLERS-RETOURS plutot qu'en un seul bloc : une evaluation
  // geante ne dit pas ou elle a echoue, et depasse le delai des qu'un cas pend.
  const etapes = [
    ['ouverture + rendu', `(() => { const p = confirmer({titre:'Supprimer 3 dossiers', corps:'Halo 3\\nFable II\\nGears', danger:true, ok:'SUPPRIMER'});
       const m = document.getElementById('dialogModal'), box = document.getElementById('dlgBox');
       const b = box.getBoundingClientRect(), corps = document.getElementById('dlgCorps');
       const cs = getComputedStyle(corps);
       return { affichage: getComputedStyle(m).display, w: Math.round(b.width), h: Math.round(b.height),
         deborde: b.right > innerWidth + 1 || b.left < -1,
         bord: getComputedStyle(box).borderLeftWidth + ' ' + getComputedStyle(box).borderLeftColor,
         titre: document.getElementById('dlgTitre').textContent,
         boutons: [document.getElementById('dlgNon').textContent, document.getElementById('dlgOui').textContent],
         classeOk: document.getElementById('dlgOui').className,
         focus: document.activeElement ? document.activeElement.id : null,
         ordreDOM: [...box.querySelectorAll('button')].map(x => x.id),
         blanc: cs.whiteSpace,
         lignes: Math.round(corps.getBoundingClientRect().height / parseFloat(cs.lineHeight)) }; })()`],
    ['ANNULER rend', `(async () => { const p = Promise.resolve(window.__p); return 0; })()`],
  ];
  const r1 = await evaluer(ws, etapes[0][1]);
  console.log(JSON.stringify(r1, null, 2));

  // Les quatre fermetures, une par aller-retour, avec la valeur rendue.
  const fermer = async (nom, action) => {
    const expr = `(async () => {
      const attente = ms => new Promise(r => setTimeout(r, ms));
      let valeur = 'PENDAISON';
      const p = confirmer({titre:'T', corps:'a\\nb', danger:true, ok:'SUPPRIMER'});
      p.then(v => { valeur = v; });
      await attente(40);
      ${action}
      await Promise.race([p.then(()=>{}), attente(1200)]);
      return { valeur, ouvert: getComputedStyle(document.getElementById('dialogModal')).display };
    })()`;
    const r = await evaluer(ws, expr);
    console.log('  ' + nom.padEnd(18) + ' -> ' + JSON.stringify(r));
    return r;
  };
  const res = {};
  res.annuler = await fermer('ANNULER', "document.getElementById('dlgNon').click();");
  res.valider = await fermer('VALIDER', "document.getElementById('dlgOui').click();");
  res.echap = await fermer('Echap', "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));");
  res.fond = await fermer('clic sur le fond', "document.getElementById('dialogModal').click();");
  const saisie = await evaluer(ws, `(async () => {
      const attente = ms => new Promise(r => setTimeout(r, ms));
      let valeur = 'PENDAISON';
      const p = saisir({titre:'NOUVEAU DOSSIER', libelle:'Nom', valeur:'abc'});
      p.then(v => { valeur = v; });
      await attente(60);
      const o = { focus: document.activeElement ? document.activeElement.id : null,
        champVisible: getComputedStyle(document.getElementById('dlgChamp')).display !== 'none',
        valeurInitiale: document.getElementById('dlgInput').value,
        blancCorps: getComputedStyle(document.getElementById('dlgCorps')).whiteSpace };
      document.getElementById('dlgOui').click();
      await Promise.race([p.then(()=>{}), attente(1200)]);
      o.valeurRendue = valeur;
      o.debordement = document.getElementById('dlgBox').getBoundingClientRect().right > innerWidth + 1;
      return o; })()`);
  console.log('  saisie             -> ' + JSON.stringify(saisie));
  const r = { rendu: r1, fermetures: res, saisie };
  const R = r.rendu, F = r.fermetures, S = r.saisie;
  const defauts = [];
  if (R.affichage !== 'flex') defauts.push('la boite ne s ouvre pas (display=' + R.affichage + ')');
  if (R.deborde) defauts.push('la boite depasse la fenetre');
  if (R.focus !== 'dlgNon') defauts.push('le focus n est PAS sur ANNULER mais sur ' + R.focus
    + ' -> la manette confirmerait par defaut');
  if (R.ordreDOM[0] !== 'dlgNon') defauts.push('ANNULER n est pas le premier bouton du DOM');
  if (R.blanc !== 'pre-wrap') defauts.push('white-space = ' + R.blanc + ' : les retours a la ligne seront ecrases');
  if (R.lignes < 3) defauts.push('le corps de 3 lignes n en rend que ' + R.lignes);
  if (S.focus !== 'dlgInput') defauts.push('le champ de saisie n a pas le focus (sur ' + S.focus + ')');
  if (!S.champVisible) defauts.push('le champ de saisie est cache');
  if (S.valeurRendue !== 'abc') defauts.push('saisir() n a pas rendu la valeur : ' + JSON.stringify(S.valeurRendue));
  if (S.debordement) defauts.push('la boite de saisie depasse la fenetre');
  // LE COEUR DU SUJET : aucune sortie ne doit laisser la promesse pendre.
  for (const [nom, v] of [['ANNULER', F.annuler], ['VALIDER', F.valider],
                          ['Echap', F.echap], ['clic sur le fond', F.fond]]) {
    if (v.valeur === 'PENDAISON') defauts.push(nom + ' laisse la promesse NON RESOLUE');
    if (v.ouvert !== 'none') defauts.push(nom + ' laisse la boite ouverte');
  }
  if (F.annuler.valeur !== false) defauts.push('ANNULER doit rendre false, a rendu ' + JSON.stringify(F.annuler.valeur));
  if (F.valider.valeur !== true) defauts.push('VALIDER doit rendre true, a rendu ' + JSON.stringify(F.valider.valeur));
  if (F.echap.valeur !== false) defauts.push('Echap doit rendre false, a rendu ' + JSON.stringify(F.echap.valeur));
  if (F.fond.valeur !== false) defauts.push('le clic sur le fond doit rendre false, a rendu ' + JSON.stringify(F.fond.valeur));
  if (!/rgb\(255, 153, 164\)/.test(R.bord)) defauts.push('la gravite ne se lit pas au bord : ' + R.bord);
  if (R.classeOk.indexOf('red') < 0) defauts.push('le bouton d action n a pas la variante rouge : ' + R.classeOk);

  console.log(defauts.length ? '\n--- DEFAUTS ---\n  ' + defauts.join('\n  ') : '\naucun defaut mesure');
  // Sortie EXPLICITE : le WebSocket garde la boucle d'evenements ouverte, donc le
  // process ne se terminerait jamais tout seul et la sonde paraîtrait bloquee.
  process.exit(defauts.length ? 1 : 0);
})().catch(e => { console.error('sonde impossible : ' + e.message); process.exit(2); });
