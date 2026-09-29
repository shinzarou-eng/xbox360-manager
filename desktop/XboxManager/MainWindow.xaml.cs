using System.IO;
using System.Windows;
using XboxManager.Coeur;

namespace XboxManager;

// La fenetre de l'application : elle TROUVE ou LANCE le serveur, puis affiche
// l'interface dedans. C'est le seul endroit qui decide, et il ne decide qu'une
// fois, au demarrage (spec §4.3).
//
// TOUT ECHEC SE DIT DANS LA FENETRE. Pas de boite de dialogue : elle bloquerait
// un lancement automatique, et l'utilisateur qui revient devant son ecran
// verrait une fenetre vide avec une boite cachee derriere.
public partial class MainWindow : Window
{
    private Enfant? _enfant;
    private readonly Shell _shell;
    private bool _mica;

    public MainWindow()
    {
        InitializeComponent();
        _shell = new Shell(this, Vue);
        Loaded += async (_, _) => await Demarrer();
        Closed += (_, _) =>
        {
            // ON NE TUE QUE CE QU'ON A LANCE (Decision.Arret, teste par le harnais).
            Arret.SurFermeture(_enfant is not null, () => _enfant!.Arreter());
            Journal.Ecrire("fenetre fermee" + (_enfant is not null ? " — serveur lance par la coquille arrete" : " — serveur trouve en route, laisse en place"));
        };
    }

    private async Task Demarrer()
    {
        var racine = Racine.Trouver(AppContext.BaseDirectory, File.Exists)
                  ?? Racine.DepuisFichier(Path.Combine(AppContext.BaseDirectory, "app.txt"), File.Exists);
        if (racine is null)
        {
            Repli("Application introuvable. server.js et public\\index.html doivent se trouver au-dessus "
                + "de l'executable, ou le chemin etre ecrit dans app.txt a cote de lui.");
            Journal.Ecrire("racine introuvable depuis " + AppContext.BaseDirectory);
            return;
        }
        Journal.Ecrire("racine de l'application : " + racine);

        var (code, corps) = await Sondeur.Lire();
        switch (Decision.Pour(Decision.Lire(code, corps)))
        {
            case Etat.Attacher:
                Journal.Ecrire("un serveur repond deja sur 4360 : on s'y attache (il ne sera pas arrete)");
                break;

            case Etat.PortOccupe:
                Repli("Le port 4360 est occupe par un autre programme : l'application ne peut pas "
                    + "demarrer son serveur, et elle ne tuera rien (ce serait le programme de quelqu'un d'autre). "
                    + "Fermez ce programme, puis relancez.");
                Journal.Ecrire("port 4360 occupe par autre chose qu'un serveur Xbox 360 Manager");
                return;

            case Etat.Lancer:
                var node = Node.Trouver(ChercherDansPath, File.Exists, racine);
                if (node is null)
                {
                    Repli(Node.Conseil);
                    Journal.Ecrire("node introuvable (PATH et runtime\\node)");
                    return;
                }
                Journal.Ecrire("lancement du serveur : " + node);
                _enfant = Enfant.Lancer(node, racine, AppContext.BaseDirectory);
                if (!await AttendreServeur())
                {
                    Repli("Le serveur a ete lance mais ne repond pas au bout de 6 secondes. "
                        + "Ce qu'il a dit est dans : " + _enfant.Journal);
                    return;
                }
                Journal.Ecrire("serveur pret");
                break;
        }

        await Afficher();
    }

    private async Task Afficher()
    {
        // L'INITIALISATION DE WEBVIEW2 PEUT ECHOUER, et ce n'est pas theorique :
        // le moteur de rendu est un processus Chromium separe, qui a besoin de
        // PIPES NOMMES. La ou ils sont refuses, l'initialisation echoue sur
        // 0x8000FFFF (E_UNEXPECTED) — mesure. Sans ce `catch`, l'exception non
        // geree tue la fenetre et l'utilisateur ne voit rien du tout.
        try
        {
            await Vue.EnsureCoreWebView2Async();
            Journal.Ecrire("WebView2 " + Vue.CoreWebView2.Environment.BrowserVersionString + " pret");
        }
        catch (Exception ex)
        {
            Journal.Ecrire("WebView2 INDISPONIBLE — " + ex.Message);
            Repli("WebView2 n'a pas demarre, donc l'interface ne peut pas s'afficher : " + ex.Message
                + "  (le serveur, lui, tourne : http://127.0.0.1:4360 s'ouvre dans un navigateur.)");
            return;
        }

        _shell.Brancher();
        Vue.Source = new Uri("http://127.0.0.1:4360/?shell=1");
        Mica();
    }

    // Mica et les coins arrondis sont peints par DWM (voir Native.cs) : WPF n'a
    // pas d'API pour ca dans ce SDK (mesure : `BackdropType` n'existe ni sur
    // `Window`, ni dans `System.Windows.Media`). Sur Windows 10, DWM refuse et on
    // LE DIT — jamais un repli silencieux.
    private void Mica()
    {
        // Le fond doit etre TRANSPARENT pour que ce que DWM peint soit visible :
        // un fond opaque cacherait le materiau derriere lui.
        Background = System.Windows.Media.Brushes.Transparent;
        var obtenu = Native.Mica(this);
        _shell.Mica = obtenu;

        if (obtenu)
        {
            Journal.Ecrire("DWM : fond Mica et coins arrondis demandes (build "
                + Environment.OSVersion.Version.Build + ")");
            return;
        }

        Journal.Ecrire("DWM a refuse le fond Mica (build " + Environment.OSVersion.Version.Build + ") : cadre plein");
        Bandeau.Visibility = Visibility.Visible;
        TexteBandeau.Text = "Le fond Mica n'est pas disponible sur cette version de Windows "
            + "(build " + Environment.OSVersion.Version.Build + ") : le cadre reste plein. "
            + "L'interface, elle, garde son propre fond, qui vient du papier peint du bureau.";
        TexteJournal.Text = "Journal : " + Journal.Chemin;
    }

    private void Repli(string message)
    {
        Bandeau.Visibility = Visibility.Visible;
        TexteBandeau.Text = message;
        TexteJournal.Text = "Journal : " + Journal.Chemin;
    }

    private static string? ChercherDansPath(string nom)
    {
        foreach (var d in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            if (string.IsNullOrWhiteSpace(d)) continue;
            var p = Path.Combine(d.Trim().Trim('"'), nom);
            if (File.Exists(p)) return p;
        }
        return null;
    }

    // 15 x 400 ms = 6 s. Un serveur Node met moins d'une seconde a ecouter, mais
    // un disque qui se reveille ou un antivirus qui analyse le premier demarrage
    // peuvent prendre plus ; au-dela, on le DIT au lieu d'attendre sans fin.
    private async Task<bool> AttendreServeur()
    {
        for (int i = 0; i < 15; i++)
        {
            await Task.Delay(400);
            var (c, corps) = await Sondeur.Lire();
            if (Decision.Lire(c, corps) == Sonde.NotreServeur) return true;
            if (_enfant is not null && !_enfant.Vivant) return false;   // il est mort : inutile d'attendre
        }
        return false;
    }
}
