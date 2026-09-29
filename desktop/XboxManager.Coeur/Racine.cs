using System.IO;

namespace XboxManager.Coeur;

public static class Racine
{
    // OU EST L'APPLICATION. La coquille est compilee dans
    // `desktop\XboxManager\bin\<config>\net10.0-windows\`, donc la racine de
    // l'application est plusieurs niveaux au-dessus. On ne la DEVINE pas : on la
    // cherche en remontant, et on s'arrete des qu'un dossier porte `server.js`
    // ET `public\index.html` — les DEUX, parce qu'un `server.js` isole ne prouve
    // rien (n'importe quel projet peut en avoir un).
    private static readonly string[] Marques = { "server.js", Path.Combine("public", "index.html") };

    public static string? Trouver(string depuis, Func<string, bool> existe, int max = 6)
    {
        var d = new DirectoryInfo(depuis);
        for (int i = 0; i <= max && d is not null; i++, d = d.Parent)
        {
            if (Marques.All(m => existe(Path.Combine(d.FullName, m)))) return d.FullName;
        }
        return null;
    }

    // `app.txt`, ecrit a cote de l'executable, permet de viser une installation
    // ailleurs (une archive de distribution deployee dans un autre dossier).
    public static string? DepuisFichier(string cheminAppTxt, Func<string, bool> existe)
    {
        try
        {
            if (!File.Exists(cheminAppTxt)) return null;
            var ligne = File.ReadAllLines(cheminAppTxt).FirstOrDefault(l => !string.IsNullOrWhiteSpace(l));
            if (ligne is null) return null;
            var p = ligne.Trim().Trim('"');
            return Marques.All(m => existe(Path.Combine(p, m))) ? p : null;
        }
        catch (IOException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }
}
