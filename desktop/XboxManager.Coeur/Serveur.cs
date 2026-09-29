using System.Text.Json;

namespace XboxManager.Coeur;

/// <summary>Ce que la sonde a trouvé sur le port du serveur.</summary>
public enum Sonde
{
    /// <summary>Rien n'écoute : c'est le cas « lancer le serveur ».</summary>
    Rien,
    /// <summary>Notre serveur répond (JSON avec ses clefs) : on s'y attache.</summary>
    NotreServeur,
    /// <summary>Quelque chose répond, mais ce n'est pas lui : on ne touche à rien.</summary>
    AutreChose
}

/// <summary>Ce que la coquille doit faire.</summary>
public enum Etat
{
    Attacher,
    Lancer,
    PortOccupe
}

public static class Decision
{
    // LE CRITERE N'EST PAS « le port repond » MAIS « NOTRE serveur repond ».
    // N'importe quel programme peut ecouter sur 4360 : lancer Node sur un port
    // occupe donne un echec obscur, et tuer le processus qui tient le port
    // tuerait le programme de quelqu'un d'autre.
    public static Sonde Lire(int? code, string? corps)
    {
        if (code is null) return Sonde.Rien;      // rien n'ecoute
        if (code != 200) return Sonde.AutreChose; // autre chose repond
        return EstNotreServeur(corps) ? Sonde.NotreServeur : Sonde.AutreChose;
    }

    public static Etat Pour(Sonde s) => s switch
    {
        Sonde.Rien => Etat.Lancer,
        Sonde.NotreServeur => Etat.Attacher,
        _ => Etat.PortOccupe
    };

    // `/api/config` rend `drop` et `games` : deux clefs que NOTRE serveur rend et
    // qu'un autre programme n'a aucune raison de rendre ensemble.
    public static bool EstNotreServeur(string? corps)
    {
        if (string.IsNullOrWhiteSpace(corps)) return false;
        try
        {
            using var doc = JsonDocument.Parse(corps);
            var r = doc.RootElement;
            return r.ValueKind == JsonValueKind.Object
                && r.TryGetProperty("drop", out _)
                && r.TryGetProperty("games", out _);
        }
        catch (JsonException) { return false; }
    }
}

public static class Arret
{
    // ON NE TUE QUE CE QU'ON A LANCE. Un serveur trouve en route peut etre celui
    // d'une console ouverte, ou celui d'un autre utilisateur. Le piege est
    // classique : on ferme la fenetre, et le serveur de quelqu'un d'autre
    // s'arrete.
    public static void SurFermeture(bool proprietaire, Action arreter)
    {
        if (proprietaire) arreter();
    }
}
