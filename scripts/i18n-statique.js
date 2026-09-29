// Les fragments COURTS du HTML statique : titres de section, boutons, en-tetes de
// tableau, puces de filtre. Ils n'appellent pas T() et sont traduits par trDom()
// via la table DICT (francais -> anglais).
//
// Sans eux, la page d'accueil restait en FRANCAIS meme en anglais : le texte
// statique ne passe par aucune des 568 fonctions T(). C'est le trou que l'audit
// `scripts/audit-html-i18n.js` a mesure — 131 fragments, dont 70 a traduire (le
// reste etant des noms propres et du code a ne pas toucher).
const fs = require('fs');

const FR_EN = {
  'MES CIBLES — OÙ JE PEUX INSTALLER': 'MY TARGETS — WHERE I CAN INSTALL',
  'CONSEILS — ACTIONS RECOMMANDEES': 'ADVICE — RECOMMENDED ACTIONS',
  'À PORTÉE DE MAIN': 'WITHIN REACH',
  'Voir, trier et lancer tes jeux installés': 'Browse, sort and launch your installed games',
  'Ranger ce qui attend dans _A_TRIER': 'Sort whatever is waiting in _A_TRIER',
  'Chercher un jeu, un DLC ou un XBLA': 'Find a game, a DLC or an XBLA',
  'SCRIPTS AURORA': 'AURORA SCRIPTS',
  'Filtres, tris et utilitaires LUA': 'LUA filters, sorts and utilities',
  'CONSOLE': 'CONSOLE',
  'Envoyer et récupérer par FTP': 'Send and fetch over FTP',
  'CATALOGUE': 'CATALOG',
  'Explorer la base de titres XboxUnity': 'Browse the XboxUnity title database',
  'UN DOSSIER': 'A FOLDER', 'DOUBLONS': 'DUPLICATES', 'SANTÉ': 'HEALTH',
  'GOD/DLC': 'GOD/DLC', 'CHERCHER': 'SEARCH', 'TYPE': 'TYPE',
  'UTILITAIRES': 'UTILITIES', 'FILTRES': 'FILTERS', 'TRIS': 'SORTS',
  'SOUS-TITRES': 'SUBTITLES', 'RAFRAÎCHIR': 'REFRESH',
  'Tous': 'All', 'Jeux': 'Games', 'Titre': 'Title', 'Détail': 'Detail',
  'Source': 'Source', 'FICHIERS': 'FILES', 'Fichier': 'File',
  'Collection': 'Collection', 'Taille': 'Size', 'Action': 'Action',
  'TÉLÉCHARGEMENTS': 'DOWNLOADS',
  "Autres moyens d'ajouter un fichier": 'Other ways to add a file',
  'Journal des opérations': 'Operation log', 'CONNECTER': 'CONNECT',
  'DESTINATIONS': 'DESTINATIONS', 'Ce que je peux envoyer': 'What I can send',
  'ACTION': 'ACTION', 'Jeux / ISO': 'Games / ISO', 'SOURCES': 'SOURCES',
  'SANTÉ DE LA BIBLIOTHÈQUE': 'LIBRARY HEALTH',
  '— ou a la main —': '— or manually —',
  'Etape 1': 'Step 1', 'Etape 2': 'Step 2', 'Etape 3': 'Step 3',
  'Etape 4': 'Step 4', 'Etape 5': 'Step 5', 'FERMER': 'CLOSE',
  "Un lien direct passe par la même file d'attente et bénéficie du même pipeline automatique qu'une recherche.":
    'A direct link goes through the same queue and gets the same automatic pipeline as a search.',
  'Retenir le mot de passe (dans': 'Remember the password (in',
  'Vérifier chaque envoi par la': 'Verify every send with the console\'s',
  'de la console': 'checksum',
  'Le serveur FTP de la console écoute sur le port 21, utilisateur et mot de passe':
    'The console FTP server listens on port 21, user and password',
  'par défaut. Sur Aurora :': 'by default. In Aurora:',
  'Paramètres → Serveur FTP': 'Settings → FTP server',
  'CONNEXION AUTO — ouvre archive.org, tu te connectes, je récupère les cookies':
    'AUTO LOGIN — opens archive.org, you sign in, cookies are captured automatically',
  'Aurora exécute des': 'Aurora runs',
  "— exactement la source que lit Aurora. Un script s'installe dans":
    '— exactly the source Aurora reads. A script installs into',
  'Base de titres': 'Title database',
  "— la même que celle d'Aurora. Cherche un jeu pour voir ses":
    '— the same one Aurora uses. Search a game to see its',
  ', ses': ', its',
  'et les fichiers téléchargeables. La pastille': 'and the downloadable files. The',
  'signale ce que tu possèdes déjà.': 'pill marks what you already own.',
  'CONNEXION ARCHIVE.ORG REQUISE': 'ARCHIVE.ORG LOGIN REQUIRED',
  'Rechercher dans les 4000+ titres...': 'Search 4000+ titles...',
  'Toutes': 'All'
};

const FR_ES = {
  'MES CIBLES — OÙ JE PEUX INSTALLER': 'MIS DESTINOS — DÓNDE PUEDO INSTALAR',
  'CONSEILS — ACTIONS RECOMMANDEES': 'CONSEJOS — ACCIONES RECOMENDADAS',
  'À PORTÉE DE MAIN': 'A MANO',
  'Voir, trier et lancer tes jeux installés': 'Ver, ordenar y lanzar tus juegos instalados',
  'Ranger ce qui attend dans _A_TRIER': 'Ordenar lo que espera en _A_TRIER',
  'Chercher un jeu, un DLC ou un XBLA': 'Buscar un juego, un DLC o un XBLA',
  'SCRIPTS AURORA': 'SCRIPTS DE AURORA',
  'Filtres, tris et utilitaires LUA': 'Filtros, ordenaciones y utilidades LUA',
  'Envoyer et récupérer par FTP': 'Enviar y recuperar por FTP',
  'Explorer la base de titres XboxUnity': 'Explorar la base de títulos de XboxUnity',
  'UN DOSSIER': 'UNA CARPETA', 'DOUBLONS': 'DUPLICADOS', 'SANTÉ': 'SALUD',
  'CHERCHER': 'BUSCAR', 'UTILITAIRES': 'UTILIDADES', 'FILTRES': 'FILTROS',
  'TRIS': 'ORDENACIONES', 'SOUS-TITRES': 'SUBTÍTULOS', 'RAFRAÎCHIR': 'ACTUALIZAR',
  'Tous': 'Todos', 'Jeux': 'Juegos', 'Titre': 'Título', 'Détail': 'Detalle',
  'Source': 'Fuente', 'FICHIERS': 'ARCHIVOS', 'Fichier': 'Archivo',
  'Collection': 'Colección', 'Taille': 'Tamaño', 'TÉLÉCHARGEMENTS': 'DESCARGAS',
  "Autres moyens d'ajouter un fichier": 'Otras formas de añadir un archivo',
  'Journal des opérations': 'Registro de operaciones', 'CONNECTER': 'CONECTAR',
  'Ce que je peux envoyer': 'Lo que puedo enviar',
  'Jeux / ISO': 'Juegos / ISO', 'SOURCES': 'FUENTES',
  'SANTÉ DE LA BIBLIOTHÈQUE': 'SALUD DE LA BIBLIOTECA',
  '— ou a la main —': '— o a mano —',
  'Etape 1': 'Paso 1', 'Etape 2': 'Paso 2', 'Etape 3': 'Paso 3',
  'Etape 4': 'Paso 4', 'Etape 5': 'Paso 5', 'FERMER': 'CERRAR',
  "Un lien direct passe par la même file d'attente et bénéficie du même pipeline automatique qu'une recherche.":
    'Un enlace directo pasa por la misma cola y recibe el mismo proceso automático que una búsqueda.',
  'Retenir le mot de passe (dans': 'Recordar la contraseña (en',
  'Vérifier chaque envoi par la': 'Verificar cada envío con la',
  'de la console': 'de la consola',
  'Le serveur FTP de la console écoute sur le port 21, utilisateur et mot de passe':
    'El servidor FTP de la consola escucha en el puerto 21, usuario y contraseña',
  'par défaut. Sur Aurora :': 'por defecto. En Aurora:',
  'Paramètres → Serveur FTP': 'Ajustes → Servidor FTP',
  'CONNEXION AUTO — ouvre archive.org, tu te connectes, je récupère les cookies':
    'CONEXIÓN AUTOMÁTICA — abre archive.org, inicias sesión y las cookies se capturan solas',
  'Aurora exécute des': 'Aurora ejecuta',
  "— exactement la source que lit Aurora. Un script s'installe dans":
    '— exactamente la fuente que lee Aurora. Un script se instala en',
  'Base de titres': 'Base de títulos',
  "— la même que celle d'Aurora. Cherche un jeu pour voir ses":
    '— la misma que usa Aurora. Busca un juego para ver sus',
  ', ses': ', sus',
  'et les fichiers téléchargeables. La pastille': 'y los archivos descargables. La etiqueta',
  'signale ce que tu possèdes déjà.': 'marca lo que ya tienes.',
  'CONNEXION ARCHIVE.ORG REQUISE': 'SE REQUIERE CONEXIÓN A ARCHIVE.ORG',
  'Rechercher dans les 4000+ titres...': 'Buscar en los más de 4000 títulos...',
  'Toutes': 'Todas'
};

const FR_PT = {
  'MES CIBLES — OÙ JE PEUX INSTALLER': 'MEUS DESTINOS — ONDE POSSO INSTALAR',
  'CONSEILS — ACTIONS RECOMMANDEES': 'CONSELHOS — AÇÕES RECOMENDADAS',
  'À PORTÉE DE MAIN': 'À MÃO',
  'Voir, trier et lancer tes jeux installés': 'Ver, organizar e iniciar seus jogos instalados',
  'Ranger ce qui attend dans _A_TRIER': 'Organizar o que espera em _A_TRIER',
  'Chercher un jeu, un DLC ou un XBLA': 'Buscar um jogo, um DLC ou um XBLA',
  'SCRIPTS AURORA': 'SCRIPTS DO AURORA',
  'Filtres, tris et utilitaires LUA': 'Filtros, ordenações e utilitários LUA',
  'Envoyer et récupérer par FTP': 'Enviar e trazer por FTP',
  'Explorer la base de titres XboxUnity': 'Explorar a base de títulos do XboxUnity',
  'UN DOSSIER': 'UMA PASTA', 'DOUBLONS': 'DUPLICADOS', 'SANTÉ': 'SAÚDE',
  'CHERCHER': 'BUSCAR', 'UTILITAIRES': 'UTILITÁRIOS', 'FILTRES': 'FILTROS',
  'TRIS': 'ORDENAÇÕES', 'SOUS-TITRES': 'LEGENDAS', 'RAFRAÎCHIR': 'ATUALIZAR',
  'Tous': 'Todos', 'Jeux': 'Jogos', 'Titre': 'Título', 'Détail': 'Detalhe',
  'Source': 'Fonte', 'FICHIERS': 'ARQUIVOS', 'Fichier': 'Arquivo',
  'Collection': 'Coleção', 'Taille': 'Tamanho', 'TÉLÉCHARGEMENTS': 'DOWNLOADS',
  "Autres moyens d'ajouter un fichier": 'Outras formas de adicionar um arquivo',
  'Journal des opérations': 'Registro de operações', 'CONNECTER': 'CONECTAR',
  'Ce que je peux envoyer': 'O que eu posso enviar',
  'Jeux / ISO': 'Jogos / ISO', 'SOURCES': 'FONTES',
  'SANTÉ DE LA BIBLIOTHÈQUE': 'SAÚDE DA BIBLIOTECA',
  '— ou a la main —': '— ou à mão —',
  'Etape 1': 'Passo 1', 'Etape 2': 'Passo 2', 'Etape 3': 'Passo 3',
  'Etape 4': 'Passo 4', 'Etape 5': 'Passo 5', 'FERMER': 'FECHAR',
  "Un lien direct passe par la même file d'attente et bénéficie du même pipeline automatique qu'une recherche.":
    'Um link direto passa pela mesma fila e recebe o mesmo processo automático de uma busca.',
  'Retenir le mot de passe (dans': 'Lembrar a senha (em',
  'Vérifier chaque envoi par la': 'Verificar cada envio com a',
  'de la console': 'do console',
  'Le serveur FTP de la console écoute sur le port 21, utilisateur et mot de passe':
    'O servidor FTP do console escuta na porta 21, usuário e senha',
  'par défaut. Sur Aurora :': 'por padrão. No Aurora:',
  'Paramètres → Serveur FTP': 'Configurações → Servidor FTP',
  'CONNEXION AUTO — ouvre archive.org, tu te connectes, je récupère les cookies':
    'CONEXÃO AUTOMÁTICA — abre o archive.org, você entra e os cookies são capturados sozinhos',
  'Aurora exécute des': 'O Aurora executa',
  "— exactement la source que lit Aurora. Un script s'installe dans":
    '— exatamente a fonte que o Aurora lê. Um script se instala em',
  'Base de titres': 'Base de títulos',
  "— la même que celle d'Aurora. Cherche un jeu pour voir ses":
    '— a mesma que o Aurora usa. Busque um jogo para ver os',
  ', ses': ', as',
  'et les fichiers téléchargeables. La pastille': 'e os arquivos para baixar. A etiqueta',
  'signale ce que tu possèdes déjà.': 'marca o que você já tem.',
  'CONNEXION ARCHIVE.ORG REQUISE': 'É PRECISO ENTRAR NO ARCHIVE.ORG',
  'Rechercher dans les 4000+ titres...': 'Buscar nos mais de 4000 títulos...',
  'Toutes': 'Todas'
};

// 1. Fusion FR->EN dans DICT (pour que l'anglais marche aussi).
const app = fs.readFileSync('public/app.js', 'utf8');
if (!app.includes('Object.assign(DICT, FR_EN_STATIQUE)')) {
  let a = app.replace('const DICT2=', 'const FR_EN_STATIQUE=')
    .replace("const CK_EN=`", "Object.assign(DICT, FR_EN_STATIQUE);\nconst CK_EN=`");
  fs.writeFileSync('public/app.js', a);
}

// 2. FR->ES et FR->PT dans i18n.js.
let i = fs.readFileSync('public/i18n.js', 'utf8');
const blocEs = Object.entries(FR_ES).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n');
const blocPt = Object.entries(FR_PT).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' + JSON.stringify(v)).join(',\n');
i = i.replace("const DICT_FR_ES = {", "const DICT_FR_ES = {\n" + blocEs + ',');
i = i.replace("const DICT_FR_PT = {", "const DICT_FR_PT = {\n" + blocPt + ',');
fs.writeFileSync('public/i18n.js', i);

console.log('FR->EN : ' + Object.keys(FR_EN).length);
console.log('FR->ES : ' + Object.keys(FR_ES).length);
console.log('FR->PT : ' + Object.keys(FR_PT).length);
