using Microsoft.Win32;

namespace XboxManager.Coeur;

/// <summary>
/// Le démarrage automatique : une valeur dans <c>HKCU\…\CurrentVersion\Run</c>,
/// posée et retirée par l'application elle-même.
/// </summary>
public static class Registre
{
    public const string Nom = "XboxManager";
    private const string Cle = @"Software\Microsoft\Windows\CurrentVersion\Run";

    public static string? Lire(string nom)
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(Cle);
            return k?.GetValue(nom) as string;
        }
        catch (System.Security.SecurityException) { return null; }
        catch (UnauthorizedAccessException) { return null; }
    }

    public static bool Ecrire(string nom, string valeur)
    {
        try
        {
            using var k = Registry.CurrentUser.CreateSubKey(Cle);
            if (k is null) return false;
            k.SetValue(nom, valeur);
            return true;
        }
        catch (System.Security.SecurityException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    public static bool Effacer(string nom)
    {
        try
        {
            using var k = Registry.CurrentUser.OpenSubKey(Cle, writable: true);
            k?.DeleteValue(nom, throwOnMissingValue: false);
            return true;
        }
        catch (System.Security.SecurityException) { return false; }
        catch (UnauthorizedAccessException) { return false; }
    }

    // LA LIGNE ECRITE, et elle est testable : le chemin est entre GUILLEMETS (il
    // contient souvent des espaces, et sans elles Windows chercherait
    // `C:\Program`), et l'option `--arriere-plan` dit a la coquille de demarrer
    // SANS montrer la fenetre — sinon la machine ouvrirait une fenetre a chaque
    // connexion, ce que personne n'a demande.
    public static string Ligne(string cheminExe) => "\"" + cheminExe + "\" --arriere-plan";
}
