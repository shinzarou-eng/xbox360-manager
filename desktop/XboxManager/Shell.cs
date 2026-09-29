using System.Text.Json;
using System.Windows;
using Microsoft.Web.WebView2.Wpf;
using XboxManager.Coeur;

namespace XboxManager;

// TOUT LE CONTRAT entre la page et la coquille vit ici : un seul fichier a relire
// quand on ajoute un message. Les formes sont celles de la spec §4.4 — la page
// envoie `min`, `max`, `close`, `drag`, et la coquille repond `etat`.
//
// Ce fichier ne DECIDE rien : il traduit des messages en actions sur la fenetre,
// et l'etat de la fenetre en messages. Toute la decision est dans
// `XboxManager.Coeur`, ou elle est testee sans fenetre.
public sealed class Shell
{
    private readonly Window _fenetre;
    private readonly WebView2 _vue;

    /// <summary>Le Mica a-t-il vraiment ete obtenu ? La page peut ainsi le dire.</summary>
    public bool Mica { get; set; } = true;

    public Shell(Window fenetre, WebView2 vue)
    {
        _fenetre = fenetre;
        _vue = vue;
    }

    public void Brancher()
    {
        _vue.CoreWebView2.WebMessageReceived += (_, e) =>
        {
            try
            {
                using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                var t = doc.RootElement.TryGetProperty("t", out var v) ? v.GetString() : null;
                switch (t)
                {
                    case "min":
                        _fenetre.WindowState = WindowState.Minimized;
                        break;

                    case "max":
                        _fenetre.WindowState = _fenetre.WindowState == WindowState.Maximized
                            ? WindowState.Normal
                            : WindowState.Maximized;
                        // La forme EXACTE de la spec §4.4 : le champ s'appelle `max`.
                        Envoyer(new { t = "etat", max = _fenetre.WindowState == WindowState.Maximized });
                        break;

                    case "close":
                        _fenetre.Close();
                        break;

                    case "drag":
                        // MECANISME RETENU PAR LA MESURE (desktop/README.md). Si la
                        // mesure a retenu `-webkit-app-region: drag`, la page
                        // n'envoie jamais ce message et c'est le CSS qui deplace la
                        // fenetre ; cette branche reste alors inoffensive.
                        _fenetre.DragMove();
                        break;

                    // LE DEMARRAGE AUTOMATIQUE. La page DEMANDE l'etat (`auto?`)
                    // puis le CHANGE (`auto`) : elle n'ecrit jamais dans le
                    // registre elle-meme, elle n'y a pas acces. Et elle n'invente
                    // pas l'etat — elle affiche celui que la coquille lui renvoie,
                    // qui est la seule verite.
                    case "auto?":
                        Envoyer(new { t = "auto", on = Registre.Lire(Registre.Nom) is not null });
                        break;

                    case "auto":
                        var on = doc.RootElement.TryGetProperty("on", out var o) && o.GetBoolean();
                        var fait = on
                            ? Registre.Ecrire(Registre.Nom, Registre.Ligne(Environment.ProcessPath!))
                            : Registre.Effacer(Registre.Nom);
                        Journal.Ecrire("demarrage automatique : " + (on ? "inscrit" : "retire")
                            + (fait ? "" : " (REFUSE par le registre)"));
                        // L'etat RENVOYE est celui du registre APRES l'operation :
                        // si l'ecriture a echoue, la case se decoche toute seule.
                        Envoyer(new { t = "auto", on = Registre.Lire(Registre.Nom) is not null });
                        break;
                }
            }
            catch (JsonException)
            {
                // Un message illisible ne doit pas tuer la fenetre : la page est
                // du code qui peut etre modifie sans recompiler la coquille.
            }
        };

        _vue.CoreWebView2.NavigationCompleted += (_, _) =>
            Envoyer(new
            {
                t = "shell",
                mica = Mica,
                version = typeof(Shell).Assembly.GetName().Version?.ToString() ?? "?"
            });
    }

    // UN SEUL POINT DE SORTIE vers la page : deux `PostWebMessageAsJson` ecrits a
    // la main finiraient par diverger de ce que la page lit.
    private void Envoyer(object message) =>
        _vue.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(message));
}
