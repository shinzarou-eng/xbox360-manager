namespace XboxManager.Coeur;

public static class Sondeur
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromMilliseconds(800) };

    public const string Url = "http://127.0.0.1:4360/api/config";

    // Ne LEVE JAMAIS : « rien ne repond » est un resultat NORMAL — c'est le cas
    // « lancer le serveur » — et non une erreur. Un timeout de 800 ms suffit : le
    // serveur repond en quelques millisecondes quand il est la, et attendre plus
    // longtemps ne ferait que retarder l'affichage.
    public static async Task<(int? code, string? corps)> Lire(string url = Url, int ms = 800)
    {
        try
        {
            using var cts = new CancellationTokenSource(ms);
            using var rep = await Http.GetAsync(url, cts.Token);
            return ((int)rep.StatusCode, await rep.Content.ReadAsStringAsync(cts.Token));
        }
        catch (Exception)
        {
            // Tout ce qui peut arriver ici veut dire la meme chose pour l'appelant :
            // personne n'a repondu. Connexion refusee, delai depasse, DNS, socket
            // ferme : on ne les distingue pas, et `Lire` rend `Rien`.
            return (null, null);
        }
    }
}
