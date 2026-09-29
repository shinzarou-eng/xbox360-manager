using System.Diagnostics;
using System.IO;

namespace XboxManager.Coeur;

/// <summary>
/// Le serveur `node server.js` lance par la coquille, et son journal.
/// </summary>
public sealed class Enfant
{
    private readonly Process _p;
    private readonly StreamWriter _flux;

    /// <summary>Vrai quand c'est NOUS qui l'avons lance — donc quand on a le droit de l'arreter.</summary>
    public bool Proprietaire { get; }

    /// <summary>Le fichier ou va la sortie du serveur (premier reflexe quand il ne repond pas).</summary>
    public string Journal { get; }

    private Enfant(Process p, StreamWriter flux, string journal)
    {
        _p = p;
        _flux = flux;
        Journal = journal;
        Proprietaire = true;
    }

    // Lance `node server.js` DANS la racine de l'application et ecrit tout ce
    // qu'il dit dans un journal : sans lui, un serveur qui refuse de demarrer (port
    // pris, module casse, disque absent) ne dit RIEN — la fenetre reste vide et il
    // n'y a rien a lire nulle part.
    //
    // Le journal vit A COTE DE L'EXECUTABLE, comme celui de la coquille : rien de
    // l'application ne s'ecrit hors de son dossier (mesure : %LOCALAPPDATA% est
    // inecrivable dans un contexte restreint).
    public static Enfant Lancer(string node, string racineApp, string dossierJournal)
    {
        var journal = Path.Combine(dossierJournal, "serveur.log");
        var psi = new ProcessStartInfo(node, "server.js")
        {
            WorkingDirectory = racineApp,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        var p = Process.Start(psi)
            ?? throw new InvalidOperationException("node n'a pas pu etre lance : " + node);

        var flux = new StreamWriter(journal, append: true) { AutoFlush = true };
        flux.WriteLine($"--- {DateTime.Now:O} node server.js (pid {p.Id}) ---");

        // Une ligne du serveur = une ligne du journal, et rien n'est perdu : la
        // sortie est lue en flux, pas a la fin (un serveur ne se termine pas).
        p.OutputDataReceived += (_, e) => { if (e.Data is not null) flux.WriteLine(e.Data); };
        p.ErrorDataReceived += (_, e) => { if (e.Data is not null) flux.WriteLine("ERR " + e.Data); };
        p.BeginOutputReadLine();
        p.BeginErrorReadLine();

        return new Enfant(p, flux, journal);
    }

    public bool Vivant
    {
        get { try { return !_p.HasExited; } catch (InvalidOperationException) { return false; } }
    }

    // L'ARBRE ENTIER : `server.js` lance des enfants (7z, iso2god, exiso). Tuer le
    // seul processus Node laisserait ces outils tourner apres la fermeture de la
    // fenetre, en tenant des fichiers du disque.
    public void Arreter()
    {
        try
        {
            if (!_p.HasExited)
            {
                _p.Kill(entireProcessTree: true);
                _p.WaitForExit(3000);
            }
        }
        catch (InvalidOperationException) { }
        catch (System.ComponentModel.Win32Exception) { }
        finally
        {
            try { _flux.Dispose(); } catch (IOException) { }
        }
    }
}
