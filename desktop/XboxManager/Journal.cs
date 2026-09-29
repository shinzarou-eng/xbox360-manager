using System.IO;

namespace XboxManager;

// Journal de la coquille : une ligne par evenement qui explique un ecran vide.
// « La fenetre est blanche » n'a aucune trace ailleurs — ni dans le journal du
// serveur, ni dans un Event Log. Ce fichier est la seule chose a lire pour
// savoir si WebView2 s'est initialise, quelle version a repondu, et quel serveur
// la coquille a trouve ou lance.
//
// IL VIT A COTE DE L'EXECUTABLE, et pas dans %LOCALAPPDATA% : la decision (a) du
// 2026-09-20 est que rien de l'application ne s'ecrit hors de son propre
// dossier — et une mesure l'a confirme : %LOCALAPPDATA% est INECRIVABLE dans un
// contexte restreint (acces refuse a la creation du dossier), donc un journal
// qui y serait ecrit disparaitrait en silence, en emportant la seule trace
// disponible. Un journal qu'on ne peut pas lire ne sert a rien.
internal static class Journal
{
    public static string Chemin => Path.Combine(AppContext.BaseDirectory, "coquille.log");

    public static void Ecrire(string ligne)
    {
        try
        {
            File.AppendAllText(Chemin, DateTime.Now.ToString("O") + "  " + ligne + Environment.NewLine);
        }
        catch (IOException) { /* un journal illisible ne doit pas empecher l'application de tourner */ }
        catch (UnauthorizedAccessException) { }
    }
}
