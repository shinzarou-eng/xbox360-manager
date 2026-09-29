// Le HTML statique d'index.html n'appelle pas T() : il est ecrit en francais et
// traduit par `trDom()` via la table DICT. Une phrase absente de DICT reste donc
// en FRANCAIS DANS TOUTES LES LANGUES, y compris en anglais — et personne ne le
// voit si on ne teste que la langue par defaut.
//
// Ce script liste le texte visible d'index.html qui n'a pas de traduction.
const fs = require('fs');

const html = fs.readFileSync('public/index.html', 'utf8');
const app = fs.readFileSync('public/app.js', 'utf8');

// La table DICT d'app.js (francais -> anglais).
const bloc = /const DICT=(\{[\s\S]*?\});/.exec(app);
if (!bloc) { console.log('DICT introuvable'); process.exit(1); }
const DICT = eval('(' + bloc[1] + ')');
// Les fragments courts sont fusionnes a l'execution : l'audit doit voir la table
// COMPLETE, sinon il annonce un trou qui n'existe plus.
const bloc2 = /const FR_EN_STATIQUE=(\{[\s\S]*?\});/.exec(app);
if (bloc2) Object.assign(DICT, eval('(' + bloc2[1] + ')'));

// Texte visible : on retire les balises, les scripts, les styles et les
// expressions ${...} des gabarits.
const sansBalises = html
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
  .replace(/<[^>]+>/g, '\n');

const morceaux = sansBalises
  .split('\n')
  .map(s => s.replace(/\s+/g, ' ').trim())
  .filter(s => s.length > 2 && /[A-Za-zÀ-ÿ]/.test(s))
  // Un fragment qui n'est pas du francais visible : chiffres, symboles, code.
  .filter(s => !/^[\d\s.,:%·—–-]+$/.test(s));

const NE_PAS_TRADUIRE = new Set(["Xbox 360 Manager","XBOX","LIBRARY MANAGER","XboxUnity","XBLA","Indie","TitleID","Title Updates","Vimm's Vault","Archive.org","archive.org","DLC","DLC / XBLA","GOD/DLC","USB","CSV","HOMEBREW","Homebrew","Scripts","Console","Type","Game:\\User\\Scripts\\","secrets.json","xboxftp","logged-in-sig","logged-in-user","F12","Application","Cookies","https://archive.org","logged-in-sig=XXX...; logged-in-user=ton%40email.com","logged-in-sig=XXX...; logged-in-user=you%40email.com","MANAGER","Nous utilisons","🌐 EN","🇫🇷 Français","🇬🇧 English","🇪🇸 Español","🇵🇹 Português","Choose your language · Choisis ta langue · Elige tu idioma · Escolha o seu idioma"]);
const uniques = [...new Set(morceaux)].filter(s => !NE_PAS_TRADUIRE.has(s));
const manquants = uniques.filter(s => !DICT[s]);

console.log('fragments visibles dans index.html : ' + uniques.length);
console.log('  traduits par DICT   : ' + (uniques.length - manquants.length));
console.log('  SANS traduction     : ' + manquants.length);

console.log('\n--- fragments sans traduction ---');
for (const s of manquants) console.log('  ' + JSON.stringify(s));
