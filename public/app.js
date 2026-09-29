let games=[], selected=null, selSet=new Set(), drive='H', hasCookie=false;
// signature du dernier rendu de la bibliothèque : sert a eviter de reconstruire
// la grille quand rien n'a change (voir renderGames)
let _renderSig=null;
// ---------- i18n (FR par defaut, EN selectionnable) ----------
let LANG=localStorage.getItem('x360lang')||'';
// Le 3e et le 4e argument servent aux rares chaines qu'un dictionnaire ne peut
// pas couvrir (une phrase construite avec une variable au milieu).
const T=(fr,en,es,pt)=>{
  if(LANG==='en')return en;
  if(LANG==='es')return es||(typeof DICT_ES!=='undefined'?DICT_ES[en]:'')||en;
  if(LANG==='pt')return pt||(typeof DICT_PT!=='undefined'?DICT_PT[en]:'')||en;
  return fr;
};
const DICT={"Chercher ce jeu sur Vimm's Vault":"Find this game on Vimm's Vault","Vimm digital (DLC, TU, XBLA)":"Vimm digital (DLC, TU, XBLA)","Lance le diaporama après 5 minutes sans activité":"Starts the slideshow after 5 minutes without activity","DIAPORAMA":"SLIDESHOW","DIAPORAMA AUTOMATIQUE":"AUTOMATIC SLIDESHOW","ACCÈS TÉLÉPHONE":"PHONE ACCESS","ACTIVER":"ENABLE","CODE D'APPAIRAGE":"PAIRING CODE","RÉGÉNÉRER":"REGENERATE",'Accueil':'Home','Bibliothèque':'Library','Catalogue':'Catalog','Téléchargements':'Downloads','ACTIONS RAPIDES':'QUICK ACTIONS','BIBLIOTHÈQUE':'LIBRARY','ORGANISER LE DÉPÔT':'ORGANIZE DROP FOLDER','TÉLÉCHARGER':'DOWNLOAD','SCANNER':'SCAN','SCANNER UN DOSSIER...':'SCAN A FOLDER...','DOSSIERS':'FOLDERS','Filtrer...':'Filter...','Nom A→Z':'Name A→Z','Taille ↓':'Size ↓','LISTE':'LIST','GRILLE':'GRID','DÉPÔT':'DROP','JEUX':'GAMES','ÉMULATEURS':'EMULATORS','SAUVER':'SAVE','APPLICATION':'APP','EXÉCUTABLE':'EXÉCUTABLE','EMPLACEMENT':'LOCATION','Rechercher dans les 4000+ titres...':'Search 4000+ titles...','TOUS':'ALL','JEUX GOD':'GOD GAMES','JEU':'GAME','Chercher un jeu...':'Search a game...','ou lien direct...':'or direct link...','ou importe : C:\\chemin\\vers\\fichier':'or import: C:\\path\\to\\file','IMPORTER':'IMPORT','RÉSULTATS':'RESULTS','TITRE':'TITLE','TAILLE':'SIZE','FICHIERS (clic = télécharger)':'FILES (click = download)','FICHIER':'FILE','Parle-moi en francais...':'Type a command...','ENVOYER':'SEND','ÉLÉMENT':'ITEM','JEU / TITLEID':'GAME / TITLEID',"CONFIRMER L'ORGANISATION":'CONFIRM ORGANIZATION','Rechercher :':'Search:','JEUX / ISO':'GAMES / ISO','FICHIERS — INSTALLER = direct dans Content · DÉPÔT = a organiser':'FILES — INSTALL = straight into Content · DROP = to organize','Chemin du dossier a analyser (ex : D:\\Telechargements)':'Folder path to analyze (e.g. D:\\Downloads)','ANALYSER':'ANALYZE','CONNEXION ARCHIVE.ORG REQUISE':'ARCHIVE.ORG LOGIN REQUIRED','CONTENU':'CONTENT','Chargement...':'Loading...','OUVRIR':'OPEN','COPIER TID':'COPY TID','RENOMMER':'RENAME','DÉPLACER':'MOVE','JAQUETTE':'COVER','SUPPRIMER':'DELETE','DEPOSE TES FICHIERS ICI':'DROP YOUR FILES HERE','ISO · 7Z · ZIP · RAR · dossiers GOD — tout part dans le dépôt, rien ne bouge sans ta confirmation':'ISO · 7Z · ZIP · RAR · GOD folders — everything goes to the drop folder, nothing moves without your confirmation','Trier _A_TRIER':'Sort _A_TRIER','Scanner mes jeux':'Scan my games','Espace libre':'Free space','Chercher un jeu':'Find a game','Supprimer un jeu':'Delete a game','INSTALLER':'INSTALL','DÉPÔT':'DROP','À TRIER':'TO SORT','Erreur : ':'Error: ','Erreur':'Error'};
const FR_EN_STATIQUE={"Assistant":"Assistant","Dans ta bibliothèque":"In your library","Entretien":"Maintenance","Dépôt":"Drop folder","Destinations":"Destinations","PAPIER PEINT EN FOND":"WINDOWS WALLPAPER","Affiche ton papier peint Windows en fond flouté":"Show your Windows wallpaper as a blurred backdrop","Filtrer le dépôt (nom, type, jeu)…":"Filter the drop folder (name, type, game)…","APPLIQUER AUX SÉLECTIONNÉS…":"APPLY TO SELECTED…","← RETOUR":"← BACK","ENTRETIEN — DÉTAIL":"MAINTENANCE — DETAIL","Filtrer les diagnostics (jeu, fichier)…":"Filter diagnostics (game, file)…","DÉTAIL":"DETAIL","ERREURS":"ERRORS","AVERTISSEMENTS":"WARNINGS","INFOS":"INFO","ÉLÉMENT":"ITEM","TYPE":"TYPE","JEU / TITLEID":"GAME / TITLEID","TAILLE":"SIZE","AUCUN":"NONE","Voir, trier et lancer tes jeux installés":"Browse, sort and launch your installed games","Ranger ce qui attend dans _A_TRIER":"Sort whatever is waiting in _A_TRIER","Chercher un jeu, un DLC ou un XBLA":"Find a game, a DLC or an XBLA","SCRIPTS AURORA":"AURORA SCRIPTS","Filtres, tris et utilitaires LUA":"LUA filters, sorts and utilities","CONSOLE":"CONSOLE","Envoyer et récupérer par FTP":"Send and fetch over FTP","CATALOGUE":"CATALOG","Explorer la base de titres XboxUnity":"Browse the XboxUnity title database","UN DOSSIER":"A FOLDER","DOUBLONS":"DUPLICATES","SANTÉ":"HEALTH","Type":"Type","GOD/DLC":"GOD/DLC","CHERCHER":"SEARCH","TYPE":"TYPE","UTILITAIRES":"UTILITIES","FILTRES":"FILTERS","TRIS":"SORTS","SOUS-TITRES":"SUBTITLES","RAFRAÎCHIR":"REFRESH","Tous":"All","Jeux":"Games","Titre":"Title","Détail":"Detail","Source":"Source","FICHIERS":"FILES","Fichier":"File","Collection":"Collection","Taille":"Size","Action":"Action","TÉLÉCHARGEMENTS":"DOWNLOADS","Autres moyens d'ajouter un fichier":"Other ways to add a file","Journal des opérations":"Operation log","CONNECTER":"CONNECT","DESTINATIONS":"DESTINATIONS","Ce que je peux envoyer":"What I can send","ACTION":"ACTION","Jeux / ISO":"Games / ISO","SOURCES":"SOURCES","SANTÉ DE LA BIBLIOTHÈQUE":"LIBRARY HEALTH","— ou a la main —":"— or manually —","Etape 1":"Step 1","Etape 2":"Step 2","Etape 3":"Step 3","Etape 4":"Step 4","Etape 5":"Step 5","FERMER":"CLOSE","Un lien direct passe par la même file d'attente et bénéficie du même pipeline automatique qu'une recherche.":"A direct link goes through the same queue and gets the same automatic pipeline as a search.","Retenir le mot de passe (dans":"Remember the password (in","Vérifier chaque envoi par la":"Verify every send with the console's","de la console":"checksum","Le serveur FTP de la console écoute sur le port 21, utilisateur et mot de passe":"The console FTP server listens on port 21, user and password","par défaut. Sur Aurora :":"by default. In Aurora:","Paramètres → Serveur FTP":"Settings → FTP server","CONNEXION AUTO — ouvre archive.org, tu te connectes, je récupère les cookies":"AUTO LOGIN — opens archive.org, you sign in, cookies are captured automatically","Aurora exécute des":"Aurora runs","— exactement la source que lit Aurora. Un script s'installe dans":"— exactly the source Aurora reads. A script installs into","sur la console.":".","Base de titres":"Title database","— la même que celle d'Aurora. Cherche un jeu pour voir ses":"— the same one Aurora uses. Search a game to see its",", ses":", its","et les fichiers téléchargeables. La pastille":"and the downloadable files. The","signale ce que tu possèdes déjà.":"pill marks what you already own.","CONNEXION ARCHIVE.ORG REQUISE":"ARCHIVE.ORG LOGIN REQUIRED","Rechercher dans les 4000+ titres...":"Search 4000+ titles...","Le cookie reste stocke en local dans config.json — il n'est jamais envoye ailleurs que vers archive.org. S'il expire, refais la manip.":"The cookie is stored locally in secrets.json — it is never sent anywhere but archive.org. If it expires, repeat these steps.","ACCUEIL":"HOME","ACTUALISER":"REFRESH","Actions":"Actions","Jeu":"Game","LIEN":"LINK","IMPORT":"IMPORT","INSTALLÉ":"INSTALLED","somme de contrôle":"checksum",", jamais dans config.json)":", never in config.json)","— Va sur":"— Go to",", créé un compte gratuit et connecte-toi.":", create a free account and sign in.","l'organiser plus tard,":"organize it later,","le range directement au bon endroit sur le disque.":"puts it straight in the right place on the drive.","FICHIERS — INSTALLER = direct dans Content · DÉPÔT = à organiser":"FILES — INSTALL = straight into Content · DROP = to organize","Toutes":"All","— Une fois connecté sur archive.org, appuie sur":"— Once signed in, press","(outils developpeur).":"(dev tools).","— Onglet":"— Tab","— Copie les valeurs de":"— Copy the values of","— Colle-les ci-dessous au format :":"— Paste them below in this format:","JOURNAL AURORA":"AURORA LOG","Lire Aurora/Logs/Aurora.log par FTP":"Read Aurora/Logs/Aurora.log over FTP","CHOISIR UN DOSSIER":"CHOOSE A FOLDER","CHOISIR CE DOSSIER":"CHOOSE THIS FOLDER","ASSISTANT":"ASSISTANT","ASSISTANT LOCAL":"ASSISTANT LOCAL","DEMANDER A L'ASSISTANT":"ASK THE ASSISTANT","Actif":"Active","SOURCES TIERCES":"THIRD-PARTY SOURCES","RAFRAÎCHIR L'INDEX":"REFRESH THE INDEX","Région":"Region","Démarrer avec Windows":"Start with Windows","Le démarrage automatique se règle dans l'application Windows, pas dans le navigateur.":"Automatic start is set in the Windows app, not in the browser.","Lance l'application au démarrage de Windows, sans montrer la fenêtre":"Starts the app when Windows starts, without showing the window","REDÉMARRER":"REBOOT","DÉCONNECTER":"DISCONNECT","RÉESSAYER":"RETRY","Connexion — adresse et identifiants":"Connection — address and credentials","Activité":"Activity","Réglages":"Settings","RÉGLAGES":"SETTINGS","Dépôt — ce qui attend dans _A_TRIER":"Drop folder — what's waiting in _A_TRIER","ORGANISER":"ORGANIZE","ORGANISER →":"ORGANIZE →","Contenu installé — DLC &amp; TU":"Installed content — DLC & TU","VUE DIRECTE":"LIVE VIEW","PLEIN ÉCRAN":"FULLSCREEN","CAPTURE":"CAPTURE","EXPLORER LES DISQUES":"BROWSE THE DRIVES","ENVOYER DU PC":"SEND FROM PC","via XBDM":"via XBDM","Hdd1 · Usb0 · Game…":"Hdd1 · Usb0 · Game…","CONTENU INSTALLÉ":"INSTALLED CONTENT","TOUT AFFICHER →":"SHOW ALL →","FTP":"FTP","XBDM":"XBDM","CONTENU":"CONTENT","DLC":"DLC","MISES À JOUR":"TITLE UPDATES","jeu, DLC, jaquette…":"game, DLC, cover…","Tout ce qui se règle ou s'entretient : les dossiers de la bibliothèque, l'accès téléphone, l'assistant, et les portes vers le catalogue, les homebrews et les scripts.":"Everything that gets set or maintained: the library folders, phone access, the assistant, and the doors to the catalog, homebrew and scripts.","Explorer":"Explore","La base de titres XboxUnity":"The XboxUnity title database","HOMEBREWS":"HOMEBREWS","Applications et jeux amateurs":"Apps and homebrew games","ENTRETIEN":"MAINTENANCE","Doublons, jaquettes manquantes, santé":"Duplicates, missing covers, health","État de la console — ouvrir la vue Console":"Console status — open the Console view","Actualiser":"Refresh","▶ LIVE":"▶ LIVE","LIVE lance des captures en rafale — une à la fois, le rythme réel mesuré s'affiche en badge. Noir possible selon le mode vidéo de la console — limite XBDM connue.":"LIVE starts captures in a burst — one at a time, the measured rate shows in the badge. Black possible depending on the console's video mode — a known XBDM limit.","Dossiers":"Folders","Où attendent les fichiers":"Where files wait","La bibliothèque":"The library","Le Content de la console":"The console's Content folder","Applications consoles":"Console applications","Rétro":"Retro","COOKIE DE COMPTE":"ACCOUNT COOKIE","Requis pour les packs DLC/XBLA restreints":"Required for restricted DLC/XBLA packs","Assistant local":"Local assistant","Accès téléphone":"Phone access","SERVEUR RÉSEAU":"NETWORK SERVER","Ouvre l'app depuis le téléphone":"Opens the app from the phone","Demandé à la première connexion":"Asked at first connection","ADRESSE":"ADDRESS","À taper dans le navigateur du téléphone":"Type it into the phone browser","Divers":"Miscellaneous","Où trouver le cookie":"Where to find the cookie","Moteur local — rien ne sort du PC":"Local engine — nothing leaves the PC","Stockage":"Storage","PC":"PC","PC et console — l'espace, ce qu'il porte, ce que la console lira.":"PC and console — space, what it holds, what the console will read."};
Object.assign(DICT, FR_EN_STATIQUE);
const CK_EN=`<button class="btn accent ck-auto" onclick="iaAuto()">AUTO LOGIN — opens archive.org, you sign in, cookies are captured automatically</button>
<div id="ckStatus" class="ck-status"></div>
<div class="ck-or">— or manually —</div>
<b class="acc">Step 1</b> — Go to <b>archive.org</b>, create a free account and sign in.<br>
<b class="acc">Step 2</b> — Once signed in, press <b>F12</b> (dev tools).<br>
<b class="acc">Step 3</b> — <b>Application</b> tab → <b>Cookies</b> → <b>https://archive.org</b><br>
<b class="acc">Step 4</b> — Copy the values of <b>logged-in-sig</b> and <b>logged-in-user</b>.<br>
<b class="acc">Step 5</b> — Paste them below in this format:<br>
<code class="ck-code">logged-in-sig=XXX...; logged-in-user=you%40email.com</code>
<div class="ck-row">
<input type="text" id="ckIn" placeholder="Paste your cookie: logged-in-sig=...; logged-in-user=..." class="ck-in">
<button class="btn accent" onclick="saveCookie()">SAVE</button>
</div>
<div class="ck-note">The cookie is stored locally in secrets.json (never in config.json, never sent back to this page) — it is only ever sent to archive.org. If it expires, repeat these steps.</div>`;
// Libelles des vues Catalogue et Telechargements. Ajoutes a part : la ligne du
// dictionnaire historique est longue et fragile, et une faute de frappe dedans
// casse tout le fichier.
Object.assign(DICT,{
  'Jeu':'Game','Type':'Type','TitleID':'TitleID','Actions':'Actions',
  'Titre':'Title','Détail':'Detail','Source':'Source',
  'Fichier':'File','Collection':'Collection','Taille':'Size',
  'Toutes':'All','Vimm\'s Vault':'Vimm\'s Vault','Archive.org':'Archive.org','DLC / XBLA':'DLC / XBLA',
  'FICHIERS':'FILES','Action':'Action','Taille / version':'Size / version',
  "Autres moyens d'ajouter un fichier":'Other ways to add a file',
  'Journal des opérations':'Operations log',
  'Nom du jeu ou TitleID (ex. 41560817)':'Game name or TitleID (e.g. 41560817)',
  "URL directe d'un fichier (.iso, .7z, .zip...)":'Direct URL to a file (.iso, .7z, .zip...)',
  'C:\\chemin\\vers\\fichier ou dossier':'C:\\path\\to\\file or folder'
  // L'assistant n'est PAS ici : ses quatre libelles statiques vivent dans le
  // litteral `FR_EN_STATIQUE`, ci-dessus. Ce n'est pas un detail de rangement —
  // `scripts/audit-html-i18n.js` lit ce litteral-la (son motif non glouton
  // s'arrete au PREMIER « }; »), donc une entree rangee dans ce bloc-ci serait
  // INVISIBLE pour lui : l'audit annoncerait « ASSISTANT », « ASSISTANT LOCAL »,
  // « Actif » et « DEMANDER A L'ASSISTANT » non traduits alors qu'ils le sont.
});
// Les phrases d'introduction contiennent des <b> : le TreeWalker de trDom ne voit
// que des fragments de texte, donc on les remplace en bloc.
// Les paragraphes d'introduction contiennent des <b> et des <code> : ce ne sont
// que des fragments de texte, donc on les remplace en bloc, par langue.
//
// Un dictionnaire fragment par fragment ne marcherait pas ici : couper « Cherche
// un jeu, un DLC ou un XBLA, puis choisis : » en cinq morceaux donnerait une
// phrase que personne n'ecrirait. Et le francais n'a pas la meme place pour le
// complement d'objet qu l'espagnol.
const LEADS={
  fr:{
    asLead:'Aurora exécute des <b>scripts LUA</b> : filtres, tris, sous-titres et utilitaires. Cette liste vient des <b>dépôts officiels XboxUnity</b> — exactement la source que lit Aurora. Un script s\'installe dans <code>Game:\\User\\Scripts\\</code> sur la console.',
    catLead:'Base de titres <b>XboxUnity</b> — la même que celle d\'Aurora. Cherche un jeu pour voir ses <b>DLC</b>, ses <b>Title Updates</b> et les fichiers téléchargeables. La pastille <b>INSTALLÉ</b> signale ce que tu possèdes déjà.',
    dlLead:'Cherche un jeu, un DLC ou un XBLA, puis choisis : <b>DÉPÔT</b> garde le fichier pour l\'organiser plus tard, <b>INSTALLER</b> le range directement au bon endroit sur le disque.',
    conLead:'Relie l\'application à ta console par FTP — Aurora, FSD et Dashlaunch en ont un. Parcours ses disques, envoie-lui un jeu, un DLC ou une jaquette, et récupère ce qu\'elle a en plus. Rien n\'est écrit sans que tu le demandes.\n\nIdentifiants par défaut : xbox / xbox (plugin FTP d\'Aurora) ou xboxftp / xboxftp (FtpDll).\n\nCe que tu trouveras sur la console : Hdd1 (disque interne), Usb0 (clé USB), Dvd (lecteur). Sous Hdd1 : Aurora, Games et Content.'
  },
  en:{
    asLead:'Aurora runs <b>LUA scripts</b>: filters, sorts, subtitles and utilities. This list comes from the <b>official XboxUnity repositories</b> — exactly the source Aurora reads. A script installs into <code>Game:\\User\\Scripts\\</code> on the console.',
    catLead:'<b>XboxUnity</b> title database — the same one Aurora uses. Search a game to see its <b>DLC</b>, its <b>Title Updates</b> and the downloadable files. The <b>INSTALLED</b> pill marks what you already own.',
    dlLead:'Search a game, a DLC or an XBLA, then pick: <b>DROP</b> keeps the file to organize later, <b>INSTALL</b> puts it straight in the right place on the drive.',
    conLead:'Connect the app to your console over FTP — Aurora, FSD and Dashlaunch all have one. Browse its drives, send it a game, a DLC or a cover, and pull back what it has extra. Nothing is written unless you ask.\n\nDefault credentials: xbox / xbox (Aurora\'s FTP plugin) or xboxftp / xboxftp (FtpDll).\n\nWhat you will find on the console: Hdd1 (internal drive), Usb0 (USB key), Dvd (optical drive). Under Hdd1: Aurora, Games and Content.'
  },
  es:{
    asLead:'Aurora ejecuta <b>scripts LUA</b>: filtros, ordenaciones, subtítulos y utilidades. Esta lista viene de los <b>repositorios oficiales de XboxUnity</b> — exactamente la fuente que lee Aurora. Un script se instala en <code>Game:\\User\\Scripts\\</code> en la consola.',
    catLead:'Base de títulos <b>XboxUnity</b> — la misma que usa Aurora. Busca un juego para ver sus <b>DLC</b>, sus <b>Title Updates</b> y los archivos descargables. La etiqueta <b>INSTALADO</b> marca lo que ya tienes.',
    dlLead:'Busca un juego, un DLC o un XBLA, y luego elige: <b>BANDEJA</b> guarda el archivo para organizarlo más tarde, <b>INSTALAR</b> lo coloca directamente en el lugar correcto del disco.',
    conLead:'Conecta la aplicación a tu consola por FTP — Aurora, FSD y Dashlaunch tienen uno. Recorre sus discos, envíale un juego, un DLC o una carátula, y recupera lo que tenga de más. No se escribe nada sin que lo pidas.\n\nCredenciales por defecto: xbox / xbox (plugin FTP de Aurora) o xboxftp / xboxftp (FtpDll).\n\nLo que encontrarás en la consola: Hdd1 (disco interno), Usb0 (memoria USB), Dvd (lector). Bajo Hdd1: Aurora, Games y Content.'
  },
  pt:{
    asLead:'O Aurora executa <b>scripts LUA</b>: filtros, ordenações, legendas e utilitários. Esta lista vem dos <b>repositórios oficiais do XboxUnity</b> — exatamente a fonte que o Aurora lê. Um script se instala em <code>Game:\\User\\Scripts\\</code> no console.',
    catLead:'Base de títulos <b>XboxUnity</b> — a mesma que o Aurora usa. Busque um jogo para ver os <b>DLC</b>, as <b>Title Updates</b> e os arquivos para baixar. A etiqueta <b>INSTALADO</b> marca o que você já tem.',
    dlLead:'Busque um jogo, um DLC ou um XBLA, e depois escolha: <b>BANDEJA</b> guarda o arquivo para organizar depois, <b>INSTALAR</b> coloca direto no lugar certo do disco.',
    conLead:'Conecte o aplicativo ao console por FTP — Aurora, FSD e Dashlaunch têm um. Percorra os discos dele, envie um jogo, um DLC ou uma capa, e traga de volta o que ele tiver a mais. Nada é escrito sem que você peça.\n\nCredenciais padrão: xbox / xbox (plugin FTP do Aurora) ou xboxftp / xboxftp (FtpDll).\n\nO que você encontrará no console: Hdd1 (disco interno), Usb0 (pen drive), Dvd (leitor). Sob Hdd1: Aurora, Games e Content.'
  }
};
const LEADS_EN = LEADS.en;
// Le corps de la fenetre « connexion archive.org ». Beaucoup de balises et un
// exemple de format a ne pas traduire : ecrit en entier par langue plutot que
// decoupe en fragments.
const CK_LANG={
  es:`<button class="btn accent ck-auto" onclick="iaAuto()">CONEXIÓN AUTOMÁTICA — abre archive.org, inicias sesión y las cookies se capturan solas</button>
<div id="ckStatus" class="ck-status"></div>
<div class="ck-or">— o a mano —</div>
<b class="acc">Paso 1</b> — Ve a <b>archive.org</b>, crea una cuenta gratuita e inicia sesión.<br>
<b class="acc">Paso 2</b> — Una vez dentro, pulsa <b>F12</b> (herramientas de desarrollo).<br>
<b class="acc">Paso 3</b> — Pestaña <b>Application</b> → <b>Cookies</b> → <b>https://archive.org</b><br>
<b class="acc">Paso 4</b> — Copia los valores de <b>logged-in-sig</b> y <b>logged-in-user</b>.<br>
<b class="acc">Paso 5</b> — Pégalos abajo con este formato:<br>
<code class="ck-code">logged-in-sig=XXX...; logged-in-user=tu%40email.com</code>
<div class="ck-row">
<input type="text" id="ckIn" placeholder="Pega tu cookie: logged-in-sig=...; logged-in-user=..." class="ck-in">
<button class="btn accent" onclick="saveCookie()">GUARDAR</button>
</div>
<div class="ck-note">La cookie se guarda en local en secrets.json (nunca en config.json, nunca se devuelve a esta página) — solo se envía a archive.org. Si caduca, repite estos pasos.</div>`,
  pt:`<button class="btn accent ck-auto" onclick="iaAuto()">CONEXÃO AUTOMÁTICA — abre o archive.org, você entra e os cookies são capturados sozinhos</button>
<div id="ckStatus" class="ck-status"></div>
<div class="ck-or">— ou à mão —</div>
<b class="acc">Passo 1</b> — Vá ao <b>archive.org</b>, crie uma conta gratuita e entre.<br>
<b class="acc">Passo 2</b> — Depois de entrar, aperte <b>F12</b> (ferramentas de desenvolvedor).<br>
<b class="acc">Passo 3</b> — Aba <b>Application</b> → <b>Cookies</b> → <b>https://archive.org</b><br>
<b class="acc">Passo 4</b> — Copie os valores de <b>logged-in-sig</b> e <b>logged-in-user</b>.<br>
<b class="acc">Passo 5</b> — Cole abaixo neste formato:<br>
<code class="ck-code">logged-in-sig=XXX...; logged-in-user=voce%40email.com</code>
<div class="ck-row">
<input type="text" id="ckIn" placeholder="Cole o seu cookie: logged-in-sig=...; logged-in-user=..." class="ck-in">
<button class="btn accent" onclick="saveCookie()">SALVAR</button>
</div>
<div class="ck-note">O cookie fica guardado localmente em secrets.json (nunca em config.json, nunca volta para esta página) — só é enviado ao archive.org. Se expirar, repita estes passos.</div>`
};
// Langues : francais (origine), anglais, espagnol, portugais.
//
// UNE CHAINE NON TRADUITE RETOMBE SUR L'ANGLAIS, PAS SUR LE FRANCAIS : quelqu'un
// qui lit l'espagnol comprend generalement mieux l'anglais que le francais. Se
// tromper de repli donne une interface a moitie traduite dans une langue qu'on
// ne lit pas.
const LANGS=['fr','en','es','pt'];
function trDom(){
  if(!LANG||LANG==='fr')return;
  const D={en:DICT,es:Object.assign({},DICT_ES,DICT_FR_ES),pt:Object.assign({},DICT_PT,DICT_FR_PT)};
  // Le HTML statique est ecrit en FRANCAIS : on passe donc d'abord par l'anglais
  // (la table DICT), puis de l'anglais vers la langue visee.
  const tr=s=>{
    if(LANG==='en')return DICT[s]||s;
    const en=DICT[s];
    const table=D[LANG]||{};
    return table[s]||(en?table[en]:null)||en||s;
  };
  // Les paragraphes d'introduction, en bloc et dans la langue voulue. Le francais
  // est deja dans le HTML : on ne le repose que si l'on change de langue.
  const leads=LEADS[LANG]||{};
  for(const k in leads){const el=$(k);if(el)el.innerHTML=leads[k];}
  const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  let n;while(n=w.nextNode()){const t=n.nodeValue.trim();if(t&&tr(t)!==t)n.nodeValue=n.nodeValue.replace(t,tr(t));}
  document.querySelectorAll('input[placeholder]').forEach(e=>{const v=tr(e.placeholder);if(v!==e.placeholder)e.placeholder=v;});
  document.querySelectorAll('[title]').forEach(e=>{const v=tr(e.title);if(v!==e.title)e.title=v;});
  // Le corps de la fenetre « connexion archive.org » est long et truffe de
  // balises : il est ecrit en entier par langue, comme les paragraphes.
  if(LANG==='en')$('ckBody').innerHTML=CK_EN;
  else if(LANG==='es'||LANG==='pt')$('ckBody').innerHTML=CK_LANG[LANG];
}
function setLang(l){localStorage.setItem('x360lang',l);post('/api/config',{lang:l});location.reload();}
// Le bouton montre la langue COURANTE. Afficher « EN » quand on est en francais
// se lisait comme un etat, pas comme une action — et l'ancien clic qui faisait
// defiler les langues obligeait a cliquer quatre fois en devinant l'ordre. Le
// menu les propose toutes d'un coup, alors on ne devine plus rien.
const LANG_LIBELLE={fr:'FR',en:'EN',es:'ES',pt:'PT'};

// LE MENU DE LANGUES. Il s'ouvre au survol et au focus (voir style.css) ; ce clic
// sert au TACTILE, ou il n'y a ni l'un ni l'autre. Le bouton OUVRE, il ne fait
// plus defiler les langues : proposer les quatre d'un coup est plus clair que de
// cliquer quatre fois en devinant l'ordre.
function basculeLang(){
  const w=$('langWrap'), b=$('langBtn');
  const ouvert=w.classList.toggle('ouvert');
  b.setAttribute('aria-expanded',String(ouvert));
}
// La langue active se marque : sans cela, on ne sait pas d'ou l'on part.
function majLangMenu(){
  document.querySelectorAll('#langMenu button').forEach(b=>{
    b.setAttribute('aria-current',String(b.dataset.l===(LANG||'fr')));
  });
}
const $=id=>document.getElementById(id);
const fmt=b=>b>1073741824?(b/1073741824).toFixed(1)+' Go':b>1048576?(b/1048576).toFixed(0)+' Mo':b>=1024?(b/1024).toFixed(0)+' Ko':(b||0)+' o';

// ---------- Echappement (SÉCURITÉ) ----------
// Les titres d'items archive.org, les noms de fichiers et les résultats de
// recherche sont du contenu DISTANT, controlable par un tiers, et ils etaient
// injectes bruts dans innerHTML : un titre d'item contenant une balise <img
// onerror=...> s'executait dans la page, avec acces a l'API locale complete
// (suppression/deplacement/installation) et au cookie archive.org.
// Trois contextes, trois fonctions — ne jamais en utiliser une autre :
//   escH -> contenu texte (entre balises)
//   escA -> valeur d'attribut HTML (guillemets doubles)
//   jsA  -> litteral JS place DANS un attribut de handler (onclick="f(...)")
const escH=s=>String(s==null?'':s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const escA=s=>escH(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const jsA=v=>escA(JSON.stringify(v===undefined?null:v));
// LE LIBELLE D'UNE COLONNE VIENT DE L'EN-TETE DE SA TABLE : UNE SEULE SOURCE.
//
// Sous 560 px, l'en-tete disparait et chaque cellule devient une ligne
// « libelle : valeur » (la fiche). Le libelle est pose en `data-l` et la feuille
// le lit par `content:attr(data-l)` : sans lui, la fiche montre « 584109B7 »
// sans dire que c'est un TitleID.
//
// IL EST LU, JAMAIS RECOPIE. Les en-tetes sont deja traduits par `trDom()` (qui
// parcourt tous les noeuds de texte, `<th>` compris) et `setLang()` recharge la
// page : il n'y a donc pas de bascule de langue sans re-rendu, et le `data-l`
// suit la langue affichee. Vingt libelles ecrits en dur auraient ete vingt
// chaines francaises invisibles a l'i18n — justes en francais, fausses partout
// ailleurs. Le moment est sur : `trDom()` tourne au demarrage, avant le premier
// rendu de vue.
//
// Un `<tbody>` absent ou une table sans `<thead>` rend une chaine vide : la
// feuille n'affiche alors aucun libelle, ce qui est moins grave qu'une exception
// au milieu d'un rendu.
function enTete(idTbody,i){
  const tb=$(idTbody),th=tb&&tb.closest('table')&&tb.closest('table').querySelector('thead tr');
  return th&&th.children[i]?th.children[i].textContent.trim():'';
}

// ---------- Clavier ----------
// Une dizaine d'éléments interactifs sont des <div> ou des <tr> avec un onclick :
// tuiles de jeux, lignes de liste, en-tetes depliables, lignes de tableau. Ni
// atteignables au Tab ni actionnables au clavier — l'interface etait donc
// inutilisable sans souris. Plutot que de reecrire chaque gabarit en <button>
// (ce qui casserait la mise en page), on les rend focusables et on centralise
// l'activation ici : Entrée et Espace declenchent le clic, comme sur un bouton.
//
// Les lignes de tableau recoivent tabindex mais PAS role="button" : changer leur
// role les sortirait de la structure du tableau et un lecteur d'ecran ne saurait
// plus qu'il lit des lignes. On les reconnait donc a leur balise.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const el = e.target;
  if (!el || !el.tagName) return;
  if (el.getAttribute('role') !== 'button' && el.tagName !== 'TR') return;
  if (el.tagName === 'BUTTON' || el.tagName === 'A') return; // déjà gere par le navigateur
  e.preventDefault();
  el.click();
});
// jaquette cassee : handler dedie. Le repli inline
// onerror="this.outerHTML='<div class=nocov>X</div>'" cassait des que le nom du
// jeu commencait par une apostrophe (handler mort, aucune image de repli).
function covErr(img,ch){img.outerHTML='<div class="nocov">'+escH(ch)+'</div>';}

// api() : sans controle, un 500 HTML ou un corps vide faisait rejeter .json()
// -> rejet non gere, spinner fige pour toujours et onglet qui ne se recharge
// plus jamais (les drapeaux *Loaded etaient poses avant l'await).
async function api(p,opts){
  let r=await fetch(p,opts);
  // UN 401 AVEC `besoin:'acces'` N'EST PAS UNE PANNE. C'est le serveur qui
  // demande le code d'appairage : la requete vient du reseau, pas de la machine
  // qui fait tourner le serveur. On demande le code, puis on REJOUE la requete —
  // sinon l'application afficherait une erreur pour une porte qu'on peut ouvrir.
  if(r.status===401){
    const d=await r.clone().json().catch(()=>({}));
    if(d&&d.besoin==='acces'&&await demanderCode())r=await fetch(p,opts);
  }
  if(!r.ok)throw new Error('HTTP '+r.status);
  const ct=r.headers.get('content-type')||'';
  if(!ct.includes('application/json'))throw new Error(T('Réponse invalide du serveur','Invalid server response'));
  return r.json();
}

// UNE SEULE BOITE A LA FOIS. Au demarrage la page lance une dizaine de requetes
// ensemble : sans ce verrou, elles recevraient dix fois 401 et l'on ouvrirait dix
// boites l'une sur l'autre, dont neuf sans reponse possible.
let _codeEnCours=null;
function demanderCode(){
  if(_codeEnCours)return _codeEnCours;
  _codeEnCours=(async()=>{
    try{
      const c=await saisir({
        titre:T('Accès depuis le réseau','Access from the network'),
        libelle:T('Les 6 chiffres affichés dans les RÉGLAGES du PC','The 6 digits shown in the PC SETTINGS'),
        valeur:''
      });
      if(c===null)return false;
      const r=await fetch('/api/acces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:c.trim()})});
      if(!r.ok){
        const d=await r.json().catch(()=>({}));
        toast(d.error||T('Code refusé','Code refused'),'err');
        return false;
      }
      return true;
    }catch(e){toast(T('Connexion impossible : ','Cannot connect: ')+e.message,'err');return false;}
    finally{_codeEnCours=null;}
  })();
  return _codeEnCours;
}
async function post(p,b){return api(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});}

// `setAppBg(tid)` vivait ici : il installait le fanart du jeu courant comme fond
// de TOUTE l'application. La couche Mica echantillonne desormais le fond d'ecran
// de Windows (`GET /api/wallpaper`), qui lui est toujours la — au tableau de bord
// comme ailleurs, alors que le fanart, lui, n'existe que si un jeu est
// selectionne : c'est pour cela que le fond ne se voyait pas.
// L'art du jeu n'est pas perdu : la fiche de detail porte le sien (`#dpBg`), la
// ou il sert vraiment — a reconnaitre le jeu qu'on regarde.
// La tete de page dit OU l'on est et A QUOI sert la section. Un titre seul
// laissait l'utilisateur deviner.
//
// Les quatre langues sont ECRITES, pas deduites d'un dictionnaire : ces chaines
// vivaient dans un tableau [fr, en] hors de tout appel T(), donc l'extracteur du
// vocabulaire ne les voyait pas — et le sous-titre restait en anglais en
// espagnol. Une paire figee est un piege des qu'on ajoute une langue.
const VTITLE={
  dash:{nom:['ACCUEIL','HOME','INICIO','INÍCIO'],
        sub:['Vue d\'ensemble de ta bibliothèque','Your library at a glance','Tu biblioteca de un vistazo','Sua biblioteca em resumo']},
  lib:{nom:['BIBLIOTHÈQUE','LIBRARY','BIBLIOTECA','BIBLIOTECA'],
       sub:['Tes jeux installés, et ce qui attend dans le dépôt','Your installed games, and what waits in the drop folder','Tus juegos instalados, y lo que espera en la bandeja','Seus jogos instalados, e o que espera na bandeja']},
  hb:{nom:['HOMEBREW','HOMEBREW','HOMEBREW','HOMEBREW'],
      sub:['Applications et émulateurs pour la console','Apps and emulators for the console','Aplicaciones y emuladores para la consola','Aplicativos e emuladores para o console']},
  cat:{nom:['CATALOGUE','CATALOG','CATÁLOGO','CATÁLOGO'],
       sub:['Chercher un titre dans la base XboxUnity','Search the XboxUnity title database','Buscar un título en la base de XboxUnity','Buscar um título na base do XboxUnity']},
  ct:{nom:['DLC & TU','DLC & TU','DLC & TU','DLC & TU'],
      sub:['Ce qui est installé sur le disque, et ce qui manque','What is installed on the drive, and what is missing','Lo que está instalado en el disco, y lo que falta','O que está instalado no disco, e o que falta']},
  con:{nom:['CONSOLE','CONSOLE','CONSOLA','CONSOLE'],
       sub:['Piloter Aurora par FTP : disques, envois, récupérations','Drive Aurora over FTP: disks, sends, fetches','Controlar Aurora por FTP: discos, envíos, recepciones','Controlar o Aurora por FTP: discos, envios, recebimentos']},
  as:{nom:['SCRIPTS AURORA','AURORA SCRIPTS','SCRIPTS DE AURORA','SCRIPTS DO AURORA'],
      sub:['Filtres, tris, sous-titres et utilitaires LUA, depuis les dépôts officiels','LUA filters, sorts, subtitles and utilities, from the official repositories','Filtros, ordenaciones, subtítulos y utilidades LUA, de los repositorios oficiales','Filtros, ordenações, legendas e utilitários LUA, dos repositórios oficiais']},
  act:{nom:['ACTIVITÉ','ACTIVITY','ACTIVIDAD','ATIVIDADE'],
       sub:['Transferts console, téléchargements et dépôt, en un coup d\'œil','Console transfers, downloads and drop folder, at a glance','Transferencias, descargas y bandeja, de un vistazo','Transferências, downloads e bandeja, de relance']},
  tools:{nom:['RÉGLAGES & OUTILS','SETTINGS & TOOLS','AJUSTES Y HERRAMIENTAS','CONFIG. E FERRAMENTAS'],
         sub:['Dossiers, réseau, entretien — ce qui se règle une fois','Folders, network, maintenance — what gets set once','Carpetas, red, mantenimiento — lo que se ajusta una vez','Pastas, rede, manutenção — o que se ajusta uma vez']},
  sto:{nom:['STOCKAGE','STORAGE','ALMACENAMIENTO','ARMAZENAMENTO'],
       sub:['L\'espace par disque, et ce qui le remplit','Space per drive, and what fills it','Espacio por disco, y qué lo llena','Espaço por disco, e o que o preenche']}
};
// DEST : la couche de correspondance vue -> destination (spec 002). Les vues
// absorbées par une destination gardent leur identifiant ; le rail n'allume que
// les cinq entrees, et `go('cat')` depuis un raccourci fait luire « Bibliothèque ».
const DEST={dash:'dash',lib:'lib',hb:'lib',as:'lib',cat:'lib',con:'con',act:'act',sto:'sto',tools:'tools'};
// viewState : l'etat d'une vue survit au changement de destination (spec US3) —
// position de lecture seulement : les filtres et la selection vivent deja dans le
// DOM, qui persiste ; rien ne survit a unload (volontaire).
const viewState={};let curView='dash';
// L'index de la langue dans LANGS, pour lire le bon element des tableaux.
function langIdx(){const i=LANGS.indexOf(LANG);return i<0?0:i;}
function showView(v,btn){
  const ancien=$('v-'+curView);
  if(ancien&&curView!==v)viewState[curView]={scroll:ancien.scrollTop};
  btn=btn||$('nv-'+(DEST[v]||v));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.ttab').forEach(x=>x.classList.remove('active'));
  const nv=$('v-'+v);nv.classList.add('active');btn.classList.add('active');
  const st=viewState[v];if(st)nv.scrollTop=st.scroll;
  if(v!=='con'&&conLive)conLiveArreter();   // la vue directe meurt avec sa vue
  curView=v;
  const vt=VTITLE[v]||{nom:['','','',''],sub:['','','','']};const i=langIdx();
  $('vtName').textContent=vt.nom[i]||vt.nom[0];$('vtSub').textContent=vt.sub[i]||vt.sub[0];
  ctxMaj(v);
  if(v==='cat'&&!catLoaded)loadCatalog();
  if(v==='hb'&&!hbLoaded)loadHomebrew();
  if(v==='as'&&!asLoaded)loadScripts();
  if(v==='con'){conEtat();if(!ctLoaded)loadMyContent();}
  if(v==='act'){pollLog();setSrcNote();conEtat();depotAct();}
  if(v==='sto')loadStock();
  if(v==='tools'){chargerReseau();chargerCandidats();}
  if(v==='dash')loadDash();
}
function go(v){showView(v);}
// La barre de contexte repete ce que la vue sait DEJA : elle ne va rien chercher
// — constitution III, un compteur invente est pire que pas de compteur.
function ctxMaj(v){
  const el=$('vctx');if(!el)return;
  let s='';
  if(v==='lib'&&games.length)s=games.length+T(' jeux',' games');
  else if(v==='con'&&conConnecte)s=$('conBNom').textContent||'';
  else if(v==='act')s=$('dlStatus').textContent||'';
  el.textContent=s;
}
// La pastille « Dépôt » d'Activité compte ce qui attend — le meme endpoint que
// le tableau de bord, en lecture seule. Elle porte le nombre ET le volume.
async function depotAct(){
  try{
    const d=await api('/api/drop')||[];const n=d.length;
    const t=d.reduce((s,f)=>s+(f.size||0),0);
    $('actDepotStat').textContent=n?n+' · '+fmt(t):T('Rien en attente','Nothing waiting');
    $('actDepotPill').hidden=!n;
  }catch(e){const s=$('actDepotStat');if(s)s.textContent='';}
}
// Le badge d'Activite compte ce qui bouge : jobs FTP (races) + telechargements
// actifs et en file. Les deux rendeurs l'alimentent ; a zero il disparait.
let actBadgeFtp=0,actBadgeDl=0;
function actBadgeMaj(){
  const b=$('nvActBadge');if(!b)return;
  const n=actBadgeFtp+actBadgeDl;
  b.hidden=!n;b.textContent=n?(n>9?'9+':n):'';
}
// Une jaquette de l'accueil mene au JEU, pas a la bibliotheque en vrac :
// l'objet clique est l'objet obtenu. `games` peut ne pas etre chargee encore —
// dans ce cas on lance le scan puis on selectionne.
async function openJeuTid(tid){
  go('lib');
  if(!games.length)await loadGames();
  const i=games.findIndex(g=>g.tid===tid);
  if(i>=0)selGame(i);
}


/* ==========================================================================
   ETATS, FOCUS, AIDE
   ========================================================================== */

// --- Squelettes -----------------------------------------------------------
// Une attente doit avoir la FORME de ce qui va s'afficher : l'oeil sait alors ou
// regarder quand le contenu arrive, au lieu de voir la page sursauter. Le texte
// "Chargement..." ne prepare a rien.
const skelCards = (n) => '<div class="skel-grid">' + Array.from({length:n||10},()=>'<div class="skel-card"></div>').join('') + '</div>';
const skelRows = (n) => '<div class="skel-rows">' + Array.from({length:n||6},()=>'<div class="skel-row"></div>').join('') + '</div>';

// --- Etats vides ----------------------------------------------------------
// Un vide n'est pas une impasse : il dit ce qui manque et propose la suite.
// Les actions sont enregistrees a part, car un onclick en ligne ne peut pas
// referencer une closure — il est compile dans la portee globale.
window._videActs = [];
function etatVide(o){
  const i = window._videActs.push(o.act) - 1;
  return '<div class="empty">'+
    '<div class="empty-i"><svg><use href="#i-'+(o.icone||'box')+'"/></svg></div>'+
    '<div class="empty-t">'+escH(o.titre)+'</div>'+
    (o.aide?'<div class="empty-h">'+escH(o.aide)+'</div>':'')+
    (o.bouton&&o.act?'<button class="btn" onclick="window._videActs['+i+']()">'+escH(o.bouton)+'</button>':'')+
  '</div>';
}

// --- Modales : focus et semantique ----------------------------------------
// Sans piege a focus, Tab sortait de la modale et allait se perdre derriere :
// au clavier, on ne savait plus ou l'on etait. Et sans restauration, fermer la
// modale laissait le focus nulle part.
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
// L'ASSISTANT Y EST COMME LES AUTRES : sans cette ligne, Echap, Tab, le piege a
// focus et le bouton B de la manette ne le voient pas, et on s'y enferme sans
// pouvoir refuser. Son `z-index` vient de la FEUILLE (jeton `--z-assistant`),
// jamais d'un attribut en ligne.
const SURCOUCHES = ['orgModal','dlModal','scanModal','cookieModal','helpModal','healthModal','langModal','pickModal','dialogModal','diaModal','iaModal'];
let _focusAvant = null;

// Etat de la boite de dialogue maison (voir `confirmer`/`saisir` plus bas).
let dlgResoudre = null, dlgTexte = false, dlgReponse = undefined;

const visible = (el) => el && el.offsetParent !== null && !el.disabled;

function ouvrirSurcouche(el){
  if (!el || el.style.display === 'flex') return;
  _focusAvant = document.activeElement;
  el.style.display = 'flex';
  el.setAttribute('role','dialog');
  el.setAttribute('aria-modal','true');
  const cible = [...el.querySelectorAll(FOCUSABLE)].find(visible);
  if (cible) cible.focus();
}

function fermerSurcouche(el){
  if (!el || el.style.display === 'none') return;
  el.style.display = 'none';
  el.removeAttribute('aria-modal');
  // on rend le focus la ou il etait : l'utilisateur ne perd pas sa place
  if (_focusAvant && _focusAvant.focus) { try { _focusAvant.focus(); } catch(e){} }
  _focusAvant = null;
  // UNE BOITE FERMEE SANS REPONSE DOIT RENDRE LA VALEUR SURE. Echap et le bouton B
  // de la manette passent par ici, pas par `dlgRepondre` : sans ce point, la
  // promesse ne se resoudrait JAMAIS — l'appelant resterait suspendu pour toujours,
  // et la reponse suivante resoudrait la question PRECEDENTE. On resout APRES avoir
  // rendu le focus, pour que la suite puisse ouvrir une autre boite proprement.
  if (el.id === 'dialogModal' && dlgResoudre) {
    const f = dlgResoudre;
    const r = dlgReponse !== undefined ? dlgReponse : (dlgTexte ? null : false);
    dlgResoudre = null; dlgReponse = undefined;
    f(r);
  }
  // Le diaporama a un minuteur A LUI : le fermer par Echap ou par le bouton B ne
  // passe pas par `diaFermer`, donc sans cette ligne le minuteur survivait jusqu'a
  // 8 s et declenchait un dernier `diaAfficher()` sur une surcouche cachee — soit
  // une requete /api/cover inutile (un navigateur charge une image meme dans un
  // conteneur `display:none`). La chaine s'arrete ensuite d'elle-meme, `diaRelancer`
  // sortant si la surcouche est fermee : ce n'etait donc PAS une fuite, seulement
  // un aller-retour reseau pour rien. Ferme veut dire arrete, sur TOUS les chemins.
  if (el.id === 'diaModal') diaStop();
}

// ---- DIAPORAMA --------------------------------------------------------------
// L'etat tient en CINQ variables : la liste, l'index courant, le minuteur, la pause,
// et la face affichee — le fondu enchaine a deux couches, donc il faut savoir
// laquelle porte l'image. (Ce commentaire disait « trois » : il venait du plan.)
let DIA_LISTE=[], DIA_I=0, DIA_MINUTEUR=null, DIA_EN_PAUSE=false, DIA_FACE=0;
const DIA_DUREE=8000;

const diaEstOuvert=()=>{const m=$('diaModal');return !!m&&m.style.display==='flex';};

async function diaOuvrir(){
  if(diaEstOuvert())return;
  // LA LISTE SE RELIT A CHAQUE OUVERTURE, et c'est le cache SERVEUR qui evite le
  // travail : il ne relit le dossier que si sa date a change. Elle ne se relisait
  // que si elle etait VIDE, donc une jaquette arrivee pendant la session — l'app en
  // telecharge en permanence — restait invisible jusqu'a F5, et le seul appelant
  // annulait le benefice du cache qu'il interroge.
  try{DIA_LISTE=await api('/api/diaporama');}catch(e){/* on garde la precedente */}
  // La liste a pu RETRECIR (une jaquette supprimee pendant la session) : sans ce
  // controle, l'index pointerait au-dela du tableau et `diaAfficher` sortirait
  // sans rien poser — un ecran fige sur la derniere image.
  if(!DIA_LISTE.length)DIA_I=0;
  else if(DIA_I>=DIA_LISTE.length)DIA_I=0;
  ouvrirSurcouche($('diaModal'));
  // RIEN A MONTRER SE DIT. Un ecran noir laisserait croire a une panne, alors
  // que la cause est connue : aucune jaquette en cache.
  const vide=DIA_LISTE.length===0;
  $('diaVide').hidden=!vide;
  if(vide)$('diaVide').textContent=T('Aucune jaquette à afficher. Lance une recherche de jaquettes depuis la bibliothèque.','No cover to show. Fetch covers from the library first.');
  $('diaPile').hidden=vide; $('diaBas').hidden=vide;
  // ON REPART DE LA PREMIERE JAQUETTE, et non de l'index precedent : rouvrir le
  // diaporama est une remise a zero. Les deux lignes ci-dessus ne gardent que
  // l'invariant d'index (une liste vide, ou plus courte qu'avant).
  if(!vide){DIA_I=0;diaAfficher();diaRelancer();}
}
function diaFermer(){
  if(!diaEstOuvert())return;
  diaStop();
  fermerSurcouche($('diaModal'));
  diaInactivite();
}
function diaStop(){if(DIA_MINUTEUR){clearTimeout(DIA_MINUTEUR);DIA_MINUTEUR=null;}}
function diaRelancer(){
  diaStop();
  if(DIA_EN_PAUSE||!diaEstOuvert())return;
  DIA_MINUTEUR=setTimeout(()=>{diaAvancer(1);},DIA_DUREE);
}
function diaAfficher(){
  const g=DIA_LISTE[DIA_I]; if(!g)return;
  const url='/api/cover?tid='+encodeURIComponent(g.tid);
  // FONDU ENCHAINE : on allume la couche qui dormait, on eteint celle qui etait
  // visible. Une seule image ne peut pas se fondre en elle-meme, et un
  // `background-image` ne s'anime pas — d'ou les deux couches de #diaPile.
  const suivante=DIA_FACE?$('diaCover'):$('diaCoverB');
  const precedente=DIA_FACE?$('diaCoverB'):$('diaCover');
  suivante.src=url;
  suivante.classList.add('on');
  precedente.classList.remove('on');
  DIA_FACE=1-DIA_FACE;
  $('diaFond').style.backgroundImage='url(\''+url+'\')';
  $('diaNom').textContent=g.name;
  $('diaMeta').textContent=g.tid+' · '+fmt(g.size);
  $('diaCompteur').textContent=(DIA_I+1)+' / '+DIA_LISTE.length;
}
function diaAvancer(sens){
  if(!DIA_LISTE.length)return;
  DIA_I=(DIA_I+sens+DIA_LISTE.length)%DIA_LISTE.length;
  diaAfficher();
  diaRelancer();
}
function diaBascule(){
  DIA_EN_PAUSE=!DIA_EN_PAUSE;
  $('diaPause').hidden=!DIA_EN_PAUSE;
  diaRelancer();
}

// ---- DECLENCHEMENT PAR INACTIVITE -------------------------------------------
// Cinq minutes, et c'est une CONSTANTE **au sens du produit** : le reglage qui
// compte est « jamais / cinq minutes », parce que ce qu'on veut pouvoir arreter
// c'est que l'ecran soit pris tout seul. Offrir cinq durees serait trois chaines
// a traduire de plus pour un curseur que personne ne deplace deux fois.
//
// `let` ET NON `const`, et ce n'est pas un detail de style : la verification de
// l'etape 5 ramene le delai a 400 ms pour ne pas attendre cinq minutes, et une
// affectation a une `const` leve « Assignment to constant variable ». Mesure :
// le TypeError est bien leve, donc l'expression de la sonde ne rend RIEN et la
// verification echoue pour une raison qui n'a rien a voir avec le produit.
let DIA_DELAI_MS=5*60*1000;
const DIA_LARGEUR_MIN=780;
let DIA_INACTIF=null;

// TROIS CONDITIONS, et chacune protege d'un cas reel.
function diaAutoPeut(){
  if(!DIA_AUTO)return false;                       // le reglage est coupe
  if(diaEstOuvert())return false;                  // deja ouvert
  if(innerWidth<=DIA_LARGEUR_MIN)return false;     // telephone ou tablette
  if(surcoucheOuverte())return false;              // une confirmation est ouverte
  return true;
}
// Appelee a CHAQUE geste. Le sondage de l'application (telechargements, journal)
// n'en est pas un : il ne passe pas par ici, donc il ne rearme pas le minuteur.
function diaInactivite(){
  if(DIA_INACTIF)clearTimeout(DIA_INACTIF);
  DIA_INACTIF=null;
  if(!DIA_AUTO)return;
  DIA_INACTIF=setTimeout(()=>{if(diaAutoPeut())diaOuvrir();},DIA_DELAI_MS);
}
for(const ev of ['mousemove','mousedown','keydown','wheel','touchstart','pointerdown'])
  document.addEventListener(ev,diaInactivite,{passive:true});
// LE CLAVIER PILOTE LE DIAPORAMA QUAND IL EST OUVERT. Echap est deja pris en
// charge par `fermerSurcouche` (le diaporama est dans SURCOUCHES) ; il reste les
// fleches et la barre d'espace, qui n'ont aucun sens ailleurs dans ce contexte.
// `preventDefault` sur les fleches evite que la surcouche ne defile en meme temps.
document.addEventListener('keydown',e=>{
  if(!diaEstOuvert())return;
  if(e.key==='ArrowLeft'){e.preventDefault();diaAvancer(-1);}
  else if(e.key==='ArrowRight'){e.preventDefault();diaAvancer(1);}
  else if(e.key===' '){e.preventDefault();diaBascule();}
});
// PAS D'APPEL ICI, ET C'EST UNE MESURE, PAS UN GOUT. `DIA_AUTO` est declare
// `let` PLUS BAS dans ce fichier (avec `loadCfg`), donc la zone morte temporelle
// court jusqu'a cette declaration : appelee ici, `diaInactivite()` levait
// « ReferenceError: Cannot access 'DIA_AUTO' before initialization » (releve a la
// ligne 455 par la sonde), ce qui ARRETAIT l'evaluation du script — `diaEstOuvert`
// n'existait plus, la page entiere perdait le diaporama, et la sonde ne rendait
// RIEN sans dire pourquoi. Le minuteur n'a rien a faire ici de toute facon :
// `loadCfg()` l'arme des que le reglage est lu (reglement R12), et les gestes
// l'arment ensuite par les ecouteurs ci-dessus.

// ---------- Boite de dialogue maison ----------
// Remplace confirm() et prompt(), qui GELAIENT le fil JavaScript (pendant une
// confirmation, le sondage des telechargements s'arretait et l'ecran montrait un
// etat perime) et ne se pilotaient pas a la manette.
//
// Contrat de sortie, dans les deux cas : ANNULER, Echap, le bouton B et un clic sur
// le fond rendent la valeur SURE. Rien ne part sans reponse explicite.
//
// Le corps est pose en `textContent`, jamais en `innerHTML` : les messages portent
// des noms de jeux lus sur le disque ET des titres d'items archive.org, que
// n'importe qui peut nommer. `confirm()` prenait une chaine brute ; passer a
// innerHTML introduirait une XSS que ce code n'a jamais eue.
function dlgRepondre(ok){
  if (!dlgResoudre) return;
  dlgReponse = dlgTexte ? (ok ? $('dlgInput').value : null) : !!ok;
  fermerSurcouche($('dialogModal'));
}

// confirmer({titre, corps, ok, danger}) -> Promise<boolean>
function confirmer(o){
  o = o || {};
  return new Promise(res => {
    dlgTexte = false;
    $('dlgTitre').textContent = o.titre || '';
    $('dlgCorps').textContent = o.corps || '';
    $('dlgChamp').style.display = 'none';
    $('dlgNon').textContent = o.annuler || T('ANNULER','CANCEL');
    $('dlgOui').textContent = o.ok || T('CONFIRMER','CONFIRM');
    // La gravite se lit sur le bouton lui-meme : SUPPRIMER passe en rouge.
    $('dlgOui').className = 'btn' + (o.danger ? ' red' : '');
    dlgReponse = undefined;
    dlgResoudre = res;
    ouvrirSurcouche($('dialogModal'));
  });
}

// saisir({titre, corps, libelle, valeur, ok}) -> Promise<string|null>
//   `null` = annule (on ne fait RIEN) ; `''` = valide a vide (une reponse, qui
//   peut vouloir dire quelque chose : « recharge la jaquette officielle »).
//   Confondre les deux ferait agir l'application quand on lui dit de ne rien faire.
function saisir(o){
  o = o || {};
  return new Promise(res => {
    dlgTexte = true;
    $('dlgTitre').textContent = o.titre || '';
    $('dlgCorps').textContent = o.corps || '';
    $('dlgChamp').style.display = '';
    $('dlgLabel').textContent = o.libelle || '';
    $('dlgInput').value = o.valeur || '';
    $('dlgNon').textContent = o.annuler || T('ANNULER','CANCEL');
    $('dlgOui').textContent = o.ok || T('VALIDER','OK');
    $('dlgOui').className = 'btn';
    dlgReponse = undefined;
    dlgResoudre = res;
    // Le champ est le premier focusable du DOM quand il est visible : ouvrirSurcouche
    // le focalise tout seul, et on vient la pour taper.
    ouvrirSurcouche($('dialogModal'));
  });
}

// La surcouche VISIBLE la PLUS HAUTE, et non la premiere de la liste.
//
// `find()` rendait la premiere ouverte dans l'ordre du tableau. Des qu'une AUTRE
// surcouche etait ouverte en meme temps — le choix de langue au premier lancement
// est ouvert d'office — Echap fermait CELLE-LA et laissait la boite de dialogue en
// place, sa promesse NON RESOLUE. Et comme le bouton B de la manette passe par
// Echap (`padRetour`), B ne refusait plus rien. Mesure a la sonde, pas suppose.
//
// LE Z-INDEX VIT DESORMAIS DANS LA FEUILLE, plus en ligne : les neuf voiles
// partagent la classe `.ovl`, et c'est la feuille qui decide de l'empilement
// (`#dialogModal{z-index:100}`), en un seul endroit qu'on lit d'un coup d'oeil.
// Il faut donc le style CALCULE — mais on ne le lit qu'UNE FOIS par surcouche et
// on le garde : `surcoucheOuverte()` tourne a chaque clic ET a chaque image de la
// boucle manette (15 Hz), et neuf lectures de style par image pour une valeur qui
// ne change jamais seraient payees pour rien.
const _zCache = new Map();
function zIndexDe(el) {
  if (_zCache.has(el)) return _zCache.get(el);
  const z = parseInt(getComputedStyle(el).zIndex, 10);
  const v = isNaN(z) ? 0 : z;
  _zCache.set(el, v);
  return v;
}
const surcoucheOuverte = () => SURCOUCHES.map(id=>$(id))
  .filter(el => el && el.style.display === 'flex')
  .reduce((haut, el) => (!haut || zIndexDe(el) > zIndexDe(haut)) ? el : haut, null);

document.addEventListener('keydown', e => {
  const ov = surcoucheOuverte();
  if (!ov) return;
  if (e.key === 'Escape') { e.preventDefault(); fermerSurcouche(ov); return; }
  if (e.key !== 'Tab') return;
  const liste = [...ov.querySelectorAll(FOCUSABLE)].filter(visible);
  if (!liste.length) return;
  const premier = liste[0], dernier = liste[liste.length-1];
  // Tab boucle a l'interieur : il ne doit jamais atteindre la page en dessous
  if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
  else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
});

// Un clic sur le FOND de la boite de dialogue l'annule. C'est une regle globale, au
// meme titre qu'Echap — pas un `onclick` sur le fond : un fond plein ecran n'est pas
// un controle, il ne doit donc pas etre atteignable au Tab. Et s'il l'etait, il
// deviendrait le PREMIER element focusable : le focus irait sur le fond au lieu
// d'ANNULER, et la manette perdrait le refus par defaut.
//
// SEULEMENT POUR LA BOITE DE DIALOGUE, pas pour les autres surcouches. Fermer
// `orgModal` sur un clic a cote jetterait les actions configurees ligne a ligne
// (`orgAct<i>`), que l'utilisateur vient de regler : ce serait une perte, pas un
// raccourci. Une surcouche ne se ferme au clic sur le fond que si l'abandonner ne
// coute rien.
//
// LE DIAPORAMA EST LE SECOND CAS, ET LA REGLE LE COUVRE : abandonner un diaporama
// ne coute RIEN — il ne porte aucune saisie, il reprend ou il en etait a la
// prochaine ouverture, et le minuteur se rearme (`diaFermer` appelle
// `diaInactivite`). C'est aussi sa SEULE sortie a la souris : la surcouche n'a
// aucun bouton, et sans cette ligne il fallait connaitre Echap — ou brancher une
// manette. `fermerSurcouche` n'appelle PAS `diaFermer` (il fait `diaStop`), donc on
// passe bien ici par la fonction qui rend AUSSI le minuteur a la vie.
document.addEventListener('click', e => {
  const ov = surcoucheOuverte();
  if (!ov || e.target !== ov) return;
  if (ov.id === 'dialogModal') dlgRepondre(false);
  else if (ov.id === 'diaModal') diaFermer();
});

// --- Aide clavier ---------------------------------------------------------
// Le pied de page annonce déjà des boutons de manette : la touche ? rend la
// liste complete consultable, ce qui evite d'apprendre les raccourcis par hasard.
const AIDE = [
  { t:['/'], d:()=>T('Aller a la recherche','Jump to search') },
  { t:['?'], d:()=>T('Afficher cette aide','Show this help') },
  { t:['Échap'], d:()=>T('Fermer le panneau ou la fenêtre','Close panel or dialog') },
  { t:['Entrée','Espace'], d:()=>T('Activer l\'élément sélectionné','Activate the focused item') },
  { t:['Tab'], d:()=>T('Naviguer entre les éléments','Move between elements') },
  { t:['F5'], d:()=>T('Réanalyser la bibliothèque','Rescan the library') }
];
function aideHtml(){
  return '<h2 class="sec">'+T('RACCOURCIS','SHORTCUTS')+'</h2>'+
    AIDE.map(a=>'<div class="help-row"><span class="help-t">'+
      a.t.map(k=>'<span class="kbd">'+escH(k)+'</span>').join('')+
      '</span><span>'+escH(a.d())+'</span></div>').join('');
}
function ouvrirAide(){
  const el = $('helpModal');
  $('helpBody').innerHTML = aideHtml();
  ouvrirSurcouche(el);
}
document.addEventListener('keydown', e => {
  const t = document.activeElement;
  if (t && /input|textarea|select/i.test(t.tagName)) return;
  if (e.key === '?' ) { e.preventDefault(); ouvrirAide(); }
});

// --- Boutons : etat "en cours" --------------------------------------------
// Un bouton qui ne dit rien pendant une opération laisse croire qu'il n'a pas
// repondu, et on clique deux fois.
async function avecAttente(btn, travail){
  if (!btn || btn.dataset.busy) return;
  const texte = btn.textContent;
  btn.dataset.busy = '1';
  btn.disabled = true;
  btn.textContent = T('En cours…','Working…');
  try { return await travail(); }
  finally {
    btn.disabled = false;
    delete btn.dataset.busy;
    btn.textContent = texte;
  }
}

// notifications
function toast(msg,type){const d=document.createElement('div');d.className='toast '+(type||'');d.textContent=msg;$('toasts').appendChild(d);setTimeout(()=>d.remove(),4500);}

// MES CIBLES — ou l'application peut installer. On ne demande PAS de choisir un
// « mode » au demarrage : beaucoup de gens ont un disque ET une console, et
// tout le travail reel (identifier un paquet, associer la bonne MAJ, trouver le
// bon DLC) est le meme partout. Ce qui change, c'est la DESTINATION — on la rend
// donc visible et cliquable, au lieu de cacher la moitie de l'application.
// dashboard
async function loadDash(){
  try{
    const [gs,repDrives,hb]=await Promise.all([api('/api/games?drive='+($('drive').value||'H')),api('/api/drives'),api('/api/homebrew')]);
    // Les residus sont comptes a part : ce ne sont pas des jeux « en attente »,
    // il n'y a rien a ranger — seulement a nettoyer.
    const tot=gs.reduce((s,g)=>s+(g.size||0),0),pend=gs.filter(g=>g.format==='A trier'&&!g.residu),god=gs.filter(g=>g.format==='GOD');
    const residus=gs.filter(g=>g.residu);
    // `/api/drives` rend desormais { disques, absents } : on normalise ICI, une
    // fois. Lire la reponse comme un tableau a fait echouer loadDash() en silence
    // (« ds.find is not a function »), ce qui vidait les CIBLES et le DEPOT —
    // et la sonde ne le voyait que comme une « section vide ».
    const rep=await api('/api/drives');
    const ds=Array.isArray(rep)?rep:(rep.disques||[]);
    const drv=ds.find(d=>d.letter===($('drive').value||'H'))||ds[0]||{free:0,total:0};
    const usedPct=drv.total?Math.round((drv.total-drv.free)/drv.total*100):0;
    // CINQ cartes colorees de poids egal faisaient des chiffres une decoration.
    // Une seule ligne secondaire : les nombres restent lisibles, mais ne
    // precede plus les jaquettes dans la hierarchie.
    $('dashStats').innerHTML=
      `<div class="dashsum"><b>${god.length}</b> ${T('jeux installés','games installed')}<span class="sep">·</span> <b>${fmt(tot)}</b><span class="sep">·</span> <b>${pend.length}</b> ${T('en attente au dépôt','pending in the drop folder')}${hb.length?`<span class="sep">·</span> <b>${hb.length}</b> ${T('homebrew / émulateurs','homebrew / emulators')}`:''}</div>`;
    const fb=$('freeBar'); if(fb) fb.style.width=usedPct+'%';
    // LE HEROS — un jeu au hasard parmi ceux qui ont une jaquette possible
    // (un TID). « Au hasard » est honnete : la date d'ajout n'est pas
    // mesuree, alors on ne pretend pas connaitre le « dernier ».
    const hero=$('dashHero');
    if(hero){
      const avecTid=gs.filter(g=>g.tid&&g.tid!=='-'&&g.format!=='A trier');
      if(avecTid.length){
        const g=avecTid[Math.floor(Math.random()*avecTid.length)];
        $('heroCov').src='/api/cover?tid='+g.tid;
        $('heroCov').onerror=function(){covErr(this,(g.name[0]||'?').toUpperCase())};
        $('heroName').textContent=g.name;
        $('heroMeta').innerHTML=[g.format.toUpperCase(),fmt(g.size),g.tid]
          .map(x=>`<span><b>${escH(x)}</b></span>`).join('');
        $('heroAct').innerHTML=
          `<button class="btn accent" onclick="openJeuTid(${jsA(g.tid)})">${T('OUVRIR LA FICHE','OPEN THE PAGE')}</button>`
          +`<button class="btn quiet" onclick="go('lib')">${T('BIBLIOTHÈQUE','LIBRARY')}</button>`;
        hero.hidden=false;
      }else hero.hidden=true;
    }
    // Le depot montre AUSSI les residus, avec leur vraie nature : un jeu deja
    // installe dont l'archive traine encore. Les taire laissait le disque se
    // remplir sans que rien ne le signale.
    const lrowDepot=(g,badge,cls)=>`<div role="button" tabindex="0" class="lrow" onclick="toast(${jsA(T(g.name.replace(/'/g,' ')+' dans le dépôt — lance TRIER pour le ranger',g.name.replace(/'/g,' ')+' is in the drop folder — run ORGANIZE to sort it'))})"><div class="nocov" style="width:34px;height:48px;font-size:16px;border-radius:4px">?</div><div class="lname">${escH(g.name)}</div><span class="badge ${cls}">${badge}</span><span class="ldim">${fmt(g.size)}</span></div>`;
    const dansDepot=[...pend.map(g=>lrowDepot(g,T('À TRIER','TO SORT'),'wait'))]
      .concat(residus.map(g=>lrowDepot(g,T('DÉJÀ INSTALLÉ','ALREADY INSTALLED'),'con')));
    // Le depot est un ESPACE DE TRAVAIL, pas une collection a exposer : une
    // ligne de synthese (combien, quel poids) et les deux seules actions utiles.
    // La liste entiere reste joignable, mais plus affichee par defaut.
    const depoSz=fmt(pend.concat(residus).reduce((s,g)=>s+(g.size||0),0));
    const depoOuvert=$('dashPending').querySelector('details[data-k="depot"]')?.open;
    $('dashPending').innerHTML=dansDepot.length
      ?`<div class="depotsum"><div class="ds-num">${dansDepot.length}</div><div class="ds-info">${T('élément(s) à organiser','item(s) to organize')} · ${depoSz}${residus.length?` · ${residus.length} ${T('déjà installé(s)','already installed')}`:''}</div><button class="btn accent" onclick="openOrganize()">${T('ORGANISER','ORGANIZE')}</button></div>`
        +`<details class="fold" data-k="depot"${depoOuvert?' open':''}><summary>${T('Voir les fichiers','View files')} · ${dansDepot.length}</summary><div class="liblist fold-in">${dansDepot.join('')}</div></details>`
      :`<div style="color:var(--text-3);font-size:var(--fs-body)">${T('Rien en attente — le dépôt est vide.','Nothing pending — the drop folder is empty.')}</div>`;
    // LA STRIP — trois cartes vivantes qui remplacent « Destinations » :
    // depot (combien attend), console (reliee ou pas), activite (ce qui
    // tourne). Les CIBLES detaillees (disque par disque) restent dans la
    // vue Console ; l'accueil n'a besoin que de l'etat.
    const strip=$('dashStrip');
    if(strip){
      // Pas de requete ici : conEtat() maintient deja conConnecte/xbdmPret/
      // xbdmTitre a jour, et un await sur la sonde console retardait toute la
      // vue (etagere incluse) le temps du sondage FTP.
      const conTxt=conConnecte?(xbdmTitre||T('Reliée','Linked'))
        :xbdmPret?T('Lien partiel','Partial link'):T('Hors ligne','Offline');
      const conCls=conConnecte?' ok':xbdmPret?' warn':'';
      const nAct=actBadgeFtp+actBadgeDl;
      strip.innerHTML=
        `<button class="scard" onclick="openOrganize()"><span class="sc-t">${T('DÉPÔT','DROP FOLDER')}</span><span class="sc-v">${dansDepot.length||T('Vide','Empty')}</span><span class="sc-s">${dansDepot.length?T('élément(s) · ','item(s) · ')+depoSz:T('Rien à organiser','Nothing to sort')}</span><span class="sc-l">${T('Organiser →','Organize →')}</span></button>`
        +`<button class="scard" onclick="go('con')"><span class="sc-t">${T('CONSOLE','CONSOLE')}</span><span class="sc-v${conCls}">${escH(conTxt)}</span><span class="sc-s">${escH(T('FTP + XBDM','FTP + XBDM'))}</span><span class="sc-l">${T('Ouvrir →','Open →')}</span></button>`
        +`<button class="scard" onclick="go('act')"><span class="sc-t">${T('ACTIVITÉ','ACTIVITY')}</span><span class="sc-v">${nAct||T('Repos','Idle')}</span><span class="sc-s">${nAct?T('tâche(s) en cours','task(s) running'):T('Aucun transfert en cours','Nothing running')}</span><span class="sc-l">${T('Voir →','View →')}</span></button>`;
    }
    const recent=gs.filter(g=>g.tid&&g.tid!=='-').slice(0,12);
    $('dashShelf').innerHTML=recent.length
      ? '<div class="shelf">'+recent.map(g=>`<div role="button" tabindex="0" class="shelf-i" onclick="openJeuTid(${jsA(g.tid)})" title="${escA(g.name)}"><img loading="lazy" src="/api/cover?tid=${g.tid}&sz=sm" alt="" onerror="covErr(this,${jsA((g.name[0]||'?').toUpperCase())})"><span class="sn">${escH(g.name)}</span><span class="s2">${escH(g.format.toUpperCase())} · ${fmt(g.size)}</span></div>`).join('')+'</div>'
      : '';
    const ss=$('dashShelfSec');
    ss.style.display=recent.length?'':'none';
    if(recent.length)ss.textContent=T('Dans ta bibliothèque','In your library')+' — '+gs.length+' '+T('jeux','games');
    loadAdvisor();
  }catch(e){$('dashStats').innerHTML='<div style="color:var(--danger);font-size:var(--fs-body);padding:8px">'+escH(T('Erreur : ','Error: ')+e.message)+'</div>';}
}

// ---------- Assistant : suggestions actionnables ----------
let advTimer=null, advTries=0;
async function loadAdvisor(){
  const r=await api('/api/advisor');if(!r)return;
  const items=r.items||[];
  $('dashAdvSec').style.display=items.length?'':'none';
  // Le rafraichissement reconstruit le HTML : un groupe OUVERT doit le rester —
  // un repli qui se referme tout seul annule le choix de lecture de l'utilisateur.
  const ouverts=new Set([...$('dashAdv').querySelectorAll('details[data-k]')].filter(d=>d.open).map(d=>d.dataset.k));
  const SEV={err:['sev-err','✕'],warn:['sev-warn','⚠'],info:['sev-info','ℹ']};
  const cartes=items.map((it,i)=>{
    const[c,ic]=SEV[it.sev]||SEV.info;
    // La severite se lit AUSSI a la couleur du bord : l'icone seule se perd dans
    // une liste, et une erreur doit se reperer sans lire.
    return {sev:it.sev||'info',type:it.type||'',txt:(it.title+' '+(it.detail||'')+' '+it.type).toLowerCase(),html:`<div class="advcard ${escA(it.sev||'info')}">
      <span class="advico ${c}">${ic}</span>
      <div class="advbody"><div class="advtitre">${escH(it.title)}</div><div class="advdet">${escH(it.detail||'')}</div></div>
      ${it.act?`<button class="btn quiet advact" onclick="advAct(${i})">${escH(it.act.label)}</button>`:''}
    </div>`};
  });
  // SYNTHESE PAR FAMILLE, pas un mur de cartes : seuls les blocages de
  // l'operation courante restent ouverts (rien de lisible, un jeu qui ne
  // demarre pas, un telechargement tombé). Le reste est une ligne par famille
  // — la carte complete et ses actions restent dedans, rien n'est perdu.
  const BLOCS=new Set(['nodossier','xbox1','dlerr']);
  const FAM={tu:'tu',tuWrong:'tu',orphan:'orphelin',dup:'double',discs:'double',residu:'residu',nocov:'covers'};
  const FLBL={
    bloc:T('Blocages','Blockers'),
    tu:T('Mises à jour à vérifier','Updates to check'),
    orphelin:T('Contenus sans jeu','Orphan content'),
    double:T('Doublons et multi-disques','Duplicates & multi-disc'),
    residu:T('Fichiers déjà installés','Files already installed'),
    covers:T('Jaquettes manquantes','Missing covers'),
    autre:T('Autres vérifications','More checks')
  };
  const ORD={err:3,warn:2,info:1},blocs=[],fams=new Map();
  cartes.forEach(k=>{
    if(BLOCS.has(k.type)){blocs.push(k);return;}
    if(k.type==='pending')return; // le bloc DEPOT rend deja ce compte et sa taille
    const cle=FAM[k.type]||'autre';
    const f=fams.get(cle)||{sev:'info',items:[]};
    f.items.push(k);
    if((ORD[k.sev]||1)>ORD[f.sev])f.sev=k.sev;
    fams.set(cle,f);
  });
  const tri=[...fams.entries()].sort((a,b)=>ORD[b[1].sev]-ORD[a[1].sev]);
  const famHtml=([cle,f])=>{
    const[c,ic]=SEV[f.sev];
    return `<details class="fold fam" data-k="${escA(cle)}"><summary><span class="famic ${c}">${ic}</span> ${escH(FLBL[cle]||FLBL.autre)} <span class="famn">${f.items.length}</span></summary><div class="advgrid fold-in">${f.items.map(k=>k.html).join('')}</div></details>`;
  };
  const visF=tri.slice(0,3),pliF=tri.slice(3);
  const nPlie=pliF.reduce((s,f)=>s+f[1].items.length,0);
  $('dashAdv').innerHTML=blocs.map(k=>k.html).join('')
    +visF.map(famHtml).join('')
    +(pliF.length?`<details class="fold" data-k="__plus"><summary>${T('Autres vérifications','More checks')} · ${nPlie}</summary><div class="fold-in">${pliF.map(famHtml).join('')}</div></details>`:'');
  ouverts.forEach(k=>{const d=$('dashAdv').querySelector('details[data-k="'+k+'"]');if(d)d.open=true;});
  window._adv=items;
  window._advCartes={cartes,blocs,tri,FLBL,SEV};
  // La vue detaillee suit le meme rafraichissement, sans fermer ses groupes.
  if($('entModal')&&$('entModal').classList.contains('on'))renderEnt();
  // relance tant que les donnees MediaID/TU arrivent en arriere-plan, mais
  // PLAFONNEE : si XboxUnity est injoignable, pending reste vrai a vie et
  // l'advisor se re-interrogeait indefiniment toutes les 12 s.
  clearTimeout(advTimer);
  if(r.pending&&++advTries<10)advTimer=setTimeout(loadAdvisor,12000);else advTries=0;
}
// Vue detaillee ENTRETIEN : toutes les familles, filtrables par severite et
// rechercheables. Les cartes et les actions sont celles de la synthese — meme
// _adv, memes index, pas de seconde source de verite. Les groupes ouverts et le
// filtre survivent au rafraichissement (loadAdvisor rappelle renderEnt).
let entSevCur='';
function openEntretien(){
  if(!window._advCartes){loadAdvisor().then(()=>{if(window._advCartes){renderEnt();ouvrirSurcouche($('entModal'));}});return;}
  renderEnt();
  ouvrirSurcouche($('entModal'));
}
function entSev(s,b){entSevCur=s;[...$('entSeg').querySelectorAll('.seg-i')].forEach(x=>x.classList.toggle('on',x===b));renderEnt();}
function entFiltre(){renderEnt();}
function renderEnt(){
  const d=window._advCartes;if(!d)return;
  const q=($('entFilter').value||'').toLowerCase();
  // Etat a conserver : groupes ouverts + action qui a le focus.
  const ouverts=new Set([...$('entBody').querySelectorAll('details[data-k]')].filter(x=>x.open).map(x=>x.dataset.k));
  const focus=document.activeElement&&document.activeElement.classList.contains('advact')?document.activeElement:null;
  const focusIdx=focus?focus.getAttribute('onclick'):null;
  const filtre=k=>(!entSevCur||k.sev===entSevCur)&&(!q||k.txt.includes(q));
  const famH=([cle,f])=>{
    const vs=f.items.filter(filtre);
    if(!vs.length)return '';
    const[c,ic]=d.SEV[f.sev];
    return `<details class="fold fam" data-k="${escA(cle)}"${ouverts.has(cle)?' open':''}><summary><span class="famic ${c}">${ic}</span> ${escH(d.FLBL[cle]||d.FLBL.autre)} <span class="famn">${vs.length}${vs.length!==f.items.length?'/'+f.items.length:''}</span></summary><div class="advgrid fold-in">${vs.map(k=>k.html).join('')}</div></details>`;
  };
  const blocsF=d.blocs.filter(filtre);
  const html=(blocsF.length?`<details class="fold fam" data-k="bloc" open><summary><span class="famic sev-err">✕</span> ${escH(d.FLBL.bloc)} <span class="famn">${blocsF.length}</span></summary><div class="advgrid fold-in">${blocsF.map(k=>k.html).join('')}</div></details>`:'')
    +d.tri.map(famH).join('');
  $('entBody').innerHTML=html||`<div class="advcard info"><span class="advico sev-info">ℹ</span><div class="advbody"><div class="advtitre">${escH(T('Rien dans ce filtre','Nothing in this filter'))}</div><div class="advdet">${escH(T('Aucun diagnostic ne correspond — élargis la recherche ou la sévérité.','No diagnostic matches — widen the search or severity.'))}</div></div></div>`;
  if(focusIdx){const b=[...$('entBody').querySelectorAll('.advact')].find(x=>x.getAttribute('onclick')===focusIdx);if(b)b.focus();}
}
async function advAct(i){
  const it=(window._adv||[])[i];if(!it||!it.act)return;
  const a=it.act;
  if(a.kind==='tu'){const r=await post('/api/tu/install',{tid:a.tid,tuid:a.tuid});toast(r.ok?T('TU installée : ','Update installed: ')+(r.file||''):T('Erreur : ','Error: ')+r.error,r.ok?'':'err');setTimeout(loadAdvisor,1500);}
  else if(a.kind==='organize')openOrganize();
  else if(a.kind==='health'){go('lib');checkHealth();}
  else if(a.kind==='dups'){go('lib');if(!dupOnly)toggleDup();}
  else if(a.kind==='covers'){await post('/api/precovers',{tids:a.tids});toast(T('Jaquettes en cours de téléchargement','Covers downloading'));setTimeout(()=>{renderGames();loadAdvisor();},4000);}
  else if(a.kind==='retry'){await post('/api/dlctl',{id:a.id,action:'retry'});pollDl();}
  else if(a.kind==='residus')await nettoyerResidus();
  else if(a.kind==='altIa'||a.kind==='altVimm')dlAlt(a.q,a.kind==='altIa'?'ia':'vimm');
  // Un dossier introuvable se corrige dans DOSSIERS : on y amene directement au
  // lieu de laisser l'utilisateur chercher ou se trouve le reglage.
  else if(a.kind==='cfg'){go('dash');$('cfgPanel').style.display='flex';try{$('cfgPanel').scrollIntoView({block:'nearest'});}catch(e){}}
}
// Les residus : des fichiers du depot dont le jeu est DEJA installe. On les liste
// avant de demander, et le serveur recalcule la liste au moment de supprimer —
// jamais celle qu'on lui a envoyee. Rien n'est supprime sans confirmation.
async function nettoyerResidus(){
  const r=await api('/api/residus');
  if(r.error){toast(r.error,'err');return;}
  if(!r.items.length){toast(T('Aucun résidu à nettoyer.','No leftovers to clean.'));return;}
  const liste=r.items.slice(0,8).map(x=>'• '+(x.dejaInstalle?x.dejaInstalle.name:x.nom)).join('\n');
  // Le TITRE porte le compte et le verbe ; le CORPS garde la liste telle qu'elle
  // etait ecrite (ses puces, son « … », puis le total libere). La phrase de tete a
  // ete retiree du corps parce que le titre dit deja la meme chose : la garder
  // aurait fait lire deux fois « supprimer N fichiers ».
  const corps=liste+(r.items.length>8?'\n…':'')+'\n\n'+fmt(r.total)+T(' seront libérés.',' will be freed.');
  if(!await confirmer({titre:r.items.length+T(' fichier(s) à supprimer du dépôt',' drop-folder file(s) to delete'),
    corps, ok:T('SUPPRIMER','DELETE'), danger:true}))return;
  const d=await post('/api/residus/supprimer',{});
  if(d.error){toast(d.error,'err');return;}
  toast(T('Nettoyé : ','Cleaned: ')+d.supprimes+T(' fichier(s), ',' file(s), ')+fmt(d.liberes)+T(' libérés',' freed'));
  // L'ACCUEIL AUSSI. Il etait le seul panneau a ne pas se rafraichir : on
  // cliquait NETTOYER, le fichier partait, et la ligne restait a l'ecran — on
  // croyait que rien n'avait marche.
  loadGames();loadAdvisor();loadDash();
}

// vue grille/liste + tri
let libView='chan';
function toggleView(){libView={chan:'grid',grid:'list',list:'flow',flow:'chan'}[libView];$('viewBtn').textContent={chan:T('GRILLE','GRID'),grid:T('LISTE','LIST'),list:'FLOW',flow:T('CANAUX','CHANNELS')}[libView];renderGames();}
// Canal d'un jeu : la bibliothèque en rangées NXE groupe par type de contenu.
// L'arcade n'est pas un `format` (les XBLA sont des GOD comme les autres) :
// c'est la plage de TitleID 5841xxxx qui les identifie.
function canalDe(g){
  if(g.residu)return 'residu';
  if(g.format==='A trier')return 'depot';
  if(g.format==='Xbox1')return 'xbox1';
  if(g.tid&&g.tid.startsWith('5841'))return 'arcade';
  return 'x360';
}
// « TOUT AFFICHER » bascule la rangée du canal en grille dépliée, et
// inversement. Etat DOM seul : un re-rendu (données, filtre) replie tout.
function chanTout(el){
  const chan=el.closest('.chan');if(!chan)return;
  const open=chan.querySelector('.chrow').classList.toggle('open');
  chan.querySelectorAll('.chall').forEach(b=>b.textContent=open?'← '+T('RÉDUIRE','COLLAPSE'):T('TOUT AFFICHER','SHOW ALL')+' →');
}
// coverflow Aurora : inclinaison des jaquettes selon la distance au centre
let flowRAF=0;
function flowTilt(){
  if(libView!=='flow'||flowRAF)return;
  flowRAF=requestAnimationFrame(()=>{
    flowRAF=0;
    const f=$('flow');if(!f)return;
    const vc=f.scrollLeft+f.clientWidth/2;let best=null,bd=1e9;
    f.querySelectorAll('.fcard').forEach(c=>{
      const d=c.offsetLeft+c.offsetWidth/2-vc,ad=Math.abs(d),h=c.dataset.h?1:0;
      c.style.transform=`translateZ(${-Math.min(170,ad*0.42)+h*100}px) rotateY(${Math.max(-52,Math.min(52,-d*0.085*(1-h*.65)))}deg) scale(${Math.max(.8,1-ad*0.0011)*(h?1.75:1)})`;
      c.style.zIndex=h?5:'';
      if(ad<bd){bd=ad;best=c}
    });
    if(best){
      f.querySelectorAll('.fcard.cur').forEach(x=>x.classList.remove('cur'));
      best.classList.add('cur');
      const focus=f.querySelector('.fcard[data-h]')||best;
      const g=games[+focus.dataset.i];
      if(g){
        // La FICHE du jeu mis en avant. Aurora affiche sous la jaquette ce qu'on
        // doit savoir sans ouvrir quoi que ce soit : format, TitleID, taille,
        // galettes, etat de la TU. Une seule ligne de titre ne disait rien.
        const tu=tuMap[g.tid];
        $('flowName').innerHTML=
          `<div class="fn-t">${escH(g.name)}</div><div class="fn-b">`
          +`<span class="badge ${g.format==='GOD'?'god':g.format==='Extrait'?'ext':'wait'}">${escH(g.format.toUpperCase())}</span>`
          +(g.residu?`<span class="badge con">${T('DÉJÀ INSTALLÉ','ALREADY INSTALLED')}</span>`:'')
          +(g.tid&&g.tid!=='-'?`<span class="badge mono">${escH(g.tid)}</span>`:'')
          +`<span class="badge">${fmt(g.size)}</span>`
          +(g.discs>1?`<span class="badge god">${g.discs} ${T('DISQUES','DISCS')}</span>`:'')
          +(tu?`<span class="badge" title="${T('Mise à jour disponible sur XboxUnity','Update available on XboxUnity')}">${tu} TU</span>`:'')
          +`</div>`;
        if($('flowGhost'))$('flowGhost').textContent=g.name;
      }
    }
  });
}
function flowClick(el,ev){
  const i=+el.dataset.i;selGame(i,ev);
  if(!ev||!ev.ctrlKey){const c=$('flow').querySelector(`.fcard[data-i="${i}"]`);if(c)c.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});}
}

// CHOISIR UN DOSSIER AU LIEU DE LE TAPER.
//
// Le panneau DOSSIERS demandait d'ecrire cinq chemins a la main : rien ne disait
// si le dossier existait, ni s'il contenait des jeux. Choisir un dossier de jeux
// demandait donc deja de savoir ou il etait — exactement ce que l'utilisateur
// venait chercher.
//
// Le serveur RECONNAIT chaque sous-dossier et le dit : « Dossier de jeux
// (dossiers par TitleID) ». On choisit ce qu'on voit, pas un chemin qu'on espere.
let pickCible = null, pickChemin = '', pickParent = null, pickCb = null;

// Deux usages du meme selecteur :
//   - `pickFolder(idChamp)` remplit un CHAMP de formulaire (panneau DOSSIERS) ;
//   - `pickPour(cb)` rend le chemin a un RAPPEL (deplacement d'un jeu).
// Le rappel n'est PAS une promesse, et c'est voulu : si l'on annule (Echap, bouton
// B, croix), le rappel ne part simplement jamais — donc rien ne se passe. Une
// promesse aurait exige un point de resolution de plus, et un oubli aurait fait
// deplacer le jeu vers un chemin vide.
// Le role de chaque champ DOSSIERS : il sert aux SUGGESTIONS du selecteur (« ce
// qu'on a reconnu pour CET usage ») et a la completion des champs (datalist).
const PICK_ROLE = { cfgDrop: 'depot', cfgGames: 'jeux', cfgContent: 'contenu', cfgHb: 'homebrew', cfgEmu: 'emulateurs' };
let pickRole = null;

async function pickFolder(champ) {
  pickCible = champ;
  pickCb = null;
  pickRole = PICK_ROLE[champ] || null;
  const el = $(champ);
  // Le libelle vit dans la colonne de gauche de la ligne de reglage — auparavant
  // c'etait le frere precedent du champ, mais les lignes « libelle | controle »
  // ont separe les deux.
  const lb = el && el.closest('.srl') ? el.closest('.srl').querySelector('.lb b') : null;
  const libelle = lb ? lb.textContent : (el && el.previousElementSibling ? el.previousElementSibling.textContent : '');
  $('pickTitre').textContent = T('CHOISIR UN DOSSIER', 'CHOOSE A FOLDER') + (libelle ? ' — ' + libelle : '');
  $('pickModal').style.display = 'flex';
  await pickGo((el && el.value) || '');
}

// Deplacer un jeu : on CHOISIT la destination au lieu de la taper. Le panneau
// DOSSIERS a deja etabli le principe — « choisir un dossier demandait de savoir ou
// il etait, exactement ce que l'utilisateur venait chercher ». Le serveur reconnait
// chaque sous-dossier et le dit ; on choisit ce qu'on voit, pas un chemin qu'on
// espere. Depart au dossier PARENT du jeu, comme le faisait la saisie libre.
async function pickPour(titre, depart, cb) {
  pickCible = null;
  pickCb = cb;
  pickRole = null;
  $('pickTitre').textContent = titre;
  $('pickModal').style.display = 'flex';
  await pickGo(depart || '');
}

async function pickGo(chemin) {
  $('pickListe').innerHTML = skelRows(4);
  $('pickSugg').innerHTML = '';
  let r;
  try { r = await api('/api/fs?path=' + encodeURIComponent(chemin || '') + (pickRole ? '&pour=' + pickRole : '')); }
  catch (e) { $('pickListe').innerHTML = ''; return; }
  if (!r) return;
  if (r.error) { $('pickListe').innerHTML = '<p class="dim cap">' + escH(r.error) + '</p>'; pickChemin = chemin; pickParent = null; return; }
  pickChemin = r.chemin || '';
  pickParent = r.parent || null;
  $('pickPath').value = pickChemin || T('(disques)', '(drives)');
  $('pickUp').disabled = !pickParent;
  // ON DIT CE QU'EST LE DOSSIER COURANT, et on previent quand c'est la racine
  // d'un disque entier : choisir C:\ comme dossier de jeux ferait analyser tout
  // le disque systeme.
  const estRacine = !!pickChemin && /^[A-Za-z]:[\\/]?$/.test(pickChemin);
  $('pickInfo').textContent = (r.rec ? r.rec.titre : '')
    + (estRacine ? '  ' + T('Attention : c\'est la racine d\'un disque entier.', 'Warning: this is the root of a whole drive.') : '');
  // Les pistes que l'application a trouvees sans qu'on les lui demande.
  if (r.suggestions && r.suggestions.length) {
    $('pickSugg').innerHTML = '<h2 class="sec">' + T('TROUVÉ ICI', 'FOUND HERE') + '</h2>'
      + r.suggestions.map(s => `<div class="lrow asrow">
          <span class="asico"><svg><use href="#i-check"/></svg></span>
          <div class="asbody"><div class="astop">${escH(s.titre)} ${s.jeux ? `<span class="badge ext">${s.jeux} ${T('jeu(x)', 'game(s)')}</span>` : ''}</div>
          <div class="asdesc aspath">${escH(s.chemin)}</div></div>
          <span class="ca"><button class="btn quiet pad-s" onclick="pickVa(${jsA(s.chemin)})">${T('CHOISIR', 'CHOOSE')}</button></span>
        </div>`).join('');
  }
  $('pickListe').innerHTML = r.dossiers && r.dossiers.length
    ? r.dossiers.map(d => `<div class="lrow asrow" role="button" tabindex="0" onclick="pickGo(${jsA(d.chemin)})">
        <span class="asico"><svg><use href="#i-${d.rec.genre === 'vide' ? 'box' : d.rec.genre === 'inconnu' ? 'drive' : 'check'}"/></svg></span>
        <div class="asbody"><div class="astop">${escH(d.name)} ${d.jeux ? `<span class="badge">${d.jeux} TitleID</span>` : ''}</div>
        <div class="asdesc">${escH(d.rec.titre)} — ${escH(d.rec.detail)}</div></div>
        <span class="ca"><button class="btn quiet pad-s" onclick="event.stopPropagation();pickVa(${jsA(d.chemin)})">${T('CHOISIR', 'CHOOSE')}</button></span>
      </div>`).join('')
    : '<p class="dim cap">' + T('Aucun sous-dossier ici.', 'No sub-folder here.') + '</p>';
}

function pickVa(chemin) {
  const el = pickCible && $(pickCible);
  const cb = pickCb;
  if (el) el.value = chemin;
  // On remet les deux a zero AVANT de fermer : `fermerSurcouche` rend le focus, et
  // le rappel peut ouvrir une autre surcouche. Un etat residuel ferait remplir le
  // champ suivant avec un chemin qui ne le concerne pas.
  pickCible = null; pickCb = null; pickRole = null;
  fermerSurcouche($('pickModal'));
  if (cb) cb(chemin);
}
function pickChoisir() { pickVa(pickChemin); }

async function loadDrives(){
  try{
    const rep=await api('/api/drives');
    // L'API rend { disques, absents }. On accepte encore un tableau nu : une
    // reponse d'une version precedente ne doit pas casser l'affichage.
    const ds=Array.isArray(rep)?rep:(rep.disques||[]);
    drive=$('drive').value||drive;
    // Une seule lecture du mot : il sert a l'infobulle ET a la ligne de place
    // libre, et deux appels a T() pour la meme chaine se comptent deux fois.
    const motLibre=T('libres','free');
    // LE MENU DIT A QUOI SERT CHAQUE DISQUE, pas seulement sa lettre. « C » et
    // « D » tout seuls ne permettaient pas de choisir : on ne savait pas ou
    // vivaient les jeux, le depot ou Aurora.
    // « ◆ » marque un support reconnu comme disque Xbox et charge a chaud.
    $('drive').innerHTML=ds.map(d=>{
      // LIBELLE COURT a l'ecran, detail complet en infobulle. Les roles
      // detailles (« Dépôt (fichiers à ranger) · Contenu (DLC, mises à jour) »)
      // tenaient sur 400 px : dans le bandeau, la liste depassait la fenetre.
      const court=d.roleCourt||d.roleTexte||(d.auto?T('disque Xbox','Xbox drive'):'');
      const long=d.roleTexte||court;
      // L'OPTION NE PORTE QUE L'IDENTITE DU DISQUE. Elle portait aussi la place
      // libre — deja montree juste a droite, avec sa jauge — et le libelle
      // demandait 246 px de texte pour 228 px disponibles : le selecteur
      // s'affichait « ... Jeux · Dépôt · DL... ». Un fait, un endroit : le role
      // ici, la place a droite, le detail complet dans l'infobulle.
      const libre=d.free?' · '+fmt(d.free)+' '+motLibre:'';
      const bulle=d.cle+' — '+long+libre+(d.avertissement?'\n'+d.avertissement:'');
      return `<option ${d.letter===drive?'selected':''} value="${escA(d.letter)}" title="${escA(bulle)}">${escH(d.letter)}:${d.auto?' ◆':''}${court?' '+escH(court):''}</option>`;
      }).join('');
    // Le disque memorise peut avoir DISPARU (debranche, ou la lettre a change).
    // Sans repli, on ne trouvait rien a afficher et la place libre restait VIDE —
    // l'utilisateur voyait un bandeau muet au lieu d'un autre disque.
    if(!ds.some(d=>d.letter===drive)&&ds.length){
      drive=ds[0].letter;
      $('drive').value=drive;
    }
    const cur=ds.find(d=>d.letter===drive);
    // La lettre n'est PAS repetee ici : le selecteur juste a gauche la porte
    // deja (« H: Jeux · Dépôt »). « H: 797.8 Go libres » a cote de « H ◆ · 797.8
    // Go » disait deux fois le meme disque et deux fois la meme taille.
    if(cur)$('free').textContent=fmt(cur.free)+' '+motLibre;
    const autos=ds.filter(d=>d.auto).map(d=>d.letter);
    if(autos.length)$('abHint').textContent=T('Disque Xbox détecté : ','Xbox drive detected: ')+autos.join(', ')+T(' — jeux chargés automatiquement',' — games loaded automatically');
    // UN ROLE CONFIGURE SUR UN DISQUE ABSENT : sans ce rappel, le disque
    // debranche disparait de la liste et l'application cherche encore ses jeux
    // sur un disque qui n'est plus la, sans que rien ne le dise.
    if(!Array.isArray(rep)&&rep.absents&&rep.absents.length){
      $('abHint').textContent=T('Disque absent : ','Missing drive: ')
        +rep.absents.map(a=>a.cle+' ('+a.roleTexte+')').join(', ')
        +T(' — rebranche-le, ou change le chemin dans DOSSIERS.',' — plug it back in, or change the path in FOLDERS.');
    }
    // UN DISQUE QUE LA CONSOLE NE LIRA PAS DOIT SE VOIR SANS SURVOL.
    // L'avertissement ne vivait que dans une infobulle, et personne ne survole
    // une jauge pour decouvrir que trente jeux sont illisibles sur sa console.
    const souci=ds.filter(d=>d.avertissement&&/console/.test(d.avertissement));
    if(souci.length){
      $('abHint').textContent=T('Attention : ','Warning: ')+souci.map(d=>d.cle).join(', ')+' — '+souci[0].avertissement;
    }
    const fat=ds.filter(d=>d.avertissement);
    if(fat.length)$('free').title=fat.map(d=>d.cle+' — '+d.avertissement).join('\n');
  }catch(e){$('free').textContent=T('Erreur : ','Error: ')+e.message;}
}

// Etat du reglage d'acces reseau, tel que le serveur le rend (voir chargerReseau).
let RESEAU=null;
// Le diaporama automatique : lu du serveur, ecrit a chaque clic sur la case.
let DIA_AUTO=false;
async function loadCfg(){
  try{
    const c=await api('/api/config');
    $('cfgDrop').value=c.drop;$('cfgGames').value=c.games;$('cfgContent').value=c.content;
    if(c.homebrew)$('cfgHb').value=c.homebrew;if(c.emulators)$('cfgEmu').value=c.emulators;
    // le cookie n'est JAMAIS renvoye par le serveur (il vit dans secrets.json) :
    // on affiché seulement son etat, et on ne l'ecrase pas a l'enregistrement.
    hasCookie=!!c.hasCookie;
    DIA_AUTO=!!c.diaporamaAuto;
    if($('cfgDia'))$('cfgDia').checked=DIA_AUTO;
    document.body.classList.toggle('papier',!!c.papier);
    if($('cfgWall'))$('cfgWall').checked=!!c.papier;
    // LE MINUTEUR DOIT POUVOIR S ARMER SANS GESTE (R12). L'appel du chargement du
    // script tourne AVANT que le reglage ne soit lu : `DIA_AUTO` vaut alors
    // `false` et il ne fait rien. Avec le reglage actif, le minuteur ne s'armerait
    // donc qu'au PREMIER geste — or le cas d'usage est justement d'ouvrir
    // l'application puis de ne plus y toucher.
    diaInactivite();
    $('cfgCookie').value='';
    $('cfgCookie').placeholder=hasCookie?T('cookie enregistré — laisser vide pour le garder','cookie saved — leave empty to keep it'):T('logged-in-sig=... ; logged-in-user=...','logged-in-sig=... ; logged-in-user=...');
    if((c.lang||'fr')!==(LANG||'fr'))post('/api/config',{lang:LANG||'fr'});
    CON_CFG=c.console||{};CON_HASPASS=!!c.hasFtpPass;conInit();
    // L'ASSISTANT A SON PROPRE APPEL, et ce n'est pas un doublon : les trois
    // reglages vivent dans le bloc `ia` de la config, et les relire ici eviterait
    // de faire dependre la fenetre de l'assistant du chargement des dossiers. Le
    // bouton du pied de page doit repondre meme si `/api/config` echoue — c'est
    // `iaOuvrir()` qui dit alors l'etat du moteur.
    iaConfig();
    // LA COQUILLE N'A PAS BESOIN DE LA CONFIG pour poser ses trois boutons : elle
    // ne lit que l'URL. On l'appelle donc ici, a la fin du chargement, pour que
    // les boutons apparaissent avec le reste de l'interface.
    shellBrancher();
  }catch(e){$('cfgStatus').textContent=T('Erreur : ','Error: ')+e.message;}
}

// Les chemins que le serveur a RECONNUS, par usage — tapes dans les datalists
// des champs DOSSIERS. On propose ce qui existe (« E:\Games — dossier de
// jeux »), on ne demande plus de deviner un chemin. Recharge a chaque entree
// dans la vue : un disque fraichement branche s'y retrouve.
async function chargerCandidats(){
  let c;
  try{ c=await api('/api/candidats'); }catch(e){ return; }
  const lie={cfgDrop:'depot',cfgGames:'jeux',cfgContent:'contenu',cfgHb:'homebrew',cfgEmu:'emulateurs'};
  for(const [champ,role] of Object.entries(lie)){
    const dl=$({cfgDrop:'dlDrop',cfgGames:'dlGames',cfgContent:'dlContent',cfgHb:'dlHb',cfgEmu:'dlEmu'}[champ]);
    if(!dl)continue;
    dl.innerHTML=((c&&c[role])||[]).map(x=>
      `<option value="${escA(x.chemin)}" label="${escA(x.titre+(x.jeux?' · '+x.jeux+' '+T('jeu(x)','game(s)'):''))}"></option>`).join('');
  }
}

// ---------- Stockage -------------------------------------------------------
// Une ligne par disque ; la barre segmentee dit ce qui le remplit. Les tailles
// sont mesurees cote serveur (jeux du scan, depot, dossiers configures) ; la
// piste grise du fond est le libre systeme. « autre » = l'occupe non identifie,
// par soustraction — jamais estime.
const SEG_STO=[['jeux','sg-jeux'],['contenu','sg-dlc'],['homebrew','sg-hb'],['depot','sg-depot']];
// Les libelles par classe de segment, en appels T() LITTERAUX : l'extracteur
// de vocabulaire ne voit pas un T() a arguments variables, et la traduction
// du libelle se perdrait en silence (orphelins garantis).
const lblSegSto=()=>({'sg-jeux':T('Jeux','Games'),'sg-dlc':T('Contenu (GOD/DLC/TU)','Content (GOD/DLC/TU)'),'sg-hb':T('Homebrew','Homebrew'),'sg-depot':T('Dépôt','Drop folder')});
async function loadStock(){
  const box=$('stoPc');if(!box)return;
  box.innerHTML='<p class="dim">'+T('Mesure des disques…','Measuring drives…')+'</p>';
  $('stoCon').innerHTML='';
  let r;try{r=await api('/api/stockage')}catch(e){box.innerHTML='<p class="dim">'+escH(e.message)+'</p>';return;}
  if(!r)return;
  const pcs=r.pc||[];
  const libre=pcs.reduce((s,d)=>s+(d.free||0),0);
  const jc=pcs.reduce((s,d)=>{const g=d.segments||{};return s+(g.jeux||0)+(g.contenu||0);},0);
  const fat=pcs.filter(d=>d.grosFichiers===false);
  $('stoTot').innerHTML=
    `<div><div class="k">${T('DISQUES PC','PC DRIVES')}</div><b>${pcs.length}</b></div>`
    +`<div><div class="k">${T('LIBRE TOTAL','TOTAL FREE')}</div><b class="ok">${fmt(libre)}</b></div>`
    +`<div><div class="k">${T('JEUX + CONTENU','GAMES + CONTENT')}</div><b>${fmt(jc)}</b></div>`
    +(fat.length?`<div><div class="k">${T('À RISQUE FAT32','FAT32 AT RISK')}</div><b class="warn">${fat.length} ${T('disque(s)','drive(s)')}</b></div>`:'');
  // La legende globale ne s'affiche que si un segment a ete mesure — sans quoi
  // elle decrirait des couleurs qui ne sont a l'ecran nulle part.
  const mesure=pcs.some(d=>d.segments&&Object.keys(d.segments).length);
  $('stoLeg').hidden=!mesure;
  const lbls=lblSegSto();
  if(mesure)$('stoLeg').innerHTML=SEG_STO.map(s=>`<span><i class="sg ${s[1]}"></i>${lbls[s[1]]}</span>`).join('')
    +`<span><i class="sg sg-autre"></i>${T('Autre / libre','Other / free')}</span>`;
  $('stoPc').innerHTML=pcs.map(d=>{
    const sg=d.segments||{};
    const connu=(sg.jeux||0)+(sg.contenu||0)+(sg.homebrew||0)+(sg.depot||0);
    const autre=Math.max(0,(d.total||0)-(d.free||0)-connu);
    const parts=[['sg-jeux',sg.jeux],['sg-dlc',sg.contenu],['sg-hb',sg.homebrew],['sg-depot',sg.depot],['sg-autre',autre]].filter(x=>x[1]>0);
    const barre=parts.map(([k,v])=>`<i class="sg ${k}" style="width:${(d.total?v/d.total*100:0).toFixed(1)}%"></i>`).join('');
    const det=parts.filter(x=>x[0]!=='sg-autre').map(([k,v])=>
      `<span><i class="sg ${k}"></i><b>${fmt(v)}</b> ${lbls[k]}</span>`).join('');
    return `<div class="stodrv">
      <div class="stot"><span class="stolt">${escH(d.letter)}:\\</span><span class="storo">${escH(d.roleCourt||d.roleTexte||'')}</span><span class="stofs ${d.grosFichiers===false?'warn':'ok'}">${escH(d.fs||'?')}</span><span class="stonum"><b>${fmt(d.free)}</b> ${T('libres','free')} / ${fmt(d.total)}</span></div>
      <div class="stoseg">${barre}</div>
      ${det?'<div class="stoleg">'+det+'</div>':''}
      ${d.avertissement?`<div class="stowarn">⚠ ${escH(d.avertissement)}</div>`:''}
    </div>`;
  }).join('')||'<p class="dim">'+T('Aucun disque mesuré.','No drive measured.')+'</p>';
  // CONSOLE : volumes XBDM quand la console repond — noms et espace reels ;
  // la composition n'est pas mesuree, un seul segment neutre « occupe ».
  const con=r.console||{};
  if(con.disponible&&(con.disques||[]).length){
    $('stoCon').innerHTML=`<h2 class="sec">${T('CONSOLE','CONSOLE')}${r.hote?' · '+escH(r.hote):''}</h2>`+con.disques.map(d=>{
      const occ=(d.free!=null&&d.total)?Math.max(0,d.total-d.free):null;
      const barre=(occ!=null&&d.total)?`<i class="sg sg-autre" style="width:${(occ/d.total*100).toFixed(1)}%"></i>`:'';
      return `<div class="stodrv"><div class="stot"><span class="stolt">${escH(d.nom)}</span><span class="stonum">${d.free!=null?`<b>${fmt(d.free)}</b> ${T('libres','free')} / ${fmt(d.total)}`:T('taille inconnue','size unknown')}</span></div><div class="stoseg">${barre}</div></div>`;
    }).join('');
  }else{
    $('stoCon').innerHTML=`<h2 class="sec">${T('CONSOLE','CONSOLE')}</h2><div class="stooff">${T('Console non connectée — ses disques apparaîtront ici.','Console not connected — its drives will show here.')}</div>`;
  }
}

// ---------- Coquille WPF (`?shell=1`) ----------------------------------------
// LA PAGE NE SAIT PAS si elle est dans la coquille : `?shell=1` le lui dit. Les
// trois boutons de legende (reduire / agrandir / fermer) ne sont dessines que
// la, et ils envoient des messages que SEULE la coquille ecoute. Dans un
// navigateur ordinaire ils s'affichent et ne font RIEN — c'est voulu, et c'est
// meme ce qui permet de les mesurer avec `scripts/uicheck.js` sans compiler une
// ligne de C#.
const SHELL=new URLSearchParams(location.search).get('shell')==='1';
function shellEnvoyer(t,extra){
  const m=Object.assign({t},extra||{});
  try{ if(window.chrome&&window.chrome.webview) window.chrome.webview.postMessage(m); }catch(e){}
}
function shellGlyphes(){
  // LES IDENTIFIANTS SONT ECRITS EN DUR DANS UN GABARET (backticks), et ce n'est
  // pas cosmetique : le garde-fou « tout identifiant recherche par le JS existe »
  // accepte les ids crees par un gabarit et REFUSE une concatenation
  // (`id="'+d.id+'"` ne lui fait pas voir `shMin`). Les trois `$('shMin')` qui
  // suivent seraient alors signales comme inexistants.
  const T_MIN=T('Réduire','Minimize'), T_MAX=T('Agrandir','Maximize'), T_CLOSE=T('Fermer','Close');
  $('shellBtns').innerHTML=`
    <button id="shMin" title="${escA(T_MIN)}" onclick="shellEnvoyer('min')"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8h12v1H2z"/></svg></button>
    <button id="shMax" title="${escA(T_MAX)}" onclick="shellEnvoyer('max')"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3h10v10H3zm1 1v8h8V4z"/></svg></button>
    <button id="shClose" title="${escA(T_CLOSE)}" onclick="shellEnvoyer('close')"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button>`;
}
function shellBrancher(){
  if(!SHELL||document.getElementById('shellBtns'))return;   // une seule pose, meme si loadCfg repasse
  document.body.classList.add('shell');
  // LE CONTENEUR EST POSE PAR UN GABARET, comme les boutons, et pour la meme
  // raison : `document.createElement` + `b.id='shellBtns'` n'ecrit nulle part la
  // chaine `id="shellBtns"`, donc le garde-fou « tout identifiant recherche par
  // le JS existe » declare le `$('shellBtns')` de `shellGlyphes()` inexistant.
  const hote=document.querySelector('.tb-right')||document.body;
  // LES TROIS BOUTONS VONT DANS LA RANGEE D'IDENTITE DE L'EN-TETE, a son bord
  // droit : `#topbar > .tb-top > .tb-right`. On vise une CLASSE et non un
  // identifiant : `.tb-right` n'en a pas, et `$()` n'accepte que des identifiants.
  hote.insertAdjacentHTML('beforeend',
    `<div id="shellBtns" role="group" aria-label="${escA(T('Fenêtre','Window'))}"></div>`);
  shellGlyphes();
  if(window.chrome&&window.chrome.webview){
    window.chrome.webview.addEventListener('message',ev=>{
      const m=ev.data||{};
      if(m.t==='etat')majShellMax(!!m.max);   // `max` : la forme de la spec §4.4
      if(m.t==='auto')majAutoShell(!!m.on);   // `on` : l'etat du registre, renvoye par la coquille
    });
    // L'ETAT DU DEMARRAGE AUTOMATIQUE SE DEMANDE, il ne se suppose pas : cocher
    // la case « parce qu'on est dans la coquille » annoncerait une inscription
    // qui n'existe peut-etre pas.
    shellEnvoyer('auto?');
  }
}
// Le demarrage automatique : la page DEMANDE, la coquille ECRIT (une page web
// n'accede pas au registre). L'etat affiche est TOUJOURS celui que la coquille
// renvoie — donc si le registre a refuse, la case revient toute seule.
function autoReglage(){
  shellEnvoyer('auto',{on:!!$('cfgAuto').checked});
}
function majAutoShell(on){
  $('cfgAuto').checked=!!on;
}
// Le glyphe ET l'infobulle disent l'action A VENIR : agrandir quand la fenetre
// est normale, restaurer quand elle est agrandie.
function majShellMax(max){
  const b=$('shMax');if(!b)return;
  b.setAttribute('title',max?T('Restaurer','Restore'):T('Agrandir','Maximize'));
  const p=b.querySelector('path');
  if(p)p.setAttribute('d',max?'M5 5h8v8H5zM5 5V3h8v2':'M3 3h10v10H3zm1 1v8h8V4z');
}
// ---- ACCES DEPUIS LE TELEPHONE ---------------------------------------------
// L'etat du reglage ET le code d'appairage. Le serveur refuse cette route a tout
// ce qui n'est pas la machine locale : elle rend le code, et l'envoyer a un
// client distant le donnerait a qui a deja une session.
async function chargerReseau(){
  try{
    const r=await api('/api/reseau');
    RESEAU=r;
    majReseau();
  }catch(e){
    // Cas normal depuis un telephone AVANT appairage : on le dit, sans crier a
    // l'erreur — le reglage ne se fait pas a distance, par construction.
    $('netEtat').textContent='';
    $('netNote').textContent=T('Réglage visible seulement depuis le PC.','Setting visible from the PC only.');
  }
}
function majReseau(){
  const r=RESEAU||{};
  $('netEtat').textContent=r.actif?T('ACTIVÉ','ON'):T('DÉSACTIVÉ','OFF');
  $('netEtat').className='badge '+(r.actif?'god':'wait');
  $('netCode').textContent=r.code?(r.code.slice(0,3)+' '+r.code.slice(3)):'— — — — — —';
  $('netUrl').textContent=r.url||T('aucune adresse réseau','no network address');
  $('netBtn').textContent=r.actif?T('DÉSACTIVER','DISABLE'):T('ACTIVER','ENABLE');
  // Une bascule ne prend effet qu'au redemarrage : on le DIT, sinon l'utilisateur
  // tape l'adresse sur son telephone et conclut que « ca ne marche pas ».
  $('netNote').textContent=r.applique===false
    ?T('Redémarre le serveur pour appliquer.','Restart the server to apply.')
    :(r.appaires?T('Appareils appairés : ','Paired devices: ')+r.appaires:'');
  // L'avertissement est long, et il doit etre lu AVANT d'activer : c'est un code
  // d'APPAIRAGE, affiche a l'ecran, et le cookie circule en clair sans HTTPS.
  $('netAvert').textContent=T(
    'Le code s’affiche à l’écran : quiconque voit cet écran peut s’appairer. Sans HTTPS, le cookie circule en clair sur le Wi-Fi — n’active ceci que sur ton propre réseau.',
    'The code is shown on screen: anyone who sees this screen can pair. Without HTTPS the cookie travels in clear over Wi-Fi — enable this only on your own network.');
  $('netBtn').disabled=!r.actif&&!r.url;
}
async function basculeReseau(){
  const actif=!(RESEAU&&RESEAU.actif);
  const r=await post('/api/reseau',{actif});
  RESEAU=r;majReseau();
  toast(r.actif?T('Accès réseau activé','Network access enabled'):T('Accès réseau désactivé','Network access disabled'),r.actif?'warn':'');
}
async function regenCode(){
  if(!await confirmer({
    titre:T('Régénérer le code','Regenerate the code'),
    corps:T('Un nouveau code remplace l’ancien, et TOUS les appareils déjà appairés sont déconnectés.\n\nTon téléphone redemandera le code à sa prochaine visite.',
      'A new code replaces the old one, and EVERY already-paired device is disconnected.\n\nYour phone will ask for the code again on its next visit.'),
    ok:T('RÉGÉNÉRER','REGENERATE')
  }))return;
  const r=await post('/api/reseau',{regen:true});
  RESEAU={...(RESEAU||{}),code:r.code,appaires:0};majReseau();
  toast(T('Nouveau code. Les appareils appairés sont déconnectés.','New code. Paired devices are disconnected.'),'warn');
}

// Le diaporama automatique s'enregistre DES QU'ON COCHE, sans passer par SAUVER :
// c'est une case a cocher, pas un formulaire, et la melanger aux dossiers ferait
// enregistrer cinq chemins pour un clic.
async function diaReglageAuto(){
  DIA_AUTO=$('cfgDia').checked;
  // Le reglage devient actif ICI aussi : sans cet appel, le minuteur attendrait un
  // premier geste pour s'armer, et « je coche puis je ne touche plus a rien » ne
  // declencherait jamais rien.
  diaInactivite();
  try{await post('/api/config',{diaporamaAuto:DIA_AUTO});}
  catch(e){toast(T('Réglage non enregistré : ','Setting not saved: ')+e.message,'err');}
}

// Le papier peint est une OPTION, pas le defaut : un fond graphite neutre laisse
// les jaquettes donner la couleur. La case s'enregistre au clic, comme celle du
// diaporama, et l'effet est immediat — pas de rechargement pour un fond.
async function wallReglage(){
  document.body.classList.toggle('papier',$('cfgWall').checked);
  try{await post('/api/config',{papier:$('cfgWall').checked});}
  catch(e){toast(T('Réglage non enregistré : ','Setting not saved: ')+e.message,'err');}
}

async function saveCfg(){
  const body={drop:$('cfgDrop').value,games:$('cfgGames').value,content:$('cfgContent').value,homebrew:$('cfgHb').value,emulators:$('cfgEmu').value,lang:LANG||'fr'};
  // champ envoye SEULEMENT s'il est rempli : sinon enregistrer les DOSSIERS
  // effacerait le cookie, que l'UI ne recoit plus
  const ck=$('cfgCookie').value.trim();
  if(ck)body.archiveCookie=ck;
  // Le reglage du diaporama n'est PAS dans ce corps, et ce n'est pas un oubli : il
  // part SEUL au clic sur sa case (`diaReglageAuto`, branchee sur `onchange`). Le
  // mettre ici ferait reecrire le reglage avec l'etat de la case a chaque
  // enregistrement des chemins, et inversement. (Ce commentaire disait que le
  // reglage « part SEUL, et seulement s'il a change » DEPUIS CE CORPS : c'etait
  // faux, le corps ne l'a jamais porte — le mecanisme decrit n'existait pas.)
  const r=await post('/api/config',body);
  if(ck)hasCookie=true;
  $('cfgStatus').textContent=r.ok?T('Dossiers enregistrés','Folders saved'):T('Erreur','Error');
  loadGames();
}

async function loadGames(){
  drive=$('drive').value;
  tuTries=0;
  $('libStatus').textContent=T('Scan en cours...','Scanning...');
  if(!games.length)$('grid').innerHTML=skelCards(12);
  try{
    games=await api('/api/games?drive='+drive);
    renderGames();
    loadDrives();
    post('/api/precovers',{tids:games.map(g=>g.tid).filter(t=>t&&t!=='-')});
    tuCheck();
    // TOUTE modification de la bibliotheque se voit sur l'accueil. Il etait le
    // seul panneau a ne jamais se rafraichir : on nettoyait un residu, le fichier
    // partait, et la ligne restait a l'ecran — donc on croyait que rien n'avait
    // marche. La regle est ici, une fois, plutot que chez chaque appelant.
    if($('v-dash')&&$('v-dash').classList.contains('active'))loadDash();
  }catch(e){$('libStatus').textContent=T('Erreur : ','Error: ')+e.message;}
}

// badge "MAJ dispo" : compte les TU XboxUnity par jeu (cache serveur 24h)
let tuMap={},tuTimer=null,tuTries=0;
async function tuCheck(){
  const tids=[...new Set(games.map(g=>g.tid).filter(t=>t&&t!=='-'))];
  if(!tids.length)return;
  try{
    const m=await api('/api/tucheck?tids='+tids.join(','));
    tuMap=m||{};
    renderGames();
    clearTimeout(tuTimer);
    // re-poll BORNE : si XboxUnity ne repond jamais, la cle n'arrive pas et
    // l'ancien code relancait un renderGames() complet toutes les 8s a vie
    if(tids.some(t=>!(t in tuMap))&&++tuTries<8)tuTimer=setTimeout(tuCheck,8000);
    else tuTries=0;
  }catch(e){clearTimeout(tuTimer);tuTries=0;}
}

let dupOnly=false;
function toggleDup(){dupOnly=!dupOnly;$('dupBtn').classList.toggle('on',dupOnly);renderGames();}

function renderGames(){
  const q=$('libFilter').value.toLowerCase();
  const g2=games.filter(g=>(!q||g.name.toLowerCase().includes(q)||(g.tid||'').toLowerCase().includes(q))&&(!dupOnly||g.dup));
  const s=$('libSort')?$('libSort').value:'name';
  if(s==='size')g2.sort((a,b)=>b.size-a.size);
  else if(s==='type')g2.sort((a,b)=>a.format.localeCompare(b.format)||a.name.localeCompare(b.name));
  else g2.sort((a,b)=>a.name.localeCompare(b.name));
  const tot=games.reduce((s,g)=>s+(g.size||0),0);
  // Un RESIDU n'est pas « en attente » : il n'y a rien a ranger, seulement a
  // nettoyer. Les compter ensemble annoncait du travail qui n'existe pas.
  const enAttente=games.filter(g=>g.format==='A trier'&&!g.residu).length;
  const residus=games.filter(g=>g.residu);
  const majStatut=()=>{
    $('libStatus').textContent=g2.length+T(' jeu(x) · ',' game(s) · ')+fmt(tot)
      +(enAttente?' · '+enAttente+T(' en attente',' pending'):'')
      +(residus.length?' · '+residus.length+T(' résidu',' leftover')+(residus.length>1?T('s','s'):''):'');
  };

  // --- Ne reconstruire la grille que si SON CONTENU a change ---
  // renderGames() remplacait tout le innerHTML a chaque appel, et il est appele
  // a chaque sondage des Title Updates (toutes les 8 s) : les <img> de jaquettes
  // etaient donc recreees en boucle, l'animation d'apparition se rejouait, et la
  // bibliothèque scintillait sans arret. La signature porte sur tout ce qui est
  // reellement affiché (vue, filtre, tri, selection, doublons, pastille TU),
  // donc rien ne change a l'ecran quand rien ne change dans les donnees.
  const sig=[
    libView,q,s,dupOnly?1:0,
    g2.map(g=>g.tid+'|'+g.name+'|'+g.size+'|'+(g.dup?'1':'0')+'|'+(selSet.has(g)?'s':'-')+'|'+(tuMap[g.tid]?'T':'-')).join(';')
  ].join('#');
  if(sig===_renderSig){ majStatut(); return; }
  _renderSig=sig;

  $('flowWrap').style.display=libView==='flow'?'':'none';
  $('chan').style.display=libView==='chan'?'':'none';
  $('grid').style.display=(libView==='grid'||libView==='list')?'':'none';
  if(libView==='chan'){
    const canaux=[
      {id:'x360',  nom:'XBOX 360',u:T('jeux','games')},
      {id:'arcade',nom:'ARCADE',u:T('jeux','games')},
      {id:'xbox1', nom:'XBOX 1',u:T('jeux','games')},
      {id:'depot', nom:T('DÉPÔT — À TRIER','DROP — TO SORT'),u:T('éléments','items')},
      {id:'residu',nom:T('RÉSIDUS','LEFTOVERS'),u:T('éléments','items')},
    ];
    const carte=g=>{
      const i=games.indexOf(g),dep=g.format==='A trier'&&!g.residu;
      const cov=g.tid&&g.tid!=='-'?`<img class="ccov" loading="lazy" src="/api/cover?tid=${g.tid}" onerror="covErr(this,${jsA((g.name[0]||'?').toUpperCase())})">`:`<div class="ccovph ${dep?'dep':''}">${escH((g.name[0]||'?').toUpperCase())}</div>`;
      const pastille=g.residu?`<span class="badge con">${T('DÉJÀ INSTALLÉ','ALREADY INSTALLED')}</span>`
        :`<span class="badge ${g.format==='GOD'?'god':g.format==='Extrait'?'ext':'wait'}">${escH(g.format.toUpperCase())}</span>`;
      return `<div role="button" tabindex="0" class="ccard ${selSet.has(g)?'sel':''}" onclick="selGame(${i},event)" ondblclick="openPath(${jsA(g.path)})" oncontextmenu="selGame(${i});return false" onkeydown="if(event.key==='Enter')selGame(${i},event)">${cov}<div class="cnm">${escH(g.name)}</div><div class="cmeta">${pastille}<span>${fmt(g.size)}</span>${g.dup?`<span class="badge wait">×2</span>`:''}</div></div>`;
    };
    $('chan').innerHTML=canaux.map(c=>{
      const items=g2.filter(g=>canalDe(g)===c.id);
      if(!items.length)return '';
      return `<section class="chan"><div class="chanhead"><span class="chbadge ${c.id}">${c.nom}</span>`
        +`<span class="chcount">${items.length} ${c.u}</span>`
        +(items.length>6?`<button class="chall" onclick="chanTout(this)">${T('TOUT AFFICHER','SHOW ALL')} →</button>`:'')+`</div>`
        +`<div class="chrow">${items.map(carte).join('')}`
        +(items.length>6?`<div role="button" tabindex="0" class="ccard more" onclick="chanTout(this)" onkeydown="if(event.key==='Enter')chanTout(this)"><b>+${items.length}</b><span>${T('tout voir','see all')}</span></div>`:'')
        +`</div></section>`;
    }).join('');
  }
  if(libView==='flow'){
    const sl=$('flow').scrollLeft;
    $('flow').innerHTML=g2.map(g=>{
      const cov=g.tid&&g.tid!=='-'?`<img class="cov" loading="lazy" src="/api/cover?tid=${g.tid}" onerror="covErr(this,${jsA((g.name[0]||'?').toUpperCase())})">`:`<div class="nocov">${escH((g.name[0]||'?').toUpperCase())}</div>`;
      return `<div role="button" tabindex="0" class="fcard" data-i="${games.indexOf(g)}" onclick="flowClick(this,event)" ondblclick="openPath(${jsA(g.path)})" oncontextmenu="flowClick(this,event);return false" onmouseenter="this.dataset.h=1;flowTilt()" onmouseleave="delete this.dataset.h;flowTilt()">${cov}</div>`;
    }).join('');
    $('flow').scrollLeft=sl;
    flowTilt();
  }
  // --- Bibliothèque vide, ou filtre sans résultat -------------------------
  // Les deux cas n'ont pas la meme cause et n'appellent pas la meme action : on
  // ne propose pas la meme chose a quelqu'un qui n'a rien scanne et a quelqu'un
  // dont le filtre ne remonte rien. Avant, les deux donnaient une grille vide.
  if(!g2.length){
    // L'etat vide va dans le conteneur VISIBLE : dans #grid il restait cache
    // quand la vue active etait les canaux ou le flow.
    const cible=libView==='chan'?$('chan'):$('grid');
    if(libView==='flow'){$('flowWrap').style.display='none';$('grid').style.display='';}
    if(q){
      cible.innerHTML=etatVide({
        icone:'search', titre:T('Aucun jeu ne correspond à ce filtre','No game matches this filter'),
        aide:T('Le filtre porte sur le nom et le TitleID.','The filter covers the name and the TitleID.'),
        bouton:T('EFFACER LE FILTRE','CLEAR FILTER'),
        act:()=>{ $('libFilter').value=''; renderGames(); }
      });
    } else {
      cible.innerHTML=etatVide({
        icone:'library',
        titre:T('La bibliothèque est vide','The library is empty'),
        aide:T('Indique où sont tes jeux dans DOSSIERS, puis relance l\'analyse. Tu peux aussi déposer des fichiers dans le dépôt pour les ranger automatiquement.',
               'Point the app at your games folder in FOLDERS and rescan. You can also drop files in the drop folder to have them sorted.'),
        bouton:T('OUVRIR LES DOSSIERS','OPEN FOLDERS'),
        act:()=>showView('dash')
      });
    }
    majStatut();
    return;
  }
  else if(libView==='list'){
    $('grid').innerHTML='<div class="liblist" style="grid-column:1/-1">'+g2.map(g=>{
      const bc=g.residu?'con':g.format==='GOD'?'god':g.format==='Extrait'?'ext':'wait';
      return `<div role="button" tabindex="0" class="lrow ${selSet.has(g)?'sel':''}" onclick="selGame(${games.indexOf(g)},event)" ondblclick="openPath(${jsA(g.path)})"><img src="/api/cover?tid=${g.tid}&sz=sm" loading="lazy" onerror="this.style.visibility='hidden'"><div class="lname">${escH(g.name)}</div><span class="badge ${bc}" ${g.residu&&g.dejaInstalle?`title="${escA(T('Déjà installé : ','Already installed: ')+g.dejaInstalle.name+' ('+g.dejaInstalle.tid+')')}"`:''}>${g.residu?T('DÉJÀ INSTALLÉ','ALREADY INSTALLED'):g.format.toUpperCase()}</span>${g.dup?`<span class="badge wait" title="${T('Présent en double','Duplicate')}">×2</span>`:''}${g.discs>1?`<span class="badge god" title="${escA((g.discNames||[]).join(' · '))}">${g.discs} ${T('DISQUES','DISCS')}</span>`:''}${tuMap[g.tid]?`<span class="badge" style="color:var(--warn);border-color:#8a6d1d;background:rgba(232,179,61,.12)" title="${T('Mise à jour dispo','Update available')}">⬆ TU</span>`:''}<span class="ldim">${escH(g.tid)}</span><span class="ldim">${fmt(g.size)}</span></div>`;
    }).join('')+'</div>';
  } else {
  $('grid').innerHTML=g2.map((g,i)=>{
    // Un RESIDU (le jeu est deja installe) ne se presente pas comme un jeu a
    // ranger : meme vignette, autre pastille, et le nom du fichier au lieu d'un
    // « [EN ATTENTE] » trompeur.
    const cov=g.tid&&g.tid!=='-'?`<img class="cov" loading="lazy" src="/api/cover?tid=${g.tid}" onerror="covErr(this,${jsA(g.name[0]||'?')})">`:`<div class="nocov">${escH((g.name[0]||'?').toUpperCase())}</div>`;
    const bc=g.residu?'con':g.format==='GOD'?'god':g.format==='Extrait'?'ext':'wait';
    const pastille=g.residu
      ?`<span class="badge con" title="${escA(T('Déjà installé : ','Already installed: ')+(g.dejaInstalle?g.dejaInstalle.name+' ('+g.dejaInstalle.tid+')':''))}">${T('DÉJÀ INSTALLÉ','ALREADY INSTALLED')}</span>`
      :`<span class="badge ${bc}">${g.format.toUpperCase()}</span>`;
    return `<div role="button" tabindex="0" class="card ${g.format==='A trier'&&!g.residu?'wait':''} ${selSet.has(g)?'sel':''}" onclick="selGame(${games.indexOf(g)},event)" ondblclick="openPath(${jsA(g.path)})" oncontextmenu="selGame(${games.indexOf(g)});return false">${cov}<div class="info"><div class="name">${escH(g.name)}</div><div class="meta">${pastille}<span>${fmt(g.size)}</span></div><div class="meta"><span style="font-family:monospace">${escH(g.tid)}</span></div></div></div>`;
  }).join('');
  }
  majStatut();
}
let hbLoaded=false;

// LES EMULATEURS DE LA CONSOLE. La structure vient du guide Aurora FR 2026 :
//   <disque>/Emulators/<Nom>/default.xex   +   <disque>/Roms/<Console>/
//
// On ne dit JAMAIS « installé » tout court. Un emulateur sans son dossier de ROMs
// demarre sur une liste vide : l'utilisateur croit avoir installe quelque chose de
// casse alors qu'il manque juste un dossier — et on lui donne son nom exact.
async function loadEmulateurs(){
  const el=$('hbEmu');
  if(!el)return;
  let r;
  try{ r=await api('/api/emulateurs'); }catch(e){ el.innerHTML=''; return; }
  if(!r)return;
  const TITRE='<h2 class="sec">'+T('ÉMULATEURS SUR LA CONSOLE','EMULATORS ON THE CONSOLE')+'</h2>';
  if(!r.connecte){
    el.innerHTML=r.catalogue
      ?TITRE+'<p class="dim cap" style="margin-bottom:10px">'+escH(r.note||'')+'</p>'
        +'<div class="quickgrid">'+r.catalogue.map(c=>
          `<div class="qbtn"><span class="qi"><svg><use href="#i-box"/></svg></span><span class="qt">${escH(c.nom)}</span><span class="qd">${escH(c.machine)}</span></div>`).join('')+'</div>'
      :'';
    return;
  }
  if(!r.installes.length&&!r.orphelins.length){
    el.innerHTML=TITRE+'<p class="dim cap">'+escH(r.emulatorsPresent
      ?T('Aucun émulateur dans Emulators/. Installe-en un : sans lui, tes ROMs ne servent à rien.','No emulator in Emulators/. Install one: without it your ROMs are useless.')
      :T('Pas de dossier Emulators/ sur ce disque.','No Emulators/ folder on this drive.'))+'</p>';
    return;
  }
  const ligne=e=>`<div class="lrow asrow">
      <span class="asico">${e.romsOk?'<svg><use href="#i-check"/></svg>':'<svg><use href="#i-warn"/></svg>'}</span>
      <div class="asbody">
        <div class="astop">${escH(e.nom)} <span class="ldim">${escH(e.machineNom)}</span>
          ${e.romsOk?`<span class="badge ext">${T('PRÊT','READY')}</span>`:`<span class="badge wait">${T('ROMS MANQUANTES','ROMS MISSING')}</span>`}
          ${e.bios?`<span class="badge wait">${T('BIOS REQUIS','BIOS REQUIRED')}</span>`:''}</div>
        <div class="asdesc">${escH(e.romsOk
          ?T('ROMs lues dans ','ROMs read from ')+e.dossierRoms+'/  ·  '+e.extensions.join(' ')
          :e.conseil)}</div>
      </div>
    </div>`;
  el.innerHTML=TITRE
    +r.installes.map(ligne).join('')
    +r.orphelins.map(o=>`<div class="lrow asrow">
        <span class="asico"><svg><use href="#i-warn"/></svg></span>
        <div class="asbody"><div class="astop">${escH(o.dossier)}/ <span class="ldim">${escH(o.machine)}</span></div>
        <div class="asdesc">${T('Des ROMs sans émulateur : elles ne seront pas lisibles tant qu\'il n\'est pas installé.','ROMs without an emulator: they will not be readable until it is installed.')}</div></div>
      </div>`).join('')
    +(r.plugins&&r.plugins.length
      ?'<h2 class="sec mt-3">'+T('PLUGINS AURORA','AURORA PLUGINS')+'</h2>'
        +'<p class="dim cap" style="margin-bottom:8px">'+escH(T('Compatibilité vérifiée sur ','Compatibility checked on ')+(r.pluginsReference||''))
          +' — '+T('un plugin absent de cette liste est NON TESTÉ, pas cassé.','a plugin absent from that list is UNTESTED, not broken.')+'</p>'
        +r.plugins.map(p=>{
          const cls=p.statut==='ok'?'ext':p.statut==='inconnu'?'':'wait';
          return `<div class="lrow asrow">
            <span class="asico"><svg><use href="#i-box"/></svg></span>
            <div class="asbody"><div class="astop">${escH(p.nom)} ${p.marque?`<span class="badge ${cls}">${escH(p.marque)}</span>`:''} <span class="ldim aspath">${escH(p.aurora)}/Plugins</span></div>
            <div class="asdesc">${escH(p.note||'')}${p.auteur?' · '+escH(p.auteur):''}${p.version?' · v'+escH(p.version):''}</div>
            <div class="asdesc">${T('À ACTIVER dans Aurora : Paramètres → Plugins, puis redémarre Aurora. Un plugin copié mais non activé ne fait rien.','ACTIVATE it in Aurora: Settings → Plugins, then restart Aurora. A plugin copied but not activated does nothing.')}</div></div>
          </div>`;}).join('')
        +(r.depannagePlugin
          ?`<div class="advcard warn mt-3"><span class="advico warnc">⚠</span><div class="advbody">
              <div class="advtitre">${escH(r.depannagePlugin.symptome)}</div>
              ${(r.depannagePlugin.etapes||[]).map((e,i)=>`<div class="advdet">${i+1}. ${escH(e)}</div>`).join('')}
            </div></div>`
          :'')
      :'')
    +(r.conseils&&r.conseils.length
      ?'<div class="advcard" style="margin-top:10px"><span class="advico warnc">ℹ</span><div class="advbody">'+r.conseils.map(c=>`<div class="advdet">${escH(c)}</div>`).join('')+'</div></div>'
      :'');
}

// LE JOURNAL D'AURORA. Le guide conseille de le telecharger et d'y chercher
// « ERROR » a la main ; l'application a deja la session FTP ouverte. On ne
// l'affiche pas brut : on REGROUPE les repetitions, parce qu'un journal qui
// repete la meme erreur 400 fois n'apprend rien de plus, et on rend des PISTES.
async function loadJournal(){
  const el=$('hbLog');
  if(!el)return;
  el.innerHTML='<h2 class="sec">'+T('JOURNAL D\'AURORA','AURORA LOG')+'</h2>'+skelRows(3);
  let r;
  try{ r=await api('/api/aurora-log'); }catch(e){ el.innerHTML=''; return; }
  if(!r){ el.innerHTML=''; return; }
  const TITRE='<h2 class="sec">'+T('JOURNAL D\'AURORA','AURORA LOG')+'</h2>';
  if(!r.connecte||!r.trouve){
    el.innerHTML=TITRE+'<p class="dim cap">'+escH(r.error||r.raison||'')+'</p>'
      +(r.essais&&r.essais.length
        ?'<div class="advdet">'+r.essais.map(e=>escH(e.aurora+' — '+e.error)).join('<br>')+'</div>':'');
    return;
  }
  const BADGE={propre:'ext',avertissements:'',critique:'wait',erreurs:'wait'};
  const entete=`<div class="lrow asrow">
      <span class="asico"><svg><use href="#i-${r.verdict==='propre'?'check':'warn'}"/></svg></span>
      <div class="asbody">
        <div class="astop">${escH(r.distant)} <span class="badge ${BADGE[r.verdict]||''}">${escH(r.verdict.toUpperCase())}</span>
          ${r.tronque?`<span class="badge wait">${T('FIN SEULEMENT','TAIL ONLY')}</span>`:''}</div>
        <div class="asdesc">${r.lues} ${T('lignes lues','lines read')} · ${r.erreurs} ${T('erreur(s)','error(s)')} · ${r.critiques} ${T('critique(s)','critical')} · ${r.avertissements} ${T('avertissement(s)','warning(s)')}</div>
      </div></div>`;
  // Un journal propre est une BONNE nouvelle, et il faut le dire : une liste vide
  // laisserait croire que la lecture a echoue.
  if(r.verdict==='propre'){
    el.innerHTML=TITRE+entete+'<p class="dim cap">'+T('Aucune erreur dans le journal. Aurora ne signale rien.','No error in the log. Aurora reports nothing.')+'</p>';
    return;
  }
  el.innerHTML=TITRE+entete
    +'<h2 class="sec">'+T('PROBLÈMES REGROUPÉS','GROUPED PROBLEMS')+'</h2>'
    +r.motifs.map(m=>`<div class="lrow asrow ${m.niveau==='avertissement'?'':'advcard '+m.niveau}">
        <span class="asico">${m.niveau==='avertissement'?'<svg><use href="#i-warn"/></svg>':'<svg><use href="#i-warn"/></svg>'}</span>
        <div class="asbody"><div class="astop">${escH(m.motif)} <span class="badge ${m.niveau==='avertissement'?'':'wait'}">×${m.compte}</span></div>
        <div class="asdesc">${T('ligne ','line ')}${m.premiere} · ${escH(m.exemple.slice(0,140))}</div>
        ${m.piste?`<div class="asdesc">${escH(m.piste.quoi)} — ${escH(m.piste.conseil)}</div>`:''}</div>
      </div>`).join('');
}
async function loadHomebrew(){
  loadEmulateurs();
  $('hbStatus').textContent=T('Scan...','Scanning...');
  try{
    const apps=await api('/api/homebrew');
    $('hbBody').innerHTML=apps.map(a=>`<tr><td data-l="${escA(enTete('hbBody',0))}"><span class="v">${escH(a.name)}</span></td><td data-l="${escA(enTete('hbBody',1))}"><span class="v"><span class="badge ${a.kind==='Emulateur'?'ext':'god'}">${escH(a.kind.toUpperCase())}</span></span></td><td data-l="${escA(enTete('hbBody',2))}" style="font-family:monospace;color:var(--text-3)"><span class="v">${escH(a.exe)}</span></td><td data-l="${escA(enTete('hbBody',3))}" class="dim cap"><span class="v">${escH(a.path)}</span></td></tr>`).join('');
    $('hbStatus').textContent=apps.length+T(' application(s)',' app(s)');
    hbLoaded=true; // pose APRES le succes : sinon un echec reseau laissait l'onglet vide a vie
  }catch(e){$('hbStatus').textContent=T('Erreur : ','Error: ')+e.message;}
}

// catalogue homebrew téléchargeable : essentiels RGH/JTAG depuis archive.org + recherche libre
let hbApps=[];
async function loadHbStore(q){
  const box=$('hbStore');
  box.innerHTML='<div class="status">'+T('Chargement du catalogue...','Loading store...')+'</div>';
  const apps=await api('/api/hbstore'+(q?'?q='+encodeURIComponent(q):''));
  if(!apps||!apps.length){box.innerHTML=etatVide({icone:'box',titre:T('Aucun résultat','No results'),aide:T('Essaie un autre terme, vérifie la connexion : ce catalogue interroge archive.org.','Try another term, or check the connection: this catalogue queries archive.org.')});return;}
  hbApps=apps;
  box.innerHTML='<div style="color:var(--text-3);font-size:var(--fs-caption);font-weight:700;margin:6px 0">'+(q?T('RÉSULTATS','RESULTS'):T('CATALOGUE HOMEBREW — LES ESSENTIELS','HOMEBREW STORE — THE ESSENTIALS'))+'</div>'
    +apps.map((a,ai)=>`<div class="dlrow" style="flex-direction:column;align-items:stretch">
      <div style="display:flex;align-items:center;gap:8px;padding:2px 0">
        <span style="font-weight:700">${escH(a.name)}</span>
        ${a.emu?'<span class="badge ext">EMU</span>':'<span class="badge god">APP</span>'}
        ${a.installed?'<span class="badge" style="background:#1c4d2e">✓ '+T('INSTALLÉ','INSTALLED')+'</span>':''}
      </div>
      ${(a.files||[]).slice(0,5).map((f,fi)=>`<div style="display:flex;align-items:center;gap:8px;padding:3px 0 3px 14px;border-top:1px solid var(--stroke-secondary)">
        <span style="flex:1;font-size:var(--fs-caption);word-break:break-all" title="${escA(f.name)}">${escH(f.name)}</span>
        ${f.group?'<span class="badge cap">DOSSIER</span>':''}
        <span class="dim cap">${f.size?(f.size/1048576).toFixed(0)+' Mo':''}</span>
        <button class="btn sm" onclick="hbInstall(${ai},${fi})">INSTALLER</button>
      </div>`).join('')||etatVide({icone:'search',titre:T('Aucun fichier trouvé','No file found'),aide:T('Réessaie avec le titre exact du jeu, ou avec son TitleID a 8 caracteres.','Try the exact game title, or its 8-character TitleID.')})}
    </div>`).join('');
}
async function hbInstall(ai,fi){
  const a=hbApps[ai],f=a&&a.files[fi];if(!f)return;
  const r=await post('/api/hb/install',f.group?{group:true,app:a.name,name:a.name,files:f.list}:{url:f.url,app:a.name,name:f.name});
  if(r.error){$('hbStatus').textContent=T('Erreur : ','Error: ')+r.error;return;}
  $('hbStatus').textContent=T('Téléchargement lancé → onglet TÉLÉCHARGEMENTS (install auto a la fin)','Download queued → Downloads tab (auto-installs when done)');
  showView('act');
}

// ---------- DLC & TU lies aux jeux installés ----------
let ctData=[],ctLoaded=false,ctOpen=new Set(),ctDlcCache={};
async function loadMyContent(){
  $('ctStatus').textContent=T('Analyse du contenu installé...','Analyzing installed content...');
  try{
    const r=await api('/api/mycontent');
    ctData=(r&&r.games)||[];renderCt();
    $('ctStatus').textContent=ctData.length+T(' jeu(x)',' game(s)');
    ctLoaded=true; // pose APRES le succes : sinon un echec reseau laissait l'onglet vide a vie
    if(r&&r.pending)setTimeout(async()=>{try{const r2=await api('/api/mycontent');if(r2){ctData=r2.games||[];renderCt();}}catch(e){$('ctStatus').textContent=T('Erreur : ','Error: ')+e.message;}},12000);
  }catch(e){$('ctStatus').textContent=T('Erreur : ','Error: ')+e.message;}
}
function renderCt(){
  const q=($('ctFilter')||{value:''}).value.toLowerCase();
  $('ctList').innerHTML=ctData.filter(g=>!q||g.name.toLowerCase().includes(q)||(g.tid||'').toLowerCase().includes(q)).map(g=>{
    const open=ctOpen.has(g.tid);
    const tuOk=g.tusOnline.some(t=>t.match&&t.installed), tuAny=g.tusOnline.some(t=>t.match);
    const tuLbl=g.pending?'TU …':tuOk?'TU ✓':(g.tus.length?'TU ✗':T('pas de TU','no TU'));
    return `<div class="ctrow ${open?'open':''}">
      <div role="button" tabindex="0" class="cthead" onclick="ctToggle(${jsA(g.tid)})">
        <img src="/api/cover?tid=${g.tid}&sz=sm" loading="lazy" onerror="this.style.visibility='hidden'">
        <div style="flex:1;min-width:0"><div class="ctn">${escH(g.name)}</div><div class="ctid">${escH(g.tid)} · ${escH(g.format)} · ${fmt(g.size)}${g.mediaId?' · MID '+escH(g.mediaId):''}</div></div>
        <div class="ctsum">
          <span class="badge ${g.dlc.length?'god':''}">${g.dlc.length} DLC</span>
          ${g.discs>1?`<span class="badge god" title="${escA((g.discNames||[]).join(' · '))}">${g.discs} ${T('DISQUES','DISCS')}</span>`:''}
          <span class="badge ${tuOk?'ext':(g.tus.length||tuAny)?'wait':''}">${tuLbl}</span>
        </div>
      </div>
      <div class="ctbody" id="ctb-${g.tid}">${open?ctBody(g):''}</div>
    </div>`;
  }).join('');
  // Le canal du cockpit : les jeux les plus garnis en DLC/TU defilent en
  // apercu ; le clic filtre la liste complete dessous (conCtGo).
  const hero=$('conCtRow');
  if(hero){
    const avec=ctData.filter(g=>g.dlc.length+g.tus.length>0)
      .sort((a,b)=>(b.dlc.length+b.tus.length)-(a.dlc.length+a.tus.length));
    $('conCtHero').hidden=!conConnecte||!avec.length;
    $('conCtHeroN').textContent=avec.length+T(' jeux avec contenu',' games with content');
    // L'idcard peut avoir rendu « analyse… » avant que les donnees arrivent :
    // la ligne d'etat se met a jour avec le compte reel.
    const cc=$('csCt'),cd=$('csdCt');
    if(cc&&conConnecte)cc.textContent=ctData.length+T(' jeux',' games');
    if(cd)cd.className='csdot '+(conConnecte&&ctData.length?'ok':'off');
    hero.innerHTML=avec.slice(0,14).map(g=>{
      const d=g.dlc.length,t=g.tus.length;
      const cov=g.tid?`<img class="ccov" loading="lazy" src="/api/cover?tid=${g.tid}" onerror="covErr(this,${jsA((g.name[0]||'?').toUpperCase())})">`:`<div class="ccovph">${escH((g.name[0]||'?').toUpperCase())}</div>`;
      return `<div role="button" tabindex="0" class="ccard" onclick="conCtGo(${jsA(g.name)})" onkeydown="if(event.key==='Enter')conCtGo(${jsA(g.name)})"><div class="cwrap">${cov}<span class="ccnt">${d?d+' DLC':''}${d&&t?' · ':''}${t?t+' TU':''}</span></div><div class="cnm">${escH(g.name)}</div></div>`;
    }).join('');
  }
}
function ctToggle(tid){ctOpen.has(tid)?ctOpen.delete(tid):ctOpen.add(tid);renderCt();}
function ctBody(g){
  const dlcInst=g.dlc.map(d=>`<div class="trow"><span class="tmid segoe t1" title="${escA(d.name)}">${escH(d.name)}</span><span class="ds">${fmt(d.size)}</span></div>`).join('')
    ||`<div style="color:var(--text-3);font-size:var(--fs-caption);padding:4px 0">${T('Aucun DLC installé','No DLC installed')}</div>`;
  const tuList=g.tusOnline.length?tuSort(g.tusOnline).map(t=>tuRow(g.tid,t,'ctInstallTu')).join('')
    :`<div style="color:var(--text-3);font-size:var(--fs-caption);padding:4px 0">${g.pending?T('Recherche des TU XboxUnity...','Fetching XboxUnity updates...'):T('Aucune TU référencée','No TU listed')}</div>`;
  const tuInst=g.tus&&g.tus.length?g.tus.map(t=>`<div class="trow"><span class="tmid segoe t1" title="${escA(t.name||t)}">${escH(tuName(t.name||t))}</span></div>`).join(''):'';
  return `<h4>DLC & CONTENU — ${g.dlc.length} ${T('installé(s)','installed')}</h4>${dlcInst}
    <div style="margin:8px 0"><button class="btn gray" style="padding:5px 14px;font-size:var(--fs-caption)" onclick="ctDlc(${jsA(g.tid)})">${T('CHERCHER LES DLC EN LIGNE','FIND DLC ONLINE')}</button></div>
    <div id="ctdlc-${g.tid}">${ctDlcCache[g.tid]||''}</div>
    <h4 class="mt-3">TITLE UPDATES${g.mediaId?' — MID '+escH(g.mediaId):''}</h4>${tuInst}${tuList}`;
}
async function ctDlc(tid){
  const g=ctData.find(x=>x.tid===tid),el=$('ctdlc-'+tid);if(!g||!el)return;
  el.innerHTML=`<div style="color:var(--text-3);font-size:var(--fs-caption);padding:6px 0">${T('Recherche DLC...','Searching DLC...')}</div>`;
  const files=await api('/api/dlc?q='+encodeURIComponent(g.name)+'&tid='+tid);
  const html=(files||[]).slice(0,30).map(f=>`<div style="display:flex;gap:10px;align-items:center;font-size:var(--fs-caption);padding:4px 0">
    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escA(f.name)}">${escH(f.name)}</span>
    <span class="badge ${f.col==='XBLA'?'god':f.col==='Indie'?'wait':'ext'}">${escH(f.col)}</span>
    <span class="dim">${fmt(f.size)}</span>
    <button class="btn pad-s cap" onclick="dlcInstall(${jsA(f.url)},${jsA(f.name)})">${T('INSTALLER','INSTALL')}</button>
  </div>`).join('')||etatVide({icone:'plus-box',titre:T('Aucun DLC trouvé','No DLC found'),aide:T('Les packs DLC viennent de collections archive.org : la recherche peut ne rien remonter pour un jeu peu documenté.','DLC packs come from archive.org collections: searches can come up empty for lesser-known games.')});
  ctDlcCache[tid]=html;if(el)el.innerHTML=html;
}
async function ctInstallTu(tid,tuid){await installTu(tid,tuid);setTimeout(async()=>{const r=await api('/api/mycontent');if(r){ctData=r.games||[];renderCt();}},1500);}

async function importPath(){
  const p=$('impPath').value.trim();if(!p)return;
  $('dlStatus').textContent=T('Import en cours...','Importing...');
  const r=await post('/api/import',{path:p});
  $('dlStatus').textContent=r.ok?T('Importe : ','Imported: ')+r.dest:T('Erreur : ','Error: ')+r.error;
  $('impPath').value='';
}

function selGame(i,ev){
  const g=games[i];
  if(ev&&ev.ctrlKey){selSet.has(g)?selSet.delete(g):selSet.add(g);selected=g;}
  else{selSet=new Set([g]);selected=g;openDetail(g);}
  renderGames();
  // La carte selectionnee doit etre VISIBLE : `openJeuTid` arrive d'un clic sur
  // l'accueil, et sans cela la fiche s'ouvrirait pendant que la bibliotheque
  // montre le haut d'une longue liste — l'objet obtenu ne serait pas l'objet vu.
  // En coverflow, la carte se CENTRE comme au clic (`flowClick`) : sans lui, le
  // tilt calculerait un autre « cur » sous le pointeur.
  if(libView==='flow'){
    const fc=$('flow').querySelector('.fcard[data-i="'+games.indexOf(g)+'"]');
    if(fc){fc.scrollIntoView({inline:'center',block:'nearest'});flowTilt();}
  }else{
    const carteSel=document.querySelector('#grid .sel');
    if(carteSel)carteSel.scrollIntoView({block:'nearest'});
  }
  $('abHint').style.display='none';
  $('actionbar').style.display='flex';
  $('selInfo').textContent=selSet.size>1?selSet.size+T(' éléments sélectionnés',' items selected'):selected.name+' — '+selected.path;
}
async function openPath(p){await post('/api/open',{path:p});}

// Les quatre faits de la rangée sous l'en-tête : type, taille, disques,
// fichiers. `d` (gamedetail) arrive APRES l'ouverture — le nombre de fichiers
// passe de « … » au vrai compte sans que la fiche saute.
function dpFaits(g,d){
  const disques=(d&&d.discs&&d.discs.length)||g.discs||1;
  const fichiers=d&&typeof d.files==='number'?String(d.files):'…';
  return [[T('Type','Type'),g.format],[T('Taille','Size'),fmt(g.size||0)],
    [T('Disques','Discs'),disques],[T('Fichiers','Files'),fichiers]]
    .map(([k,v])=>`<div class="dfact"><b>${escH(String(v))}</b><span>${escH(k)}</span></div>`).join('');
}
// Les trois onglets de la fiche : une liste a la fois, le compteur reste
// visible sur l'onglet ferme.
function detailTab(w){
  [['ct','dpList','dtCt'],['dlc','dpDlc','dtDlc'],['tu','dpTu','dtTu']].forEach(([k,p,b])=>{
    const pe=$(p),be=$(b);if(pe)pe.hidden=k!==w;if(be){be.classList.toggle('on',k===w);be.setAttribute('aria-selected',k===w?'true':'false');}
  });
  const ds=document.querySelector('#detail .dscroll');if(ds)ds.scrollTop=0;
}
async function openDetail(g){
  $('detail').classList.add('open');
  detailTab('ct');
  const cov='/api/cover?tid='+g.tid+'&sz=lg';
  $('dpImg').src=cov;$('dpImg').style.display='';
  $('dpImg').onerror=function(){this.style.display='none'};
  $('dpBg').style.backgroundImage=`url('${cov}')`;
  $('dpName').textContent=g.name;
  $('dpMeta').innerHTML=
    (g.tid&&g.tid!=='-'?`<span class="dtid cp" role="button" tabindex="0" title="${escA(T('TitleID — cliquer pour copier','TitleID — click to copy'))}" onclick="copyTxt(${jsA(g.tid)})">${escH(g.tid)}</span>`:'')+
    `<div class="dpath">${escH(g.path)}</div>`;
  $('dpFacts').innerHTML=dpFaits(g,null);
  $('dtnCt').textContent='';$('dtnDlc').textContent='';$('dtnTu').textContent='';
  $('dpDlc').innerHTML='';$('dpTu').innerHTML='';
  $('dpList').innerHTML=skelRows(5);
  try{
    const d=await api('/api/gamedetail?path='+encodeURIComponent(g.path));
    // Les AUTRES COPIES du meme jeu : un doublon ne choisit pas a la place de
    // l'utilisateur — chaque copie montre son format et son chemin, et on peut
    // dire laquelle on regarde.
    const copies=games.filter(x=>x!==g&&x.name===g.name);
    $('dpMeta').innerHTML+=
      (d.exe?`<div class="dpath dim">${escH(d.exe.split(/[\\/]/).pop())}</div>`:'')+
      copies.map(c=>`<div class="dpath dim">${T('Autre copie','Other copy')} · ${escH(c.format)} · ${fmt(c.size)} — ${escH(c.path)}</div>`).join('');
    $('dpFacts').innerHTML=dpFaits(g,d);
    const lignes=d.discs&&d.discs.length>1?d.discs:d.children||[];
    $('dtnCt').textContent=lignes.length||'';
    $('dpList').innerHTML=d.error?escH(T('Erreur : ','Error: ')+d.error)
      :(lignes.length
        ?lignes.map(c=>`<div class="ditem"><span class="dn">${escH(c.name)}</span><span class="ds">${fmt(c.size)}</span></div>`).join('')
        :T('Aucun détail','No details'));
    loadContent(g);
  }catch(e){$('dpList').textContent=T('Erreur : ','Error: ')+e.message;}
}
// helpers TU partages : nom court, tri (compatibles d'abord, version desc), ligne propre
const tuName=n=>{const m=(n||'').match(/title\s*update\s*#?\s*([0-9a-z]+)/i);return m?'Title Update #'+m[1]:(n||'').replace(/\.(data|live|con|pirs)$/i,'');};
const tuSort=l=>l.slice().sort((a,b)=>((b.match!==false)-(a.match!==false))||((+b.version)-(+a.version)));
function tuRow(tid,t,fn){
  const ok=t.match!==false;
  return `<div class="trow${ok?'':' off'}"><span class="tver">v${escH(t.version)}</span><span class="tdot ${ok?'ok':'ko'}" title="${ok?T('Compatible avec ton disque','Matches your disc'):T('Autre MediaID — ignorée par la console','Different MediaID — ignored by console')}"></span><span class="tmid">MID ${escH(t.media||'—')}</span><span class="ds">${fmt(t.size)}</span>${t.installed?`<span class="badge ext">${T('INSTALLÉE','INSTALLED')}</span>`:`<button class="btn pad-s cap" onclick="${fn}(${jsA(tid)},${jsA(t.tuid)})">${T('INSTALLER','INSTALL')}</button>`}</div>`;
}
async function loadContent(g){
  // DEUX PANNEAUX, PAS UN MUR : DLC dans `dpDlc`, mises a jour dans `dpTu` —
  // l'onglet porte le compte, la liste ne montre que la famille choisie.
  const elD=$('dpDlc'),elT=$('dpTu');
  const panne=e=>{const m='<span class="errc">'+escH(T('Erreur : ','Error: ')+e.message)+'</span>';elD.innerHTML=elT.innerHTML=m;};
  if(!g.tid||g.tid==='-'){
    const m=T('Pas de TitleID — contenu live indisponible.','No TitleID — live content unavailable.');
    elD.innerHTML=elT.innerHTML=m;return;
  }
  const att=T('Recherche DLC/MAJ...','Looking up DLC/updates...');
  elD.innerHTML=elT.innerHTML=att;
  try{
  const d=await api('/api/gamecontent?tid='+g.tid+'&path='+encodeURIComponent(g.path||''));
  if(d.error){elD.innerHTML=elT.innerHTML='<span class="errc">'+escH(d.error)+'</span>';return;}
  $('dtnDlc').textContent=d.dlcInstalled.length||'';
  $('dtnTu').textContent=(d.tusInstalled.length+d.tusOnline.length)||'';
  elD.innerHTML=
    `<div class="dsub">${T('DLC installés','Installed DLC')} · ${d.dlcInstalled.length}</div>`+
    (d.dlcInstalled.length?d.dlcInstalled.map(x=>`<div class="ditem"><span class="dn" title="${escA(x.name)}">${escH(x.name)}</span><span class="ds">${fmt(x.size)}</span><button class="dx" title="${T('Supprimer','Delete')}" onclick="delContent(${jsA(x.path||'')})">✕</button></div>`).join(''):`<div class="ditem warnc">${T('Aucun DLC installé','No DLC installed')}</div>`)+
    `<button class="btn gray" style="margin-top:10px;padding:7px 14px;font-size:var(--fs-caption);width:100%" onclick="searchDlcFor()">${T('CHERCHER DES DLC EN LIGNE','FIND DLC ONLINE')}</button><div id="dpDlcResults"></div>`;
  let h='';
  if(d.mediaId)h+=`<div class="midc cp" role="button" tabindex="0" title="${escA(T('MediaID du disque — cliquer pour copier','Disc MediaID — click to copy'))}" onclick="copyTxt(${jsA(d.mediaId)})">MID&nbsp;${escH(d.mediaId)}</div>`;
  h+=`<div class="dsub">${T('Mises à jour installées','Installed updates')} · ${d.tusInstalled.length}</div>`;
  h+=d.tusInstalled.length?d.tusInstalled.map(x=>`<div class="trow"><span class="tmid segoe t1" title="${escA(x.name)}">${escH(tuName(x.name))}</span><button class="dx" title="${T('Supprimer','Delete')}" onclick="delContent(${jsA(x.path||'')})">✕</button></div>`).join(''):`<div class="trow">${T('Aucune','None')}</div>`;
  if(d.tusOnline.length){
    // la meilleure TU = la plus haute version compatible avec le MediaID du disque (d.tuBest calcule serveur)
    // PAS de repli sur list[0] : la TU d'un AUTRE MediaID est ignoree par la
    // console (DLC bloqués) meme si l'UI la presentait comme "la bonne".
    const list=tuSort(d.tusOnline),best=d.tuBest||list.find(t=>t.match===true)||null;
    h+=`<div class="dsub">${T('MAJ en ligne','Online updates')} · ${d.tusOnline.length}</div>`;
    if(!best)h+=`<div class="trow" style="color:var(--warn);border-bottom:none">${T('Aucune mise a jour ne correspond au MediaID de ton disque','No update matches your disc MediaID')}</div>`;
    else h+=best.installed?`<div class="trow" style="border-bottom:none"><span class="badge ext">${T('À JOUR','UP TO DATE')} — v${escH(best.version)}</span></div>`:`<div class="trow" style="border-bottom:none;padding-bottom:2px"><span style="flex:1;color:var(--text-3)">${T('Meilleure version pour ton disque','Best version for your disc')}</span><button class="btn pad-s cap" onclick="installTu(${jsA(g.tid)},${jsA(best.tuid)})">${T('INSTALLER','INSTALL')} v${escH(best.version)}</button></div>`;
    if(d.mediaId&&!d.tuOk)h+=`<div class="trow" style="color:var(--danger);border-bottom:none">⚠ ${T('Aucune TU compatible installée — les DLC peuvent etre bloqués.','No compatible update installed — DLC may be blocked.')}</div>`;
    h+=list.slice(0,8).map(t=>tuRow(g.tid,t,'installTu')).join('');
  } else h+=`<div class="trow dim">${T('Aucune MAJ sur XboxUnity.','No updates on XboxUnity.')}</div>`;
  elT.innerHTML=h;
  }catch(e){panne(e);}
}
async function searchDlcFor(){
  if(!selected)return;
  // On envoie le nom COMPLET. Le tronquer au « : » transformait
  // « Assassin's Creed: Brotherhood » en « Assassin's Creed » et ramenait les DLC
  // de toute la serie. Le serveur sait desormais retirer lui-meme les mots
  // d'edition (« Game of the Year Edition ») et relacher un prefixe de studio.
  const q=selected.name.replace(/\s*Disc\s*\d/ig,'').trim();
  $('dpDlcResults').innerHTML=`<div style="color:var(--text-3);margin-top:8px">${T('Recherche dans les collections DLC Xbox 360...','Searching Xbox 360 DLC collections...')}</div>`;
  const files=await api('/api/dlc?q='+encodeURIComponent(q)+'&tid='+(selected.tid||''));
  if(files.error){$('dpDlcResults').innerHTML='<span class="errc">'+escH(files.error)+'</span>';return;}
  if(!files.length){$('dpDlcResults').innerHTML=`<div style="color:var(--warn);margin-top:8px">${T('Aucun pack DLC trouvé pour','No DLC pack found for')} "${escH(q)}"</div>`;return;}
  $('dpDlcResults').innerHTML=`<b style="color:var(--text-1);font-size:var(--fs-caption)">${files.length} ${T('pack(s) — INSTALLER = télécharge et installe directement dans le dossier du jeu','pack(s) — INSTALL = downloads and installs straight into the game folder')}</b>`+(hasCookie?'':`<div role="button" tabindex="0" style="color:var(--warn);margin:6px 0;cursor:pointer;text-decoration:underline" onclick="cookieHelp()">${T('Ces packs exigent un compte archive.org — clique ici pour le tuto','These packs require an archive.org account — click here for the how-to')}</div>`)+
    (()=>{
      const groups={};files.forEach(f=>(groups[f.col]=groups[f.col]||[]).push(f));
      const GL={DLC:T('PACKS DLC','DLC PACKS'),'DLC XBLA':T('DLC XBLA','XBLA DLC'),XBLA:'XBLA',Indie:T('JEUX INDES','INDIE GAMES'),Bundle:T('JEU COMPLET + DLC (tout le jeu)','FULL GAME + DLC (the whole game)')};
      const row=f=>`<div style="padding:6px 0 7px;border-bottom:1px solid var(--stroke-secondary)"><div style="font-size:var(--fs-caption);line-height:1.4;word-break:break-word;color:var(--text-1)" title="${escA(f.name)}">${escH(f.name)}</div><div style="display:flex;align-items:center;gap:8px;margin-top:5px"><span class="dim cap">${fmt(f.size)}</span><span style="margin-left:auto;display:flex;gap:6px"><button class="btn pad-s cap" onclick="dlcInstall(${jsA(f.url)},${jsA(f.name)})">${T('INSTALLER','INSTALL')}</button><button class="btn gray pad-s cap" onclick="dlcDl(${jsA(f.url)},${jsA(f.name)})">${T('DÉPÔT','DROP')}</button></span></div></div>`;
      return ['DLC','DLC XBLA','XBLA','Indie','Bundle'].filter(c=>groups[c]).map(c=>`<div style="margin:10px 0 2px;color:var(--text-3);font-size:var(--fs-caption);letter-spacing:1.5px">${GL[c]||c} — ${groups[c].length}</div>`+groups[c].map(row).join('')).join('');
    })();
}
// ---------- Tuto cookie archive.org ----------
function cookieHelp(){ouvrirSurcouche($('cookieModal'));if(hasCookie)$('ckIn').value=$('cfgCookie').value;}
// le polling du cookie tourne toutes les 2s : il doit mourir avec le modal
let iaTimer=null;
function stopIaTimer(){if(iaTimer){clearInterval(iaTimer);iaTimer=null;}}
function closeCookie(){fermerSurcouche($('cookieModal'));stopIaTimer();}
async function iaAuto(){
  $('ckStatus').textContent=T('Ouverture de la fenêtre archive.org...','Opening the archive.org window...');
  stopIaTimer();
  try{await post('/api/ia/login',{});}catch(e){$('ckStatus').textContent=T('Erreur : ','Error: ')+e.message;return;}
  $('ckStatus').textContent=T('Connecte-toi dans la fenêtre qui vient de s\'ouvrir — je récupère les cookies tout seul des que tu es connecté.','Sign in in the window that just opened — cookies are captured automatically once you are logged in.');
  iaTimer=setInterval(async()=>{
    try{
      const s=await api('/api/ia/status');
      if(s.done){stopIaTimer();hasCookie=true;$('ckStatus').textContent='';fermerSurcouche($('cookieModal'));toast(T('Cookie archive.org récupéré automatiquement','archive.org cookie captured automatically'));}
      else if(s.error){stopIaTimer();$('ckStatus').textContent=T('Erreur : ','Error: ')+s.error;}
    }catch(e){stopIaTimer();$('ckStatus').textContent=T('Erreur : ','Error: ')+e.message;}
  },2000);
}
async function saveCookie(){
  const v=$('ckIn').value.trim();
  if(!v.includes('logged-in')){toast(T('Format attendu : logged-in-sig=...; logged-in-user=...','Expected format: logged-in-sig=...; logged-in-user=...'),'warn');return;}
  $('cfgCookie').value=v;
  await saveCfg();
  hasCookie=true;
  closeCookie();
  toast(T('Cookie enregistré — les téléchargements archive.org passent','Cookie saved — archive.org downloads will work'));
}
function needCookie(url){ if(!hasCookie&&/archive\.org/i.test(url||'')){cookieHelp();toast(T('Compte archive.org requis — suis le tuto','archive.org account required — follow the how-to'),'warn');return true;} return false; }
async function dlcInstall(url,name){
  if(needCookie(url))return;
  const r=await post('/api/dlc/install',{url,name});
  if(r.error){toast(T('Erreur : ','Error: ')+r.error,'err');return;}
  toast(T('En file : ','Queued: ')+name+T(' — s\'installé tout seul a la fin du téléchargement',' — auto-installs when the download finishes'));
  go('act');
}
async function dlcDl(url,name){
  const r=await post('/api/download',{url,name});
  toast(r.queued?T('DLC en file : ','DLC queued: ')+name+T(' — apres le DL, ORGANISER le place dans le dossier du jeu',' — after the download, ORGANIZE places it in the game folder'):T('Erreur : ','Error: ')+r.error,r.queued?'':'err');
}
async function installTu(tid,tuid){
  toast(T('Téléchargement de la MAJ...','Downloading update...'));
  const r=await post('/api/tu/install',{tid,tuid});
  if(r.already)toast(T('MAJ déjà installée','Update already installed'),'warn');
  else if(r.ok){toast(T('MAJ installée : ','Update installed: ')+r.file);if(selected)loadContent(selected);}
  else toast(T('Erreur : ','Error: ')+r.error,'err');
}
function closeDetail(){
  // Echappé appelle closeDetail() a CHAQUE Echap : ne rendre le focus que si la
  // fiche etait vraiment ouverte, sinon on volerait le focus d'un champ saisi.
  if(!$('detail').classList.contains('open')){stopIaTimer();return;}
  $('detail').classList.remove('open');stopIaTimer();
  // Fermer la fiche rend le focus AU JEU : au clavier comme a la manette, on
  // retrouve la carte selectionnee, pas le haut de la page. En coverflow, la
  // carte courante porte « cur », pas « sel ».
  const carteSel=document.querySelector(libView==='flow'?'#flow .fcard.cur':'#grid .sel');
  if(carteSel)carteSel.focus({preventScroll:true});
}
document.addEventListener('keydown',e=>{
  // les surcouches sont gerees par le piege a focus (un seul gestionnaire,
  // qui rend le focus a sa place) ; ici, seul le panneau lateral reste a fermer.
  if(e.key==='Escape'){closeDetail();stopIaTimer();}
  if(e.key==='/'&&!/input|textarea|select/i.test(document.activeElement.tagName)){e.preventDefault();const v=[...document.querySelectorAll('.view')].find(x=>x.classList.contains('active'));const f=v&&v.querySelector('input[type=text]');if(f)f.focus();}
});
function dpOpen(){if(selected)openPath(selected.path);}
function dpCopy(){if(selected&&selected.tid)copyTxt(selected.tid);}
// Copie presse-papiers AVEC retour : une copie silencieuse laisse douter que le
// geste a marche — le toast dit ce qui est parti dans le presse-papiers.
async function copyTxt(t){
  if(!t)return;
  try{await navigator.clipboard.writeText(t);toast(T('copié','copied')+' : '+t);}
  catch(e){toast(T('Copie impossible','Copy failed'),'err');}
}
async function dpCover(){
  if(!selected||!selected.tid)return;
  const u=await saisir({
    titre:T('Jaquette personnalisée','Custom cover'),
    corps:T('Laisse vide pour recharger la jaquette officielle.','Leave empty to reload the official cover.'),
    libelle:'URL', valeur:'', ok:T('VALIDER','OK')});
  if(u===null)return;
  if(u.trim()){const r=await post('/api/cover/custom',{tid:selected.tid,url:u.trim()});if(r.error){toast(T('Erreur : ','Error: ')+r.error,'err');return;}}
  else await post('/api/cover/refresh',{tid:selected.tid});
  const src='/api/cover?tid='+selected.tid+'&t='+Date.now();
  $('dpImg').src=src;
  document.querySelectorAll('img.cov').forEach(im=>{if(im.src.includes('tid='+selected.tid))im.src='/api/cover?tid='+selected.tid+'&sz=sm&t='+Date.now();});
}
// Dossier parent d'un chemin, SANS supposer le separateur de l'OS.
//
// Le client recollait avec un `\` litteral. Sous Windows c'est juste ; sous Linux,
// `/media/usb/Games/Halo` devenait `/media/usb/Games\Halo` — un chemin qui n'existe
// pas. Consequence : le selecteur de destination s'ouvrait au mauvais endroit, et le
// panneau ORGANISER affichait un dossier faux. C'est la MEME faute que les antislashs
// de `CATEGORIES[].rel` restes litteraux sous Linux : recoller un chemin avec le
// separateur d'une seule plateforme.
//
// On derive le separateur DU CHEMIN, qui vient toujours de la machine qui fait
// tourner le serveur.
function dossierParent(p){
  const s=String(p==null?'':p);
  const sep=s.indexOf('\\')>=0?'\\':'/';
  const parts=s.split(/[\\/]/);
  parts.pop();
  const j=parts.join(sep);
  if(!j)return sep;                        // racine POSIX ('/')
  if(/^[A-Za-z]:$/.test(j))return j+sep;   // 'C:' seul designe le dossier COURANT du
  return j;                                // disque, pas sa racine
}
function dpMove(){
  if(!selected)return;
  // On capture la cible MAINTENANT : le selecteur reste ouvert, et `selected` peut
  // changer pendant ce temps. Deplacer « le jeu selectionne a l'instant du clic »
  // vers un dossier choisi une minute plus tard serait un contresens.
  const src=selected.path, nom=selected.name;
  pickPour(T('DÉPLACER','MOVE')+' — '+nom,
    dossierParent(src),
    async dest=>{
      const r=await post('/api/move',{paths:[src],dest});
      if(r.err&&r.err.length)toast(T('Erreur : ','Error: ')+r.err.join(', '),'err');
      else toast(nom+T(' déplacé',' moved'));
      closeDetail();loadGames();
    });
}

async function selDelete(){
  if(!selSet.size)return;
  const items=[...selSet];
  if(!await confirmer({titre:T('Supprimer définitivement ','Permanently delete ')+items.length+T(' élément(s)',' item(s)'),
    corps:items.map(g=>g.name).join('\n'), ok:T('SUPPRIMER','DELETE'), danger:true}))return;
  await post('/api/delete',{paths:items.map(g=>g.path)});
  toast(items.length+T(' élément(s) supprimé(s)',' item(s) deleted'));
  selected=null;selSet=new Set();$('actionbar').style.display='none';closeDetail();loadGames();
}
async function selRename(){
  if(!selected)return;
  const n=await saisir({titre:T('RENOMMER','RENAME'), corps:selected.name,
    libelle:T('Nouveau nom','New name'), valeur:selected.name, ok:T('RENOMMER','RENAME')});
  if(n===null||!n.trim())return;
  await post('/api/rename',{path:selected.path,name:n.trim()});
  loadGames();
}
function selOpen(){if(selected)openPath(selected.path);}

// ---------- Organiser le dépôt ----------
const ORG_ACT={x1:T('Extraire → Jeux Xbox 1','Extract → Xbox 1 games'),extract:T('Extraire → Jeux (dossier)','Extract → Games (folder)'),god:T('Convertir → GOD (Content)','Convert → GOD (Content)'),auto:T('Extraire + analyser auto','Extract + auto analyze'),content:T('Ranger → Content','Move → Content'),games:T('Ranger → Jeux','Move → Games'),skip:T('Ne rien faire','Do nothing'),delete:T('⚠ SUPPRIMER','⚠ DELETE')};
let orgItems=[],orgPreview=false,orgDrives=[],orgDefDrive='';
async function openOrganize(){
  try{
    // Disques en meme temps que le depot : l'action GOD choisit sa destination.
    const [items,repDrives,c]=await Promise.all([api('/api/drop'),api('/api/drives'),api('/api/config')]);
    orgItems=items;
    orgDrives=(Array.isArray(repDrives)?repDrives:(repDrives.disques||[])).filter(d=>!d.systeme);
    orgDefDrive=String((c&&c.games)||'').slice(0,1).toUpperCase();
    if(!items.length){toast(T('Le dépôt est vide','The drop folder is empty'),'warn');return;}
    if(!$('orgBatch').dataset.init){
      $('orgBatch').dataset.init='1';
      for(const a of ['x1','extract','god','auto','content','games','delete'])$('orgBatch').innerHTML+=`<option value="${a}">${escH(ORG_ACT[a])}</option>`;
    }
    orgRetour();
    $('orgBody').innerHTML=items.map((it,i)=>{
      const bc=it.kind==='GOD'?'god':it.kind==='DLC'?'wait':it.kind==='TU'?'wait':it.kind==='Extrait'||it.kind.indexOf('ISO')===0?'ext':'god';
      const title=it.title?escH(it.title)+' <span style="font-family:monospace;color:var(--ac)">'+escH(it.tid||'')+'</span>':escH(it.tid||'—');
      const opts=it.actions.map((a,j)=>`<option value="${escA(a)}" ${j===0?'selected':''}>${escH(ORG_ACT[a]||a)}</option>`).join('');
      return `<tr>
        <td data-l="${escA(enTete('orgBody',0))}"><span class="v"><label class="checkline orgCk"><input type="checkbox" id="orgCk${i}" checked onchange="orgCompte()"></label></span></td>
        <td data-l="${escA(enTete('orgBody',1))}" title="${escA(it.path)}" style="word-break:break-all;font-size:var(--fs-caption)"><span class="v">${escH(it.name)}</span></td>
        <td data-l="${escA(enTete('orgBody',2))}"><span class="v"><span class="badge ${bc}">${escH(it.kind.toUpperCase())}</span></span></td>
        <td data-l="${escA(enTete('orgBody',3))}" class="cap"><span class="v">${title}${it.sub?'<br><span class="dim">→ '+escH(it.sub)+'</span>':''}</span></td>
        <td data-l="${escA(enTete('orgBody',4))}" class="cap"><span class="v">${fmt(it.size)}</span></td>
        <td data-l="${escA(enTete('orgBody',5))}"><span class="v"><select id="orgAct${i}" onchange="orgAction(${i})" style="padding:5px 8px;font-size:var(--fs-caption)">${opts}</select><select id="orgDest${i}" style="display:${it.actions[0]==='god'?'':'none'};padding:5px 8px;font-size:var(--fs-caption);margin-left:6px" title="${escA(T('Disque de destination','Destination drive'))}">${orgDrives.map(d=>`<option value="${escA(d.cle||d.letter+':')}" ${d.letter===orgDefDrive?'selected':''}>${escH(d.letter)}: · ${escH(d.fs||'?')} · ${fmt(d.free)} ${T('libres','free')}${d.consoleLit?' · '+escH(T('la console le lit','console-readable')):''}</option>`).join('')}</select></span></td>
      </tr>`;
    }).join('');
    if($('orgFilter'))$('orgFilter').value='';
    orgFiltre();
    ouvrirSurcouche($('orgModal'));
  }catch(e){$('orgBody').innerHTML=`<tr><td colspan="6" style="color:var(--danger);font-size:var(--fs-caption)">${escH(T('Erreur : ','Error: ')+e.message)}</td></tr>`;$('orgInfo').textContent='';ouvrirSurcouche($('orgModal'));}
}
// La recherche CACHE les lignes, elle ne les retire pas : une case reste cochee
// sous le filtre, et la regle portee en haut dit que seules les lignes VISIBLES
// et cochees seront traitees. `orgCompte` tient le bouton a jour des deux cotes.
function orgFiltre(){
  const q=($('orgFilter').value||'').toLowerCase();
  [...$('orgBody').querySelectorAll('tr')].forEach((tr,i)=>{
    const it=orgItems[i];if(!it)return;
    const txt=(it.name+' '+it.kind+' '+(it.title||'')+' '+(it.tid||'')).toLowerCase();
    tr.style.display=!q||txt.includes(q)?'':'none';
  });
  orgCompte();
}
function orgTout(v){
  [...$('orgBody').querySelectorAll('tr')].forEach((tr,i)=>{
    if(tr.style.display!=='none'&&$('orgCk'+i))$('orgCk'+i).checked=v;
  });
  orgCompte();
}
// La regle de lot suit la meme frontiere que la regle de selection : elle n'a
// d'effet que sur les lignes VISIBLES et cochees — jamais sur une ligne que le
// filtre a cachee ni sur une case decochee.
function orgBatch(a){
  if(!a||!ORG_ACT[a])return;
  [...$('orgBody').querySelectorAll('tr')].forEach((tr,i)=>{
    if(tr.style.display==='none'||!$('orgCk'+i)||!$('orgCk'+i).checked)return;
    const sel=$('orgAct'+i);
    if(sel&&[...sel.options].some(o=>o.value===a)){sel.value=a;orgAction(i);}
  });
  orgCompte();
}
// GOD choisit son disque : le second selecteur n'existe que pour elle.
function orgAction(i){
  const sel=$('orgAct'+i),dst=$('orgDest'+i);
  if(dst)dst.style.display=sel&&sel.value==='god'?'':'none';
}
// PREVISUALISATION : CONFIRMER ne lance rien, il montre la liste des operations
// (source -> verbe -> destination) et ce qui sera ignore. RETOUR rend la table
// intacte, rien n'est ecrit tant que le verbe n'a pas ete confirme.
const ORG_VERB={x1:T('EXTRAIRE','EXTRACT'),extract:T('EXTRAIRE','EXTRACT'),god:T('CONVERTIR','CONVERT'),auto:T('ORGANISER','ORGANIZE'),content:T('DÉPLACER','MOVE'),games:T('DÉPLACER','MOVE'),delete:T('SUPPRIMER','DELETE')};
const ORG_DEST={x1:T('Jeux Xbox 1','Xbox 1 games'),extract:T('Dossier Jeux','Games folder'),god:T('Content (GOD)','Content (GOD)'),auto:T('Tri automatique','Automatic sort'),content:T('Content','Content'),games:T('Dossier Jeux','Games folder'),delete:T('suppression définitive','permanent deletion')};
function orgCollect(){
  return orgItems.map((it,i)=>{
    const tr=$('orgBody').querySelectorAll('tr')[i];
    if(!tr||tr.style.display==='none'||!$('orgCk'+i).checked)return null;
    const a=$('orgAct'+i).value;
    const dest=a==='god'&&$('orgDest'+i)?$('orgDest'+i).value:null;
    // La place du disque choisi, comparee a l'ISO — un avertissement, pas un
    // refus : le GOD taille est souvent plus petit que la source.
    const drv=dest&&orgDrives.find(d=>d.cle===dest);
    return {path:it.path,action:a,name:it.title||it.name,sub:it.sub,size:it.size,
      dest,tight:!!(drv&&it.size&&drv.free<it.size)};
  }).filter(x=>x&&x.action!=='skip');
}
function orgRetour(){
  orgPreview=false;
  if($('orgPrev'))$('orgPrev').style.display='none';
  if($('orgTable'))$('orgTable').style.display='';
  if($('orgBack'))$('orgBack').style.display='none';
  if($('orgAll'))$('orgAll').style.display='';
  if($('orgNone'))$('orgNone').style.display='';
  if($('orgBody'))orgCompte();
}
// Le bouton CONFIRMER dit ce qu'il va faire : N elements cocher-traiter et
// combien d'operations reelles (action != « ne rien faire »).
function orgCompte(){
  if(!orgItems)return;
  let sel=0,ops=0;
  [...$('orgBody').querySelectorAll('tr')].forEach((tr,i)=>{
    if(tr.style.display==='none'||!$('orgCk'+i)||!$('orgCk'+i).checked)return;
    sel++;
    if($('orgAct'+i).value!=='skip')ops++;
  });
  const visibles=orgItems.filter((it,i)=>{const tr=$('orgBody').querySelectorAll('tr')[i];return tr&&tr.style.display!=='none'}).length;
  $('orgInfo').textContent=sel+T(' sélectionné(s) sur ',' selected of ')+visibles+T(' visible(s) — ',' visible — ')+dossierParent(orgItems[0].path);
  $('orgScope').textContent=$('orgFilter').value?T('seules les lignes visibles seront traitées','only visible rows will be processed'):'';
  $('orgConfirm').textContent=T('CONFIRMER — ','CONFIRM — ')+ops+T(' opération(s)',' op(s)');
}
async function execOrganize(){
  const items=orgCollect();
  if(!items.length){fermerSurcouche($('orgModal'));toast(T('Rien à faire','Nothing to do'),'warn');return;}
  if(!orgPreview){
    // Phase 1 : on MONTRE ce qui va se passer. Aucune ecriture ici.
    const ign=orgItems.length-items.length;
    $('orgPrev').innerHTML='<div class="prv-head">'+items.length+T(' opération(s) prévue(s)',' op(s) planned')+(ign?' · '+ign+T(' ignoré(s) (décoché, filtré ou « ne rien faire »)',' ignored (unchecked, filtered, or "do nothing")'):'')+'</div>'
      +items.map(j=>`<div class="prv${j.action==='delete'?' danger':''}">
        <span class="badge ${j.action==='delete'?'err':'god'}">${escH(ORG_VERB[j.action]||j.action.toUpperCase())}</span>
        <span class="prv-m"><b title="${escA(j.path)}">${escH(j.name)}</b><span class="dim cap">→ ${escH(j.sub||(j.dest?j.dest+' — '+ORG_DEST[j.action]:ORG_DEST[j.action]||''))}${j.tight?' <span style="color:var(--warn)">'+escH(T('⚠ place insuffisante ?','⚠ may not fit'))+'</span>':''}</span></span>
        <span class="dim cap">${fmt(j.size)}</span>
      </div>`).join('');
    const verbs=[...new Set(items.map(j=>j.action))];
    $('orgConfirm').textContent=verbs.length===1?ORG_VERB[verbs[0]]+' — '+items.length:T('EXÉCUTER','RUN')+' — '+items.length+T(' opération(s)',' op(s)');
    orgPreview=true;
    $('orgTable').style.display='none';
    $('orgPrev').style.display='';
    $('orgBack').style.display='';
    $('orgAll').style.display='none';
    $('orgNone').style.display='none';
    return;
  }
  // Phase 2 : le verbe a ete lu — seule la suppression demande un second accord.
  const dels=items.filter(x=>x.action==='delete').length;
  if(dels&&!await confirmer({titre:T('Supprimer définitivement ','Permanently delete ')+dels+T(' élément(s)',' item(s)'),
    corps:T('Ces éléments sont marqués « SUPPRIMER » dans la prévisualisation.','These items are marked "DELETE" in the preview.'),
    ok:T('SUPPRIMER','DELETE'), danger:true}))return;
  const r=await post('/api/organize',{items});
  fermerSurcouche($('orgModal'));
  if(r.error){toast(T('Erreur : ','Error: ')+r.error,'err');return;}
  toast(T('Organisation lancée (','Organization started (')+r.count+T(' opération(s)) — suivi dans TÉLÉCHARGEMENTS',' op(s)) — track it in DOWNLOADS'));
  go('act');
}
async function runSort(){openOrganize();}
// Le journal est colore : une ligne ERREUR doit sauter aux yeux, pas se fondre
// dans le flux — sinon « == Operation terminee == » se lit comme un succes meme
// quand des lignes ont echoue.
async function pollLog(){try{const s=await api('/api/sortlog');$('sortLog').innerHTML=s.lines.map(l=>{
  const cls=/ERREUR|ERROR:/.test(l)?'le':/^===|^==/.test(l)?'lh':'lr';
  return `<div class="${cls}">${escH(l)}</div>`;
}).join('');$('sortLog').scrollTop=1e9;}catch(e){}setTimeout(()=>{if($('v-act').classList.contains('active'))pollLog()},1500);}

let catLoaded=false,catTimer,catKind='',catReq=0;
// Pagination du catalogue. Le serveur tronquait a 300 et l'interface se
// contentait de dire « affine la recherche pour voir le reste » : un catalogue
// XBLA de 661 titres etait donc inaccessible au-dela du 300e. On charge par
// pages, et le bouton reste FOCALISABLE — donc utilisable a la manette.
let catItems=[],catOffset=0,catTotal=0;
function catPlus(){
  const reste=catTotal-catItems.length;
  if(reste<=0)return '';
  return '<tr><td class="tdfill" colspan="4"><button class="btn accent" onclick="loadCatalog(true)">'
    +T('CHARGER LA SUITE','LOAD MORE')+' — '+reste+' '+T('restant','left')+'</button></td></tr>';
}
function catFilter(k,btn){catKind=k;document.querySelectorAll('.seg-i[data-k]').forEach(b=>b.classList.toggle('on',b===btn));loadCatalog();}
// Trie cote client apres la fusion avec XboxUnity : les titres ajoutes a la
// suite ne respecteraient pas l'ordre demande au serveur. Meme regle que lui —
// les noms de la base commencent souvent par un crochet, qu'on ignore pour le
// tri, sinon la premiere page du catalogue est entierement entre crochets.
const CAT_CLE=s=>String(s).replace(/^[^\p{L}\p{N}]+/u,'').toLowerCase();
const CAT_COL=new Intl.Collator('fr',{numeric:true,sensitivity:'base'});
const CAT_CMP={
  name:(a,b)=>CAT_COL.compare(CAT_CLE(a.name),CAT_CLE(b.name))||CAT_COL.compare(a.name,b.name),
  tid:(a,b)=>String(a.tid).localeCompare(String(b.tid)),
  kind:(a,b)=>String(a.kind).localeCompare(String(b.kind))||CAT_COL.compare(CAT_CLE(a.name),CAT_CLE(b.name))
};
function catRow(c){
  const k=c.unity?'UNITY':c.kind;
  const bc=c.kind==='XBLA'?'god':c.kind==='INDIE'?'wait':c.unity?'con':'ext';
  const ouvrir='openDlModal('+jsA(c.name)+','+jsA(c.tid)+','+jsA(c)+')';
  // Toute la ligne ouvre la recherche de fichiers, comme dans la vue
  // Telechargements : sans cela, cliquer sur un nom de jeu ne faisait RIEN, et
  // seule la colonne TitleID reagissait. La cellule du TitleID et le bouton
  // arretent la propagation, sinon l'action se declenchait deux fois.
  return '<tr tabindex="0" onclick="'+ouvrir+'">'+
    '<td data-l="'+escA(enTete('catBody',0))+'" class="c-game"><span class="v">'+
      '<img class="c-cov" src="/api/cover?tid='+escA(c.tid)+'" loading="lazy" alt="" onerror="this.style.visibility=\'hidden\'">'+
      '<span class="c-nm">'+escH(c.name)+
        (c.owned?' <span class="badge ext">'+T('installé','installed')+'</span>':'')+
        (c.updates?' <span class="badge wait">'+escH(c.updates)+' TU</span>':'')+
      '</span>'+
    '</span></td>'+
    '<td data-l="'+escA(enTete('catBody',1))+'"><span class="v"><span class="badge '+bc+'">'+escH(k)+'</span></span></td>'+
    '<td data-l="'+escA(enTete('catBody',2))+'" class="c-tid" title="'+escA(T('Cliquer pour copier','Click to copy'))+'" onclick="event.stopPropagation();copierTid('+jsA(c.tid)+')"><span class="v">'+escH(c.tid)+'</span></td>'+
    // DEUX ACTIONS PAR LIGNE. « Telecharger » est la porte habituelle (la modale
    // de fichiers) ; VIMM est l'AUTRE SOURCE, celle qu'on va chercher quand le
    // telechargement a echoue ou que le jeu n'est pas sur archive.org. Les deux
    // boutons arretent la propagation : la ligne entiere ouvre deja la modale.
    // Le libelle VIMM est un NOM PROPRE et ne se traduit pas (comme « Vimm's
    // Vault » dans le controle de source) ; l'INFOBULLE, elle, est une phrase, et
    // elle est traduite dans les dictionnaires — un bouton cree en JavaScript
    // echappe au garde-fou d'infobulles, qui ne lit que index.html.
    '<td data-l="'+escA(enTete('catBody',3))+'" class="c-act"><span class="v">'+
      '<button class="btn quiet" onclick="event.stopPropagation();'+ouvrir+'">'+T('Télécharger','Download')+'</button>'+
      '<button class="btn quiet" style="margin-left:8px" title="'+escA(T('Chercher ce jeu sur Vimm\'s Vault','Find this game on Vimm\'s Vault'))+'" onclick="event.stopPropagation();dlAlt('+jsA(c.name)+',\'vimm\')">VIMM</button>'+
    '</span></td>'+
  '</tr>';
}
function copierTid(tid){
  try{navigator.clipboard.writeText(tid);}catch(e){}
  $('catStatus').textContent=T('TitleID copié','TitleID copied')+' : '+tid;
}
async function loadCatalog(suite){
  clearTimeout(catTimer);
  const q=$('catSearch').value.trim();
  const sort=$('catSort').value;
  const req=++catReq;
  if(!suite){catItems=[];catOffset=0;catTotal=0;}
  // Un corps vide pendant la requete se lit comme « aucun resultat » : on montre
  // la forme de ce qui arrive, a l'endroit exact ou cela arrivera.
  // Pour une page SUIVANTE, on ne detruit PAS ce qui est deja a l'ecran : on
  // perdrait la position de lecture pour un simple chargement.
  if(!suite)$('catBody').innerHTML='<tr><td class="tdfill" colspan="4">'+skelRows(8)+'</td></tr>';
  $('catStatus').textContent=suite?T('Chargement de la suite...','Loading more...'):T('Recherche...','Searching...');
  catTimer=setTimeout(async()=>{
    try{
    const r=await api('/api/catalog?q='+encodeURIComponent(q)+'&kind='+catKind+'&sort='+sort+'&offset='+catOffset);
    if(req!==catReq)return;   // une frappe plus recente a deja pris la main
    const items=catItems.concat((r&&r.items)||[]);
    catTotal=(r&&r.total)||items.length;
    // source supplementaire : base de titres XboxUnity (meme source que le store Aurora)
    // Au PREMIER chargement seulement : elle n'est pas paginee.
    if(!suite&&q.length>1){
      try{
        const un=await api('/api/unity?q='+encodeURIComponent(q));
        if(un&&un.length){
          const have=new Set(items.map(c=>c.tid));
          let ajoutes=0;
          for(const t of un){
            if(have.has(t.tid))continue;
            const k=t.type==='XBLA'?'XBLA':t.type==='Homebrew'?'INDIE':t.type==='Xbox1'?'XBOX1':'GOD';
            if(catKind&&k!==catKind)continue;
            // L'ITEM PORTE TOUT CE QUE LA SOURCE PUBLIE : la fiche de gauche de
            // la surcouche s'en sert sans rien redemander (`type` pour « le
            // style », `covers` et `newest` pour l'explication).
            items.push({tid:t.tid,name:t.name,kind:k,unity:true,updates:t.updates,
              type:t.type,covers:t.covers,link:t.link,newest:t.newest});
            ajoutes++;
          }
          if(ajoutes){catTotal+=ajoutes;items.sort(CAT_CMP[sort]||CAT_CMP.name);}
        }
      }catch(e){}
      if(req!==catReq)return;
    }
    // LES SOURCES TIERCES, A COTE DES RESULTATS. Meme requete, autre listes :
    // elles ne sont pas paginees (`catTotal` ne compte que le catalogue) et elles
    // vivent leur propre vie — un echec d'une source tierce ne doit pas empecher
    // la base XboxUnity de s'afficher. Non attendu : la section se remplit quand
    // elle peut, et `tiersChercher` a sa propre generation.
    if(!suite)tiersChercher(q);
    catItems=items;catOffset=items.length;
    if(!items.length){
      $('catBody').innerHTML='<tr><td class="tdfill" colspan="4">'+etatVide({
        icone:'search',
        titre:T('Aucun titre ne correspond','No title matches'),
        aide:T('La base XboxUnity est interrogée en ligne — vérifie l\'orthographe, ou colle le TitleID à 8 caractères du jeu.','The XboxUnity database is queried online — check the spelling, or paste the 8-character TitleID of the game.'),
        bouton:T('Effacer la recherche','Clear the search'),
        act:()=>{$('catSearch').value='';catKind='';document.querySelectorAll('.seg-i[data-k]').forEach(b=>b.classList.toggle('on',!b.dataset.k));loadCatalog();}
      })+'</td></tr>';
    } else {
      $('catBody').innerHTML=items.map(catRow).join('')+catPlus();
    }
    // Le compte dit sur quoi il porte : « 300 affiches » sans referentiel ne
    // permettait pas de distinguer une recherche qui a trouve d'une liste
    // tronquee par le serveur.
    const n=items.length;
    let s=n===0?T('Aucun titre','No title'):n===1?T('1 titre','1 title'):n+T(' titres',' titles');
    if(catTotal>n)s+=T(' sur ',' of ')+catTotal;
    if(catKind)s+=' · '+catKind;
    if(q)s+=' · « '+q+' »';
    // Plus de « affine la recherche » : il y a un bouton, et il charge vraiment.
    if(catTotal>n)s+=' — '+T('la suite se charge avec le bouton','load the rest with the button');
    $('catStatus').textContent=s;
    catLoaded=true; // pose APRES le succes : sinon un echec reseau laissait l'onglet vide a vie
    }catch(e){
      if(req!==catReq)return;
      // Un echec sur une page SUIVANTE ne doit pas effacer ce qui est deja lu.
      if(suite){$('catBody').innerHTML=catItems.map(catRow).join('')+catPlus();$('catStatus').textContent=T('Erreur : ','Error: ')+e.message;return;}
      $('catBody').innerHTML='<tr><td class="tdfill" colspan="4">'+etatVide({icone:'update',titre:T('Catalogue injoignable','Catalog unreachable'),aide:e.message})+'</td></tr>';
      $('catStatus').textContent=T('Erreur : ','Error: ')+e.message;
    }
  },suite?0:200);
}
// ---------- Sources tierces (catalogue) --------------------------------------
// LE CHEMIN QUI MANQUAIT. Le registre de sources existe (`lib/sources.js`,
// `/api/sources`, `/api/sources/search`) et AUCUNE vue ne l'appelait : zero
// occurrence de `api/sources` dans public/. Une source ajoutee etait donc
// joignable par API et INVISIBLE a l'ecran — or le catalogue est exactement
// l'endroit ou l'on cherche un jeu. Cette section montre les sources de nature
// « tiers » (un service externe, ou l'utilisateur reste responsable) A COTE des
// resultats XboxUnity, sans les melanger : deux listes, deux origines.
//
// CE QUI VIENT DE LA SOURCE, ET CE QUI VIENT DE L'INDEX. Le nom affiche est
// celui de la source (un nom propre ne se traduit pas). Sa `description`, elle,
// est ecrite en francais cote serveur : l'afficher telle quelle donnerait du
// francais dans les quatre langues. Ce que la section DIT, c'est l'etat de
// l'index que l'application a ecrit (sa date, son compte, ses echecs) et, sur
// chaque ligne, ce que la source a reellement publie : nom du fichier, taille,
// region, et le type — jeu ou DLC.
//
// CE QU'ELLE AVOUE, ET QUI N'EST PAS DECORATIF : le contenu des `.rar` n'est PAS
// verifie (les titres d'items annoncent XEX / XBLA / GOD, l'extension est `.rar`
// a 100 %, aucun nom ne finit par `.iso`) — on n'ecrit donc jamais que ce sont
// des ISO ; et le telechargement exige un compte archive.org, les items etant
// reserves aux comptes connectes (mesure : un HEAD anonyme rend 302 puis 401).
let TIERS=null, TIERS_ETAT={}, TIERS_REQ=0, TIERS_BUSY=false;

// Les sources tierces annoncees par le serveur. Lu une fois : la liste ne change
// pas sans un redemarrage du serveur, et un aller-retour par frappe serait payer
// la meme reponse a chaque lettre.
async function tiersSources(){
  if(TIERS)return TIERS;
  try{
    const r=await api('/api/sources');
    TIERS=((r&&r.sources)||[]).filter(s=>s&&s.nature==='tiers');
  }catch(e){TIERS=[];}
  return TIERS;
}
// L'etat de l'index local de chaque source (`null` quand la source n'en a pas :
// c'est le cas d'une source qui interroge un service en direct).
async function tiersEtats(srcs){
  await Promise.all(srcs.map(async s=>{
    if(TIERS_ETAT[s.id]!==undefined)return;
    try{TIERS_ETAT[s.id]=(await api('/api/sources/index?id='+encodeURIComponent(s.id)))||{};}
    catch(e){TIERS_ETAT[s.id]={error:e.message};}
  }));
}
const TIERS_IDS=['catTiersH','catTiersBar','catTiersWrap','catTiersNote'];
const tiersMontre=v=>TIERS_IDS.forEach(id=>{const e=$(id);if(e)e.hidden=!v;});

// La date de l'index est ECRITE, pas supposee : le materiel ZTM date de 2022
// (`publicdate` de l'item DLC), donc un instantane presente sans date laisserait
// croire qu'il est du jour.
function tiersTexteIndex(id){
  const r=TIERS_ETAT[id];
  const e=r&&r.index;
  if(!e)return '';
  const d=e.construit?new Date(e.construit).toLocaleString():'';
  let s=(d?T('index du ','index of ')+d+' — ':'')+e.fichiers+T(' releases (',' releases (')+e.jeux+T(' jeux, ',' games, ')+e.dlc+' DLC)';
  if(e.echecs&&e.echecs.length)s+=' · '+e.echecs.length+T(' item(s) illisible(s)',' unreadable item(s)');
  return s;
}
function tiersNote(srcs){
  let s=T('Sources tierces : ','Third-party sources: ')+srcs.map(x=>x.nom).join(' · ')
    +T('. Contenu hébergé par un tiers — tu restes responsable de ce que tu télécharges.','. Content hosted by a third party — you remain responsible for what you download.');
  s+=' '+T('Le contenu des .rar n\'est pas vérifié : les titres annoncent XEX, XBLA ou GOD, et aucun nom ne finit par .iso. L\'application ne peut donc pas dire que ce sont des ISO.','The .rar content is not verified: the titles announce XEX, XBLA or GOD, and no name ends in .iso. The app therefore cannot say these are ISOs.');
  s+=' '+T('Les deux familles sont montrées, et le type est écrit sur chaque ligne.','Both families are shown, and the type is written on each line.');
  if(!hasCookie)s+=' '+T('Télécharger exige un compte archive.org : ces items sont réservés aux comptes connectés.','Downloading requires an archive.org account: these items are reserved for signed-in accounts.');
  return s;
}
async function tiersChercher(q){
  const srcs=await tiersSources();
  // Sous deux caracteres, les catalogues ne sont pas interroges : la section se
  // retire ENTIEREMENT, sinon une liste d'une recherche precedente resterait a
  // l'ecran sous une barre qui ne la decrit plus.
  if(!srcs.length||String(q||'').trim().length<2){tiersMontre(false);return;}
  const gen=++TIERS_REQ;
  tiersMontre(true);
  $('catTiersNote').textContent=tiersNote(srcs);
  $('catTiersEtat').textContent=T('Recherche...','Searching...');
  $('catTiersBody').innerHTML='<tr><td class="tdfill" colspan="5">'+skelRows(2)+'</td></tr>';
  await tiersEtats(srcs);
  if(gen!==TIERS_REQ)return;
  try{
    const r=await api('/api/sources/search?q='+encodeURIComponent(q)+'&sources='+srcs.map(s=>s.id).join(','));
    if(gen!==TIERS_REQ)return;
    const items=(r&&r.resultats)||[], errs=(r&&r.erreurs)||[];
    // L'index voyage avec les resultats : il renseigne l'etat meme quand la route
    // d'index n'existe pas (serveur plus ancien que cette section).
    for(const it of items)if(it.index&&!(TIERS_ETAT[it.source]&&TIERS_ETAT[it.source].index))TIERS_ETAT[it.source]={id:it.source,index:it.index};
    tiersRender(items,errs,srcs);
  }catch(e){
    if(gen!==TIERS_REQ)return;
    $('catTiersBody').innerHTML='<tr><td class="tdfill" colspan="5">'+etatVide({
      icone:'search',titre:T('Sources tierces injoignables','Third-party sources unreachable'),aide:e.message
    })+'</td></tr>';
    $('catTiersEtat').textContent=T('Erreur : ','Error: ')+e.message;
  }
}
function tiersRender(items,errs,srcs){
  const vus=items.slice(0,25);
  $('catTiersBody').innerHTML=vus.length
    ?vus.map(tiersRow).join('')
    :'<tr><td class="tdfill" colspan="5">'+etatVide({
       icone:'search',
       titre:T('Aucun titre tierce ne correspond','No third-party title matches'),
       aide:T('Ces sources lisent leur propre index local — vérifie l\'orthographe, ou rafraîchis l\'index.','These sources read their own local index — check the spelling, or refresh the index.')
     })+'</td></tr>';
  let jeux=0,dlc=0;
  for(const it of items){if(it.type==='dlc')dlc++;else jeux++;}
  let s=(items.length===1?T('1 release','1 release'):items.length+T(' releases',' releases'));
  if(items.length)s+=' — '+jeux+T(' jeux, ',' games, ')+dlc+' DLC';
  if(items.length>vus.length)s+=' · '+T('les ','the first ')+vus.length+T(' premiers',' first');
  // L'etat de CHAQUE source qui a un index local : n'en montrer qu'un seul
  // laisserait croire que toutes les lignes viennent de la meme.
  const et=srcs.map(x=>tiersTexteIndex(x.id)).filter(Boolean).join(' · ');
  if(et)s+=' · '+et;
  if(errs.length)s+=' · '+T('source en echec : ','source failed: ')+errs.map(e=>e.source).join(', ');
  $('catTiersEtat').textContent=s;
}
// Un resultat d'une source tierce. La ligne n'est PAS cliquable : un clic de
// travers lancerait un telechargement de plusieurs Gio. L'action est le bouton,
// et rien d'autre.
function tiersRow(t){
  const dlc=t.type==='dlc';
  // Memes pastilles que le catalogue : la couleur ne distingue que les deux
  // familles (jeu / DLC), elle ne dit rien d'autre.
  const ouvrir='tiersDeposer('+jsA(t.url)+','+jsA(t.titre)+')';
  const act=hasCookie
    ?'<button class="btn quiet" title="'+escA(T('dépose le .rar dans le dossier de dépôt ; le contenu de l\'archive n\'est pas vérifié','drops the .rar into the drop folder; the archive content is not verified'))+'" onclick="event.stopPropagation();'+ouvrir+'">'+T('Déposer','Drop')+'</button>'
    :'<button class="btn quiet" title="'+escA(T('connexion archive.org requise pour télécharger','sign in to archive.org to download'))+'" onclick="event.stopPropagation();cookieHelp()">'+T('CONNEXION','SIGN IN')+'</button>';
  return '<tr>'+
    '<td data-l="'+escA(enTete('catTiersBody',0))+'" class="c-game"><span class="v">'+
      '<span class="c-nm">'+escH(t.titre)+'</span>'+
      ' <span class="badge ext" title="'+escA(T('contenu hébergé par un tiers','content hosted by a third party'))+'">'+T('tiers','third-party')+'</span>'+
    '</span></td>'+
    '<td data-l="'+escA(enTete('catTiersBody',1))+'"><span class="v"><span class="badge '+(dlc?'god':'con')+'">'+(dlc?'DLC':T('JEU','GAME'))+'</span>'+
      (t.detail?' <span class="dim">'+escH(t.detail)+'</span>':'')+'</span></td>'+
    '<td data-l="'+escA(enTete('catTiersBody',2))+'"><span class="v">'+escH(t.region||'—')+'</span></td>'+
    // `t.size` et non le nom francais : la source publie LES DEUX (le contrat de
    // `lib/sources.js` nomme ses champs en francais, l'application lit les siens
    // en anglais — le nom francais de la taille est refuse par le garde-fou des
    // champs du client, qui lit aussi les commentaires).
    '<td data-l="'+escA(enTete('catTiersBody',3))+'"><span class="v">'+fmt(t.size)+'</span></td>'+
    '<td data-l="'+escA(enTete('catTiersBody',4))+'" class="c-act"><span class="v">'+act+'</span></td>'+
  '</tr>';
}
// Le telechargement passe par la file EXISTANTE (`/api/download`), donc par le
// meme pipeline que le reste — mais en DEPOT, jamais en installation : le
// contenu de l'archive n'est pas verifie, on ne peut donc pas annoncer ce que
// l'installation en ferait.
async function tiersDeposer(url,nom){
  if(needCookie(url))return;   // sans compte, la file repondrait 401 : on le dit AVANT
  const r=await post('/api/download',{url,name:nom});
  toast(r&&r.queued?T('En file : ','Queued: ')+nom:T('Erreur : ','Error: ')+((r&&r.error)||''),r&&r.queued?'':'err');
  pollDl();
}
// La reconstruction de l'index est EXPLICITE, et c'est la seule : aucune lecture
// en tache de fond (11 documents d'archive.org ne doivent pas partir tout seuls).
async function tiersRafraichir(){
  const srcs=await tiersSources();
  if(!srcs.length||TIERS_BUSY)return;
  TIERS_BUSY=true;
  const avant=$('catTiersEtat').textContent;
  $('catTiersEtat').textContent=T('Reconstruction de l\'index (archive.org)...','Rebuilding the index (archive.org)...');
  let fait=0,dernier='';
  for(const s of srcs){
    try{
      const r=await post('/api/sources/index/refresh',{id:s.id});
      if(r&&r.index){TIERS_ETAT[s.id]={id:s.id,index:r.index};fait++;}
      else if(r&&r.error)dernier=r.error;
    }catch(e){dernier=e.message;}
  }
  if(fait){
    const e=TIERS_ETAT[srcs[0].id]&&TIERS_ETAT[srcs[0].id].index;
    toast(T('Index reconstruit','Index rebuilt')+(e&&e.construit?T(' le ',' on ')+new Date(e.construit).toLocaleString():''));
    await tiersChercher($('catSearch').value.trim());
  }else{
    $('catTiersEtat').textContent=avant;
    toast(T('Rafraîchissement impossible : ','Refresh failed: ')+(dernier||T('aucune source avec index local','no source with a local index')),'err');
  }
  TIERS_BUSY=false;
}
function goDl(name){go('act');$('dlSearch').value=name;searchStore();}

// ---------- Modal téléchargement (catalogue -> fichiers -> installer) ----------
let dlmGame=null;
// L'ITEM DU CATALOGUE, pas seulement son nom et son TitleID : la fiche de
// gauche montre le style du jeu, ses TU, ses jaquettes publiees et la date du
// dernier contenu, et ces quatre champs sont DEJA dans l'item (`c.type`,
// `c.updates`, `c.covers`, `c.newest`). Les redemander serait une requete pour
// une donnee qu'on tient. `item` reste facultatif : un appel a deux arguments
// (la console, un essai) affiche une fiche plus courte, jamais une erreur.
async function openDlModal(name,tid,item){
  dlmGame={name,tid,item:item||null};
  $('dlmTitle').textContent=name;
  dlmFiche(item||{name:name,tid:tid});
  ouvrirSurcouche($('dlModal'));
  dlmSearch('games');
}
const DL_EXT=['.iso','.7z','.zip','.rar','.god','.xex'];

// ---------- Fiche du jeu (colonne gauche de la surcouche de telechargement) ---
//
// Demande de l'utilisateur, mot pour mot : « dans catalogue cliquer sur un jeu
// ouvre donc la zone pour telecharger mais a gauche la jaquette du jeu avec
// explication et le style du jeu ». Cette colonne EST cette fiche.
//
// ON N'AFFICHE QUE CE QUE L'APPLICATION SAIT DEJA. XboxUnity — la source du
// catalogue — ne publie NI description NI genre : ses champs reels sont TitleID,
// HBTitleID, Name, LinkEnabled, TitleType, Covers, Updates, MediaIDCount,
// UserCount, NewestContent (mesure le 2026-09-20 ; les pages de son site ne
// rendent qu'une coquille ou un 404). Aucune source externe n'est ajoutee, aucun
// champ n'est saisi a la main, et la ligne « Genre » dit simplement que la
// source ne le publie pas — c'est la reponse a « le style », sans rien inventer.
//
// L'ITEM DU CATALOGUE SUFFIT. `catRow` le passe a `openDlModal`, donc `type`,
// `updates`, `covers` et `newest` ne demandent AUCUNE requete supplementaire :
// ils sont deja dans la reponse `/api/unity` qui a servi a afficher la ligne.
// La seule requete de la fiche est celle de l'etat dans la bibliotheque, et elle
// est payee une fois par ouverture de jeu.
const FICHE_TYPE={360:'Xbox 360',GOD:'Xbox 360',XBLA:'XBLA',Xbox1:'Xbox 1',INDIE:'Indie',Homebrew:'Homebrew'};
// LE DISQUE SE LIT DANS LE CHEMIN, qui est la seule chose que le scan rend :
// « H:\Games\4D5307E6 » -> « H: ». Un chemin sans lettre de lecteur (Linux) ne
// rend rien, et la ligne dit alors seulement le format et la taille.
function disqueDe(p){const m=/^([A-Za-z]):[\\/]/.exec(String(p||''));return m?m[1].toUpperCase()+':':'';}
// LE TITRE EST LA CLEF, PAS LE DISQUE. Un jeu installe sur un AUTRE disque que
// celui du selecteur est dans la bibliotheque : c'est tout l'objet de cette
// ligne. La comparaison est insensible a la casse — le TitleID arrive tantot en
// majuscules (le scan) tantot en minuscules (XboxUnity) — et un « - » ne designe
// aucun jeu : il ne doit jamais repondre oui.
function ficheBiblio(liste,tid){
  const t=String(tid||'').toUpperCase();
  if(!t||t==='-'||!Array.isArray(liste))return null;
  return liste.find(g=>g&&String(g.tid||'').toUpperCase()===t)||null;
}
// Les lignes de la fiche, dans l'ordre. PURE : ni DOM ni reseau, donc ses quatre
// etats (attente, trouve, absent, panne) se mesurent sans navigateur.
function ficheLignes(c,biblio){
  // `c.format` : LES ENTREES DE LA BIBLIOTHEQUE. Le scan des disques ne rend pas de
  // `type` (c'est un champ du catalogue XboxUnity) : il rend un `format`, et c'est
  // le meme mot — `FICHE_TYPE` porte deja `Xbox1`, `GOD`, `XBLA`. Sans ce troisieme
  // terme, une entree de la bibliotheque presentee a la fiche n'aurait AUCUN type,
  // et il faudrait inventer une deuxieme table pour le meme vocabulaire. On ne prend
  // ce `format` que s'il est un type CONNU : « Extrait » ou « A trier » disent
  // comment le jeu est range, pas ce qu'il est, et les afficher comme un type
  // serait une information fausse.
  const o=[],t=c.type||c.kind||(FICHE_TYPE[c.format]?c.format:'');
  if(t)o.push({k:T('Type','Type'),v:FICHE_TYPE[t]||String(t)});
  if(c.tid)o.push({k:T('TitleID','TitleID'),v:String(c.tid),tid:true});
  // `typeof === 'number'` et pas « truthy » : zero mise a jour et zero jaquette
  // publiee SONT une information. Un `if(c.updates)` les tairait.
  if(typeof c.updates==='number')o.push({k:T('Mises à jour','Title updates'),v:String(c.updates)});
  if(typeof c.covers==='number')o.push({k:T('Jaquettes cataloguées','Catalogued covers'),v:String(c.covers)});
  if(c.newest)o.push({k:T('Dernier contenu','Latest content'),v:String(c.newest)});
  const b=biblio||{etat:'attente'},l={k:T('Dans ta bibliothèque','In your library')};
  if(b.etat==='trouve'&&b.jeu){
    const g=b.jeu;
    l.v=[disqueDe(g.path),g.format,fmt(g.size||0)].filter(Boolean).join(' · ');
    if(g.path)l.sub=String(g.path);
  }else if(b.etat==='absent'){
    l.v=T('aucun jeu installé ne porte ce TitleID','no installed game carries this TitleID');
  }else if(b.etat==='panne'){
    l.v=T('Bibliothèque injoignable','Library unreachable');
  }else{
    l.v='…';   // en cours : ni un oui, ni un non, et jamais laisse tel quel
  }
  o.push(l);
  // COMBIEN DE GALETTES SONT INSTALLEES, ET SUR COMBIEN.
  //
  // Sans cette ligne, un jeu dont on n'a que le Disc 1 s'affichait « installé » —
  // la moitie du jeu presentee comme le jeu entier, et c'est exactement le genre
  // de phrase fausse que ce projet refuse. Le nombre installe vient du DISQUE
  // (`discs`, compte des paquets GOD ranges sous le <TID>), le total de la
  // SOURCE : quand celle-ci ne le dit pas, on ecrit ce qu'on sait et on dit
  // qu'on ne sait pas le reste — jamais un « sur 2 » invente.
  // RIEN pour une seule galette : « 1 disque sur 1 » serait du bruit.
  const gal=resumeBiblio(b.jeu,b.src);
  if(gal)o.push({k:T('Disques','Discs'),v:gal,acc:true});
  o.push({k:T('Genre','Genre'),v:T('non publié par la source','not published by the source')});
  return o;
}
function ficheHtml(c,biblio){
  const nom=String(c.name||'');
  // LA BOITE DE LA JAQUETTE EXISTE MEME SANS IMAGE (`fiche-cov` a une largeur et
  // une hauteur fixes) : c'est elle qui empeche le trou quand la route ne rend
  // rien, et `covErr` y pose un bloc visible. Sans TitleID on ne demande AUCUNE
  // image : un 404 par ligne n'est pas une facon de dire « je ne sais pas ».
  const cov=c.tid
    ?'<span class="fiche-cov"><img class="fiche-img" src="/api/cover?tid='+escA(c.tid)+'" alt="" loading="lazy" onerror="covErr(this,'+jsA((nom[0]||'?').toUpperCase())+')"></span>'
    :'<span class="fiche-cov"></span>';
  // `l.acc` : la ligne compte les GALETTES installees. C'est l'information qui
  // corrige un « installe » faux, elle doit se lire au premier regard — d'ou la
  // classe d'accent, deja definie pour cela.
  return '<div class="fiche-tete">'+cov+'<span class="fiche-nm">'+escH(nom)+'</span></div>'+
    ficheLignes(c,biblio).map(l=>'<div class="fiche-r'+(l.acc?' acc':'')+'"><span class="fiche-k">'+escH(l.k)+'</span>'+
      (l.tid
        ?'<button class="fiche-tid" onclick="copierTidFiche('+jsA(l.v)+')">'+escH(l.v)+'</button>'
        :'<span class="fiche-v">'+escH(l.v)+'</span>')+
      (l.sub?'<span class="fiche-sub">'+escH(l.sub)+'</span>':'')+
      '</div>').join('');
}
// Le compte rendu de la copie ne peut pas aller dans le catalogue : la surcouche
// le CACHE. On rejoue donc `copierTid` (le meme geste, le meme libelle, le meme
// presse-papiers) et on ecrit le compte rendu la ou l'on regarde.
function copierTidFiche(tid){
  copierTid(tid);
  const s=$('dlmStatus');
  if(s)s.textContent=T('TitleID copié','TitleID copied')+' : '+tid;
}
// LA FICHE SE RELIT DANS L'ORDRE DES REPONSES. Le jeu A puis le jeu B, et la
// reponse de A qui arrive APRES celle de B reecrirait la fiche de B — le meme
// defaut que la table RESULTATS a deja paye. Le numero de la demande fait foi.
let dlmFicheReq=0;
// CE QUE LA SOURCE A DIT DU NOMBRE DE GALETTES, garde par id de jeu.
//
// La seule source qui le dit est la page de medias de Vimm (`/api/vimmfiles`),
// et elle n'est lue qu'au clic sur un resultat — donc APRES la fiche. Plutot que
// de la relire (une requete, et une page qui peut mettre 30 s derriere
// Cloudflare), on retient le total par id : la fiche redemandee pour le meme jeu
// affiche alors le bon compte.
//
// Un id ABSENT de la table veut dire « on ne sait pas » — jamais « une seule
// galette ». C'est la difference entre « 2 disques installes » et « 2 disques
// installes — le nombre total n'est pas connu de cette source ».
const GALETTES_SRC={};
function noterGalettes(id,liste){
  const k=String(id||'');
  if(!k)return;
  GALETTES_SRC[k]=resumeDisques(liste);
}
// Le total connu pour un jeu du catalogue, ou null.
function galettesDe(c){
  if(!c)return null;
  const k=String(c.id||'');
  return k&&GALETTES_SRC[k]?GALETTES_SRC[k]:null;
}
async function dlmFiche(c){
  const zone=$('dlmFiche');
  if(!c||!zone)return;
  const req=++dlmFicheReq;
  // L'ASSISTANT N'EST PAS DANS CE BLOC, ET LE BANC DE TEST NON PLUS. Ce bloc est
  // evalue HORS NAVIGATEUR par `test/fiche-catalogue.test.js`, avec des doublures
  // qui ne connaissent que les fonctions d'ici : appeler `iaOrnerFiche` sans ce
  // test de type y leverait une `ReferenceError`, et les tests de la fiche
  // tomberaient pour une raison qui n'a rien a voir avec ce qu'ils mesurent. Le
  // bouton IA et la description sont donc un ORNEMENT de la fiche, jamais une
  // dependance — la fiche marche sans l'assistant, et c'est l'etat d'avant.
  const orner=()=>{if(typeof iaOrnerFiche==='function')iaOrnerFiche(c,zone);};
  zone.innerHTML=ficheHtml(c,null);          // tout de suite : jaquette et fiche
  // IL EST REPOSE APRES CHAQUE ECRITURE : `innerHTML` efface les enfants, et un
  // seul appel laisserait la fiche sans bouton des que la reponse de la
  // bibliotheque arrive.
  orner();
  try{
    // SANS `drive` : `/api/games` rend alors `scanDriveCached()`, la bibliotheque
    // ENTIERE, cachee cote serveur. Le tableau `games` du client ne couvrirait
    // que le disque affiche par le selecteur, et la phrase serait fausse des
    // qu'un jeu est installe sur l'autre disque.
    const jeu=ficheBiblio(await api('/api/games'),c.tid);
    if(req!==dlmFicheReq)return;             // une autre fiche a pris la main
    zone.innerHTML=ficheHtml(c,{etat:jeu?'trouve':'absent',jeu:jeu,src:galettesDe(c)});
  }catch(e){
    if(req!==dlmFicheReq)return;
    zone.innerHTML=ficheHtml(c,{etat:'panne'});
  }
  orner();
}

// ---------- Pertinence ------------------------------------------------------
// « on ne doit pas partir dans du n'importe quoi ». Une seule fonction note
// chaque resultat contre la recherche, et elle est utilisee PARTOUT : catalogue
// -> sources, fichiers, DLC, partage de fichiers. Trois regles :
//
//  1. MOTS ENTIERS. Le scoreur precedent cherchait en sous-chaine : « halo »
//     trouvait « Dragon Age: Nachalo ». Il jetait aussi tout mot de moins de
//     trois lettres, donc « Halo 3 » et « Halo 4 » obtenaient le meme score.
//  2. TOUS LES MOTS valent mieux qu'une partie ; dans l'ordre, mieux que
//     disperses ; et un titre qui COMMENCE par la recherche est le meilleur cas.
//  3. Un titre COURT est plus proche de la recherche qu'un titre long : pour
//     « halo », « Halo » doit passer avant « Halo 3 Limited Edition Bonus Disc ».
//
// Le score n'est pas une note absolue : seul son SIGNE decide si le resultat est
// montre. Zero ou moins = hors sujet, et il reste cache.
const MOTS_VIDES=new Set([
  'the','of','and','for','with','from','edition','version','complete','game',
  'le','la','les','des','du','une','aux','pour','avec','jeu','dans','sur',
]);
// Signaux de qualite, cherches dans le nom ET dans la collection d'origine :
// les vrais fichiers s'appellent souvent « Disc 1.rar » et ne se distinguent que
// par la source.
const BONUS_CTX=/xbox|360|\b(usa|europe|pal|ntsc|world|japan|asia|redump)\b/i;
// Categories qui ne sont JAMAIS le jeu qu'on cherche a installer : une bande-son,
// un artbook ou un disque de demo ne se rangent pas dans Games. On les ECARTE au
// lieu de les classer dernier — un malus de quelques points ne suffisait pas, une
// correspondance de nom forte les faisait remonter.
const JAMAIS_LE_JEU=/(redump\.info|audio\s*cd|soundtrack|artbook|press\s*kit|trailer|making\s*of)|\bost\b|\(\s*part\s*\d+\s*\)/i;
// Ceux-la sont ambigus : « collection » est dans « The Master Chief Collection »,
// qui est un vrai jeu. On penalise sans exclure, sinon on jette de vrais
// resultats.
const MALUS_CTX=/\b(collection|compendium|anthology|bundle|demo)\b/i;
const motsDe=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean);
function relScore(nom,q){
  const mt=motsDe(nom);
  const cible=' '+mt.join(' ')+' ';
  if(!mt.length)return 0;
  // Si la recherche n'est faite QUE de mots vides (« xbox 360 »), on les garde :
  // mieux vaut une recherche large qu'une recherche qui ne trouve rien.
  const utiles=motsDe(q).filter(t=>!MOTS_VIDES.has(t));
  const mots=utiles.length?utiles:motsDe(q);
  if(!mots.length)return 0;
  let trouves=0,score=0;
  for(const t of mots) if(cible.includes(' '+t+' ')){trouves++;score+=t.length>=4?3:(t.length>=2?2:1);}
  if(!trouves)return 0;
  if(trouves===mots.length){
    score+=4;
    if(cible.includes(' '+mots.join(' ')+' '))score+=4;
    if(mt[0]===mots[0])score+=2;
  }
  return score+Math.max(0,6-mt.length);
}
// Note finale : la proximite du titre, puis les signaux de qualite. Un resultat
// hors sujet ne peut pas etre sauve par un bonus — on ne veut pas d'un mauvais
// resultat simplement parce qu'il parle de Xbox 360.
function noteResultat(nom,q,contexte){
  const s=relScore(nom,q);
  if(s<=0)return 0;
  const ctx=contexte||nom;
  if(JAMAIS_LE_JEU.test(ctx))return 0;
  return s+(BONUS_CTX.test(ctx)?2:0)-(MALUS_CTX.test(ctx)?4:0);
}
// Une liste n'est montree que si elle a des resultats pertinents. `tout` est un
// choix EXPLICITE de l'utilisateur : par defaut on ne devine pas, on n'affiche
// pas de bruit.
const garderPertinents=(liste,tout)=>tout?liste:liste.filter(x=>x._s>0);
function classerPertinence(liste,q,nomDe,ctxDe){
  liste.forEach(x=>{x._s=noteResultat(nomDe(x),q,ctxDe?ctxDe(x):nomDe(x));});
  liste.sort((a,b)=>b._s-a._s);
  return liste;
}
// Le nom du jeu, sans « Disc 2 » ni « (Europe) » : c'est ce qu'on cherche.
function gameQuery(){return (dlmGame?dlmGame.name:'').replace(/\s*Disc\s*\d/ig,'').replace(/:.*$/,'').replace(/\(.*?\)/g,'').trim();}
let dlmAll=[];
// `dlmListe(montre)` : la modale s'ouvrait sur un cadre vide pendant la
// recherche, et restait vide sans rien dire quand le titre n'existe nulle part.
function dlmListe(montre){
  $('dlmSec1').style.display=montre?'':'none';
  $('dlmT1').style.display=montre?'':'none';
}
async function dlmSearch(kind){
  if(!dlmGame)return;
  document.querySelectorAll('.seg-i[data-dlm]').forEach(b=>b.classList.toggle('on',b.dataset.dlm===kind));
  $('dlmT2').style.display='none';$('dlmSec2').style.display='none';
  const q=gameQuery();
  $('dlmStatus').textContent=T('Recherche : ','Searching: ')+q+' ...';
  dlmListe(true);
  $('dlmResults').innerHTML='<tr><td class="tdfill" colspan="3">'+skelRows(5)+'</td></tr>';
  $('dlmFiles').innerHTML='';
  if(kind==='games'){
    const [r,files]=await Promise.all([api('/api/search?q='+encodeURIComponent(q)),api('/api/searchfiles?q='+encodeURIComponent(q)+'&tid='+(dlmGame.tid||''))]);
    $('dlmResults').innerHTML='';
    if(r&&r.length){
      classerPertinence(r,q,it=>it.title,it=>it.title+' '+it.id);
      const good=r.filter(it=>it._s>0);
      $('dlmResults').innerHTML=(good.length?good:[]).slice(0,8).map(it=>`<tr tabindex="0" onclick="dlmFiles(${jsA(it.id)})"><td data-l="${escA(enTete('dlmResults',0))}"><span class="v">${escH(it.title)}</span></td><td data-l="${escA(enTete('dlmResults',1))}" style="color:var(--text-3);width:90px"><span class="v">${fmt(it.size)}</span></td><td data-l="${escA(enTete('dlmResults',2))}" style="color:var(--text-3);width:90px"><span class="v">archive.org</span></td></tr>`).join('');
    }
    if(files&&files.length){
      // Le nom de la SOURCE compte autant que celui du fichier : les vrais dumps
      // s'appellent souvent « Disc 1.rar » et ne se distinguent que par la ou
      // l'item les range. Un fichier dont le TitleID correspond est un indice
      // fort, et un fichier hors sujet n'est jamais montre.
      classerPertinence(files,q,f=>f.name,f=>f.name+' '+(f.src||''));
      files.forEach(f=>{if(f.tidHit)f._s+=6;});
      files.sort((a,b)=>b._s-a._s||b.size-a.size);
      dlmAll=files;renderDlmFiles(false);
      const rel=files.filter(f=>f._s>0);
      $('dlmStatus').innerHTML=rel.length
        ? rel.length+T(' fichier(s) pertinent(s) sur ',' relevant file(s) across ')+(r?Math.min(Math.max(r.filter(x=>x._s>0).length,0),8):0)+T(' source(s) — clic sur une source = ses fichiers seuls',' source(s) — click a source to list its files only')
          +(files.length>rel.length?` — <span class="infoc ptr" onclick="renderDlmFiles(true)">${T('voir les','show all')} ${files.length}</span>`:'')
        : files.length+T(' fichier(s) — aucun ne correspond au titre',' file(s) — none matches the title')
          +` — <span class="infoc ptr" onclick="renderDlmFiles(true)">${T('les voir quand meme','show them anyway')}</span>`;
    } else {
      dlmListe(false);
      $('dlmResults').innerHTML='<tr><td class="tdfill" colspan="3">'+etatVide({
        icone:'search',
        titre:T('Aucune source pour ce titre','No source for this title'),
        aide:T('Ni archive.org ni les collections Xbox 360 ne proposent ce jeu. Essaie le DLC/XBLA, ou cherche le titre exact dans Téléchargements.','Neither archive.org nor the Xbox 360 collections offer this game. Try DLC/XBLA, or search the exact title in Downloads.')
      })+'</td></tr>';
      dlmListe(true);
      $('dlmStatus').textContent=T('Aucun fichier téléchargeable trouvé','No downloadable file found');
    }
  } else {
    // Nom COMPLET, pas gameQuery() : tronquer au « : » elargissait la recherche a
    // toute la serie (Brotherhood -> « Assassin's Creed »).
    const files=await api('/api/dlc?q='+encodeURIComponent(dlmGame.name)+'&tid='+(dlmGame.tid||''));
    $('dlmResults').innerHTML='';
    if(!files||files.error||!files.length){
      dlmListe(true);
      $('dlmResults').innerHTML='<tr><td class="tdfill" colspan="3">'+etatVide({
        icone:'plus-box',
        titre:T('Aucun pack DLC/XBLA','No DLC/XBLA pack'),
        aide:(files&&files.error)?files.error
          :T('Soit ce jeu n\'a pas de DLC, soit les packs existants appartiennent à d\'autres jeux et sont écartés. Les collections archive.org sont aussi parfois restreintes : un compte est alors nécessaire pour les lister.','Either this game has no DLC, or the matching packs belong to other games and are filtered out. archive.org collections are also sometimes restricted: an account is then required to list them.'),
        bouton:hasCookie?'':T('Voir comment se connecter','See how to sign in'),
        act:()=>cookieHelp()
      })+'</td></tr>';
      $('dlmStatus').textContent=(files&&files.error)?files.error:T('Aucun pack DLC/XBLA pour','No DLC/XBLA pack for')+' "'+q+'"';
      return;
    }
    dlmListe(false);
    classerPertinence(files,q,f=>f.name,f=>f.name+' '+(f.src||'')+' '+(f.col||''));
    dlmAll=files;renderDlmFiles(false,'dlc');
  }
}
async function dlmFiles(id){
  $('dlmStatus').textContent=T('Lecture des fichiers...','Reading files...');
  $('dlmSec2').style.display='';$('dlmT2').style.display='';
  $('dlmFiles').innerHTML='<tr><td class="tdfill" colspan="5">'+skelRows(5)+'</td></tr>';
  const r=await api('/api/item?id='+encodeURIComponent(id));
  if(!r||r.error||!r.length){
    $('dlmFiles').innerHTML='<tr><td class="tdfill" colspan="5">'+etatVide({
      icone:'box',
      titre:T('Aucun fichier téléchargeable','No downloadable file'),
      aide:T('Cet item archive.org ne contient aucune archive reconnue (.iso, .7z, .zip, .rar, .god).','This archive.org item holds no recognised archive (.iso, .7z, .zip, .rar, .god).')
    })+'</td></tr>';
    $('dlmStatus').textContent=T('Aucun fichier téléchargeable','No downloadable file');
    return;
  }
  const good=r.filter(f=>DL_EXT.includes('.'+f.name.split('.').pop().toLowerCase()));
  const pool=good.length?good:r;
  classerPertinence(pool,gameQuery(),f=>f.name,f=>f.name+' '+(f.src||''));
  dlmAll=pool;renderDlmFiles(false,'archive.org');
}
function renderDlmFiles(all,src){
  // Par defaut, SEULEMENT ce qui est pertinent. Le repli precedent montrait tout
  // des qu'aucun fichier ne marquait de points — c'est exactement « partir dans du
  // n'importe quoi ». On le dit, et on laisse l'utilisateur demander a voir.
  const rel=dlmAll.filter(f=>f._s>0);
  const list=all?dlmAll:rel.slice(0,15);
  $('dlmSec2').style.display='';$('dlmT2').style.display='';
  if(!list.length){
    $('dlmFiles').innerHTML='<tr><td class="tdfill" colspan="5">'+etatVide({
      icone:'search',
      titre:T('Aucun fichier ne correspond','No file matches'),
      aide:T('Cet item contient des fichiers, mais aucun ne porte le nom du jeu. Les sources generiques (collections, bandes-son, disques de demo) sont ecartees.','This item holds files, but none carries the game name. Generic sources (collections, soundtracks, demo discs) are filtered out.'),
      bouton:T('Voir les','Show all ')+dlmAll.length+T(' fichiers quand meme',' files anyway'),
      act:()=>renderDlmFiles(true,src||'')
    })+'</td></tr>';
    return;
  }
  // groupement : meme base de nom hors region/disque -> une ligne repliable
  const norm=n=>n.toLowerCase().replace(/\.(iso|zip|rar|7z|god|xex)$/i,'').replace(/[\(\[][^\)\]]*[\)\]]/g,'').replace(/\b(disc|disk|cd|dvd)\s*\d*/ig,'').replace(/[_.]+/g,' ').replace(/\s+/g,' ').trim();
  const groups={},order=[];
  list.forEach(f=>{const k=norm(f.name);if(!groups[k]){groups[k]=[];order.push(k);}groups[k].push(f);});
  let html='';
  order.forEach((k,gi)=>{
    const g=groups[k];
    if(g.length===1){html+=dlmFileRow(g[0].name,g[0].size,g[0].url,g[0].col||src||'archive.org',g[0].src);return;}
    const regs=[...new Set(g.map(f=>{const m=f.name.match(/[\(\[]([^\)\]]+)[\)\]]/);return m?m[1]:null;}).filter(Boolean))];
    const tot=g.reduce((s,f)=>s+(f.size||0),0);
    const gid='dlg'+gi;
    const base=g[0].name.replace(/\.(iso|zip|rar|7z|god|xex)$/i,'').replace(/[\(\[][^\)\]]*[\)\]]/g,'').trim();
    html+=`<tr tabindex="0" style="cursor:pointer" onclick="document.querySelectorAll('.${gid}').forEach(e=>e.style.display=e.style.display==='none'?'':'none')"><td data-l="${escA(enTete('dlmFiles',0))}" class="cap"><span class="v"><b>${escH(base)}</b> <span class="dim cap">×${g.length}</span> ${regs.map(r=>`<span class="badge">${escH(r)}</span>`).join(' ')}</span></td><td data-l="${escA(enTete('dlmFiles',1))}"><span class="v"><span class="badge god">PACK</span></span></td><td data-l="${escA(enTete('dlmFiles',2))}" class="dim"><span class="v">${fmt(tot)}</span></td><td data-l="${escA(enTete('dlmFiles',3))}" class="dim cap"><span class="v">${T('clic = variantes','click = variants')}</span></td><td data-l="${escA(enTete('dlmFiles',4))}" class="dim cap"><span class="v">—</span></td></tr>`
      +g.map(f=>dlmFileRow(f.name,f.size,f.url,f.col||src||'archive.org',f.src).replace('<tr>',`<tr class="${gid}" style="display:none">`)).join('');
  });
  $('dlmFiles').innerHTML=html;
  const hidden=dlmAll.length-list.length;
  $('dlmStatus').innerHTML=list.length+T(' fichier(s) pertinent(s)',' relevant file(s)')
    +(hidden>0?` — <span class="infoc ptr" onclick="renderDlmFiles(true,'${src||''}')">${T('voir les','show all')} ${dlmAll.length} (${hidden} ${T('hors sujet','unrelated')})</span>`:'')
    +(src==='dlc'&&!hasCookie?` — <span class="warnc ptr link" onclick="cookieHelp()">${T('compte archive.org requis : TUTO','archive.org account required: HOW-TO')}</span>`:'');
}
// ---------- Disques ---------------------------------------------------------
// COMBIEN DE GALETTES A UN JEU, ET LESQUELLES SONT LA.
//
// L'utilisateur l'a demande en une phrase : « il y a des jeux avec deux disques
// quelque fois ». Le vault dit le disque DANS LE NOM DU FICHIER — le nom reel de
// Castlevania: Lords of Shadow est
// « Castlevania - Lords of Shadow (USA, Europe) (En,Fr,De,Es,It) (Disc 1).iso » —
// donc le disque se lit AVANT tout telechargement, sans rien deviner.
//
// CE QUI EST INTERDIT ICI : inventer un total. Le niveau « resultat de
// recherche » ne porte AUCUNE information de disque (mesure : « Castlevania:
// Lords of Shadow » y apparait DEUX FOIS, mais ce sont deux REGIONS ; les deux
// galettes vivent au niveau des medias, sous le meme id de jeu). Un total ne
// s'ecrit donc que si la SOURCE l'a dit — sinon on dit ce qu'on sait, et on dit
// qu'on ne sait pas le reste.
//
// ET LE BRUIT EST UN DEFAUT : un jeu a une seule galette n'affiche RIEN de plus
// qu'avant. « 1 disque sur 1 » sur les 41 jeux d'une bibliotheque ne serait pas
// une information, seulement une ligne de plus a lire.
//
// Le motif est celui de `lib/pkg.js` (terrain serveur, ou il decide des
// doublons et du refus d'ecraser une galette) : les deux sont epingles l'un a
// l'autre par `test/disques.test.js`, parce que deux copies d'une meme intention
// divergent toujours.
const MOTIF_GALETTE=/\b(?:disc|disk|dvd|disque|cd)\s*[-_.]?\s*([0-9])\b/i;
// Numero de galette porte par un nom, 0 s'il n'en porte aucun.
function disqueDuNom(nom){
  const m=MOTIF_GALETTE.exec(String(nom==null?'':nom));
  return m?Number(m[1]):0;
}
// Ce qui n'est PAS une galette : l'addon qui accompagne un jeu sans en etre une
// partie (le disque bonus d'une edition collector n'est pas le disque 2 du jeu).
const GALETTE_EXCLUE=/\b(addon|bonus|extra|soundtrack|artbook)\b/i;
const estGalette=n=>!GALETTE_EXCLUE.test(String(n||''));

// Les numeros de galette que la source annonce, tries. VIDE quand elle ne dit
// rien : c'est ce vide qui interdit d'ecrire « sur N ».
function disquesDisponibles(liste){
  const nums=new Set();
  for(const m of (Array.isArray(liste)?liste:[])){
    if(!m||m.alt)continue;                      // variante du meme media
    const nom=m.file||m.name||'';
    const n=disqueDuNom(nom);
    if(n&&estGalette(nom))nums.add(n);
  }
  return [...nums].sort((a,b)=>a-b);
}

// Le resume d'une liste de medias. `url` est l'adresse de la ligne courante :
// c'est elle qui rend une galette manquante PRENABLE en un clic.
function resumeDisques(liste,url){
  const l=[];
  for(const m of (Array.isArray(liste)?liste:[])){
    const nom=m&&(m.file||m.name)||'';
    const n=disqueDuNom(nom);
    if(!n||!estGalette(nom))continue;
    l.push({n,alt:m.alt||0,url:m.url||url||'',nom});
  }
  const dispo=[...new Set(l.map(x=>x.n))].sort((a,b)=>a-b);
  const parNum={};
  for(const x of l)if(!x.alt)parNum[x.n]=x;
  // Le nombre total de galettes que la SOURCE annonce. 0 = elle ne le dit pas.
  // On ne prend pas le plus grand numero vu comme un total : les galettes
  // manquantes sont celles qui n'ont pas de ligne, pas celles d'un trou.
  const total=dispo.length>=2?Math.max(...dispo):0;
  // LES GALETTES QU'ON PEUT PRENDRE ICI. Le nom porte « manquants » parce que le
  // cas qui compte est celui du disque 2 a prendre, mais le contenu est la liste
  // des galettes PRESENTES A LA SOURCE : c'est elle qui devient un bouton par
  // galette, et « il en manque une » ne dirait pas laquelle.
  return {total,dispo,parNum,manquantsNums:dispo.slice(),
    // Une seule galette au catalogue : le seul cas ou l'on sait que le jeu
    // n'en a qu'une. `total` reste 0 (la source ne l'a pas DIT) — c'est
    // `manquantsNums` vide qui porte « il ne manque rien ».
    solo:l.length===1?l[0]:null};
}

// La ligne de la LISTE DES FICHIERS. Rien a dire pour une seule galette.
//
// LA PHRASE EST ENTIERE, jamais recollee de morceaux : « sur 2 » et « le disque
// suivant de » ne se traduisent pas separement — l'ordre des mots et l'accord
// changent d'une langue a l'autre, et un fragment traduit mot a mot donne une
// phrase que personne n'ecrirait.
function ligneDisques(r){
  if(!r||!r.total||r.total<2)return null;
  const nums=l=>(l&&l.length?l.join(', '):'—');
  const total=nT(r.total,T('disque au catalogue','disc in the catalog'),T('disques au catalogue','discs in the catalog'));
  const presents=nT(r.dispo.length,T('présent','present'),T('présents','present'))+' ('+nums(r.dispo)+')';
  const manque=r.manquantsNums&&r.manquantsNums.length
    ?nT(r.manquantsNums.length,T('manquant','missing'),T('manquants','missing'))+' ('+nums(r.manquantsNums)+')'
    :T('aucun manquant','none missing');
  return {txt:total+' — '+presents+' — '+manque,dispo:r.dispo,manquantsNums:r.manquantsNums||[]};
}

// Le nom d'une galette tel qu'on l'ecrit : « Disque 2 ».
const nomGalette=n=>T('Disque ','Disc ')+n;
// L'accord du compte de galettes : « 1 disque », « 2 disques », « 1 disc »,
// « 2 discs ». Les deux mots sont des CHAINES ENTIERES (une par nombre) : le
// pluriel anglais comme le genre espagnol ne se devinent pas a partir du
// singulier.
function nT(n,s,p){return n+' '+(n>1?p:s);}
// LE COMPTE DE GALETTES INSTALLEES, tel qu'il s'ecrit sur la FICHE DU JEU.
// `jeu.discs` vient du DISQUE (les paquets GOD ranges sous le <TID>), `src.total`
// de la SOURCE. Les deux sont necessaires : sans le second on inventerait un
// total, sans le premier on ne saurait pas ce qui est la.
function resumeBiblio(jeu,src){
  const n=Number(jeu&&jeu.discs)||0;
  if(n<1)return null;
  const total=Number(src&&src.total)||0;
  // UNE SEULE GALETTE : rien a dire. C'est la regle qui protege du bruit.
  if(n<2&&total<2)return null;
  // L'ADJECTIF S'ACCORDE AVEC CE QUI EST INSTALLE, pas avec le total : « 1 disque
  // sur 2 installe » est la phrase francaise juste — c'est le disque installe qui
  // est qualifie. Accorder avec le total donnait « 1 disque sur 2 installes ».
  const installe=nT(n,T('disque installé','disc installed'),T('disques installés','discs installed'));
  if(!total)return installe+T(' — le nombre total n\'est pas connu de cette source',
    ' — this source does not say how many there are in total');
  return installe+' '+T('sur ','of ')+total;
}
// ---------- Fin disques -----------------------------------------------------

// ---------- Assistant : choix d indice (fonction PURE, testee) ----------
// Le modele rend un INDICE dans la liste des conseils que l application a
// elle-meme produite (window._adv), jamais un objet d action. C est ce qui rend
// l injection inoffensive : meme un nom de fichier hostile ne peut produire
// qu une PROPOSITION, et elle sera confirmee par l utilisateur.
//
// L abstention est le DEFAUT, pas une decision du modele : mesure du
// 2026-09-20, il a rendu "verifier" a une question purement informative alors
// que "aucun" figurait dans les valeurs permises.
function iDeChoix(choix, n) {
  if (!n || n < 1) return null;
  const s = String(choix == null ? '' : choix).trim();
  if (s === 'aucun' || s === '') return null;
  if (!/^\d+$/.test(s)) return null;      // ni decimal, ni texte, ni code
  const i = parseInt(s, 10);
  return i >= 0 && i < n ? i : null;      // hors bornes : refuse, jamais ramene
}
// ---------- fin choix d indice ----------
// ---------- Surveillance des supports ---------------------------------------
// Brancher un disque doit suffire. La detection se fait cote SERVEUR — c'est lui
// qui voit les lettres apparaitre et qui sait lire ce qu'un disque contient. Ici
// on ne fait que demander « quoi de neuf depuis mon dernier passage ? », toutes
// les quatre secondes, et reagir.
let evDernier=0,evTimer=null,volumesAuto=[];
async function pollEvents(){
  let s;
  try{s=await api('/api/events?depuis='+evDernier);}catch{clearTimeout(evTimer);evTimer=setTimeout(pollEvents,8000);return;}
  evDernier=s.dernier||0;
  volumesAuto=(s.auto||[]).slice();
  for(const e of (s.evenements||[])){
    // LES TYPES DE FICHIERS ARRIVENT APRES COUP (PowerShell, quelques secondes).
    // La premiere reponse de /api/drives rendait `fs: ""` pour tous les disques :
    // donc AUCUN avertissement FAT32, et le client ne rechargeait jamais. On relit
    // les disques des que le serveur sait — et la bibliotheque avec, puisque le
    // scan peut desormais dire quels disques la console lira.
    if(e.type==='fsTypes'){
      await loadDrives();
      await loadGames();
      continue;
    }
    if(e.type!=='volume')continue;
    if(e.action==='ajoute'&&e.xbox){
      // CE QU'IL Y A DESSUS, ET SI LA CONSOLE POURRA LE LIRE.
      // « Disque Xbox détecté » sans chiffre ne dit pas si le disque est utile ;
      // et un disque NTFS plein de jeux doit se dire TOUT DE SUITE — pas après y
      // avoir rangé trente jeux pour rien.
      const quoi=[];
      if(e.jeux)quoi.push(e.jeux+' '+T('jeu(x)','game(s)'));
      if(e.apps)quoi.push(e.apps+' '+T('application(s)','app(s)'));
      const detail=quoi.length?' — '+quoi.join(', '):'';
      if(e.consoleLit===false){
        toast(T('Disque ','Drive ')+e.lettre+':\\ '+T('en ','in ')+e.fs+T(' : la console ne lit que le FAT32 sur un support USB. Elle n’y verra RIEN.',': the console only reads FAT32 on USB. It will see NOTHING there.'),'warn');
      }else{
        toast(T('Disque Xbox détecté : ','Xbox drive detected: ')+e.lettre+':\\'+detail);
      }
      await loadGames();
      if(e.consoleLit!==false)toast(T('Disque ','Drive ')+e.lettre+':\\ '+T('ajouté à la bibliothèque','added to the library'));
    }else if(e.action==='retire'){
      toast(T('Disque retiré : ','Drive removed: ')+e.lettre+':\\','warn');
      if(games.length)await loadGames();
    }else if(e.action==='ajoute'){
      toast(T('Disque détecté : ','Drive detected: ')+e.lettre+':\\ '+T('(pas un disque Xbox — rien à charger)','(not an Xbox drive — nothing to load)'));
    }
  }
  clearTimeout(evTimer);
  evTimer=setTimeout(pollEvents,4000);
}

// ---------- Console (FTP) ---------------------------------------------------
// Une session cote serveur, deux panneaux ici : la console d'un cote, ce que le
// PC peut lui envoyer de l'autre. Les transferts tournent en tache de fond cote
// serveur et l'UI sonde leur avancement — comme la file de telechargements.
let conChemin='',conConnecte=false,conTimer=null,CON_CFG={},CON_HASPASS=false,conSupport='',conContenu='',conListeChargee=false;
// Vitesse des transferts : l'API ne renvoie que des octets cumules, on la deduit
// de l'ecart entre deux sondages.
const conVus=new Map();
function conVitesse(j){
  const t=Date.now(),av=conVus.get(j.id);
  const d=(av&&t-av.t>250)?(j.recus-av.recus)/((t-av.t)/1000):(av?av.debit||0:0);
  conVus.set(j.id,{t,recus:j.recus,debit:d});
  return d>0?fmt(d)+'/s':'';
}
// Le temps restant se DEDUIT du meme delta que la vitesse — jamais invente :
// sans debit connu (premier sondage, transfert a l'arret) on n'affiche rien.
function conEta(j){
  const d=(conVus.get(j.id)||{}).debit||0;
  if(!d||!j.total||j.recus>=j.total)return '';
  const s=(j.total-j.recus)/d;
  return s<90?'~'+Math.ceil(s)+' s':'~'+Math.ceil(s/60)+' min';
}
function conTaille(o){return o.total?Math.round(o.recus/o.total*100):0;}
function conIcone(dossier){return dossier?'#i-box':'#i-archive';}
// ---------- XBDM : lancer, redemarrer, photographier ----------------------
// Le moniteur de debug (plugin xbdm.xex) parle sur le port 730, independamment
// du FTP : lancer un jeu suspend le serveur FTP, pas le moniteur. La sonde
// d'etat est silencieuse — l'absence du plugin n'est pas une erreur, c'est un
// reglage DashLaunch, et la barre le dit sans toast.
let xbdmPret=false;
// Le titre en cours lu par XBDM — conserve : le verdict de lancement le compare
// a l'avant/apres pour dire « demarre » ou « revenu au dashboard ».
let xbdmTitre='';
async function xbdmLancer(cheminFtp){
  // magicboot parle DOS : « /Hdd1/Games/x/default.xex » -> « Hdd1:\Games\x\default.xex »
  if(!xbdmPret){toast(T('XBDM absent — charge xbdm.xex dans DashLaunch.','XBDM missing — load xbdm.xex in DashLaunch.'),'warn');return;}
  const dos=cheminFtp.replace(/^\//,'').replace(/\//g,'\\');
  // Le chemin est verifie par FTP AVANT le lancement : volume demonte ou
  // fichier absent = erreur immediate, jamais un lancement dans le vide.
  const r=await post('/api/xbdm/lancer-verifie',{chemin:dos});
  if(r&&r.error){toast(T('Erreur : ','Error: ')+r.error,'err');return;}
  if(r&&r.avertissement)toast(r.avertissement,'warn');
  const avant=xbdmTitre;
  toast(T('Lancement envoyé — vérification du démarrage…','Launch sent — checking it started…'));
  // VERDICT : le titre courant doit changer. Le dashboard qui reste, c'est la
  // reponse « n'a pas demarre » — on la dit au lieu de laisser croire.
  let n=0;
  const sondage=async()=>{
    try{
      const s=await api('/api/xbdm');
      if(s&&s.disponible){
        if(s.titre&&s.titre!==avant){toast(T('Démarré : ','Started: ')+s.titre);conEtat();return;}
        if(++n<5)return setTimeout(sondage,4000);
        toast(T('Revenu au dashboard — le titre n\'a pas démarré.','Back to the dashboard — the title did not start.'),'warn');conEtat();return;
      }
      if(++n<5)return setTimeout(sondage,4000);
      toast(T('Pas de réponse de la console — regarde son écran.','No reply from the console — check its screen.'),'warn');
    }catch{if(++n<5)setTimeout(sondage,4000);}
  };
  setTimeout(sondage,3500);
}
async function xbdmReboot(){
  if(!await confirmer({titre:T('Redémarrer la console ?','Reboot the console?'),corps:T('Soft reset — la console revient sur son dashboard.','Soft reset — the console comes back to its dashboard.'),ok:T('REDÉMARRER','REBOOT'),danger:true}))return;
  const r=await post('/api/xbdm/reboot',{});
  toast(r&&r.ok?T('Redémarrage envoyé.','Reboot sent.'):T('Erreur : ','Error: ')+((r&&r.error)||''),r&&r.ok?'':'err');
}
// ---------- Vue directe : captures framebuffer XBDM en rafale -------------
// Pas une video : une capture a la fois, SEQUENTIELLE — la suivante part quand
// la precedente est rendue, jamais de requetes empilees sur un canal fragile.
// Le rythme affiche est MESURE (delta entre rendus), jamais un « fps » promis.
let conLive=false,conLiveUrl='',conLiveDernier=0;
async function conLiveTour(){
  if(!conLive)return;
  const info=$('conLiveInfo');
  try{
    const r=await fetch('/api/xbdm/screenshot',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!conLive)return;                                  // arretee pendant l'attente
    if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j.error||('HTTP '+r.status));}
    const b=await r.blob();
    if(!conLive)return;
    const u=URL.createObjectURL(b);
    const img=$('conLiveImg');
    if(conLiveUrl)URL.revokeObjectURL(conLiveUrl);
    conLiveUrl=u;img.src=u;img.hidden=false;$('conLiveVide').hidden=true;
    // Rythme mesure entre deux rendus, affiche honnetement.
    const t=performance.now();
    if(conLiveDernier)info.textContent=T('1 image toutes les ~','1 frame every ~')
      +((t-conLiveDernier)/1000).toFixed(1)+' s';
    conLiveDernier=t;
    if(conLive)setTimeout(conLiveTour,400);             // petite respiration entre captures
  }catch(e){
    if(info)info.textContent=T('Arrêté : ','Stopped: ')+e.message;
    conLiveArreter();
    if(curView==='con')toast(T('Vue directe arrêtée : ','Live view stopped: ')+e.message,'err');
  }
}
function conLiveArreter(){
  conLive=false;conLiveDernier=0;
  const b=$('conLiveBtn');if(b)b.textContent='▶ LIVE';
}
function conLiveToggle(){
  if(conLive){conLiveArreter();const i=$('conLiveInfo');if(i)i.textContent=T('Arrêté','Stopped');return;}
  if(!xbdmPret){toast(T('XBDM absent — charge xbdm.xex dans DashLaunch.','XBDM missing — load xbdm.xex in DashLaunch.'),'warn');return;}
  conLive=true;
  $('conLiveBtn').textContent=T('■ ARRÊTER','■ STOP');
  const i=$('conLiveInfo');if(i)i.textContent=T('Première capture…','First capture…');
  conLiveTour();
}
// Plein ecran : la derniere capture affichee, pas un flux — XBDM ne sait pas
// faire mieux.
function conLiveFs(){
  const i=$('conLiveImg');
  if(i&&!i.hidden&&i.src&&i.requestFullscreen)i.requestFullscreen();
  else toast(T("Lance ▶ LIVE d'abord — rien à agrandir sinon.","Start ▶ LIVE first — nothing to enlarge yet."),'warn');
}
// Les tuiles du cockpit sont des ANCRES : elles descendent vers la section
// reelle (navigateur FTP, panier d'envoi, Xbox 1, contenu installe) plutot
// que de dupliquer le panneau.
function conZoneGo(z){
  const el=$({files:'conListe',send:'conPc',ct:'conCt'}[z]);
  if(el)(el.closest('.conbox')||el).scrollIntoView({behavior:'smooth',block:'start'});
}
// Clic sur une carte du canal « contenu installe » : filtre la vraie liste
// sur ce jeu et descend vers elle.
function conCtGo(nom){
  const f=$('ctFilter');if(f){f.value=nom;renderCt();}
  const c=$('conCt');if(c)c.scrollIntoView({behavior:'smooth',block:'start'});
}

async function xbdmCapture(){
  // Le serveur repond IMAGE/PNG, pas du JSON : on ouvre le flux dans un onglet.
  try{
    const r=await fetch('/api/xbdm/screenshot',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!r.ok){const j=await r.json().catch(()=>({}));toast(T('Erreur : ','Error: ')+(j.error||r.status),'err');return;}
    const b=await r.blob();
    window.open(URL.createObjectURL(b),'_blank');
  }catch(e){toast(e.message,'err');}
}
// L'etat de la console arrive par UNE route : session FTP + XBDM + jobs. Le
// bandeau se compose a un seul endroit — deux fonctions qui ecrivent la meme
// ligne, c'est une incoherence garantie.
async function conEtat(){
  let s;try{s=await api('/api/console/etat');}catch{return;}
  conConnecte=!!(s.ftp&&s.ftp.connecte);
  xbdmPret=!!(s.xbdm&&s.xbdm.disponible);
  // L'anneau de l'orbe repete l'etat : quatre segments VERTS quand la console
  // est reliee, AMBRE quand un seul canal vit (XBDM sans FTP — le cas existe
  // vraiment), GRIS sinon. Pas de rouge : « hors ligne » n'est pas une panne,
  // le rouge est reserve a une erreur connue.
  const orb=$('orb');
  if(orb){
    const st=conConnecte?'ok':(xbdmPret?'partiel':'off');
    orb.className='bl-orb '+st;
    $('rolState').textContent=conConnecte?T('Console reliée','Console linked')
      :xbdmPret?T('Lien partiel','Partial link'):T('Hors ligne','Offline');
  }
  // Le meme etat sur l'entree « Console » du rail — l'orbe est loin de l'oeil
  // quand on lit le bas de l'ecran ; le point de couleur voyage avec l'onglet.
  const nd=$('nvConDot');
  if(nd){nd.hidden=false;nd.className='nvdot '+(conConnecte?'ok':(xbdmPret?'partiel':'off'));}
  ctxMaj(curView);
  // La mini-orbe du bandeau repete le meme etat — un seul langage visuel.
  const co=$('conOrb');
  if(co)co.className='conorb '+(conConnecte?'ok':(xbdmPret?'partiel':'off'));
  if(xbdmPret&&s.xbdm.titre)xbdmTitre=s.xbdm.titre;

  // --- cockpit : idcard + monitor -------------------------------------------
  const B=$('conBandeau');
  if(B){
    $('conCockpit').hidden=false;
    B.classList.toggle('off',!conConnecte);
    B.classList.toggle('figee',!!s.figee);
    const nom=$('conBNom'),sub=$('conBSub'),retry=$('conBRetry');
    if(conConnecte){
      nom.textContent=(xbdmPret&&s.xbdm.nom)||s.ftp.hote||'Xbox 360';
      const bits=[s.ftp.hote+':'+s.ftp.port];
      if(s.ftp.systeme)bits.push(s.ftp.systeme);
      if(xbdmPret)bits.push(s.xbdm.titre?T('en cours : ','running: ')+s.xbdm.titre:'XBDM ✓');
      else bits.push(T('XBDM absent','XBDM missing'));
      sub.textContent=bits.join(' · ');
      retry.hidden=true;
    }else{
      if(s.figee){
        nom.textContent=T('Console figée','Console frozen');
        sub.textContent=T('FTP et XBDM ne répondent plus — redémarre-la au bouton.','FTP and XBDM are both silent — reboot it with the power button.');
      }else if(xbdmPret){
        // La console REPOND en XBDM : elle n'est pas injoignable, c'est la
        // session FTP qui manque. Le nommer « Jtag » le prouve mieux qu'un
        // message — l'utilisateur reconnait SA console.
        nom.textContent=(s.xbdm.nom||'Xbox 360')+T(' — FTP non connecté',' — FTP not connected');
        sub.textContent=s.xbdm.titre
          ?T('La console répond (en cours : ','The console replies (running: ')+s.xbdm.titre+T(') — reconnecte le FTP.',') — reconnect FTP.')
          :T('La console répond — reconnecte le FTP.','The console replies — reconnect FTP.');
      }else if(s.adresse){
        nom.textContent=T('Console injoignable','Console unreachable');
        sub.textContent=s.adresse+T(' — vérifie qu\'elle est allumée sur le même réseau, puis réessaie.',' — check it is on the same network, then retry.');
      }else{
        nom.textContent=T('Aucune console réglée','No console set');
        sub.textContent=T('Renseigne son adresse dans « Connexion » ci-dessous.','Enter its address under "Connection" below.');
      }
      retry.hidden=!s.adresse;
    }
    // Le reboot reste a portee sur lien partiel (c'est l'outil de reparation) ;
    // deconnecter ne veut dire quelque chose qu'avec une session FTP ouverte.
    $('conBActions').hidden=!conConnecte&&!xbdmPret;
    $('conBReboot').hidden=!xbdmPret;
    $('conBDeco').hidden=!conConnecte;
    $('conBCapture').disabled=!xbdmPret;
    // Les lignes d'etat : seulement ce que la console donne vraiment.
    const dot=(id,on)=>{const d=$(id);if(d)d.className='csdot '+(on?'ok':'off');};
    dot('csdFtp',conConnecte);dot('csdXbdm',xbdmPret);dot('csdCt',conConnecte&&ctLoaded&&ctData.length>0);
    $('csFtp').textContent=conConnecte?s.ftp.hote+':'+s.ftp.port+(s.ftp.systeme?' · '+s.ftp.systeme:''):T('déconnecté','disconnected');
    $('csXbdm').textContent=xbdmPret?T('prêt','ready')+(s.xbdm.titre?' · '+s.xbdm.titre:''):T('absent','missing');
    $('csCt').textContent=conConnecte?(ctLoaded?ctData.length+T(' jeux',' games'):T('analyse…','scanning…')):'—';
    // Le monitor n'existe que si XBDM repond : sans lui, rien a montrer.
    $('conLive').hidden=!xbdmPret;
    $('conCockpit').classList.toggle('solo',!xbdmPret);
    if(xbdmPret){
      $('conMTitre').textContent=s.xbdm.titre||'Xbox 360';
      $('conMSub').textContent=s.xbdm.version||'';
    }
    $('conZones').hidden=!conConnecte;
    $('conCtHero').hidden=!conConnecte||!ctData.some(g=>g.dlc.length+g.tus.length>0);
  }
  // Connecte, les identifiants se replient : la page n'affiche que ce qui sert.
  const creds=$('conCreds');
  if(creds)creds.open=!conConnecte;
  const sum=$('conCredsSum');
  if(sum)sum.textContent=conConnecte
    ?T('Modifier la connexion — ','Edit connection — ')+((s.ftp&&s.ftp.hote)||s.adresse||'')
    :T('Connexion — adresse et identifiants','Connection — address and credentials');

  $('conBtn').textContent=conConnecte?T('DECONNECTER','DISCONNECT'):T('CONNECTER','CONNECT');
  $('conBtn').classList.toggle('accent',!conConnecte);
  $('conBtn').classList.toggle('gray',conConnecte);
  $('conPanneaux').hidden=!conConnecte;
  // Une session DEJA ouverte (rechargement de page) laissait l'explorateur vide
  // et le panier PC jamais rempli : seul conBascule() les nourrissait. La
  // premiere fois que l'etat dit « connecte », on peuple — puis le drapeau
  // bloque les rechargements a chaque sondage (conEtat tourne pendant les
  // transferts). Il se rearme a la deconnexion.
  if(conConnecte&&!conListeChargee){conListeChargee=true;conAller(conChemin||'/');conChargerPc();}
  if(!conConnecte)conListeChargee=false;
  // XBDM tombe -> on coupe la rafale (sa visibilite est geree dans le cockpit).
  if(!xbdmPret&&conLive)conLiveArreter();
  $('conStatus').textContent=conConnecte
    ?((s.ftp.hote||'')+':'+s.ftp.port+(s.ftp.systeme?' · '+s.ftp.systeme:''))
    :'';

  $('conNote').textContent=conConnecte
    ?T('Session ouverte.','Session open.')
      +(conSupport?T(' Support détecté : ',' Detected drive: ')+conSupport:'')
      +(conContenu?T(' · contenu dans ',' · content in ')+conContenu:'')
      +T(' La console n\'accepte qu\'un transfert à la fois : les envois se suivent.',' The console takes one transfer at a time: sends are queued.')
    :T('Le serveur FTP de la console écoute sur le port 21, utilisateur et mot de passe xboxftp par défaut. Sur Aurora : Paramètres → Serveur FTP.','The console FTP server listens on port 21, user and password xboxftp by default. In Aurora: Settings → FTP server.');
  conJobs(s.races||[]);
}
// « Réessayer » : la meme bascule que CONNECTER, avec le formulaire reouvert si
// l'adresse a change.
async function conRetry(){
  const creds=$('conCreds');
  if(creds)creds.open=true;
  if($('conHost')&&$('conHost').value.trim()){await conBascule();}
  else if($('conHost'))$('conHost').focus();
}
let conRaces=[];
function conJobs(races){
  // Les transferts ne forment plus une section a part : ils se fondent dans la
  // file d'Activite (renderActFile), aux cotes des telechargements.
  // Le badge compte ce qui BOUGE, pas l'historique : les derniers 20 jobs
  // exposent aussi les termines, qui n'ont rien a faire dans le compteur.
  conRaces=races;
  actBadgeFtp=races.filter(j=>j.etat==='actif'||j.etat==='attente').length;actBadgeMaj();
  renderActFile();
  // on ne relance la sonde que s'il reste un transfert a faire
  clearTimeout(conTimer);
  if(races.some(j=>j.etat==='actif'||j.etat==='attente'))conTimer=setTimeout(conEtat,700);
}
/* LA FILE CLAIRE : un seul flux, trois groupes — EN COURS / EN ATTENTE /
   TERMINE. Telechargements et transferts console se melangent : a l'ecran,
   « ce qui bouge » ne se soucie pas du canal. Ligne plate du design retenu :
   pastille de direction, nom + meta, barre pleine largeur, chiffres a droite,
   pastille d'etat, gestes en icones. */
function fLigne(o){
  // o = {dir:'dl'|'up'|'pk', nom, meta, pct, vit, pill, pillCls, btns, done, warn}
  const bar=(o.pct!=null&&o.pct!==undefined)?`<div class="fbar"><i style="width:${o.pct}%"></i></div>`:'';
  const rt=(o.pct!=null||o.vit)?`<div class="frt">${o.pct!=null?`<div class="fpct">${o.pct}%</div>`:''}<div class="fvit">${o.vit||''}</div></div>`:'';
  return `<div class="frow${o.done?' done':''}${o.warn?' warn':''}"><span class="fdir ${o.dir}">${o.dir==='up'?'↑':o.dir==='pk'?'◈':'↓'}</span><div class="fnm"><b>${o.nom}</b>${o.meta?`<span>${o.meta}</span>`:''}${bar}</div>${rt}${o.pill||''}<div class="fgo">${o.btns||''}</div></div>`;
}
function renderActFile(){
  const el=$('actFile');if(!el)return;
  const items=(dlData&&dlData.items)||[];
  const acts=items.filter(d=>d.status==='active');
  const queue=items.filter(d=>d.status==='queued');
  const paused=items.filter(d=>d.status==='paused');
  const errs=items.filter(d=>d.status==='error');
  const done=items.filter(d=>d.status==='done').slice().sort((a,b)=>(b.finished||0)-(a.finished||0));
  const live=conRaces.filter(j=>j.etat==='actif'), attente=conRaces.filter(j=>j.etat==='attente'), fins=conRaces.filter(j=>j.etat!=='actif'&&j.etat!=='attente');
  const pill=(cls,txt)=>`<span class="badge ${cls}">${txt}</span>`;
  // Les details d'un transfert console : direction + destination, puis le
  // compte de fichiers — ou « fichier » quand ce n'est pas un dossier.
  const jMeta=j=>escH((j.genre==='envoi'?T('Envoi','Send'):T('Récupération','Fetch'))+(j.dest?' → '+j.dest:''))
    +(j.dossier&&j.fichiers?' · '+(j.faits||0)+'/'+j.fichiers+T(' fichiers',' files')+(j.fichier?' · '+escH(j.fichier):''):' · '+T('fichier','file'))
    +(j.etat==='erreur'&&j.error?' — '+escH(j.error):'');
  const jVit=j=>fmt(j.recus||0)+(j.total&&j.total!==j.recus?' / '+fmt(j.total):'')+(conVitesse(j)?' · '+conVitesse(j):'')+(conEta(j)?' · '+conEta(j):'');
  // Le badge « verifie » garde son titre : la somme de controle est un detail,
  // pas une ligne.
  const jFin=j=>j.etat==='fait'
    ?`<span class="badge ext" title="${escA(j.verifie==='ok'?T('Somme de contrôle vérifiée par la console','Checksum verified by the console'):j.verifie==='different'?T('La somme ne correspond pas','Checksum mismatch'):T('Le serveur ne sait pas calculer de somme','The server cannot compute a checksum'))}">${j.verifie==='ok'?'✓ '+T('VÉRIFIÉ','VERIFIED'):j.verifie==='different'?'✕ '+T('CORROMPU','CORRUPT'):'OK'}</span>`
    :j.etat==='erreur'?pill('err',T('ERREUR','ERROR')):pill('',T('ANNULÉ','CANCELED'));
  let h='';
  // — EN COURS —
  const installing=items.filter(d=>d.installing);
  if(acts.length||live.length||installing.length){
    h+=`<div class="fgp">${T('EN COURS','RUNNING')}<b>${acts.length+live.length+installing.length}</b></div>`;
    acts.forEach(d=>{
      const p=d.total?Math.round(d.received/d.total*100):null;
      h+=fLigne({dir:'dl',nom:escH(d.name),meta:escH(d.note||''),pct:p,
        vit:fmt(d.speed||0)+'/s · '+dlEta(d),
        pill:pill('ext',T('EN COURS','RUNNING')),
        btns:`<button class="fmini" title="${escA(T('PAUSE','PAUSE'))}" onclick="dlCtl('${d.id}','pause')">⏸</button><button class="fmini r" title="${escA(T('ANNULER','CANCEL'))}" onclick="dlCtl('${d.id}','cancel')">✕</button>`});
    });
    installing.forEach(d=>{
      h+=fLigne({dir:'pk',nom:escH(d.name),meta:escH(d.note||''),
        pill:pill('wait','⟳ '+T('INSTALLATION...','INSTALLING...'))});
    });
    live.forEach(j=>{
      h+=fLigne({dir:j.genre==='envoi'?'up':'dl',nom:escH(j.name),meta:jMeta(j),
        pct:j.total?conTaille(j):null,vit:jVit(j),
        pill:pill('ext',T('EN COURS','RUNNING')),
        // Pas de bouton annuler : un STOR engage ne s'abandonne qu'en
        // detruisant la session, ce qui laisserait un fichier partiel.
        btns:''});
    });
  }
  // — EN ATTENTE : file, pauses, erreurs, transferts en file —
  const enAttente=queue.length+paused.length+errs.length+attente.length;
  if(enAttente){
    h+=`<div class="fgp">${T('EN ATTENTE','QUEUED')}<b>${enAttente}</b></div>`;
    queue.forEach(d=>{h+=fLigne({dir:'dl',nom:escH(d.name),meta:escH(d.note||''),vit:d.total?fmt(d.total):'',pill:pill('',T('EN FILE','QUEUED')),
      btns:`<button class="fmini" title="${escA(T('Priorité','Priority'))}" onclick="dlCtl('${d.id}','up')">↑</button><button class="fmini" title="${escA(T('Priorité','Priority'))}" onclick="dlCtl('${d.id}','down')">↓</button><button class="fmini" title="${escA(T('PAUSE','PAUSE'))}" onclick="dlCtl('${d.id}','pause')">⏸</button><button class="fmini r" title="${escA(T('ANNULER','CANCEL'))}" onclick="dlCtl('${d.id}','cancel')">✕</button>`});});
    paused.forEach(d=>{const p=d.total?Math.round(d.received/d.total*100):null;
      h+=fLigne({dir:'dl',nom:escH(d.name),meta:escH(d.note||''),pct:p,vit:d.total?fmt(d.total):'',warn:true,pill:pill('wait',T('PAUSE','PAUSED')),
        btns:`<button class="fmini" title="${escA(T('REPRENDRE','RESUME'))}" onclick="dlCtl('${d.id}','resume')">▶</button><button class="fmini r" title="${escA(T('ANNULER','CANCEL'))}" onclick="dlCtl('${d.id}','cancel')">✕</button>`});});
    errs.forEach(d=>{
      const isVimm=d.url&&/vimm\.net/.test(d.url),needsAuth=/401|403|compte archive/i.test(d.error||'');
      const altQ=(d.name||'').replace(/\.(iso|rar|zip|7z|xex)$/i,'').replace(/\s*\([^)]*\)\s*/g,' ').replace(/[._]/g,' ').replace(/\s+/g,' ').trim();
      let btns=`<button class="fmini" title="${escA(T('RÉESSAYER','RETRY'))}" onclick="dlCtl('${d.id}','retry')">↻</button>`
        +(isVimm?`<button class="fmini" title="${escA(T('LIBERER','RELEASE'))}" onclick="vimmCancel('${d.id}')">⛓</button><button class="btn blue dlbtn" title="${escA(T('Chercher ce jeu sur archive.org','Find this game on archive.org'))}" onclick="dlAlt(${jsA(altQ)},'ia')">ARCHIVE.ORG</button>`
        :(needsAuth||/archive\.org/.test(d.url||'')?`<button class="btn blue dlbtn" title="${escA(T('Essayer Vimm\'s Vault','Try Vimm\'s Vault'))}" onclick="dlAlt(${jsA(altQ)},'vimm')">VIMM</button>`:''));
      h+=fLigne({dir:'dl',nom:escH(d.name),meta:escH(d.error||d.note||''),warn:true,pill:pill('err',T('ERREUR','ERROR')),
        btns:btns+`<button class="fmini r" title="${escA(T('ANNULER','CANCEL'))}" onclick="dlCtl('${d.id}','cancel')">✕</button>`});});
    // La POSITION dans la file : rang · rang/reste, comme avant — la console
    // n'accepte qu'un transfert a la fois.
    attente.forEach(j=>{h+=fLigne({dir:j.genre==='envoi'?'up':'dl',nom:escH(j.name),meta:jMeta(j),
      vit:j.total?fmt(j.total):'',pill:pill('wait',T('EN ATTENTE','QUEUED')+(j.rang?' · '+j.rang+(j.reste>1?'/'+j.reste:''):'')),
      btns:`<button class="fmini r" title="${escA(T('ANNULER','CANCEL'))}" onclick="conAnnule(${jsA(j.id)})">✕</button>`});});
  }
  // — TERMINES —
  if(done.length||fins.length){
    h+=`<div class="fgp">${T('Terminés','Completed')}<b>${done.length+fins.length}</b><button class="fmini" style="margin-left:auto" title="${escA(T('EFFACER','CLEAR'))}" onclick="dlCtl('x','clear')">✕</button></div>`;
    fins.forEach(j=>{h+=fLigne({dir:j.genre==='envoi'?'up':'dl',nom:escH(j.name),done:true,
      meta:jMeta(j),vit:j.total?fmt(j.total):'',pill:jFin(j)});});
    done.slice(0,15).forEach(d=>{
      const tag=d.installed?pill('ext',T('INSTALLÉ','INSTALLED')+(d.installed>1?' ×'+d.installed:'')):d.installing?pill('wait','⟳ '+T('INSTALLATION...','INSTALLING...')):pill('ext',T('TERMINÉ','DONE'));
      const acts2=d.installed||d.installing?'':`<button class="fmini" title="${escA(T('Détecté le contenu et l\'installé au bon endroit (jeu, DLC, TU...)','Detects the content and installs it in the right place (game, DLC, TU...)'))}" onclick="dlOrg()">◈</button><button class="fmini" title="${escA(T('OUVRIR','OPEN'))}" onclick="dlOpen('${d.id}')">↗</button>`;
      h+=fLigne({dir:'pk',nom:escH(d.name),done:!d.installing,meta:escH(d.note||''),vit:fmt(d.total||d.received||0),pill:tag,
        btns:acts2+`<button class="fmini r" title="${escA(T('Retirer','Remove'))}" onclick="dlCtl('${d.id}','remove')">✕</button>`});});
  }
  el.innerHTML=h||etatVide({
    icone:'download',
    titre:T('Rien à télécharger','Nothing to download'),
    aide:T('Cherche un jeu ci-dessus, ou ajoute un lien direct dans « Autres moyens ».','Search a game above, or add a direct link under Other ways.')});
}

async function conAnnule(id){
  const r=await conGarde(await post('/api/ftp/jobs/cancel',{id}));
  if(!r)return;
  if(r.error){toast(r.error,'warn');return;}
  toast(T('Annulé : ','Canceled: ')+r.annule);
  conEtat();
}
async function conBascule(){
  // On se fie a l'etat REEL du serveur, pas a ce que la page croit : une session
  // peut tomber sans qu'elle le sache, et le bouton proposait alors de
  // « deconnecter » une session qui n'existait plus.
  await conEtat();
  if(conConnecte){await post('/api/ftp/disconnect',{});conChemin='';await conEtat();return;}
  const host=$('conHost').value.trim();
  if(!host){toast(T('Adresse de la console manquante','Console address missing'),'warn');$('conHost').focus();return;}
  $('conStatus').textContent=T('Connexion...','Connecting...');
  const r=await post('/api/ftp/connect',{
    host,port:Number($('conPort').value)||21,user:$('conUser').value.trim()||'xboxftp',
    pass:$('conPass').value,save:$('conSave').checked
  });
  if(r.error){toast(r.error,'err');$('conStatus').textContent=T('Echec : ','Failed: ')+r.error;return;}
  $('conPass').value='';
  // Ou la console range vraiment son contenu, detecte a la connexion : FtpDll
  // expose ses supports par leur nom et « Game » est le dossier d'Aurora.
  conSupport=r.support||'';conContenu=r.contenu||'';
  conChemin=r.racine||'';
  conRendreConsole(r.entrees||[],r.racine||'');
  await conEtat();
  conChargerPc();
  if(r.avertissement)toast(r.avertissement,'warn');
}
// Le role d'un volume se TRADUIT, il ne se devine pas : le serveur le
// reconnait (`role`), la vue l'affiche en langage d'installation — « contenu »
// pour les GOD, « jeux » pour les dossiers extraits.
const VOL_LIB={
  contenu:()=>T('contenu (GOD, profils, TU)','content (GOD, profiles, TU)'),
  jeux:()=>T('jeux en dossiers','folder-format games'),
  systeme:()=>T('système — ne pas installer ici','system — do not install here'),
  xbox1:()=>T('compatibilité Xbox 1 (XeFu)','Xbox 1 compatibility (XeFu)'),
  aurora:()=>T('titre actif','active title'),
};
function conRendreConsole(entrees,chemin){
  conChemin=chemin;
  $('conCrumb').textContent=chemin||'/';
  const tri=entrees.slice().sort((a,b)=>(b.dir?1:0)-(a.dir?1:0)||a.name.localeCompare(b.name));
  $('conListe').innerHTML=tri.length?tri.map(e=>
    `<div class="conrow ${e.dir?'dossier':''} ${e.role?'cvol':''}" tabindex="0" onclick="conOuvrir(${jsA(e.path)},${e.dir?1:0})">`+
    `<span class="ci"><svg><use href="${e.role?'#i-drive':conIcone(e.dir)}"/></svg></span>`+
    `<span class="cn">${escH(e.titre||e.name)}${e.titre?` <span class="ct">${escH(e.name)}</span>`:''}</span>`+
    (e.role?`<span class="crole">${escH((VOL_LIB[e.role]||(()=>e.role))())}</span>`:'')+
    `<span class="ct">${e.dir?'':fmt(e.size)}</span>`+
    `<span class="ca">`+
    (/\.(xex|xbe)$/i.test(e.name)?`<button class="btn quiet" onclick="event.stopPropagation();xbdmLancer(${jsA(e.path)})">${T('Lancer','Launch')}</button>`:'')+
    `<button class="btn quiet" onclick="event.stopPropagation();conEnvoiVers(${jsA(e.path)},${e.dir?1:0})" ${e.dir?'':'disabled'}>${T('Recevoir','Receive')}</button>`+
    `<button class="btn quiet" onclick="event.stopPropagation();conRetrait(${jsA(e.path)},${jsA(e.name)})" ${e.dir?'disabled':''}>${T('Récupérer','Fetch')}</button>`+
    `<button class="btn quiet" onclick="event.stopPropagation();conSupprimer(${jsA(e.path)},${jsA(e.name)},${e.dir?1:0})">${T('Supprimer','Delete')}</button>`+
    `</span>`+
    `</div>`).join('')
    :etatVide({icone:'box',titre:T('Dossier vide','Empty folder'),aide:T('Rien à cet endroit sur la console.','Nothing at this location on the console.')});
}
// « Recevoir » : envoyer un dossier DU PC vers l'endroit ou l'on se trouve sur la
// console. C'est la meme action que dans le panneau de droite, mais la
// destination suit la navigation — on se place d'abord, on envoie ensuite.
async function conEnvoiVers(cheminLocal,dossier){
  if(!dossier)return;
  const nom=String(cheminLocal).split('\\').pop();
  const r=await conGarde(await post('/api/ftp/upload',{local:cheminLocal,remote:joinCon(conChemin,nom),verifier:$('conVerif').checked}));
  if(!r)return;
  toast(T('Envoi lancé : ','Sending: ')+nom+' → '+joinCon(conChemin,nom));
  conEtat();
}
function joinCon(base,nom){
  const a=String(base||'/').replace(/\/+$/,'');
  return (a||'')+'/'+String(nom).replace(/^\/+/,'');
}
async function conNouveauDossier(){
  if(!conConnecte)return;
  const nom=await saisir({titre:T('NOUVEAU DOSSIER','NEW FOLDER'),
    corps:T('Il sera créé dans ','It will be created in ')+conChemin,
    libelle:T('Nom du dossier','Folder name'), valeur:'', ok:T('CRÉER','CREATE')});
  if(nom===null||!nom.trim())return;
  const r=await conGarde(await post('/api/ftp/mkdir',{path:joinCon(conChemin,nom.trim())}));
  if(!r)return;
  toast(T('Dossier créé : ','Folder created: ')+nom.trim());
  conAller(conChemin);
}
async function conSupprimer(chemin,nom,dossier){
  if(!conConnecte)return;
  // Regle du projet : RIEN n'est supprime sans confirmation explicite.
  const ok=await confirmer({
    titre:dossier
      ?T('Supprimer le dossier « ','Delete folder "')+nom+T(' » et tout son contenu','" and everything inside it')
      :T('Supprimer « ','Delete "')+nom+T(' »','"'),
    // On montre OU : c'est la difference entre supprimer sur le disque de la
    // console et supprimer ailleurs, et un nom seul ne le dit pas.
    corps:chemin, ok:T('SUPPRIMER','DELETE'), danger:true});
  if(!ok)return;
  const r=await conGarde(await post('/api/ftp/delete',{path:chemin,dossier:!!dossier}));
  if(!r)return;
  toast(T('Supprimé : ','Deleted: ')+nom);
  conAller(conChemin);
}
function conOuvrir(chemin,dossier){
  if(!dossier)return;
  conAller(chemin);
}
// Une session FTP peut TOMBER sans que la page le sache : console eteinte,
// serveur FTP arrete, application redemarree. L'interface continuait alors
// d'afficher « Session ouverte » et chaque action echouait sur un message
// technique (« Console non connectee ») sans rien proposer.
// Ce point de passage unique resynchronise l'etat et dit quoi faire.
async function conGarde(r){
  if(!r||!r.error)return r;
  if(/non connect/i.test(r.error)){
    await conEtat();                       // l'interface cesse de mentir
    if(!conConnecte)toast(T('La session FTP est tombée — reconnecte-toi à la console.','The FTP session dropped — reconnect to the console.'),'warn');
    return null;
  }
  toast(r.error,'err');
  return null;
}
async function conAller(chemin){
  // Chemin vide = la racine des VOLUMES (« / » : Hdd1, Usb0, Game…), jamais le
  // dossier ou la session s'est arretee — celui-ci est imprevisible (la console
  // le conserve entre deux visites) et ne disait rien a l'utilisateur.
  if(!chemin)chemin='/';
  $('conListe').innerHTML=skelRows(4);
  const r=await conGarde(await api('/api/ftp/list?path='+encodeURIComponent(chemin)));
  if(!r)return;
  conRendreConsole(r.entrees||[],r.path||chemin);
}
function conMonter(){
  if(!conChemin)return;
  const haut=conChemin.replace(/\/[^/]+\/?$/,'');
  conAller(haut||'/');
}
// --- cote PC : ce que l'application peut envoyer ---------------------------
async function conChargerPc(){
  $('conPc').innerHTML=skelRows(4);
  const [depot,jeux]=await Promise.all([
    api('/api/drop').catch(()=>[]),
    api('/api/games').catch(()=>[])
  ]);
  const lignes=[];
  // Le depot : ce qui attend d'etre range, donc ce qu'on peut pousser tel quel.
  for(const it of (depot||[])){
    if(!it.path)continue;
    lignes.push({name:it.title||it.name||it.tid||'?',detail:(it.kind||'')+' · '+fmt(it.size||0),path:it.path});
  }
  // Les jeux installes : leur NOM, pas le dossier — qui n'est qu'un TitleID.
  // Ce sont des DOSSIERS : le serveur les envoie en recouvrement complet.
  for(const g of (jeux||[])){
    if(!g.path)continue;
    lignes.push({name:g.name||g.tid,detail:(g.format||'')+' · '+fmt(g.size||0),path:g.path,dir:true});
  }
  $('conPcTitre').textContent=T('Ce que je peux envoyer','What I can send')+' ('+lignes.length+')';
  const zs=$('czSend');if(zs)zs.textContent=lignes.length?lignes.length+T(' prêts',' ready'):T('jeu, DLC, jaquette…','game, DLC, cover…');
  $('conPc').innerHTML=lignes.length?lignes.map(l=>
    `<div class="conrow ${l.dir?'dossier':''}" tabindex="0">`+
    `<span class="ci"><svg><use href="${conIcone(l.dir)}"/></svg></span>`+
    `<span class="cn" title="${escA(l.path)}">${escH(l.name)}</span>`+
    `<span class="ct">${escH(l.detail)}</span>`+
    `<span class="ca">`+
    `<button class="btn quiet" onclick="conEnvoi(${jsA(l.path)})">${T('Envoyer','Send')}</button>`+
    (l.dir?`<button class="btn quiet" onclick="conEnvoiVers(${jsA(l.path)},1)">${T('Ici','Here')}</button>`:'')+
    `</span>`+
    `</div>`).join('')
    :etatVide({icone:'archive',titre:T('Rien à envoyer','Nothing to send'),aide:T('Le dépôt est vide et aucun jeu n\'est installé.','The drop folder is empty and no game is installed.')});
}
async function conEnvoi(local){
  if(!conConnecte)return;
  const nom=String(local).split('\\').pop();
  const distant=(conChemin||'/').replace(/\/+$/,'')+'/'+nom;
  const r=await conGarde(await post('/api/ftp/upload',{local,remote:distant,verifier:$('conVerif').checked}));
  if(!r)return;
  toast(T('Envoi lancé : ','Sending: ')+nom+' → '+distant);
  conEtat();
}
async function conRetrait(distant,nom){
  if(!conConnecte)return;
  const base=(await api('/api/config')).drop||'';
  const local=base+'\\'+nom;
  const r=await conGarde(await post('/api/ftp/download',{remote:distant,local}));
  if(!r)return;
  toast(T('Récupération lancée : ','Fetching: ')+nom);
  conEtat();
}
async function conComparer(){
  if(!conConnecte)return;
  $('conStatus').textContent=T('Comparaison...','Comparing...');
  const r=await conGarde(await api('/api/ftp/compare'));
  if(!r)return;
  // La comparaison parcourt le dossier de contenu de la console : la session a
  // donc bouge. On remet l'explorateur ou l'utilisateur l'avait laisse.
  await conAller(conChemin||'');
  $('conStatus').textContent=r.absents.length+T(' jeu(x) du PC absent(s) de la console',' PC game(s) missing on the console');
  toast(r.absents.length
    ?r.absents.length+T(' jeu(x) du PC absents de la console',' game(s) on the PC but not on the console')
    :T('La console a tout ce que le PC a.','The console has everything the PC has.'));
}

// OU LA CONSOLE RANGE-T-ELLE SES FICHIERS ? On le CHERCHE : le disque principal
// est celui qui porte Content\0000000000000000, et l'installation d'Aurora est le
// dossier qui contient Aurora.xex. Le bouton « ALLER » y amene l'explorateur :
// « Envoyer » depose alors dans le dossier ou l'on se trouve.
async function conDestinations(){
  if(!conConnecte)return;
  $('conDest').innerHTML='<h2 class="sec">'+T('DESTINATIONS SUR LA CONSOLE','DESTINATIONS ON THE CONSOLE')+'</h2>'+skelRows(3);
  const r=await conGarde(await api('/api/ftp/destinations'));
  if(!r){$('conDest').innerHTML='';return;}
  if(!r.connecte){$('conDest').innerHTML='';return;}
  // L'ambiguite se dit EN CLAIR : poser un script dans l'installation qu'Aurora
  // ne demarre pas donne un script qui ne se charge jamais, sans erreur.
  const alerte=r.ambigu
    ?`<div class="advcard" style="margin-bottom:8px"><span class="advico warnc">⚠</span><div class="advbody"><div class="advtitre">${T('Deux installations d\'Aurora contiennent des scripts','Two Aurora installs contain scripts')}</div><div class="advdet">${escH((r.candidats||[]).join('  ·  '))} — ${T('rien ne dit laquelle la console démarre. Indique celle que tu utilises dans DOSSIERS (champ Aurora), sinon je ne poserai rien tout seul.','nothing says which one the console boots. Set the one you use in FOLDERS (Aurora field), otherwise I will not place anything myself.')}</div></div></div>`
    :'';
  $('conDest').innerHTML='<h2 class="sec">'+T('DESTINATIONS SUR LA CONSOLE','DESTINATIONS ON THE CONSOLE')+'</h2>'+alerte
    +r.cibles.map(c=>`<div class="lrow asrow">
        <span class="asico"><svg><use href="#i-console"/></svg></span>
        <div class="asbody">
          <div class="astop">${escH(c.nom)}${c.genre?` <span class="ldim">${escH(c.genre)}</span>`:''}${c.existe===false?' <span class="badge wait">'+T('ABSENT','MISSING')+'</span>':''}</div>
          <div class="asdesc">${escH(c.description)}</div>
          ${c.distant?`<div class="asdesc aspath">${escH(c.distant)}</div>`:''}
        </div>
        <span class="ca">${c.distant?`<button class="btn quiet" onclick="conAller(${jsA(c.distant)})">${T('ALLER','GO TO')}</button>`:''}</span>
      </div>`).join('')
    +`<p class="asdesc" style="margin-top:8px">${escH(r.note||'')}</p>`;
}
function conInit(){
  const c=CON_CFG||{};
  $('conHost').value=c.host||'';
  $('conPort').value=c.port||21;
  $('conUser').value=c.user||'xboxftp';
  $('conPass').placeholder=CON_HASPASS?T('Enregistré — laisser vide','Saved — leave empty'):T('Mot de passe','Password');
  conEtat();
}

// ---------- Scanner un dossier quelconque ----------
function scanFolder(){ouvrirSurcouche($('scanModal'));$('scanPath').focus();}
async function scanFolderGo(){
  const p=$('scanPath').value.trim();if(!p)return;
  $('scanInfo').textContent=T('Analyse de ','Analyzing ')+p+' ...';$('scanBody').innerHTML='';
  try{
    const r=await api('/api/scanfolder?path='+encodeURIComponent(p));
    if(r.error){$('scanInfo').textContent=T('Erreur : ','Error: ')+r.error;return;}
    const items=r.items||[];
    $('scanBody').innerHTML=items.map(it=>{
      const bc=it.kind==='GOD'?'god':it.kind==='DLC'||it.kind==='TU'?'wait':it.kind==='Extrait'||it.kind.indexOf('ISO')===0?'ext':'god';
      const title=it.title?escH(it.title)+' <span style="font-family:monospace;color:var(--ac)">'+escH(it.tid||'')+'</span>':escH(it.tid||'—');
      return `<tr><td data-l="${escA(enTete('scanBody',0))}" style="word-break:break-all;font-size:var(--fs-caption)"><span class="v">${escH(it.name)}</span></td><td data-l="${escA(enTete('scanBody',1))}"><span class="v"><span class="badge ${bc}">${escH(it.kind.toUpperCase())}</span></span></td><td data-l="${escA(enTete('scanBody',2))}" class="cap"><span class="v">${title}${it.sub?'<br><span class="dim">→ '+escH(it.sub)+'</span>':''}</span></td><td data-l="${escA(enTete('scanBody',3))}" class="cap"><span class="v">${fmt(it.size)}</span></td><td data-l="${escA(enTete('scanBody',4))}" style="white-space:nowrap"><span class="v"><button class="btn gray pad-s cap" onclick="openPath(${jsA(it.path)})">${T('OUVRIR','OPEN')}</button> <button class="btn pad-s cap" onclick="importItem(${jsA(it.path)})">→ ${T('DÉPÔT','DROP')}</button></span></td></tr>`;
    }).join('');
    const c={};items.forEach(it=>c[it.kind]=(c[it.kind]||0)+1);
    $('scanInfo').textContent=items.length+T(' élément(s) — ',' item(s) — ')+Object.entries(c).map(([k,v])=>v+' '+k).join(' · ');
  }catch(e){$('scanInfo').textContent=T('Erreur : ','Error: ')+e.message;}
}
async function importItem(p){
  const r=await post('/api/import',{path:p});
  toast(r.ok?T('Copie vers le dépôt : ','Copied to drop folder: ')+r.dest:T('Erreur : ','Error: ')+r.error,r.ok?'':'err');
}
// scan USB 1-clic : détecté les lecteurs amovibles puis analyse le premier
async function scanUsb(){
  const ds=await api('/api/removable');
  if(!ds||!ds.length){toast(T('Aucun lecteur USB détecté','No USB drive detected'),'warn');return;}
  $('scanPath').value=ds[0]+'\\';
  ouvrirSurcouche($('scanModal'));
  scanFolderGo();
  if(ds.length>1)toast(T('Autres lecteurs : ','Other drives: ')+ds.slice(1).join(', '),'warn');
}
// export CSV de la bibliothèque
function exportCsv(){
  const rows=[['Name','TitleID','Format','Size','Path']];
  games.forEach(g=>rows.push([g.name,g.tid||'',g.format,Math.round(g.size/1048576)+' MB',g.path]));
  const csv=rows.map(r=>r.map(c=>'"'+String(c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['﻿'+csv],{type:'text/csv'}));a.download='xbox360-library.csv';a.click();
  toast(T('CSV exporté : ','CSV exported: ')+games.length+T(' jeux',' games'));
}
// sante de la bibliothèque : contenu orphelin + fichiers non reconnus
async function checkHealth(){
  ouvrirSurcouche($('healthModal'));
  $('healthBody').innerHTML='<div style="color:var(--text-3);padding:20px;text-align:center">'+T('Analyse en cours...','Analyzing...')+'</div>';
  try{
    const r=await api('/api/health');
    const iss=r.issues||[];
    $('healthBody').innerHTML=iss.length?iss.map(i=>{
      const lbl=i.type==='orphan'?T('CONTENU ORPHELIN','ORPHAN CONTENT'):T('TYPE INCONNU','UNKNOWN TYPE');
      return `<div class="dlrow"><span class="badge wait">${lbl}</span><span class="nm">${escH(i.name)} <span class="dim cap">${escH(i.tid||'')} — ${escH(i.detail||'')}</span></span><span class="sz">${fmt(i.size||0)}</span><button class="btn gray dlbtn" onclick="openPath(${jsA(i.path)})">${T('OUVRIR','OPEN')}</button></div>`;
    }).join(''):`<div style="color:var(--ac);padding:24px;text-align:center">✓ ${T('Aucun problème détecté — bibliothèque saine','No issue found — library is healthy')} (${r.games} ${T('jeux','games')})</div>`;
  }catch(e){$('healthBody').innerHTML='<div style="color:var(--danger);padding:20px;text-align:center">'+escH(T('Erreur : ','Error: ')+e.message)+'</div>';}
}

function dlmFileRow(name,size,url,col,src){
  const bc=col==='XBLA'?'god':col==='Indie'?'wait':col==='DLC'||col==='DLC XBLA'?'ext':'god';
  // LE BOUTON DE JUGEMENT EST DANS LA LIGNE DU FICHIER, et il n'apparait QUE si
  // le moteur repond : proposer un jugement qu'aucun modele ne peut rendre serait
  // une invite mensongere. La cellule qu'il remplit est la sienne — le verdict ne
  // touche ni la taille, ni le type, ni les boutons INSTALLER/DEPOT.
  // `dlmGame` porte l'identite ATTENDUE (nom + TitleID) : c'est elle que le
  // modele compare, et c'est la seule table ou les deux sont connus ensemble.
  const ia=iaPret?`<button class="btn quiet pad-s cap" onclick="event.stopPropagation();iaJugerFichier(${jsA(name)},${Number(size)||0},${jsA((dlmGame&&dlmGame.tid)||'')},this.parentNode)">${T('JUGER CE FICHIER','JUDGE THIS FILE')}</button>`:'';
  return `<tr><td data-l="${escA(enTete('dlmFiles',0))}" style="font-size:var(--fs-caption);word-break:break-all"><span class="v">${escH(name)}${src?`<div style="font-size:var(--fs-caption);color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px">${escH(src)}</div>`:''}</span></td><td data-l="${escA(enTete('dlmFiles',1))}" style="width:80px"><span class="v"><span class="badge ${bc}">${escH(col)}</span></span></td><td data-l="${escA(enTete('dlmFiles',2))}" style="color:var(--text-3);width:80px"><span class="v">${fmt(size)}</span></td><td data-l="${escA(enTete('dlmFiles',3))}" style="width:180px;white-space:nowrap"><span class="v"><button class="btn pad-s cap" onclick="dlcInstall(${jsA(url)},${jsA(name)})">${T('INSTALLER','INSTALL')}</button> <button class="btn gray pad-s cap" onclick="downloadFile(${jsA(url)},${jsA(name)})">${T('DÉPÔT','DROP')}</button></span></td><td data-l="${escA(enTete('dlmFiles',4))}" class="cap" style="width:170px"><span class="v">${ia}</span></td></tr>`;
}
async function delContent(p){
  if(!await confirmer({titre:T('Supprimer ce contenu','Delete this content'),
    corps:p, ok:T('SUPPRIMER','DELETE'), danger:true}))return;
  const r=await post('/api/content/delete',{path:p});
  toast(r.ok?T('Contenu supprimé','Content deleted'):T('Erreur : ','Error: ')+r.error,r.ok?'':'err');
  if(selected)loadContent(selected);
}

// routeur de recherche : source choisie par le controle segmente (vimm / vimmd /
// archive.org / dlc / toutes)
let dlSrc='all';
// Une section vide ne s'affiche pas : un en-tete « RÉSULTATS » au-dessus de rien
// se lit comme une page cassee, et il repoussait la file d'attente hors de vue.
function dlSec(nom,on){const h=$(nom+'H'),w=$(nom+'Wrap');if(h)h.hidden=!on;if(w)w.hidden=!on;}
// Ce que fait chaque source, en une ligne : « Vimm » et « Archive.org » sont deux
// mots opaques pour qui ne connait pas les deux sites.
//
// DEUX VAULTS VIMM, PAS UN : `vimm` est celui des DISQUES (Redump), `vimmd` celui
// du dematerialise (No-Intro) — DLC, Title Updates, XBLA, XBLIG. La note de chacun
// dit ce qu'il contient, parce que deux choix qui portent le meme mot « Vimm »
// obligeraient l'utilisateur a essayer pour savoir. La note du digital dit aussi
// qu'une partie de ce qu'il liste n'est PAS hebergee : c'est mesure (5 lignes sur
// 6 pour « WWE 2K17 »), et c'est la ligne qui le montre desormais.
const SRC_NOTES={
  all:()=>T('Interroge Vimm\'s Vault et archive.org en même temps, puis fusionne les résultats.','Queries Vimm\'s Vault and archive.org at once, then merges the results.'),
  vimm:()=>T('Le vault des disques Xbox 360 (Redump). Un seul téléchargement à la fois par IP — les « .iso » y sont souvent des 7z renommés.','The Xbox 360 disc vault (Redump). One download at a time per IP — its ".iso" files are often 7z in disguise.'),
  vimmd:()=>T('Le vault dématérialisé (No-Intro) : DLC, Title Updates (TU), XBLA et XBLIG. C\'est un catalogue — une partie de ce qu\'il liste n\'est pas hébergée, et la ligne le dit avant le clic.','The digital vault (No-Intro): DLC, Title Updates (TU), XBLA and XBLIG. It is a catalog — part of what it lists is not hosted, and the line says so before you click.'),
  ia:()=>T('Fichiers directs et packs DLC/XBLA des collections archive.org. Un compte est requis pour les collections restreintes.','Direct files and DLC/XBLA packs from archive.org collections. An account is required for restricted collections.'),
  dlc:()=>T('Contenus additionnels et XBLA uniquement — dossiers prêts à installer.','Add-on content and XBLA only — folders ready to install.')
};
function setSrcNote(){const n=$('dlSrcNote');if(n)n.textContent=(SRC_NOTES[dlSrc]||SRC_NOTES.all)();}
function pickSrc(el){dlSrc=el.dataset.src;document.querySelectorAll('.seg-i[data-src]').forEach(t=>t.classList.toggle('on',t===el));setSrcNote();}
function pickSrcVal(v){dlSrc=v;document.querySelectorAll('.seg-i[data-src]').forEach(t=>t.classList.toggle('on',t.dataset.src===v));setSrcNote();}
// Une recherche « toutes sources » sur un titre courant rendait 109 lignes d'un
// coup : la liste des fichiers se retrouvait loin sous la ligne de flottaison, et
// il fallait faire defiler sans savoir ou l'on allait.
// Pire, Vimm publie une fiche PAR REGION : « Halo 3 » occupait onze lignes
// identiques, seule la region changeait. On regroupe donc par jeu, regions en
// pastilles, et le detail se deplie — c'est deja ce que fait la surcouche pour
// les variantes de fichiers.
const MAX_RES=40;
let dlResGroups=[],dlResTout=false,dlBrut={vl:[],al:[]};
// Une seule recherche a le droit d'ecrire la table : la DERNIERE lancee. Sans ce
// compteur, la reponse d'une recherche abandonnee revient plus tard et reecrit la
// table. Mesure dans le navigateur (reseau reel, profil neuf) : une recherche
// « toutes sources » encore EN VOL quand l'action VIMM du Catalogue est cliquee
// rendait 48 lignes Vimm, puis archive.org repondait et la table affichait
// « 48 vimm + 7 archive.org » — le selecteur disant toujours « Vimm's Vault ».
// 20 echantillons sur 31 (500 ms pendant 15 s) montraient le melange. Il suffit
// qu'un catalogue soit lent : l'application annonce elle-meme « ~30 s si
// Cloudflare », et /api/search interroge 60 items archive.org.
let dlResGen=0;
function dlVimmToggle(gid,el){
  const l=document.querySelectorAll('.'+gid);
  if(!l.length)return;
  const ouvert=l[0].style.display!=='none';
  for(const e of l)e.style.display=ouvert?'none':'';
  if(el)el.classList.toggle('sel',!ouvert);
}
const normVimm=n=>String(n).toLowerCase().replace(/[\(\[][^\)\]]*[\)\]]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
// UN SEUL GABARIT POUR UNE LIGNE VIMM, et il porte les DEUX badges de la ligne.
//
// La recherche « Vimm » et la recherche « toutes » affichent la meme ligne dans la
// meme table, et les variantes repliees d'un seul jeu n'en different que par un
// retrait : trois copies du meme gabarit divergeraient au premier changement —
// c'est deja arrive a la cellule « vimm.net », restee apres le passage de la table
// a trois colonnes.
//
// `it.type` et `it.available` viennent de la page de resultats elle-meme (le
// `title` des badges, lu par `Vimm.parseListe`). Ils sont FACULTATIFS dans le
// gabarit : une reponse ancienne, ou un item sans badge, ne doit rien casser.
//
// `available === false` seulement, et jamais `!it.available` : une ligne se
// marque quand le vault l'a DIT. Un champ absent n'est pas une ligne morte, et
// crier au loup sur une ligne telechargeable ferait ignorer le vrai marquage.
//
// `o.cls` regroupe les lignes repliees, `o.cache` les masque au depart,
// `o.retrait` les decale sous leur ligne de tete, `o.sansSource` laisse la
// colonne SOURCE vide — elle est deja portee par cette ligne de tete.
function vimmRow(it,o){
  o=o||{};
  const t=String(it.type||'').trim();
  const typ=t?' <span class="badge">'+escH(t)+'</span>':'';
  const mort=it.available===false
    ?' <span class="badge errc" title="'+escA(T('Catalogué mais non hébergé sur Vimm : le téléchargement échouerait. Essaie l\'autre vault ou archive.org.','Catalogued but not hosted on Vimm: the download would fail. Try the other vault or archive.org.'))+'">'+T('Non hébergé','Not hosted')+'</span>'
    :'';
  const cls=o.cls?' class="'+o.cls+'"':'';
  const cache=o.cache?' style="display:none"':'';
  const pad=o.retrait?' style="padding-left:var(--sp-5)"':'';
  const src=o.sansSource?'':'<span class="badge ext">VIMM</span>';
  return `<tr tabindex="0"${cls}${cache} onclick="vimmFiles(${jsA(it.id)},${jsA(it.name)})"><td data-l="${escA(enTete('dlResults',0))}"${pad}><span class="v">${escH(it.name)}${typ}${mort}</span></td><td data-l="${escA(enTete('dlResults',1))}" class="dim"><span class="v">${escH(it.regions||'')||'—'} · v${escH(it.ver||'?')}</span></td><td data-l="${escA(enTete('dlResults',2))}"><span class="v">${src}</span></td></tr>`;
}
function dlVimmGroups(vl){
  const par={},ordre=[];
  for(const it of vl){const k=normVimm(it.name)||String(it.name).toLowerCase();if(!par[k]){par[k]=[];ordre.push(k);}par[k].push(it);}
  return ordre.map((k,gi)=>{
    const g=par[k];
    if(g.length===1)return [vimmRow(g[0])];
    const gid='dlvg'+gi;
    const base=g[0].name.replace(/[\(\[][^\)\]]*[\)\]]/g,'').replace(/\s+/g,' ').trim()||g[0].name;
    const regs=[...new Set(g.map(x=>(x.regions||'').trim()).filter(Boolean))];
    const tete=`<tr tabindex="0" class="grp" onclick="dlVimmToggle('${gid}',this)">`
      +`<td data-l="${escA(enTete('dlResults',0))}"><span class="v">${escH(base)} <span class="badge">×${g.length}</span></span></td>`
      +`<td data-l="${escA(enTete('dlResults',1))}" class="dim cap"><span class="v">${regs.map(r=>escH(r)).join(' · ')||T('plusieurs versions','several versions')}</span></td>`
      +`<td data-l="${escA(enTete('dlResults',2))}"><span class="v"><span class="badge ext">VIMM</span></span></td></tr>`;
    return [tete].concat(g.map(it=>vimmRow(it,{cls:gid,cache:true,retrait:true,sansSource:true})));
  });
}
// Une seule porte de sortie pour la liste de resultats : elle decide de ce qui
// est montre. Par defaut, uniquement le pertinent.
function dlResRender(){
  const vl=garderPertinents(dlBrut.vl,dlResTout);
  const al=garderPertinents(dlBrut.al,dlResTout);
  dlResGroups=dlVimmGroups(vl)
    .concat(al.map(it=>[`<tr tabindex="0" onclick="loadFiles(${jsA(it.id)})"><td data-l="${escA(enTete('dlResults',0))}"><span class="v">${escH(it.title)}</span></td><td data-l="${escA(enTete('dlResults',1))}"><span class="v">${fmt(it.size)}</span></td><td data-l="${escA(enTete('dlResults',2))}"><span class="v"><span class="badge">ARCHIVE.ORG</span></span></td></tr>`]));
  const brut=dlBrut.vl.length+dlBrut.al.length;
  if(!dlResGroups.length){
    $('dlResults').innerHTML='<tr><td class="tdfill" colspan="3">'+etatVide({
      icone:'search',
      titre:T('Rien de pertinent','Nothing relevant'),
      aide:brut
        ? T('Les catalogues ont répondu, mais aucun titre ne correspond vraiment à cette recherche. Les résultats hors sujet sont écartés plutôt que mélangés aux bons.','The catalogs answered, but no title really matches this search. Unrelated results are filtered out instead of being mixed in with the good ones.')
        : T('Les deux catalogues ont été interrogés et n\'ont rien renvoyé. Essaie le titre exact, ou le TitleID du jeu.','Both catalogs were queried and returned nothing. Try the exact title, or the game TitleID.'),
      bouton:brut?T('Voir les','Show all ')+brut+T(' résultats bruts',' raw results'):'',
      act:()=>dlResToutOn()
    })+'</td></tr>';
    return;
  }
  const vues=dlResTout?dlResGroups:dlResGroups.slice(0,MAX_RES);
  const total=dlResGroups.reduce((s,g)=>s+g.length,0);
  $('dlResults').innerHTML=vues.map(g=>g.join('')).join('')
    +(!dlResTout&&dlResGroups.length>MAX_RES
      ?'<tr><td class="tdfill" colspan="3"><button class="btn quiet" onclick="dlResToutOn()">'
        +T('Afficher les ','Show all ')+total+T(' résultats',' results')+'</button></td></tr>'
      :'');
}
function dlResToutOn(){dlResTout=true;dlResRender();}
// Resume honnete : combien de retenus, combien ecartes, et pourquoi.
function dlResStatut(){
  const vl=garderPertinents(dlBrut.vl,dlResTout), al=garderPertinents(dlBrut.al,dlResTout);
  const ecartes=(dlBrut.vl.length-vl.length)+(dlBrut.al.length-al.length);
  const n=vl.length+al.length;
  let s=(n||0)+T(' résultat(s) retenu(s)',' kept result(s)');
  if(n)s+=' — '+vl.length+' vimm + '+al.length+' archive.org';
  if(ecartes)s+=' · '+ecartes+T(' écarté(s) comme hors sujet',' filtered out as unrelated');
  return s;
}
// UNE SEULE PORTE pour la longueur minimale d'une requete, et elle sert les DEUX
// tables de resultats. Les trois fonctions de la table RÉSULTATS repetaient la
// meme garde, et chacune sortait AVANT de toucher la table : l'ancienne liste
// restait donc affichee. Mesure dans le navigateur (profil neuf, reseau reel) :
// une recherche « toutes » rendant 61 lignes dont 7 archive.org, puis « a » avec
// le selecteur sur Vimm — les 61 lignes ET les 7 archive.org restaient en place,
// alors que la barre ne decrivait plus du tout cette recherche. Meme famille de
// mensonge que la course corrigee juste au-dessus, par un autre mecanisme.
// `searchDlcTab` en avait une QUATRIEME, pour #dlFiles : meme mensonge, autre
// tableau. Il n'y a donc plus qu'une comparaison, et `tab` dit a QUELLE table la
// requete appartenait — c'est la seule chose qui differe (section, colonnes,
// icone, etat brut). Deux copies de la meme intention divergent toujours.
// On VIDE, et on DIT pourquoi : un tableau vide sans explication est le defaut
// qu'on corrige ailleurs dans ce fichier.
function dlResTropCourt(q,tab){
  if(q.length>=2)return false;
  ++dlResGen;   // les tables n'appartiennent plus a la recherche precedente : une reponse
                // en retard ne doit pas les regarnir sous une barre qui a change
  const dit=T('Saisis au moins 2 caractères','Type at least 2 characters');
  const aide=T('Les catalogues ne sont pas interrogés en dessous de deux caractères. La liste précédente est retirée avec la recherche : la garder à l\'écran afficherait des résultats qui ne correspondent plus.','The catalogs are not queried below two characters. The previous list goes away with the search: keeping it on screen would show results that no longer match.');
  if(tab==='files'){
    // #dlFiles : quatre colonnes, onglet DLC/XBLA.
    dlFilesBrut=[];dlFilesTout=false;
    dlSec('dlRes',false);dlSec('dlFiles',true);
    $('dlFiles').innerHTML='<tr><td class="tdfill" colspan="4">'+etatVide({
      icone:'plus-box',titre:dit,aide:aide
    })+'</td></tr>';
  }else{
    // #dlResults : trois colonnes, sources Vimm / archive.org / toutes.
    dlBrut={vl:[],al:[]};dlResTout=false;dlResGroups=[];
    dlSec('dlRes',true);dlSec('dlFiles',false);
    $('dlResults').innerHTML='<tr><td class="tdfill" colspan="3">'+etatVide({
      icone:'search',titre:dit,aide:aide
    })+'</td></tr>';
  }
  $('dlStatus').textContent=dit;
  return true;
}
async function searchDl(){
  const src=dlSrc;
  if(src==='ia')return searchStore();
  if(src==='vimm')return searchVimm();
  // LE VAULT DIGITAL EST UNE VALEUR DE PLUS, PAS UN CHEMIN DE PLUS : meme
  // fonction, meme table, meme porte de sortie que le vault des disques. Cote
  // serveur, c'est exactement le meme choix (`Vimm.systeme` + `Vimm.urlListe`) —
  // dupliquer la recherche aurait fait deux lectures du meme HTML, et la seconde
  // aurait perdu le type et la disponibilite sans que rien ne le dise.
  if(src==='vimmd')return searchVimm('X360-D');
  if(src==='dlc')return searchDlcTab();
  const q=$('dlSearch').value.trim();if(dlResTropCourt(q,'res'))return;
  const gen=++dlResGen;                  // cette recherche devient la seule a pouvoir ecrire
  dlSec('dlRes',true);dlSec('dlFiles',false);
  $('dlStatus').textContent=T('Recherche toutes sources...','Searching all sources...');
  $('dlResults').innerHTML='<tr><td class="tdfill" colspan="3">'+skelRows(4)+'</td></tr>';
  const [v,a]=await Promise.all([
    api('/api/vimm?q='+encodeURIComponent(q)).catch(()=>[]),
    api('/api/search?q='+encodeURIComponent(q)).catch(()=>[])
  ]);
  if(gen!==dlResGen)return;              // une recherche plus recente a pris la table
  const vl=v&&!v.error?(v||[]):[], al=a&&!a.error?(a||[]):[];
  // Vimm n'etait PAS note du tout : sa recherche est floue et « halo » remontait
  // « Dragon Age: Nachalo ». Meme bareme que partout ailleurs.
  classerPertinence(vl,q,it=>it.name,it=>it.name+' '+(it.regions||''));
  classerPertinence(al,q,it=>it.title,it=>it.title+' '+it.id);
  dlBrut={vl,al};dlResTout=false;
  dlResRender();
  $('dlStatus').textContent=dlResStatut();
}
async function searchStore(){
  const q=$('dlSearch').value.trim();if(dlResTropCourt(q,'res'))return;
  const gen=++dlResGen;
  dlSec('dlRes',true);dlSec('dlFiles',false);
  $('dlStatus').textContent=T('Recherche...','Searching...');
  $('dlResults').innerHTML='<tr><td class="tdfill" colspan="3">'+skelRows(4)+'</td></tr>';
  const r=await api('/api/search?q='+encodeURIComponent(q));
  if(gen!==dlResGen)return;              // une recherche plus recente a pris la table
  const l=r||[];
  classerPertinence(l,q,it=>it.title,it=>it.title+' '+it.id);
  // Ici, une seule source : la liste brute tient dans dlBrut.vl pour que la
  // meme porte de sortie (et le meme bouton « voir les bruts ») s'applique.
  dlBrut={vl:[],al:l};dlResTout=false;
  dlResRender();
  $('dlStatus').textContent=dlResStatut();
}
// Fichiers d'un item archive.org. Meme regle que partout : on ne montre que le
// pertinent, et « voir les bruts » est un choix explicite de l'utilisateur.
let dlFilesBrut=[],dlFilesTout=false;
function dlFilesRender(){
  const brut=dlFilesBrut;
  const liste=dlFilesTout?brut:brut.filter(f=>f._s>0);
  $('dlFiles').innerHTML=liste.length
    ? liste.slice(0,25).map(f=>`<tr tabindex="0" onclick="downloadFile(${jsA(f.url)},${jsA(f.name)})"><td data-l="${escA(enTete('dlFiles',0))}"><span class="v">${escH(f.name)}</span></td><td data-l="${escA(enTete('dlFiles',1))}" class="dim"><span class="v">archive.org</span></td><td data-l="${escA(enTete('dlFiles',2))}"><span class="v">${fmt(f.size)}</span></td><td data-l="${escA(enTete('dlFiles',3))}" class="c-act"><span class="v"><button class="btn quiet">${T('Déposer','Drop')}</button></span></td></tr>`).join('')
    : '<tr><td class="tdfill" colspan="4">'+etatVide({
        icone:'box',
        titre:brut.length?T('Aucun fichier ne porte ce nom','No file carries that name'):T('Aucun fichier téléchargeable','No downloadable file'),
        aide:brut.length
          ? T('Cet item contient des fichiers, mais aucun ne correspond à la recherche. Les collections, bandes-son et disques de démo sont écartés.','This item holds files, but none matches the search. Collections, soundtracks and demo discs are filtered out.')
          : T('Cet item archive.org ne contient aucune archive reconnue (.iso, .7z, .zip, .rar, .god).','This archive.org item holds no recognised archive (.iso, .7z, .zip, .rar, .god).'),
        bouton:brut.length?T('Voir les','Show all ')+brut.length+T(' fichiers bruts',' raw files'):'',
        act:()=>{dlFilesTout=true;dlFilesRender();}
      })+'</td></tr>';
  $('dlStatus').textContent=liste.length
    ? liste.length+T(' fichier(s) pertinent(s) — clic pour télécharger',' relevant file(s) — click to download')
      +(brut.length>liste.length?' · '+(brut.length-liste.length)+T(' écarté(s)',' filtered out'):'')
    : brut.length+T(' fichier(s), aucun pertinent',' file(s), none relevant');
}
async function loadFiles(id){
  dlSec('dlFiles',true);
  $('dlStatus').textContent=T('Fichiers...','Files...');
  $('dlFiles').innerHTML='<tr><td class="tdfill" colspan="4">'+skelRows(4)+'</td></tr>';
  const r=await api('/api/item?id='+encodeURIComponent(id));
  const q=$('dlSearch').value.trim();
  const good=(r||[]).filter(f=>DL_EXT.includes('.'+f.name.split('.').pop().toLowerCase()));
  const pool=good.length?good:(r||[]);
  classerPertinence(pool,q,f=>f.name,f=>f.name+' '+(f.src||''));
  dlFilesBrut=pool;dlFilesTout=false;
  dlFilesRender();
}
// Vimm's Vault : recherche -> fiche jeu (Turnstile resolu via Edge/CDP cote serveur) -> mediaId -> DL
//
// `sys` choisit LE VAULT, et rien d'autre : absent = les disques (le defaut
// d'avant le parametre, donc la requete reste identique a l'octet), `X360-D` = le
// dematerialise. Les deux vaults partagent l'espace d'`id` et la route
// `/api/vimmfiles` n'a donc pas besoin de le connaitre.
let vimmCtx=null;
async function searchVimm(sys){
  const q=$('dlSearch').value.trim();if(dlResTropCourt(q,'res'))return;
  const gen=++dlResGen;                  // cette recherche devient la seule a pouvoir ecrire
  dlSec('dlRes',true);dlSec('dlFiles',false);
  $('dlStatus').textContent=T('Recherche Vimm\'s Vault...','Searching Vimm\'s Vault...');
  $('dlResults').innerHTML='<tr><td class="tdfill" colspan="3">'+skelRows(4)+'</td></tr>';
  const r=await api('/api/vimm?q='+encodeURIComponent(q)+(sys?'&system='+encodeURIComponent(sys):''));
  if(gen!==dlResGen)return;              // une recherche plus recente a pris la table
  // Cette table est reconstruite a partir de la SEULE liste Vimm : l'etat brut doit
  // le dire. Sinon il decrit encore la recherche precedente, et le premier
  // dlResRender venu (« Afficher les N resultats ») rallume ses lignes archive.org.
  dlBrut={vl:[],al:[]};dlResTout=false;
  if(r.error){$('dlResults').innerHTML='';$('dlStatus').textContent=T('Erreur : ','Error: ')+r.error;return;}
  const l=r||[];
  // La recherche Vimm est floue : « halo » y remonte « Dragon Age: Nachalo ».
  // C'est ici que le tri par pertinence se voit le plus.
  classerPertinence(l,q,it=>it.name,it=>it.name+' '+(it.regions||''));
  const rel=l.filter(it=>it._s>0);
  // COMBIEN DE LIGNES SANS FICHIER, et on le dit AVANT le clic. Mesure : 5 lignes
  // sur 6 pour « WWE 2K17 », 2 sur 5 pour « Tiger Woods PGA Tour 12 » — le vault
  // digital est un INDEX (No-Intro), et une partie de ce qu'il liste n'est pas
  // hebergee. Le compter ici evite d'envoyer l'utilisateur dans un mur : sans ce
  // chiffre, il ne l'apprend qu'apres deux clics.
  const morts=rel.filter(it=>it.available===false).length;
  $('dlResults').innerHTML=rel.length
    ? rel.map(it=>vimmRow(it)).join('')
    : '<tr><td class="tdfill" colspan="3">'+etatVide({
        icone:'vault',
        titre:l.length?T('Rien de pertinent','Nothing relevant'):T('Aucun résultat','No result'),
        aide:l.length
          ? T('Le vault a répondu, mais aucun titre ne correspond vraiment — sa recherche est approximative. Archive.org a souvent des dumps redump du même jeu.','The vault answered, but no title really matches — its search is approximate. Archive.org often has redump dumps of the same game.')
          : T('Le vault ne propose pas ce titre. Archive.org a souvent des dumps redump du même jeu.','The vault has no such title. Archive.org often has redump dumps of the same game.'),
        bouton:T('Chercher sur archive.org','Search archive.org'),
        act:()=>{pickSrcVal('ia');searchDl();}
      })+'</td></tr>';
  $('dlStatus').textContent=rel.length
    ? rel.length+T(' résultat(s) — clic = voir les fichiers',' result(s) — click = show files')
      +(morts?' · '+morts+T(' non hébergé(s)',' not hosted'):'')
      +(l.length>rel.length?' · '+(l.length-rel.length)+T(' écarté(s) comme hors sujet',' filtered out as unrelated'):'')
    : l.length+T(' résultat(s), aucun pertinent',' result(s), none relevant');
}
async function vimmFiles(id,name){
  dlSec('dlFiles',true);
  $('dlStatus').textContent=T('Lecture de la page Vimm (peut prendre ~30s si Cloudflare)...','Reading Vimm page (can take ~30s if Cloudflare)...');
  $('dlFiles').innerHTML='<tr><td class="tdfill" colspan="4">'+skelRows(4)+'</td></tr>';
  const r=await api('/api/vimmfiles?id='+id);
  if(r.error){$('dlFiles').innerHTML='';dlSec('dlFiles',false);$('dlStatus').textContent=T('Erreur : ','Error: ')+r.error;return;}
  vimmCtx=r;
  const medias=r.medias||[];
  // COMBIEN DE GALETTES, ET LESQUELLES. Le nom du fichier porte « (Disc N) » :
  // c'est la seule chose dont on se sert, jamais l'ordre des medias ni leurs ids
  // (mesure : le Disc 2 de Castlevania porte l'id le PLUS PETIT).
  const gal=resumeDisques(medias,r.action);
  noterGalettes(id,medias);           // la fiche du jeu saura alors le total
  const ligne=ligneDisques(gal);
  // UNE GALETTE QU'ON PEUT PRENDRE : un bouton par galette, dans la ligne. Le
  // disque manquant se prend donc en UN clic, sans avoir a lire le nom du
  // fichier pour retrouver lequel c'est.
  const boutons=gal.dispo.map(n=>{
    const i=medias.findIndex(m=>disqueDuNom(m.file||m.label)===n&&!m.alt);
    return i<0?'':'<button class="btn pad-s cap" onclick="event.stopPropagation();vimmDl('
      +jsA(id)+','+i+')">'+escH(nomGalette(n))+'</button>';
  }).join(' ');
  const dG=n=>n?'<span class="badge god">'+escH(nomGalette(n))+'</span>':'';
  $('dlFiles').innerHTML=medias.map((m,i)=>`<tr tabindex="0" onclick="vimmDl(${jsA(id)},${i})"><td data-l="${escA(enTete('dlFiles',0))}"><span class="v">${escH(m.file||m.label)}</span></td><td data-l="${escA(enTete('dlFiles',1))}"><span class="v"><span class="badge ext">VIMM</span> ${dG(disqueDuNom(m.file||m.label))}</span></td><td data-l="${escA(enTete('dlFiles',2))}" class="dim"><span class="v">${escH(m.label)}</span></td><td data-l="${escA(enTete('dlFiles',3))}" class="c-act"><span class="v"><button class="btn quiet">DL</button></span></td></tr>`).join('');
  $('dlStatus').innerHTML=(r.title||name)+' — '+medias.length+T(' média(s) — clic pour télécharger',' media(s) — click to download')
    +(ligne?` — <span class="acc">${escH(ligne.txt)}</span>`:'')
    +(ligne&&gal.dispo.length>1?' '+boutons:'');
  pollDl();   // les enchaînements partis tout seuls doivent se voir tout de suite
}
async function vimmDl(id,i){
  if(!vimmCtx)return;
  const m=vimmCtx.medias[i];if(!m)return;
  // ON ENVOIE LA LISTE DES MEDIAS. C'est elle qui porte « (Disc 2) » : sans
  // elle, le serveur ne peut pas savoir qu'il existe un disque suivant, et
  // l'enchainement decide par l'utilisateur n'aurait rien a enchainer. On envoie
  // la liste du vault TELLE QU'ELLE, avec l'ordre et les ids d'origine : c'est le
  // NOM qui decide quel disque est lequel, jamais l'ordre ni l'id (mesure : le
  // Disc 2 de Castlevania porte l'id le plus petit).
  const r=await post('/api/vimmdl',{id,mediaId:m.id,token:vimmCtx.token,alt:m.alt||0,action:vimmCtx.action,name:m.file||((vimmCtx.title||'vimm_'+m.id)+'.iso'),ua:vimmCtx.ua,cookie:vimmCtx.cookie,title:vimmCtx.title,medias:vimmCtx.medias.map(x=>({id:x.id,file:x.file,alt:x.alt||0}))});
  if(r.error){$('dlStatus').textContent=T('Erreur : ','Error: ')+r.error;return;}
  // CE QUI VA SUIVRE SE DIT ICI. Un jeu a plusieurs galettes enchainera le
  // disque suivant tout seul : le taire ferait partir 6,6 Go sans prevenance.
  const suite=resumeDisques(vimmCtx.medias,vimmCtx.action);
  $('dlStatus').textContent=suite.total>1
    ?T('Téléchargement lancé','Download started')+' — '
      +T('les disques de ce jeu s\'enchaîneront un à la fois ; chacun s\'annule dans la file',
         'this game\'s discs will chain one at a time; each can be cancelled in the queue')
    :T('Téléchargement lancé','Download started');
  pollLog();
  pollDl();
}

// L'onglet DLC/XBLA ecrit #dlFiles, pas #dlResults : il passe donc la MEME porte
// que les trois autres, en lui disant quelle table la requete concerne. La garde
// « moins de deux caracteres » qui vivait ici sortait avant de toucher la liste :
// une frappe d'un seul caractere laissait les packs precedents affiches sous une
// barre qui ne les decrivait plus — le mensonge de la table RÉSULTATS, transpose
// dans l'autre tableau. Le compteur de generation, lui, empeche la reponse d'une
// recherche encore en vol de regarnir une liste qui vient d'etre videe.
async function searchDlcTab(){
  const q=$('dlSearch').value.trim();if(dlResTropCourt(q,'files'))return;
  const gen=++dlResGen;                  // cette recherche devient la seule a pouvoir ecrire
  dlSec('dlRes',false);dlSec('dlFiles',true);
  $('dlStatus').textContent=T('Recherche DLC/XBLA dans les collections Xbox 360...','Searching Xbox 360 DLC/XBLA collections...');
  $('dlFiles').innerHTML='<tr><td class="tdfill" colspan="4">'+skelRows(4)+'</td></tr>';
  const files=await api('/api/dlc?q='+encodeURIComponent(q));
  if(gen!==dlResGen)return;              // une recherche plus recente a pris la liste
  if(files.error){$('dlFiles').innerHTML='';dlSec('dlFiles',false);$('dlStatus').textContent=T('Erreur : ','Error: ')+files.error;return;}
  const l=files||[];
  classerPertinence(l,q,f=>f.name,f=>f.name+' '+(f.src||'')+' '+(f.col||''));
  const rel=l.filter(f=>f._s>0);
  $('dlFiles').innerHTML=rel.length?rel.map(f=>`<tr><td data-l="${escA(enTete('dlFiles',0))}" onclick="dlcDl(${jsA(f.url)},${jsA(f.name)})"><span class="v">${escH(f.name)}</span></td><td data-l="${escA(enTete('dlFiles',1))}"><span class="v"><span class="badge ${f.col==='XBLA'?'god':f.col==='Indie'?'wait':'ext'}">${escH(f.col)}</span></span></td><td data-l="${escA(enTete('dlFiles',2))}"><span class="v">${fmt(f.size)}</span></td><td data-l="${escA(enTete('dlFiles',3))}" class="c-act"><span class="v"><button class="btn quiet" onclick="dlcInstall(${jsA(f.url)},${jsA(f.name)})">${T('Installer','Install')}</button></span></td></tr>`).join('')
    :'<tr><td class="tdfill" colspan="4">'+etatVide({
      icone:'plus-box',
      titre:l.length?T('Rien de pertinent','Nothing relevant'):T('Aucun pack DLC/XBLA','No DLC/XBLA pack'),
      aide:l.length
        ? T('Les collections ont répondu, mais aucun pack ne correspond à ce titre. Les packs hors sujet ne sont pas mélangés aux bons.','The collections answered, but no pack matches this title. Unrelated packs are not mixed in with the good ones.')
        : T('Aucun pack pour ce titre — soit il n\'en a pas, soit les collections archive.org sont restreintes (un compte est alors nécessaire).','No pack for this title — either it has none, or the archive.org collections are restricted (an account is then required).'),
      bouton:l.length?'':T('Se connecter à archive.org','Sign in to archive.org'),
      act:()=>cookieHelp()
    })+'</td></tr>';
  dlSec('dlFiles',true);
  $('dlStatus').innerHTML=rel.length
    ? rel.length+T(' pack(s) DLC/XBLA — INSTALLER = direct dans Content, clic sur le nom = dépôt',' DLC/XBLA pack(s) — INSTALL = straight into Content, click the name = drop folder')
      +(l.length>rel.length?' · '+(l.length-rel.length)+T(' écarté(s) comme hors sujet',' filtered out as unrelated'):'')
      +(hasCookie?'':` — <span class="warnc ptr link" onclick="cookieHelp()">${T('compte archive.org requis : TUTO','archive.org account required: HOW-TO')}</span>`)
    : l.length+T(' pack(s), aucun pertinent',' pack(s), none relevant');
}
async function downloadUrl(){const u=$('dlUrl').value.trim();if(!u)return;const r=await post('/api/download',{url:u});toast(r.queued?T('Ajouté à la file (','Added to queue (')+r.queued+')':T('Erreur : ','Error: ')+r.error,r.queued?'':'err');pollDl();}
async function downloadFile(url,name){if(needCookie(url))return;const r=await post('/api/download',{url,name,install:1});toast(r.queued?T('En file : ','Queued: ')+r.file+T(' — extrait et converti en GOD automatiquement',' — auto-extracted and converted to GOD'):T('Erreur : ','Error: ')+r.error,r.queued?'':'err');pollDl();}
let dlTimer=null,dlData=null;
const dlEta=d=>{if(!d.speed||!d.total)return'—';const s=Math.max(0,(d.total-d.received)/d.speed);if(s>3600)return Math.floor(s/3600)+'h '+Math.floor(s%3600/60)+'min';if(s>60)return Math.floor(s/60)+'min '+Math.round(s%60)+'s';return Math.round(s)+'s';};
async function dlCtl(id,action){const r=await post('/api/dlctl',{id,action});if(r.error)toast(r.error,'err');pollDl();}
async function vimmCancel(id){const r=await post('/api/vimmcancel',{id});toast(r.ok?T('Slot Vimm libéré — réessayez le DL','Vimm slot released — retry the download'):T('Erreur : ','Error: ')+r.error,r.ok?'':'err');}
// LE POINT DE DECISION UNIQUE pour « va chercher ce titre sur l'autre source ».
// Trois appelants : la ligne d'action de l'assistant (altIa / altVimm), le bouton
// VIMM du Catalogue, et les deux boutons de la liste des telechargements. Deux
// copies de la meme intention divergent toujours — c'est pourquoi il n'y en a
// qu'une.
// `go('act')` fait PARTIE de la decision : sans lui, un appel depuis le Catalogue
// changerait la source et lancerait la recherche sans jamais montrer la vue ou le
// resultat arrive — l'utilisateur aurait clique et rien ne se serait passe a
// l'ecran. La source reste un PARAMETRE plutot qu'une constante : l'assistant s'en
// sert aussi pour renvoyer vers archive.org.
function dlAlt(q,src){go('act');$('dlSearch').value=q||'';pickSrcVal(src);searchDl();}
function dlOpen(id){const d=dlData&&dlData.items.find(x=>x.id===id);if(d)post('/api/open',{path:(d.dir||dlData.drop)+'\\'+d.name});}
function dlOrg(){openOrganize();}
async function pollDl(){
  try{dlData=await api('/api/downloads');}catch{dlTimer=setTimeout(pollDl,5000);return;}
  renderDl(dlData);
  const busy=dlData.items.some(d=>d.status==='active'||d.status==='queued'||d.installing);
  clearTimeout(dlTimer);dlTimer=setTimeout(pollDl,busy?900:6000);
}
function renderDl(s){
  const items=s.items;
  const acts=items.filter(d=>d.status==='active');
  const queue=items.filter(d=>d.status==='queued');
  actBadgeDl=acts.length+queue.length;actBadgeMaj();
  // mini indicateur sidebar
  const mini=$('dlMini');
  if(acts.length){mini.style.display='flex';const tot=acts.reduce((s,d)=>s+(d.total||0),0),rec=acts.reduce((s,d)=>s+d.received,0),spd=acts.reduce((s,d)=>s+(d.speed||0),0),p=tot?Math.round(rec/tot*100):0;$('dlMiniT').textContent='↓ '+(acts.length>1?acts.length+' '+T('téléchargements','downloads'):acts[0].name);$('dlMiniB').style.width=p+'%';$('dlMiniS').textContent=p+'% · '+fmt(spd)+'/s'+(queue.length?' · +'+queue.length:'');}
  else mini.style.display='none';
  // Le rendu vit dans renderActFile() : telechargements + transferts console
  // se melangent dans la meme file a trois groupes.
  renderActFile();
}


// glisser-déposer -> dépôt (rien ne bouge sans confirmation)
let dragN=0;
document.addEventListener('dragenter',e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files')){dragN++;$('dropzone').classList.add('on');}});
document.addEventListener('dragleave',()=>{if(--dragN<=0){dragN=0;$('dropzone').classList.remove('on');}});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',async e=>{
  e.preventDefault();dragN=0;$('dropzone').classList.remove('on');
  const files=[...e.dataTransfer.files];if(!files.length)return;
  toast(T('Envoi de ','Sending ')+files.length+T(' fichier(s) vers le dépôt...',' file(s) to the drop folder...'));
  for(const f of files){
    try{const r=await fetch('/api/upload?name='+encodeURIComponent(f.name),{method:'POST',body:f});const j=await r.json();toast(j.ok?T('Importe : ','Imported: ')+f.name+T(' (dépôt)',' (drop folder)'):T('Erreur ','Error ')+f.name+' : '+j.error,j.ok?'':'err');}
    catch(err){toast(T('Erreur envoi ','Send error ')+f.name,'err');}
  }
  toast(T('Terminé — lance TRIER quand tu es prêt','Done — run ORGANIZE when ready'),'warn');
});
// ---------- Scripts Aurora (LUA) --------------------------------------------
// Aurora execute des scripts LUA : filtres, tris, sous-titres, utilitaires. Le
// depot officiel XboxUnity (AuroraScripts) publie quatre index INI, et
// AuroraRepo/Repos.ini donne les chemins ou ils vont sur la console :
//   Utility Scripts -> Game:\User\Scripts\Utility\
//   Filters/Sorts/Subtitles -> Game:\User\Scripts\Content\<Categorie>\
// On lit donc la MEME source que la console, et on envoie le script par FTP si
// une session est ouverte — un fichier pose dans un dossier du PC ne sert a rien
// a Aurora.
let asItems=[],asLoaded=false,asCat='',asInstalleTotal=0,asEmplacement='';
async function loadScripts(force){
  $('asList').innerHTML=skelRows(8);
  $('asStatus').textContent=T('Chargement des dépôts XboxUnity...','Loading XboxUnity repositories...');
  try{
    const r=await api('/api/ascripts'+(force?'?refresh=1':''));
    if(r.error&&!(r.items||[]).length){
      $('asList').innerHTML=etatVide({icone:'script',titre:T('Dépôts injoignables','Repositories unreachable'),aide:r.error});
      $('asStatus').textContent=T('Erreur','Error');
      return;
    }
    asItems=r.items||[];
    // Ce que le DISQUE contient deja, et ou. La route relit l'inventaire a chaque
    // reponse : le catalogue est en cache 24 h, l'inventaire du disque non.
    asInstalleTotal=r.installeTotal||0;
    asEmplacement=(r.emplacements||[])[0]||'';
    asLoaded=true;
    asFiltre();
  }catch(e){
    $('asList').innerHTML=etatVide({icone:'script',titre:T('Dépôts injoignables','Repositories unreachable'),aide:e.message});
    $('asStatus').textContent=T('Erreur : ','Error: ')+e.message;
  }
}
function asKind(k,btn){asCat=k;document.querySelectorAll('#asCat .seg-i').forEach(b=>b.classList.toggle('on',b===btn));asFiltre();}
function asFiltre(){
  const q=($('asQ').value||'').trim().toLowerCase();
  const l=asItems.filter(s=>(!asCat||s.cat===asCat)
    &&(!q||(s.titre+' '+s.auteur+' '+s.description).toLowerCase().includes(q)));
  const parCat=l.length&&!asCat;
  // Le compte dit sur quoi il porte, comme partout ailleurs.
  let st=l.length===1?T('1 script','1 script'):l.length+T(' scripts',' scripts');
  if(asItems.length&&l.length<asItems.length)st+=T(' sur ',' of ')+asItems.length;
  else if(!l.length)st=T('Aucun script','No script');
  if(asCat)st+=' · '+escH((asItems.find(s=>s.cat===asCat)||{}).catNom||asCat);
  if(q)st+=' · « '+q+' »';
  // Ce qu'on possede DEJA, lu sur le disque branche. Sans ce chiffre, il faut
  // parcourir 38 lignes pour savoir ce qui est en place.
  if(asInstalleTotal)st+=' · '+asInstalleTotal+' '+T('déjà installé(s)','already installed')+(asEmplacement?' ('+escH(asEmplacement)+')':'');
  $('asStatus').textContent=st;
  if(!l.length){
    $('asList').innerHTML=etatVide({icone:'script',titre:T('Aucun script ne correspond','No script matches'),
      aide:T('Les dépôts officiels publient des filtres, des tris, des sous-titres et des utilitaires. Essaie un autre mot, ou une autre catégorie.','The official repositories publish filters, sorts, subtitles and utilities. Try another word, or another category.'),
      bouton:T('Tout montrer','Show all'),act:()=>{$('asQ').value='';asKind('',document.querySelector('#asCat .seg-i'))}});
    return;
  }
  // Aucune categorie choisie : on GROUPE, sinon 38 lignes se suivent sans repere.
  let html='';
  let dernier='';
  for(const s of l){
    if(parCat&&s.catNom!==dernier){dernier=s.catNom;html+=`<h2 class="sec">${escH(s.catNom.toUpperCase())}</h2>`;}
    html+=asRow(s);
  }
  $('asList').innerHTML=html;
}
function asRow(s){
  const meta=[s.version?'v'+s.version:'',s.auteur].filter(Boolean).join(' · ');
  return `<div class="lrow asrow">
    <span class="asico"><svg><use href="#i-script"/></svg></span>
    <div class="asbody">
      <div class="astop">${escH(s.titre)}${meta?` <span class="ldim">${escH(meta)}</span>`:''}
        ${s.installe?` <span class="badge ok" title="${escA(T('Déjà installé dans ','Already installed in ')+s.installeChemin)}">${T('INSTALLÉ','INSTALLED')}</span>`:''}
        ${s.archive?' <span class="badge wait" title="'+escA(T('Dossier complet : Aurora l\'installe depuis son navigateur de dépôt','Whole folder: Aurora installs it from its repo browser'))+'">'+T('DOSSIER','FOLDER')+'</span>':''}
      </div>
      <div class="asdesc">${escH(s.description||T('Pas de description fournie.','No description provided.'))}</div>
      <!-- Le chemin dit OU ca IRA, et c'est celui que le serveur utilisera : il vient
           de la MEME fonction (Ascripts.destination). Avant, cet ecran annoncait un
           chemin CONSTANT (« /Game/User/Scripts/Utility ») pour tout le monde, alors
           que la seule installation trouvee pouvait etre E:\Aurora et que l'envoi
           visait un troisieme chemin. Quand rien n'est decidable, on le DIT au lieu
           d'inventer. PAS DE BACKTICK ICI : ce commentaire vit dans un template
           literal, et un backtick terminerait la chaine. -->
      <div class="asdesc aspath">${escH(s.installe?s.installeChemin
        :(s.cible?(s.cibleOu==='disque'?T('Sur le disque : ','On disk: '):T('Sur la console : ','On the console: '))+s.cible
        :T('Destination à déterminer — ','Destination to be determined — ')+(s.cibleRaison||'')))}</div>
    </div>
    <span class="ca"><button class="btn ${s.installe?'quiet':'accent'}" onclick="asInstall(${jsA(s.id)})">${s.installe?T('RÉINSTALLER','REINSTALL'):T('INSTALLER','INSTALL')}</button></span>
  </div>`;
}
async function asInstall(id){
  const s=asItems.find(x=>x.id===id);
  if(!s)return;
  // On dit OU ca va avant d'y aller. Le titre porte l'action et le nom ; le corps ne
  // garde que la DESTINATION — la seule information qui manquait pour decider, et
  // celle qui etait FAUSSE (un chemin fixe au lieu du chemin reel). Rien n'est
  // irreversible ici, donc pas de bord rouge : la gravite doit rester un signal.
  const corps=s.cible
    ? (s.cibleOu==='disque'
        ? T('Le script sera installé dans ','The script will be installed in ')+s.cible
          +T('\n\nC\'est l\'installation d\'Aurora trouvée sur ton disque : la clé est le support de la console, donc il sera lu au prochain démarrage.',
              '\n\nThat is the Aurora install found on your disk: the key is the console\'s own storage, so it will be read on next boot.')
        : T('Destination sur la console : ','Destination on the console: ')+s.cible
          +T('\n\nLe disque ne porte aucune installation d\'Aurora : le script y sera envoyé par FTP.',
              '\n\nNo Aurora install was found on disk: the script will be sent there over FTP.'))
    : T('Je ne sais pas encore où poser ce script : ','I do not know yet where to put this script: ')
      +(s.cibleRaison||T('aucune installation Aurora trouvée','no Aurora install found'))
      +T('\n\nInstalle quand même ? Il sera extrait dans le dépôt et tu pourras l\'envoyer ensuite.',
         '\n\nInstall anyway? It will be extracted into the drop folder and you can send it later.');
  if(!await confirmer({titre:T('Installer ','Install ')+s.titre+(s.version?' v'+s.version:''),
    corps, ok:T('INSTALLER','INSTALL')}))return;
  const r=await post('/api/ascripts/install',{cat:s.cat,url:s.url,nom:s.nom,archive:s.archive});
  if(r.error){toast(T('Echec : ','Failed: ')+r.error,'err');return;}
  if(r.installe)toast(T('Installé dans ','Installed into ')+r.installe);
  else if(r.envoye)toast(T('Installé sur la console : ','Installed on the console: ')+r.envoye);
  else toast(T('Posé dans le dépôt : ','Placed in the drop folder: ')+r.local+(conConnecte?'':T(' — connecte la console pour l\'y envoyer.',' — connect the console to send it.')),'warn');
  if(r.note)toast(r.note,'warn');
  if(r.aRedemarrer)toast(T('Redémarre Aurora pour que le script soit pris en compte.','Restart Aurora for the script to take effect.'),'warn');
}

// ---------- Manette (Gamepad API) -------------------------------------------
// Le bandeau annoncait « LB RB NAVIGUER » et les actions rapides affichaient des
// pastilles A / X / B / Y, sans qu'AUCUNE manette ne soit geree. Sur un PC branche
// a la television, a cote de la console, la manette est pourtant le seul
// peripherique a portee de main : se lever pour reprendre la souris annule tout
// l'interet de l'application.
//
// On deplace le focus REEL du navigateur : les elements portent deja tabindex="0"
// et l'anneau de focus est deja stylé. On n'entretient donc aucun etat en double —
// le focus est la seule source de verite, et la souris continue de fonctionner.
const PAD={A:0,B:1,X:2,Y:3,LB:4,RB:5,LT:6,RT:7,BACK:8,START:9,LS:10,RS:11,UP:12,DOWN:13,LEFT:14,RIGHT:15};
let padVivant=false,padNom='',padPrec={},padRepos=0,padDir='',padProchain=0,padFrame=0,padSeuil=0.55;

function padFocales(){
  const v=document.querySelector('.view.active');
  if(!v)return [];
  return [...v.querySelectorAll('button,[tabindex="0"],input,select')].filter(e=>!e.disabled&&e.offsetParent!==null);
}
// Deplacement geometrique : on va dans la direction demandee, et l'ecart
// perpendiculaire pese deux fois plus lourd pour ne pas sauter une colonne.
function padDeplacer(dir){
  const liste=padFocales();
  if(!liste.length)return;
  const i=liste.indexOf(document.activeElement);
  if(i<0){liste[0].focus();liste[0].scrollIntoView({block:'nearest'});return;}
  const r=liste[i].getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  let best=-1,bd=Infinity;
  liste.forEach((e,j)=>{
    if(j===i)return;
    const b=e.getBoundingClientRect();
    const dx=(b.left+b.width/2)-cx,dy=(b.top+b.height/2)-cy;
    const dansAxe=dir==='up'?dy<-4:dir==='down'?dy>4:dir==='left'?dx<-4:dx>4;
    if(!dansAxe)return;
    const vert=dir==='up'||dir==='down';
    const d=(vert?Math.abs(dy):Math.abs(dx))+(vert?Math.abs(dx):Math.abs(dy))*2.2;
    if(d<bd){bd=d;best=j;}
  });
  if(best>=0){liste[best].focus();liste[best].scrollIntoView({block:'nearest',inline:'nearest'});}
}
function padOnglet(sens){
  const o=[...document.querySelectorAll('.ttab')];
  const i=o.findIndex(x=>x.classList.contains('active'));
  const j=(i<0?0:i)+sens;
  if(j>=0&&j<o.length&&j!==i)o[j].click();
}
// B = la touche Echap. Les surcouches savent deja se fermer en restaurant le
// focus (fermerSurcouche) et le panneau de detail aussi : on ne reecrit pas cette
// logique, on s'en sert.
function padRetour(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}
function padEtat(vivant,nom){
  padVivant=vivant;
  padNom=nom||'';
  document.body.classList.toggle('padon',vivant);
  if(!vivant)padPrec={};
  majCtlLegende();
}
// Le bandeau du bas dit la VERITE. Il annoncait « LB RB NAVIGUER » et les actions
// rapides portaient des pastilles A / X / B / Y, alors qu'aucune manette n'etait
// geree et qu'aucun raccourci n'existait. Les pastilles sont retirees : un bouton
// qui promet une touche qu'il n'ecoute pas est pire que pas de pastille du tout.
//
// Les boites du navigateur (confirm, prompt) ne se pilotent PAS a la manette :
// c'est la seule chose qui oblige encore a reprendre la souris, et le bandeau le
// dit au lieu de laisser l'utilisateur se demander pourquoi rien ne repond.
function majCtlLegende(){
  const el=$('abHint');
  if(!el)return;
  const touche=(k,l)=>`<span class="gh pad">${k}</span>${l}`;
  el.innerHTML=padVivant
    ?`<span class="ctlp vivant"><span class="dot"></span>${escH(padNom||T('MANETTE','CONTROLLER'))}</span>`
      +touche('A',T('ACTIVER','ACTIVATE'))
      +touche('B',T('RETOUR','BACK'))
      +touche('◀▶',T('DÉPLACER','MOVE'))
      +touche('LB/RB',T('ONGLET','TAB'))
      +touche('START',T('ACCUEIL','HOME'))
    :`<span class="ctlp"><span class="dot"></span>${T('SOURIS','MOUSE')}</span>`
      +T('Branche une manette : l\'application y obéit entièrement.','Plug in a controller: the app obeys it entirely.');
}
function padBoucle(){
  // Un sondage sur quatre images suffit pour un menu, et ne coute rien.
  if(++padFrame%4)return requestAnimationFrame(padBoucle);
  let pad=null;
  try{for(const p of (navigator.getGamepads?navigator.getGamepads():[]))if(p&&p.connected){pad=p;break;}}catch{}
  if(!!pad!==padVivant)padEtat(!!pad,pad&&pad.id?String(pad.id).split('(')[0].trim().slice(0,22):'');
  if(pad){
    const t=performance.now();
    const feu=n=>{const b=pad.buttons[n],now=!!(b&&b.pressed),was=!!padPrec[n];padPrec[n]=now;return now&&!was;};
    // direction : croix OU stick gauche, avec repetition quand on maintient
    const ax=pad.axes[0]||0,ay=pad.axes[1]||0;
    const dir=
      (feu(PAD.UP)||ay<-padSeuil)?'up':
      (feu(PAD.DOWN)||ay>padSeuil)?'down':
      (feu(PAD.LEFT)||ax<-padSeuil)?'left':
      (feu(PAD.RIGHT)||ax>padSeuil)?'right':
      ((pad.buttons[PAD.UP]&&pad.buttons[PAD.UP].pressed)||ay<-padSeuil)?'up':
      ((pad.buttons[PAD.DOWN]&&pad.buttons[PAD.DOWN].pressed)||ay>padSeuil)?'down':
      ((pad.buttons[PAD.LEFT]&&pad.buttons[PAD.LEFT].pressed)||ax<-padSeuil)?'left':
      ((pad.buttons[PAD.RIGHT]&&pad.buttons[PAD.RIGHT].pressed)||ax>padSeuil)?'right':'';
    // QUE FAIT UNE DIRECTION DEPEND DE L'ETAT, et c'est le seul endroit ou les
    // deux etats divergent. Diaporama OUVERT : gauche/droite reculent/avancent
    // d'une jaquette — le clavier le faisait deja (voir le `keydown` des fleches),
    // et la manette restait la seule a ne pas le faire ; haut/bas ne font RIEN,
    // parce que `padDeplacer` deplacerait le focus dans `.view.active`, une vue
    // CACHEE, et ferait un `scrollIntoView` derriere la surcouche. Diaporama
    // FERME : dispo pour TOUTES les directions, exactement comme avant.
    const ouv=diaEstOuvert();
    const dispo=ouv?(dir==='left'||dir==='right'):true;
    // LE THROTTLE EST COMMUN AUX DEUX ETATS, et il est INDISPENSABLE ici : sans
    // lui, maintenir la croix ferait defiler 60 jaquettes par seconde (la boucle
    // tourne a 15 Hz, un front par image). 380 ms pour le premier appui, puis
    // 110 ms de repetition — les valeurs qui existaient deja pour le focus.
    if(dir&&dispo){
      if(dir!==padDir){if(ouv)diaAvancer(dir==='left'?-1:1);else padDeplacer(dir);padDir=dir;padProchain=t+380;}
      else if(t>=padProchain){if(ouv)diaAvancer(dir==='left'?-1:1);else padDeplacer(dir);padProchain=t+110;}
    }else padDir='';
    // LE DIAPORAMA PREND LA MANETTE QUAND IL EST OUVERT, ET IL LA PREND EN
    // PREMIER. `feu()` CONSOMME le front : le premier lecteur gagne, et une
    // branche placee apres ne verrait jamais A. Or `#diaModal` ne contient
    // AUCUN element focalisable — `ouvrirSurcouche` ne focalise donc rien, et
    // le gestionnaire generique de A aurait fait `padDeplacer('down')`, soit
    // SORTIR LE FOCUS DE LA SURCOUCHE : A cassait le diaporama.
    // LB et RB changent de jaquette ici, au lieu de changer de section
    // par-dessus le diaporama.
    //
    // `geste` — LA MANETTE EST UN GESTE, COMME LA SOURIS ET LE CLAVIER, et
    // elle doit rearmer le minuteur dans LES DEUX BRANCHES. Sans cela, un
    // utilisateur qui navigue UNIQUEMENT a la manette — le cas de la
    // television, qui est la raison d'etre de ce pilotage — se verrait ouvrir
    // le diaporama par-dessus son ecran cinq minutes apres le chargement,
    // sans avoir rien touche d'autre. On ne rearme qu'une fois par image, et
    // seulement si un bouton a ete lu : armer a chaque image ferait un
    // clearTimeout/setTimeout a 60 Hz pour rien.
    let geste=!!dir;
    if(ouv){
      if(feu(PAD.A)){diaBascule();geste=true;}
      if(feu(PAD.LB)){diaAvancer(-1);geste=true;}
      if(feu(PAD.RB)){diaAvancer(1);geste=true;}
      if(feu(PAD.B)){padRetour();geste=true;}
    }else{
      if(feu(PAD.A)){const a=document.activeElement;
        if(a&&a!==document.body&&(a.tagName==='BUTTON'||a.tagName==='SELECT'||a.tagName==='INPUT'||a.hasAttribute('tabindex')))a.click();
        else padDeplacer('down');geste=true;}
      if(feu(PAD.B)){padRetour();geste=true;}
      if(feu(PAD.LB)){padOnglet(-1);geste=true;}
      if(feu(PAD.RB)){padOnglet(1);geste=true;}
      // START ET BACK SONT AVALES PAR LE DIAPORAMA. Ils appartiennent a la VUE :
      // START appelle `$('nv-dash').click()`, donc CHANGE DE VUE par-dessus la
      // surcouche, et BACK focalise un champ de texte de la vue cachee. Une
      // surcouche ouverte prend les touches de la vue, sinon on agit sur un ecran
      // qu'on ne voit pas. (Echap et B gardent leur sens : ils FERMENT.)
      if(feu(PAD.START)){const d=$('nv-dash');if(d)d.click();geste=true;}
      if(feu(PAD.BACK)){const f=document.querySelector('.view.active input[type=text]');if(f)f.focus();geste=true;}
    }
    // Sur une image ou la manette ne dit rien, `geste` reste faux et le minuteur
    // n'est pas touche : c'est ce qui rend l'appel supportable a 60 Hz.
    if(geste)diaInactivite();
  }
  requestAnimationFrame(padBoucle);
}

setInterval(()=>{const d=new Date();$('clock').textContent=('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2);},1000);
// La manette ne se sonde que si l'API existe : un navigateur sans Gamepad reste
// exactement comme avant, sans boucle d'animation qui tourne pour rien.
if(navigator.getGamepads&&typeof requestAnimationFrame==='function'){
  padEtat(false,'');
  requestAnimationFrame(padBoucle);
  // Une manette branchee alors que la page est deja ouverte met parfois plusieurs
  // secondes a etre annoncee : on ecoute aussi les evenements.
  addEventListener('gamepadconnected',e=>padEtat(true,e&&e.gamepad?String(e.gamepad.id).split('(')[0].trim().slice(0,22):''),false);
  addEventListener('gamepaddisconnected',()=>padEtat(false,''),false);
}

/* ==========================================================================
   ASSISTANT LOCAL
   --------------------------------------------------------------------------
   La coquille : le bouton du pied de page (et son jumeau de l'accueil), la
   surcouche, et les trois reglages. La conversation elle-meme vient apres ; ce
   qui est ici est ce qu'il faut pour OUVRIR, FERMER, et DIRE L'ETAT DU MOTEUR.

   `iaInit()` N'EST PAS APPELABLE DEPUIS `trDom()` : elle lit les reglages sur le
   serveur, et `trDom()` tourne AVANT que la config ne soit chargee. Ses deux
   libelles dynamiques (`#iaEnvoyer`, `#iaFermerLbl`) sont donc poses ici, et
   suivent quand meme les quatre langues — ils sont VIDES dans le HTML, donc
   `trDom()` ne peut pas les reprendre en francais, et `T()` lit la langue
   courante. Les trois libelles qui restent dans le HTML (ASSISTANT,
   ASSISTANT LOCAL, FERMER) passent par les dictionnaires de `trDom()`.
   ========================================================================== */
let iaEnCours=false;   // une seule question a la fois
let iaPret=false;      // vrai seulement si le moteur repond ET que le modele est la

function iaInit(){
  $('iaQuestion').placeholder=T("Pose ta question sur l etat de l application",'Ask about the state of the application');
  $('iaEnvoyer').textContent=T('DEMANDER','ASK');
  $('iaFermerLbl').textContent=T('FERMER','CLOSE');
}

// `ouvrirSurcouche` prend un ELEMENT, pas un identifiant : c'est elle qui pose
// role=dialog, aria-modal, et qui focalise le premier element focusable. On ne la
// reecrit pas — le piege a focus et la restauration du focus sont dedans.
//
// L'ETAT DU MOTEUR EST UNE FONCTION A PART, ET ELLE SERT DEUX FOIS : a
// l'ouverture, et avant chaque question. Sans ce seul endroit, les deux chemins
// diraient la panne avec deux jeux de phrases differents — et l'un des deux
// finirait par oublier de remettre `iaPret` a faux, ce qui laisserait poser des
// questions a un moteur eteint.
async function iaEtatMoteur(){
  const e=$('iaEtat');
  try{
    const r=await api('/api/assistant/statut');
    if(!r.version){
      iaPret=false;e.textContent=T('moteur arrêté','engine stopped');
      iaNote(T('Le moteur local ne répond pas. Lance Ollama, puis rouvre cette fenêtre.','The local engine is not answering. Start Ollama, then reopen this window.'));
      return;
    }
    if(!r.pret){
      iaPret=false;e.textContent=T('modèle absent','no model');
      // ON DONNE LA COMMANDE EXACTE. Dire « le modele manque » laisserait
      // l'utilisateur chercher lequel : c'est le nom CONFIGURE que le serveur
      // rend, avec son repli quand rien n'est configure.
      iaNote(T('Le moteur repond mais le modele attendu n est pas installe : ','The engine answers but the expected model is not installed: ')
        +'ollama pull '+(r.modele||'gemma4:12b-it-q4_K_M'));
      return;
    }
    iaPret=true;e.textContent=T('prêt','ready');
    iaNote(T('Reponses produites par un modele local, sur ta machine. Rien ne sort du PC.','Answers produced by a local model, on your machine. Nothing leaves the PC.'));
  }catch(e2){
    iaPret=false;e.textContent=T('moteur arrêté','engine stopped');
    iaNote(T('Le moteur local ne répond pas. Lance Ollama, puis rouvre cette fenêtre.','The local engine is not answering. Start Ollama, then reopen this window.'));
  }
}
async function iaOuvrir(){
  ouvrirSurcouche($('iaModal'));
  await iaEtatMoteur();
}
function iaFermer(){fermerSurcouche($('iaModal'));}

function iaNote(txt){
  // ON NE REPETE PAS LA MEME NOTE DEUX FOIS DE SUITE. `iaEtatMoteur` en ecrit une
  // A CHAQUE OUVERTURE de la fenetre : fermer puis rouvrir ecrivait deux fois la
  // meme phrase, et le fil s'allongeait de cette ligne a chaque aller-retour
  // (mesure du 2026-09-20 : deux ouvertures, deux notes identiques a l'ecran).
  // Une repetition qui SUIT une bulle n'est PAS concernee : entre deux questions il
  // y a toujours la question, donc la raison d'un echec se redit a chaque essai.
  const fil=$('iaFil'),der=fil.lastElementChild;
  if(der&&der.className==='ia-note'&&der.textContent===txt)return;
  const d=document.createElement('div');
  d.className='ia-note';d.textContent=txt;
  fil.appendChild(d);iaBas();
}
function iaBulle(txt,classe){
  const d=document.createElement('div');
  d.className=classe==='q'?'ia-q':'ia-r';d.textContent=txt;
  $('iaFil').appendChild(d);iaBas();
  return d;
}
function iaBas(){const f=$('iaFil');f.scrollTop=f.scrollHeight;}

// ---------- La conversation -------------------------------------------------
//
// LE MODELE REND UN OBJET, ET LE FLUX TRANSPORTE DONC DU JSON. C'est ce qui
// decide de tout ce qui suit : `{reponse, choix, recherche}` arrive au fil de
// l'eau, accolades et guillemets compris. Recopier les morceaux tels quels
// afficherait `{ "reponse": "Le disque H: ...` a l'utilisateur pendant toute la
// reponse. On extrait donc la VALEUR de `reponse`, et la ligne FINALE repose la
// phrase exacte : si l'extraction s'est trompee, la version autoritaire la
// remplace. L'extraction est PURE (ni DOM ni reseau) et vit HORS du bloc marque
// « choix d indice », qui seul est evalue hors navigateur par les tests.
function iaTexteReponse(brut){
  const m=/"reponse"\s*:\s*"/.exec(brut);
  if(!m)return '';
  let out='';
  for(let i=m.index+m[0].length;i<brut.length;i++){
    const c=brut[i];
    if(c==='\\'){
      // Sequence coupee entre deux morceaux : on attend le suivant plutot que
      // d'ecrire un caractere invente.
      const s=brut[i+1];
      if(s===undefined)break;
      out+=s==='n'?'\n':s==='t'?'\t':s;
      i++;
      continue;
    }
    if(c==='"')break;                      // fin de la valeur
    out+=c;
  }
  return out;
}

// LA QUESTION. Le texte s'ecrit AU FUR ET A MESURE (mesure : premier morceau a
// 674 ms), et la ligne finale porte l'objet a valider.
//
// `iaDemander` est citee par un attribut `onclick` du document : une fonction
// annoncee et non definie fait lever une ReferenceError a la page ENTIERE, pas
// seulement au clic — c'est le garde-fou « toute fonction appelee depuis un
// attribut on* est definie » qui l'exige.
//
// ELLE NE CONSTRUIT AUCUNE PHRASE A ELLE : quand le moteur ne repond pas, elle
// repasse par `iaEtatMoteur()`, donc les deux chemins disent la meme chose avec
// les memes chaines.
async function iaDemander(){
  const q=$('iaQuestion').value.trim();
  if(!q)return;
  // Une seule question a la fois : deux appuis rapides sur DEMANDER enverraient
  // deux requetes, et la seconde repondrait sur la premiere.
  if(iaEnCours)return;
  // LE MOTEUR SE DIT AVANT D'ENVOYER, et SEULEMENT s'il ne repond pas :
  // `iaEtatMoteur` ecrit une note A CHAQUE APPEL, donc l'appeler avant chaque
  // question remplirait le fil de la meme phrase repetee. `iaPret` est rafraichi
  // par la sonde de chargement et par chaque ouverture de la fenetre.
  if(!iaPret){await iaEtatMoteur();if(!iaPret)return;}
  iaEnCours=true;$('iaEnvoyer').disabled=true;
  $('iaQuestion').value='';
  iaBulle(q,'q');
  const rep=iaBulle('','r');
  // La proposition precedente ne survit pas a une nouvelle question : la laisser
  // a l'ecran ferait cliquer sur l'action d'une reponse deja remplacee.
  $('iaProposition').innerHTML='';
  const conseils=(window._adv||[]).filter(x=>x&&x.act).map(x=>({titre:x.title,detail:x.detail}));
  // L'ANNONCE DU CHARGEMENT, et elle est necessaire : Ollama decharge le modele
  // apres 5 minutes d'inactivite, donc la premiere question apres une pause paie
  // le rechargement. Un panneau muet pendant une minute serait exactement le
  // defaut « une action doit le montrer » que ce depot a deja corrige ailleurs.
  let vu=false;
  const minuteur=setTimeout(()=>{if(!vu)rep.textContent=T('Le modèle local se charge, cela peut prendre une minute...','The local model is loading, this may take a minute...');},2500);
  try{
    const r=await fetch('/api/assistant/demander',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({question:q,conseils:conseils,langue:LANG})});
    if(!r.ok||!r.body)throw new Error('HTTP '+r.status);
    const lecteur=r.body.getReader();const dec=new TextDecoder();
    let tampon='',brut='';
    for(;;){
      const {value,done}=await lecteur.read();if(done)break;
      tampon+=dec.decode(value,{stream:true});
      const lignes=tampon.split('\n');tampon=lignes.pop();
      for(const l of lignes){
        if(!l.trim())continue;
        let o;try{o=JSON.parse(l);}catch(e){continue;}   // ligne illisible : ignoree
        if(o.morceau){
          brut+=o.morceau;
          const t=iaTexteReponse(brut);
          // Tant qu'aucun texte utile n'est arrive, l'annonce de chargement reste :
          // l'effacer sur un `{` laisserait un panneau vide.
          if(t){if(!vu){vu=true;clearTimeout(minuteur);}rep.textContent=t;iaBas();}
        }
        else if(o.fin){clearTimeout(minuteur);iaFin(o,conseils,rep);}
      }
    }
  }catch(e){clearTimeout(minuteur);rep.textContent=T('Le moteur local ne répond pas.','The local engine is not answering.');}
  iaEnCours=false;$('iaEnvoyer').disabled=false;
}

// UNE PROPOSITION N EST PAS UNE EXECUTION.
// Le modele a rendu un INDICE ; on le valide contre la liste REELLE, on affiche
// le verbe et son objet, et on attend un clic. Ce clic passe par la boite de
// dialogue maison, donc ANNULER est le premier bouton du DOM, Echap et le
// bouton B refusent, et la promesse ne peut pas rester en suspens.
function boutonIA(libelle,action){
  // Une proposition de diagnostic n'est PAS l'action primaire de l'ecran :
  // en accent, deux cartes Entretien alignees criaient deux boutons verts
  // identiques et noyaient la hierarchie (mesure, capture r2-dash-now).
  const b=document.createElement('button');
  b.className='btn quiet';b.textContent=libelle;b.onclick=action;
  return b;
}

// LE SEUL CHAMP AU NOM FRANCAIS DE TOUTE L'API : la ligne finale du flux NDJSON
// est `{fin:true, erreur}` — c'est le SERVEUR qui l'a nomme ainsi (les routes de
// l'assistant sont les seules dans ce cas, et la ligne existe deja dans la
// route). On le lit donc par sa CLEF, en un seul endroit : le garde-fou « les
// champs lus depuis le serveur gardent leur nom d'origine » refuse la lecture
// pointee de ce nom dans le client, et il a raison — renommer un champ cote
// client est ce qui avait deja casse la lecture du journal d'Aurora. Ici on ne
// renomme rien : on lit le nom que le serveur ecrit, et on accepte aussi `error`,
// celui du reste de l'API, pour ne pas dependre d'une seule graphie. (Ce
// commentaire decrit la forme refusee SANS l'ecrire : le garde-fou lit le texte
// brut du fichier, commentaires compris.)
function iaErreur(o){return String((o&&(o['erreur']||o.error))||'');}

async function iaFin(o,conseils,rep){
  const e=iaErreur(o);
  if(e){if(rep&&!rep.textContent)rep.remove();iaNote(e);return;}
  let obj=null;
  try{obj=o.objet?(typeof o.objet==='string'?JSON.parse(o.objet):o.objet):null;}catch(e){obj=null;}
  if(!obj)return;
  // LE TEXTE AUTORITAIRE. Il remplace ce que le flux a laisse lire : la phrase
  // entiere, telle que le modele l'a rendue.
  if(rep&&obj.reponse)rep.textContent=String(obj.reponse);
  // L'ETIQUETTE EST OBLIGATOIRE : l'utilisateur doit pouvoir distinguer ce que le
  // modele a ecrit de ce que l'application affirme. Elle est VISIBLE, pas une
  // infobulle : une mention qu'il faut survoler n'est pas une mention.
  if(rep&&rep.textContent)iaNote(T('Ecrit par l IA locale','Written by the local AI'));
  const z=$('iaProposition');z.innerHTML='';

  // CANAL 2 : une RECHERCHE. Le modele peut nommer un jeu ; il ne peut pas
  // designer un fichier. On remplit le champ de recherche et on n ouvre RIEN
  // d autre : le choix du fichier reste devant des resultats visibles. C est
  // l incident Dark Messiah (7,11 Go telecharges pour la galette PC) qui a
  // dicte cette regle.
  const q=obj.recherche?String(obj.recherche).trim().slice(0,80):'';
  if(q)z.appendChild(boutonIA(T('CHERCHER : ','SEARCH: ')+q,()=>iaChercher(q)));

  // CANAL 1 : une action de l application, designee par son INDICE.
  const i=iDeChoix(obj.choix,conseils.length);
  if(i===null)return;                       // aucun : ce n est pas une action
  const c=(window._adv||[]).filter(x=>x&&x.act)[i];
  if(!c)return;
  z.appendChild(boutonIA(c.act.label,async()=>{
    const ok=await confirmer({titre:c.title,corps:c.detail,ok:c.act.label});
    if(!ok)return;
    // l indice porte sur la liste FILTREE ; advAct attend l indice dans la liste
    // REELLE. Les confondre lancerait l action du mauvais conseil.
    const reel=(window._adv||[]).indexOf(c);
    if(reel>=0)advAct(reel);
  }));
  const n=document.createElement('div');n.className='ia-note';
  n.textContent=T("L assistant propose cette action ; c est toi qui la lances.",'The assistant suggests this action; you are the one who runs it.');
  z.appendChild(n);
}

// On remplit le champ de recherche du CATALOGUE et on lance la recherche. Le
// declencheur n'est pas invente : `#catSearch` porte lui-meme
// `oninput="loadCatalog()"` (verifie dans public/index.html), donc appeler
// `loadCatalog()` fait exactement ce que fait une frappe au clavier.
//
// ET ON AMENE L'UTILISATEUR AUX FICHIERS, parce que c'est ce que le canal 2
// promet : « une demande explicite ouvre les RESULTATS ». Le modele a rendu un
// NOM ; c'est l'APPLICATION qui dit a quel jeu du catalogue il correspond, et elle
// ouvre la MEME surcouche qu'un clic sur la ligne du catalogue. Le modele ne voit
// jamais un TitleID et ne designe jamais un fichier : la liste s'affiche, et c'est
// l'utilisateur qui choisit la ligne a installer (l'incident Dark Messiah, 7,11 Go
// de galette PC, est exactement ce que cette separation empeche).
async function iaChercher(q){
  $('catSearch').value=q;
  go('cat');
  const jeu=await iaJeuDuCatalogue(q);
  if(!jeu)return;                 // rien de trouve : on reste sur les resultats
  // ON FERME L'ASSISTANT AVANT D'OUVRIR LA SURCOUCHE, et ce n'est pas cosmetique :
  // `--z-assistant` (97) est AU-DESSUS de `#dlModal` (91), donc la surcouche
  // s'ouvrirait DERRIERE l'assistant et le clic semblerait sans effet — le defaut
  // « une action qui ne montre rien » que ce depot a deja corrige ailleurs.
  iaFermer();
  openDlModal(jeu.name,jeu.tid,jeu);
}

// LE JEU QUE LA RECHERCHE A TROUVE, choisi par le bareme de pertinence DU DEPOT
// (`noteResultat`, bloc Pertinence) : le modele a rendu un nom, l'application dit
// a quel titre il correspond, et c'est le SEUL endroit ou ce choix se fait.
//
// `loadCatalog` rend la main AVANT ses resultats (ils arrivent dans un minuteur) :
// on attend donc ses lignes, avec un plafond. La liste est vide DES L'APPEL
// (`loadCatalog` la remet a zero), donc on ne lit jamais la reponse de la
// recherche PRECEDENTE — le meme piege que la table RESULTATS a deja paye.
// Un titre qui ne marque RIEN n'ouvre rien : on ne devine pas.
async function iaJeuDuCatalogue(q){
  loadCatalog();
  for(let i=0;i<40;i++){
    await new Promise(r=>setTimeout(r,250));
    const l=(catItems||[]).filter(x=>x&&x.tid);
    if(!l.length)continue;
    const notes=l.map(x=>({x,n:noteResultat(x.name||'',q)})).filter(o=>o.n>0).sort((a,b)=>b.n-a.n);
    if(!notes.length)return null;
    // UN EX AEQUO N EST PAS UNE REPONSE. Mesure du 2026-09-20 : « Halo 3 » rend
    // QUATRE titres du catalogue, dont DEUX a la meme note (17) — « Halo 3 Beta »
    // et « Halo 3: ODST ». En ouvrir un serait designer un jeu que le bareme ne
    // distingue pas : on laisse alors la LISTE a l'ecran, et c'est l'utilisateur qui
    // tranche. Ce n'est pas un seuil invente : deux notes egales, c'est une egalite.
    if(notes.length>1&&notes[1].n===notes[0].n)return null;
    return notes[0].x;
  }
  return null;
}

// ---------- Les deux boutons ------------------------------------------------
//
// CE QUE LE MODELE ECRIT N EST JAMAIS UN CHAMP DE L APPLICATION. La description
// vit donc dans un fichier a part, cote serveur (`.ia-descriptions.json`), et a
// l'ecran dans une ligne de la fiche SANS clef de donnee : « Ecrit par l IA
// locale » n'est pas « Genre », et la confondre avec une donnee de la source
// serait le pire des deux mondes.
const IA_DESC={};
function iaCle(c){return String((c&&(c.tid||c.name))||'');}

// Le bouton de la fiche n'apparait QUE si le moteur repond : inviter a cliquer
// sur quelque chose qui ne peut pas repondre est pire que de ne rien offrir.
// Le texte deja ecrit s'affiche, lui, meme moteur eteint — il est deja la.
function iaOrnerFiche(c,zone){
  if(!c||!zone)return;
  const d=IA_DESC[iaCle(c)];
  if(d){
    const r=document.createElement('div');r.className='fiche-r';
    const k=document.createElement('span');k.className='fiche-k';
    k.textContent=T('Ecrit par l IA locale','Written by the local AI');
    const v=document.createElement('span');v.className='fiche-v';v.textContent=d;
    r.appendChild(k);r.appendChild(v);zone.appendChild(r);
  }
  if(!iaPret)return;
  const b=document.createElement('button');
  b.className='btn quiet';b.textContent=T('REDIGER UNE DESCRIPTION','WRITE A DESCRIPTION');
  b.onclick=()=>iaProposerDescription(c);
  zone.appendChild(b);
}

async function iaProposerDescription(c){
  const ok=await confirmer({titre:T('Rediger une description','Write a description'),
    corps:T("Le texte sera ecrit par le modele local et affiche comme tel : il ne remplace aucun champ de l application.",
            'The text will be written by the local model and shown as such: it replaces no field of the application.'),
    ok:T('REDIGER','WRITE')});
  if(!ok)return;
  const r=await post('/api/assistant/description',{tid:c.tid,nom:c.name});
  if(!r.ok){toast(r.error||T('Le moteur local ne répond pas.','The local engine is not answering.'),'err');return;}
  // REGENERER REMPLACE, et c'est la meme chose ici que dans le fichier du serveur :
  // la clef est le TitleID, donc une seconde redaction ecrase la premiere.
  IA_DESC[iaCle(c)]=String(r.texte||'');
  toast(T('Description ecrite par l IA locale.','Description written by the local AI.'));
  dlmFiche(c);          // on redessine la fiche : le texte apparait, etiquette
}

// LE JEU ATTENDU, la ou l information vit VRAIMENT. Le plan cherchait
// `window._games`, qui n existe pas dans cette application : la bibliotheque
// s appelle `games` (le scan des disques) et le catalogue `catItems`. On cherche
// donc par TitleID dans les deux, et `dlmGame` sert de repli quand il n y en a
// pas : le fichier qu on juge est presque toujours celui du jeu qu on est en
// train d installer.
function iaJeuAttendu(tid){
  const t=String(tid||'').toUpperCase();
  const parTid=l=>Array.isArray(l)?l.find(x=>x&&String(x.tid||'').toUpperCase()===t):null;
  if(t){
    const c=parTid(catItems)||parTid(games);
    if(c)return {nom:c.name||'',tid:c.tid||t};
  }
  if(dlmGame)return {nom:dlmGame.name||'',tid:dlmGame.tid||t};
  return {nom:'',tid:t};
}

// Le jugement est CONSULTATIF : il ne lance rien et ne remplace aucun champ, donc
// il s'affiche EN LIGNE, dans la ligne du fichier — pas dans une boite de
// dialogue. Cela evite d'ailleurs d'inventer une option « un seul bouton » que la
// boite maison n'a pas.
async function iaJugerFichier(nom,taille,tid,cellule){
  const jeu=iaJeuAttendu(tid);
  let r;
  try{r=await post('/api/assistant/juger',{nom:nom,taille:taille,jeu:jeu});}
  catch(e){toast(T('Le moteur local ne répond pas.','The local engine is not answering.'),'err');return;}
  if(!r||!r.ok){toast((r&&r.error)||T('Le moteur local ne répond pas.','The local engine is not answering.'),'err');return;}
  const mot={correct:T('Correspond au jeu','Matches the game'),autre_version:T('Autre version','Different version'),
    mauvais_jeu:T('Mauvais jeu','Wrong game'),incertain:T('Je ne sais pas','I do not know')}[r.verdict]||r.verdict;
  // L ETIQUETTE EST OBLIGATOIRE, et elle est lisible : la colonne s appelle « IA »,
  // et l infobulle dit la phrase entiere. Un verdict nu se lirait comme une donnee
  // de l application.
  if(cellule){cellule.textContent=mot+(r.raison?' — '+r.raison:'');cellule.title=T('Ecrit par l IA locale','Written by the local AI');}
  else toast(mot);
}

// LA SONDE DE CHARGEMENT. `iaPret` ne peut pas etre pose par la seule ouverture
// de l assistant : les deux boutons vivent dans la fiche du catalogue et dans les
// fichiers, qu on lit SANS avoir jamais ouvert la fenetre. On interroge donc le
// moteur une fois au demarrage, EN SILENCE (sans rien ecrire dans le fil : la
// fenetre n est peut-etre jamais ouverte).
async function iaSonder(){
  try{const r=await api('/api/assistant/statut');iaPret=!!(r&&r.version&&r.pret);}
  catch(e){iaPret=false;}
}

// Les trois reglages. Le moteur est LOCAL : il n'y a aucun secret a saisir, donc
// rien a mettre dans secrets.json, et l'HOTE n'est pas ici — il est fige a
// 127.0.0.1 dans lib/ollama.js, et un champ « hote » serait la porte par laquelle
// l'etat de la machine sortirait du PC.
//
// NE PAS CONFONDRE `actif` ET `pret` : le premier est un REGLAGE, le second un
// ETAT mesure sur le moteur (`/api/assistant/statut`). Les melanger ferait dire
// « pret » a quelqu'un qui vient de decocher la case.
async function iaReglages(){
  const modele=$('iaModele').value.trim();
  const port=parseInt($('iaPort').value,10);
  const corps={actif:$('iaActif').checked, modele};
  // La porte n'est envoyee que si elle est un ENTIER : le serveur refuse le
  // reste (1 a 65535), et lui envoyer du vide pour « laisse le defaut » ferait
  // echouer l'enregistrement entier, modele compris.
  if(Number.isInteger(port)&&port>=1&&port<=65535)corps.port=port;
  try{
    const r=await post('/api/config',{ia:corps});
    const c=(r&&r.cfg&&r.cfg.ia)||null;
    // ON REPOSE CE QUE LE SERVEUR A RETENU, pas ce qui a ete tape : une porte
    // refusee laisserait sinon « 99999 » a l'ecran alors qu'elle n'est pas
    // enregistree — l'ecran afficherait un reglage qui n'existe pas.
    if(c){
      $('iaActif').checked=c.actif!==false;
      $('iaModele').value=c.modele||'';
      $('iaPort').value=c.port||11434;
    }
    $('iaReglagesEtat').textContent=T('Réglage enregistré','Setting saved');
  }catch(e){
    $('iaReglagesEtat').textContent=T('Réglage non enregistré : ','Setting not saved: ')+e.message;
  }
}
// Les trois champs sont lus au chargement de la config. Les libelles de la ligne
// sont du HTML statique, donc traduits par `trDom()` comme ses voisins ; les deux
// qui sont poses ici sont ici parce qu'ils n'ont pas d'equivalent court en
// francais dans le dictionnaire existant.
async function iaConfig(){
  iaInit();
  $('iaActifLbl').textContent=T('Actif','Active');
  $('iaActif').checked=false;
  try{
    const c=await api('/api/config');
    const ia=c.ia||{};
    $('iaActif').checked=ia.actif!==false;
    $('iaModele').value=ia.modele||'';
    $('iaPort').value=ia.port||11434;
  }catch(e){
    // La config illisible ne doit pas empecher l'assistant de s'ouvrir : elle est
    // deja signalee par `loadCfg`, qui appelle cette fonction.
    $('iaReglagesEtat').textContent=T('Réglages illisibles : ','Settings unreadable: ')+e.message;
  }
}

(async()=>{
  // Le libelle « FR/EN/ES/PT » dit qu'il y a QUATRE langues a choisir — il est
  // donc long, et sur un telephone il poussait le selecteur de disque hors de
  // l'ecran (mesure a 360 px : 105 px de bouton pour 123 px de place au
  // selecteur). Le globe suffit : la fenetre de choix s'ouvre DE TOUTE FACON au
  // premier lancement, donc personne ne cherche ce bouton a ce moment-la.
  // Le seuil est celui de la feuille : 560 px. Il est ecrit ici aussi, et c'est
  // assume — le CSS ne sait pas raccourcir un texte, et deux seuils qui divergent
  // se verraient tout de suite (le bouton deborderait ou serait inutilement court).
  if(!LANG){$('langModal').style.display='flex';$('langBtn').textContent=innerWidth<=560?'🌐':'🌐 FR/EN/ES/PT';}
  // Le bouton montre la langue COURANTE : on ne fait plus defiler les langues, le
  // menu les propose toutes. Afficher « EN » quand on est en francais se lisait
  // comme un etat, pas comme une action.
  else{$('langBtn').textContent='🌐 '+LANG_LIBELLE[LANG||'fr'];majLangMenu();trDom();}
  // L'ETAT DU MOTEUR SE SONDE UNE FOIS AU DEMARRAGE, SANS RIEN ECRIRE : les deux boutons IA de la
  // fiche et des fichiers se lisent sans jamais ouvrir l'assistant, donc `iaPret`
  // doit etre su AVANT. `iaSonder` ne dit rien a l'ecran — c'est `iaEtatMoteur`
  // qui parle, et seulement quand la fenetre s'ouvre.
  iaSonder();
  await loadDrives();await loadCfg();loadDash();pollDl();setSrcNote();pollEvents();conEtat();
})();
