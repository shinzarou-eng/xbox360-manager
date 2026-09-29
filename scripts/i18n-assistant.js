// Traductions des messages de l'assistant, reecrits pour etre COMPREHENSIBLES.
//
// Avant : « TU incompatible », « SANTE », « DOUBLONS ». Des noms, du jargon, et
// aucune indication de ce qu'il faut FAIRE. Apres : le titre dit ce qui ne va pas
// en clair, le detail dit quoi faire, et le bouton porte un VERBE.
const fs = require('fs');

const P = [
  ['. Keep the one you use, delete the other.',
    '. Quédate con la que uses y borra la otra.', '. Fique com a que você usa e apague a outra.'],
  ['SHOW DUPLICATES', 'VER DUPLICADOS', 'VER DUPLICADOS'],
  ['Content without a game: ', 'Contenido sin juego: ', 'Conteúdo sem jogo: '],
  ['. The game is no longer installed: this DLC or update is useless now. Check before deleting.',
    '. El juego ya no está instalado: este DLC o esta actualización ya no sirven. Compruébalo antes de borrar.',
    '. O jogo não está mais instalado: este DLC ou esta atualização não servem mais. Confira antes de apagar.'],
  ['CHECK', 'COMPROBAR', 'CONFERIR'],
  ['CLEAN UP', 'LIMPIAR', 'LIMPAR'],
  ['ORGANIZE', 'ORGANIZAR', 'ORGANIZAR'],
  ['INSTALL v', 'INSTALAR LA v', 'INSTALAR A v'],
  [' — your disc MediaID is being analysed', ' — el MediaID de tu disco se está analizando', ' — o MediaID do seu disco está sendo analisado'],
  [' matches your disc (MediaID ', ' corresponde a tu disco (MediaID ', ' corresponde ao seu disco (MediaID '],
  ['). Install it to unblock DLC.', '). Instálala para desbloquear los DLC.', '). Instale-a para desbloquear os DLC.'],
  ['The installed one targets another disc, so the console ignores it and DLC stays blocked. v',
    'La que está instalada apunta a otro disco, así que la consola la ignora y los DLC siguen bloqueados. La v',
    'A que está instalada aponta para outro disco, então o console a ignora e os DLC continuam bloqueados. A v'],
  [' matches your disc: install it over the top.',
    ' corresponde a tu disco: instálala encima.', ' corresponde ao seu disco: instale por cima.'],
  ['The installed one targets another disc, so the console ignores it and DLC stays blocked. No update matches your disc (MediaID ',
    'La que está instalada apunta a otro disco, así que la consola la ignora y los DLC siguen bloqueados. Ninguna actualización corresponde a tu disco (MediaID ',
    'A que está instalada aponta para outro disco, então o console a ignora e os DLC continuam bloqueados. Nenhuma atualização corresponde ao seu disco (MediaID '],
  ['): there is nothing to install — it is the disc that does not match.',
    '): no hay nada que instalar — es el disco el que no corresponde.',
    '): não há nada a instalar — é o disco que não corresponde.'],
  ['VIEW STATUS', 'VER EL ESTADO', 'VER O ESTADO'],
  ['. Covers come from XboxUnity.', '. Las carátulas vienen de XboxUnity.', '. As capas vêm do XboxUnity.'],
  ['DOWNLOAD', 'DESCARGAR', 'BAIXAR'],
  ['SEARCH ARCHIVE.ORG', 'BUSCAR EN ARCHIVE.ORG', 'BUSCAR NO ARCHIVE.ORG'],
  ['SEARCH VIMM', 'BUSCAR EN VIMM', 'BUSCAR NO VIMM'],
  ['Mise à jour disponible : ', 'Actualización disponible: ', 'Atualização disponível: '],
  ['Mise à jour incompatible : ', 'Actualización incompatible: ', 'Atualização incompatível: '],
  ['Téléchargement en échec : ', 'Descarga fallida: ', 'Download falhou: ']
];

let i = fs.readFileSync('public/i18n.js', 'utf8');
let ajouts = 0;
for (const [en, es, pt] of P) {
  if (!i.includes(JSON.stringify(en) + ':') && !i.includes("'" + en + "'")) {
    i = i.replace('const DICT_ES = {', 'const DICT_ES = {\n  ' + JSON.stringify(en) + ': ' + JSON.stringify(es) + ',');
    i = i.replace('const DICT_PT = {', 'const DICT_PT = {\n  ' + JSON.stringify(en) + ': ' + JSON.stringify(pt) + ',');
    ajouts++;
  }
}
// Les cinq cles devenues inutiles : elles survivaient au renommage des messages.
const mortes = [
  '  " — game MediaID being analyzed": " — MediaID del juego en análisis",\n',
  '  " — game MediaID being analyzed": " — MediaID do jogo em análise",\n',
  '  " (game missing)": " (falta el juego)",\n',
  '  " (game missing)": " (falta o jogo)",\n',
  '  "compatible available": "compatible disponible",\n',
  '  "compatible available": "compatível disponível",\n',
  '  "installed for a different MediaID — console ignores it (DLC blocked)": "instalado para otro MediaID — la consola lo ignora (DLC bloqueado)",\n',
  '  "installed for a different MediaID — console ignores it (DLC blocked)": "instalado para outro MediaID — o console ignora (DLC bloqueado)",\n',
  '  "Orphan content: ": "Contenido huérfano: ",\n',
  '  "Orphan content: ": "Conteúdo órfão: ",\n'
];
let retirees = 0;
for (const m of mortes) if (i.includes(m)) { i = i.replace(m, ''); retirees++; }
fs.writeFileSync('public/i18n.js', i);
console.log('traductions ajoutees : ' + ajouts + ' / ' + P.length);
console.log('cles mortes retirees : ' + retirees);
