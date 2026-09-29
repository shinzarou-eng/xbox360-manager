// Source : dossiers locaux de l'utilisateur.
//
// La source de reference du systeme de plugins, et la plus utile : elle indexe
// les dossiers que l'utilisateur designe lui-meme (disque externe, partage
// reseau monte, dossier de dumps personnels). Aucun service tiers, aucune
// question de droit : ce sont des fichiers deja presents sur la machine.
//
// Configuration : `sourceFolders` dans config.json (tableau de chemins).
const fs = require('fs');
const path = require('path');

const EXT = /\.(iso|god|zip|7z|rar|xex|elf)$/i;

// Extensions cherchables : on s'interesse aux fichiers qui peuvent devenir un
// jeu, pas a la totalite du disque.
function dossiers() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
    return Array.isArray(cfg.sourceFolders) ? cfg.sourceFolders.filter(p => typeof p === 'string') : [];
  } catch { return []; }
}

// Parcours borne : profondeur ET nombre de fichiers limites. Un dossier choisi
// par erreur (racine d'un disque systeme) ne doit pas figer l'application.
function parcourir(base, maxProfondeur, maxFichiers) {
  const trouves = [];
  const pile = [{ dir: base, profondeur: 0 }];
  while (pile.length && trouves.length < maxFichiers) {
    const { dir, profondeur } = pile.pop();
    let entrees;
    try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entrees) {
      if (trouves.length >= maxFichiers) break;
      const complet = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (profondeur < maxProfondeur) pile.push({ dir: complet, profondeur: profondeur + 1 });
      } else if (EXT.test(e.name)) {
        let taille = 0;
        try { taille = fs.statSync(complet).size; } catch {}
        trouves.push({ nom: e.name, chemin: complet, taille, dossier: dir });
      }
    }
  }
  return trouves;
}

// Correspondance par MOT ENTIER : chercher « wake » ne doit pas remonter
// « waker ». Meme exigence que le score de pertinence de l'interface.
function correspond(nom, mots) {
  const bas = nom.toLowerCase();
  return mots.every(m => new RegExp('(^|[^a-z0-9])' + m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(bas));
}

module.exports = {
  id: 'dossier-local',
  nom: 'Dossiers locaux',
  description: 'Fichiers presents dans les dossiers que vous designez (disque externe, partage reseau, archives personnelles).',
  nature: 'utilisateur',
  // exposes pour les tests
  _parcourir: parcourir,
  _correspond: correspond,

  search(q, opts, cb) {
    // `opts.folders` permet de tester la source sans toucher a la configuration
    // de l'utilisateur ; en usage normal on lit config.json.
    const bases = (opts && Array.isArray(opts.folders)) ? opts.folders : dossiers();
    if (!bases.length) {
      return cb(null, []); // rien de configure n'est pas une erreur
    }
    const mots = String(q || '').toLowerCase().split(/[^a-z0-9]+/).filter(m => m.length > 1);
    if (!mots.length) return cb(null, []);

    const max = (opts && opts.max) || 200;
    const resultats = [];
    for (const base of bases) {
      if (!fs.existsSync(base)) continue;
      for (const f of parcourir(base, 4, 2000)) {
        if (resultats.length >= max) break;
        if (!correspond(f.nom, mots)) continue;
        resultats.push({
          id: f.chemin,
          titre: f.nom,
          taille: f.taille,
          detail: f.dossier
        });
      }
      if (resultats.length >= max) break;
    }
    cb(null, resultats);
  },

  files(itemId, cb) {
    // Un fichier local est deja sur le disque : il n'y a rien a telecharger,
    // seulement un chemin a rendre. Le declarer explicitement evite a
    // l'interface de chercher une URL inexistante.
    try {
      const st = fs.statSync(itemId);
      cb(null, [{ nom: path.basename(itemId), taille: st.size, path: itemId }]);
    } catch (e) { cb(e); }
  }
};
