using System.IO;
using System.Windows;

namespace XboxManager;

// Point d'entree de la coquille. Les arguments :
//   (rien)              ouvre l'application (et trouve ou lance son serveur)
//   test-glissement     ouvre la fenetre de MESURE du glissement (spec 4.6)
//   auto-fermer <s>     ferme la fenetre toute seule apres <s> secondes
//   arriere-plan        NE MONTRE PAS la fenetre (demarrage automatique)
// `auto-fermer` n'est pas un confort : c'est ce qui permet de verifier SANS clic
// que la fenetre se cree et que l'application se termine proprement.
public partial class App : Application
{
    private static Mutex? _mutex;
    private Notify? _notify;

    protected override void OnStartup(StartupEventArgs e)
    {
        Journal.Ecrire("demarrage : " + string.Join(' ', e.Args));

        // INSTANCE UNIQUE. Une seconde execution RAMENE la fenetre existante au
        // premier plan au lieu d'ouvrir un doublon : deux fenetres pour un seul
        // serveur, ce serait deux fois les memes messages et un arret qui
        // surprend (la premiere a fermer tuerait le serveur de l'autre).
        _mutex = new Mutex(true, @"Local\XboxManager.Shell", out var premier);
        if (!premier)
        {
            Journal.Ecrire("une instance tourne deja : on la ramene au premier plan");
            Native.Ramener("Xbox 360 Manager");
            Shutdown(0);
            return;
        }

        base.OnStartup(e);

        var i = Array.IndexOf(e.Args, "--auto-fermer");
        int secondes = 0;
        if (i >= 0 && i + 1 < e.Args.Length) int.TryParse(e.Args[i + 1], out secondes);
        var arrierePlan = Array.IndexOf(e.Args, "--arriere-plan") >= 0;

        Window fenetre = Array.IndexOf(e.Args, "--test-glissement") >= 0
            ? new Glissement()
            : new MainWindow();

        // L'ICONE DE NOTIFICATION EST POSEE AVANT LA FENETRE : en mode
        // arriere-plan, c'est elle qui permet de rappeler la fenetre, et elle
        // doit exister des le demarrage.
        try
        {
            _notify = new Notify(fenetre, Path.Combine(AppContext.BaseDirectory, "assets", "icone.ico"),
                () => fenetre.Close());
        }
        catch (Exception ex)
        {
            // Un environnement sans zone de notification (session sans bureau)
            // ne doit pas empecher l'application de tourner.
            Journal.Ecrire("icone de notification indisponible : " + ex.Message);
        }

        if (secondes > 0)
        {
            var minuteur = new System.Windows.Threading.DispatcherTimer
            {
                Interval = TimeSpan.FromSeconds(secondes)
            };
            minuteur.Tick += (_, _) => { minuteur.Stop(); fenetre.Close(); };
            minuteur.Start();
        }

        if (arrierePlan)
        {
            Journal.Ecrire("demarrage en arriere-plan : la fenetre n'est pas affichee");
            return;
        }

        fenetre.Show();
        Journal.Ecrire("fenetre affichee : " + fenetre.GetType().Name);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _notify?.Dispose();
        _mutex?.Dispose();
        base.OnExit(e);
    }
}
