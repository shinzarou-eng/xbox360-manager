// Harnais de test SANS cadre de test. xunit, MSTest et Microsoft.NET.Test.Sdk ne
// sont pas dans le cache NuGet local, et nuget.org n'est pas joignable depuis
// dotnet dans cet environnement (mesure : « SSL connection could not be
// established »). Un projet console suffit, et c'est le meme choix que
// `test/run.js` cote Node plutot que `node --test` (EPERM dans cet
// environnement) : les tests tournent DANS le process, sans runner qui spawne.
//
// Usage : dotnet run --project desktop\XboxManager.Coeur.Tests
// Sortie : « n/n » puis code de sortie 0 (ou 1 des qu'un test echoue).
using XboxManager.Coeur;

int total = 0, echecs = 0;

void Verifie(string nom, bool condition)
{
    total++;
    if (condition) { Console.WriteLine("  ok    : " + nom); return; }
    echecs++;
    Console.WriteLine("  ECHEC : " + nom);
}

string Config = """{"drop":"D:\\dl","games":"D:\\Games","content":"D:\\Content"}""";

Console.WriteLine("Decision.Lire");
Verifie("rien ne repond -> Rien", Decision.Lire(null, null) == Sonde.Rien);
Verifie("notre serveur -> NotreServeur", Decision.Lire(200, Config) == Sonde.NotreServeur);
Verifie("une page HTML sur le port -> AutreChose",
    Decision.Lire(200, "<html><body>autre chose</body></html>") == Sonde.AutreChose);
Verifie("un JSON sans nos clefs -> AutreChose", Decision.Lire(200, """{"hello":"world"}""") == Sonde.AutreChose);
Verifie("un 404 -> AutreChose", Decision.Lire(404, "not found") == Sonde.AutreChose);
Verifie("un corps vide -> AutreChose", Decision.Lire(200, "") == Sonde.AutreChose);
Verifie("une clef manquante -> AutreChose", Decision.Lire(200, """{"drop":"D:\\dl"}""") == Sonde.AutreChose);

Console.WriteLine("Decision.Pour");
Verifie("Rien -> Lancer", Decision.Pour(Sonde.Rien) == Etat.Lancer);
Verifie("NotreServeur -> Attacher", Decision.Pour(Sonde.NotreServeur) == Etat.Attacher);
Verifie("AutreChose -> PortOccupe", Decision.Pour(Sonde.AutreChose) == Etat.PortOccupe);

Console.WriteLine("Arret.SurFermeture");
int arrets = 0;
Arret.SurFermeture(false, () => arrets++);
Verifie("on ne tue PAS un serveur qu'on n'a pas lance", arrets == 0);
Arret.SurFermeture(true, () => arrets++);
Verifie("on tue celui qu'on a lance", arrets == 1);

Console.WriteLine("Racine.Trouver");
bool Existe(string p) => p.Equals(@"C:\app\server.js", StringComparison.OrdinalIgnoreCase)
                      || p.Equals(@"C:\app\public\index.html", StringComparison.OrdinalIgnoreCase);
Verifie("trouve la racine en remontant", Racine.Trouver(@"C:\app\desktop\XboxManager\bin\Debug", Existe) == @"C:\app");
Verifie("remonte au plus `max` niveaux", Racine.Trouver(@"C:\a\b\c\d\e\f\g", Existe, 2) is null);
Verifie("rien a trouver -> null", Racine.Trouver(@"C:\autre\chose", Existe) is null);

Console.WriteLine("Node.Trouver");
// Le chemin rendu par le PATH est VERIFIE avant d'etre accepte : nvm4w inscrit
// un chemin dans le PATH qui peut ne plus exister apres un changement de
// version. Le premier test l'accepte parce qu'il existe, le second montre le
// repli quand il n'existe pas — c'est ce cas-la qui arrive en vrai.
Verifie("le PATH d'abord",
    Node.Trouver(_ => @"C:\nvm4w\nodejs\node.exe", p => p == @"C:\nvm4w\nodejs\node.exe", @"C:\app")
    == @"C:\nvm4w\nodejs\node.exe");
Verifie("un chemin de PATH INEXISTANT ne compte pas, on passe a runtime\\node",
    Node.Trouver(_ => @"C:\absent\node.exe", p => p == @"C:\app\runtime\node\node.exe", @"C:\app")
    == @"C:\app\runtime\node\node.exe");
Verifie("le PATH puis runtime\\node",
    Node.Trouver(_ => null, p => p == @"C:\app\runtime\node\node.exe", @"C:\app") == @"C:\app\runtime\node\node.exe");
Verifie("aucun des deux -> null", Node.Trouver(_ => null, _ => false, @"C:\app") is null);

Console.WriteLine("Registre.Ligne");
Verifie("le chemin est entre guillemets (il peut contenir des espaces)",
    Registre.Ligne(@"C:\Program Files\XboxManager\XboxManager.exe")
    == "\"C:\\Program Files\\XboxManager\\XboxManager.exe\" --arriere-plan");
Verifie("le demarrage automatique ne montre PAS la fenetre",
    Registre.Ligne(@"C:\x\XboxManager.exe").EndsWith("--arriere-plan"));

Console.WriteLine($"\n{total - echecs}/{total}");
return echecs == 0 ? 0 : 1;
