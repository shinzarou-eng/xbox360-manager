// Les derniers fragments du HTML statique : quelques libelles oublies, et la
// liste des termes qu'il ne faut PAS traduire.
//
// Les noms propres doivent rester tels quels : « Vimm's Vault », « archive.org »,
// « XboxUnity », « TitleID », « xboxftp ». Les traduire rendrait intraduisible ce
// que l'utilisateur lit ailleurs — sur les forums, dans Aurora, dans un tutoriel.
const fs = require('fs');

const RESTE = {
  'ACCUEIL': ['HOME', 'INICIO', 'INÍCIO'],
  'ACTUALISER': ['REFRESH', 'ACTUALIZAR', 'ATUALIZAR'],
  'Actions': ['Actions', 'Acciones', 'Ações'],
  'Jeu': ['Game', 'Juego', 'Jogo'],
  'LIEN': ['LINK', 'ENLACE', 'LINK'],
  'IMPORT': ['IMPORT', 'IMPORTAR', 'IMPORTAR'],
  'INSTALLÉ': ['INSTALLED', 'INSTALADO', 'INSTALADO'],
  'somme de contrôle': ['checksum', 'suma de comprobación', 'soma de verificação'],
  ', jamais dans config.json)': [', never in config.json)', ', nunca en config.json)', ', nunca em config.json)'],
  '— Va sur': ['— Go to', '— Ve a', '— Vá ao'],
  ', créé un compte gratuit et connecte-toi.': [', create a free account and sign in.', ', crea una cuenta gratuita e inicia sesión.', ', crie uma conta gratuita e entre.'],
  "l'organiser plus tard,": ['organize it later,', 'organizarlo más tarde,', 'organizá-lo depois,'],
  'le range directement au bon endroit sur le disque.': ['puts it straight in the right place on the drive.', 'lo coloca directamente en el lugar correcto del disco.', 'coloca direto no lugar certo do disco.'],
  'FICHIERS — INSTALLER = direct dans Content · DÉPÔT = à organiser':
    ['FILES — INSTALL = straight into Content · DROP = to organize',
     'ARCHIVOS — INSTALAR = directo a Content · BANDEJA = por organizar',
     'ARQUIVOS — INSTALAR = direto no Content · BANDEJA = a organizar']
};

// Termes qui ne se traduisent pas : noms propres, identifiants, chemins, code.
const NE_PAS_TRADUIRE = [
  'Xbox 360 Manager', 'XBOX', 'LIBRARY MANAGER', 'XboxUnity', 'XBLA', 'Indie',
  'TitleID', 'Title Updates', 'Vimm\'s Vault', 'Archive.org', 'archive.org',
  'DLC', 'DLC / XBLA', 'GOD/DLC', 'USB', 'CSV', 'HOMEBREW', 'Homebrew', 'Scripts',
  'Console', 'Type', 'Game:\\User\\Scripts\\', 'secrets.json', 'xboxftp',
  'logged-in-sig', 'logged-in-user', 'F12', 'Application', 'Cookies',
  'https://archive.org', 'logged-in-sig=XXX...; logged-in-user=ton%40email.com',
  'logged-in-sig=XXX...; logged-in-user=you%40email.com', 'MANAGER',
  'Nous utilisons', '🌐 EN', '🇫🇷 Français', '🇬🇧 English', '🇪🇸 Español', '🇵🇹 Português',
  'Choose your language · Choisis ta langue · Elige tu idioma · Escolha o seu idioma'
];

const app = fs.readFileSync('public/app.js', 'utf8');
const i18n = fs.readFileSync('public/i18n.js', 'utf8');

// 1. FR -> EN dans la table statique.
const bloc = /const FR_EN_STATIQUE=(\{[\s\S]*?\});/.exec(app);
if (!bloc) { console.log('FR_EN_STATIQUE introuvable'); process.exit(1); }
const frEn = eval('(' + bloc[1] + ')');
for (const k of Object.keys(RESTE)) frEn[k] = RESTE[k][0];
fs.writeFileSync('public/app.js',
  app.replace(bloc[1], JSON.stringify(frEn).replace(/\},/, '}')));

// 2. FR -> ES et FR -> PT.
let i = i18n;
for (const [k, [, es, pt]] of Object.entries(RESTE)) {
  const kEs = JSON.stringify(k) + ': ' + JSON.stringify(es);
  const kPt = JSON.stringify(k) + ': ' + JSON.stringify(pt);
  i = i.replace('const DICT_FR_ES = {', 'const DICT_FR_ES = {\n  ' + kEs + ',');
  i = i.replace('const DICT_FR_PT = {', 'const DICT_FR_PT = {\n  ' + kPt + ',');
}
fs.writeFileSync('public/i18n.js', i);

// 3. L'audit doit distinguer « pas encore traduit » de « ne se traduit pas ».
let a = fs.readFileSync('scripts/audit-html-i18n.js', 'utf8');
if (!a.includes('NE_PAS_TRADUIRE')) {
  a = a.replace('const uniques = [...new Set(morceaux)];',
    'const NE_PAS_TRADUIRE = new Set(' + JSON.stringify(NE_PAS_TRADUIRE) + ');\n' +
    'const uniques = [...new Set(morceaux)].filter(s => !NE_PAS_TRADUIRE.has(s));');
  fs.writeFileSync('scripts/audit-html-i18n.js', a);
}
console.log('fragments ajoutes : ' + Object.keys(RESTE).length);
console.log('termes declares non traduisibles : ' + NE_PAS_TRADUIRE.length);
