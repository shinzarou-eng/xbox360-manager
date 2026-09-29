// Remplace les styles EN LIGNE repetes par les classes utilitaires
// correspondantes. On ne touche qu'aux motifs EXACTS : une reecriture
// approximative d'un fichier de 2100 lignes fait plus de degats que de bien.
//
// Chaque balise est traitee isolement, et la classe est FUSIONNEE avec celle qui
// existe deja — un remplacement naif ecraserait `class="btn"`.
const fs = require('fs');

const TABLE = {
  'color:var(--text-3);font-size:var(--fs-caption)': 'dim cap',
  'color:var(--text-3);font-size:var(--fs-caption);font-weight:700': 'dim cap bold',
  'color:var(--text-3)': 'dim',
  'color:var(--ac)': 'acc',
  'color:var(--danger)': 'errc',
  'color:var(--warn)': 'warnc',
  'color:var(--info)': 'infoc',
  'color:var(--info);cursor:pointer': 'infoc ptr',
  'color:var(--warn);cursor:pointer;text-decoration:underline': 'warnc ptr link',
  'font-size:var(--fs-caption)': 'cap',
  "font-family:'Segoe UI';color:var(--text-1)": 'segoe t1',
  'width:13px;height:13px;display:block;margin:auto': 'ic13',
  'padding:4px 12px': 'pad-s',
  'padding:3px 10px;font-size:var(--fs-caption)': 'pad-s cap',
  'padding:2px 10px;font-size:var(--fs-caption)': 'pad-s cap',
  'padding:3px 12px;font-size:var(--fs-caption)': 'pad-s cap',
  'padding:2px 9px;font-size:var(--fs-caption)': 'pad-s cap',
  'padding:5px 12px;font-size:var(--fs-caption)': 'pad-s cap',
  'float:right': 'right',
  'text-align:center': 'center'
};

function traiter(texte, compte) {
  return texte.replace(/<[a-zA-Z][^>]*>/g, balise => {
    const m = /style="([^"]*)"/.exec(balise);
    if (!m) return balise;
    const cls = TABLE[m[1].trim()];
    if (!cls) return balise;
    compte.set(cls, (compte.get(cls) || 0) + 1);
    let out = balise.replace(/\s*style="[^"]*"/, '');
    const mc = /class="([^"]*)"/.exec(out);
    if (mc) {
      const fusion = (mc[1] + ' ' + cls).replace(/\s+/g, ' ').trim();
      out = out.replace(/class="[^"]*"/, 'class="' + fusion + '"');
    } else {
      out = out.replace(/^<([a-zA-Z][\w-]*)/, '<$1 class="' + cls + '"');
    }
    return out;
  });
}

const compte = new Map();
for (const f of ['public/app.js', 'public/index.html']) {
  const avant = fs.readFileSync(f, 'utf8');
  const apres = traiter(avant, compte);
  if (apres !== avant) fs.writeFileSync(f, apres);
  console.log(f + ' : ' + (avant === apres ? 'inchange' : 'reecrit'));
}
console.log('\nRemplacements :');
for (const [k, n] of [...compte].sort((a, b) => b[1] - a[1])) console.log('   ' + String(n).padStart(3) + ' x  ' + k);
