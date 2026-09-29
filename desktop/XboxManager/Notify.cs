using System.Drawing;
using System.IO;
using System.Windows;
using WinForms = System.Windows.Forms;

namespace XboxManager;

// L'icone de notification : afficher/masquer la fenetre, et quitter.
//
// Elle sert au demarrage automatique (`--arriere-plan`) : la coquille se lance
// alors SANS fenetre, et l'icone est le seul moyen de la rappeler. Sans elle, ce
// mode serait un programme invisible qu'on ne peut plus arreter autrement qu'au
// gestionnaire de taches.
public sealed class Notify : IDisposable
{
    private readonly WinForms.NotifyIcon _ni;

    public Notify(Window fenetre, string icone, Action quitter)
    {
        var menu = new WinForms.ContextMenuStrip();
        menu.Items.Add("Afficher", null, (_, _) => Montrer(fenetre));
        menu.Items.Add("Quitter", null, (_, _) => quitter());

        _ni = new WinForms.NotifyIcon
        {
            Icon = ChargerIcone(icone),
            Text = "Xbox 360 Manager",
            Visible = true,
            ContextMenuStrip = menu
        };

        // Le clic sur l'icone BASCULE la fenetre : c'est ce qu'on attend d'une
        // icone de notification, et ca evite d'ouvrir un menu pour rien.
        _ni.MouseClick += (_, e) =>
        {
            if (e.Button != WinForms.MouseButtons.Left) return;
            if (fenetre.IsVisible) fenetre.Hide();
            else Montrer(fenetre);
        };
    }

    private static void Montrer(Window fenetre)
    {
        fenetre.Show();
        if (fenetre.WindowState == WindowState.Minimized) fenetre.WindowState = WindowState.Normal;
        fenetre.Activate();
    }

    // L'icone de l'application si elle existe, sinon CELLE DE L'EXECUTABLE : une
    // icone de notification doit toujours en avoir une, et `new Icon(chemin)`
    // leve si le fichier est absent — ce qui priverait l'utilisateur du seul
    // moyen de rappeler une fenetre lancee en arriere-plan.
    private static Icon ChargerIcone(string chemin)
    {
        try
        {
            if (File.Exists(chemin)) return new Icon(chemin);
            Journal.Ecrire("icone absente (" + chemin + ") : icone de l'executable utilisee");
        }
        catch (Exception ex)
        {
            Journal.Ecrire("icone illisible (" + ex.Message + ") : icone de l'executable utilisee");
        }
        return Icon.ExtractAssociatedIcon(Environment.ProcessPath!) ?? SystemIcons.Application;
    }

    public void Dispose()
    {
        _ni.Visible = false;
        _ni.Dispose();
    }
}
