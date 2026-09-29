using System.Windows;
using System.Windows.Input;

namespace XboxManager;

// Fenetre de MESURE, jetable : elle essaie les deux mecanismes de glissement
// connus (spec §4.6) pour que l'utilisateur dise lequel garder. Ce n'est pas la
// fenetre de l'application.
//
// Elle charge une page EN MEMOIRE (`NavigateToString`) et pas l'application :
// mesurer le glissement ne doit pas exiger que le serveur 4360 tourne.
public partial class Glissement : Window
{
    public Glissement()
    {
        InitializeComponent();
        Loaded += async (_, _) =>
        {
            // L'INITIALISATION DE WEBVIEW2 PEUT ECHOUER, et ce n'est pas
            // theorique : le moteur de rendu est un processus Chromium separe,
            // qui a besoin de PIPES NOMMES. Dans un contexte qui les refuse, il
            // ne demarre pas du tout (`acces refuse (0x5)`), et sans ce `catch`
            // l'exception non geree tue la fenetre — l'utilisateur voit une
            // fenetre qui disparait, sans un mot.
            try
            {
                await Vue.EnsureCoreWebView2Async();
                Journal.Ecrire("mesure du glissement : WebView2 "
                    + Vue.CoreWebView2.Environment.BrowserVersionString + " pret");
                Vue.NavigateToString("""
                    <html><body style="margin:0;background:#111;color:#eee;font:14px Segoe UI">
                      <div style="height:48px;background:#2d2d2d;-webkit-app-region:drag;
                                  display:flex;align-items:center;padding-left:12px">
                        Zone de la page : -webkit-app-region: drag
                      </div>
                      <div style="height:48px;background:#333;display:flex;align-items:center;padding-left:12px">
                        Zone de la page : -webkit-app-region: no-drag (temoin)
                      </div>
                      <p style="padding:12px">Cliquez dans la zone <b>no-drag</b> : la fenetre ne doit PAS bouger.</p>
                    </body></html>
                    """);
            }
            catch (Exception ex)
            {
                Journal.Ecrire("mesure du glissement : WebView2 INDISPONIBLE — " + ex.Message);
                Bandeau.Visibility = Visibility.Visible;
                TexteBandeau.Text = "WebView2 n'a pas demarre : " + ex.Message;
            }
        };
    }

    private void BandeB_Souris(object sender, MouseButtonEventArgs e)
    {
        // DragMove() BLOQUE le fil jusqu'au relachement : c'est precisement ce
        // qu'on mesure ici (et le defaut connu de ce mecanisme).
        DragMove();
    }
}
