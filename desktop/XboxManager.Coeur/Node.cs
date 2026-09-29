using System.IO;

namespace XboxManager.Coeur;

public static class Node
{
    // NODE EST EXIGE INSTALLE (spec §8.1), et son chemin est une donnee MOBILE :
    // sur la machine de reference il est en `C:\nvm4w\nodejs\node.exe` (nvm4w),
    // et nvm4w change de version quand l'utilisateur en change. Aucun chemin en
    // dur, donc : le PATH, puis `runtime\node\node.exe` a cote de l'application
    // (c'est ce que la conception prevoit pour une archive autonome).
    public static string? Trouver(Func<string, string?> dansPath, Func<string, bool> existe, string racineApp)
    {
        var p = dansPath("node.exe");
        if (!string.IsNullOrWhiteSpace(p) && existe(p)) return p;
        var local = Path.Combine(racineApp, "runtime", "node", "node.exe");
        return existe(local) ? local : null;
    }

    // Ce que la coquille ECRIT a l'utilisateur quand aucun des deux n'existe :
    // une phrase qui dit quoi installer, pas un message systeme.
    public const string Conseil = "Node.js est introuvable. Installez-le depuis nodejs.org "
        + "(ou deposez node.exe dans runtime\\node\\ a cote de l'application), puis relancez.";
}
