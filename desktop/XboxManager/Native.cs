using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace XboxManager;

// Ce que WPF ne sait pas faire, et qui se fait par DWM : le materiau de la
// fenetre (Mica) et ses coins arrondis.
//
// POURQUOI PAS `Window.BackdropType` : la conception (spec §4.5) le prevoyait
// « WPF .NET 9+ ». Mesure du 2026-09-21 sur le SDK 10.0.401 : ni la propriete
// `BackdropType` sur `Window`, ni le type `System.Windows.Media.BackdropType`
// n'existent (erreurs CS0103 et CS0234). L'effet, lui, reste possible — c'est
// DWM qui le peint, et deux appels suffisent. On garde donc l'INTENTION de la
// spec et on change le MECANISME, en le disant.
//
// POURQUOI `DllImport` ET PAS `LibraryImport` : le generateur de `LibraryImport`
// produit du code `unsafe`, donc il exige `<AllowUnsafeBlocks>true</AllowUnsafeBlocks>`
// dans le projet (mesure : six erreurs CS0227). Trois appels a user32 et un a
// dwmapi ne valent pas un commutateur de compilation en plus : `DllImport` fait
// exactement la meme chose, sans lui.
internal static class Native
{
    private const int DWMWA_USE_IMMERSIVE_DARK_MODE = 20;
    private const int DWMWA_WINDOW_CORNER_PREFERENCE = 33;
    private const int DWMWA_SYSTEMBACKDROP_TYPE = 38;

    private const int DWMWCP_ROUND = 2;
    private const int DWMSBT_MAINWINDOW = 2;   // Mica

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribut, ref int valeur, int taille);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "FindWindowW")]
    private static extern IntPtr FindWindow(string? classe, string titre);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(IntPtr hWnd, int commande);

    private const int SW_RESTORE = 9;

    // Ramene au premier plan la fenetre d'une instance deja ouverte (instance
    // unique). Sans cela, une seconde execution ferait croire a un demarrage
    // sans effet.
    public static void Ramener(string titre)
    {
        var h = FindWindow(null, titre);
        if (h == IntPtr.Zero) return;
        ShowWindow(h, SW_RESTORE);
        SetForegroundWindow(h);
    }

    /// <summary>
    /// Applique le fond Mica et les coins arrondis. Rend <c>false</c> quand DWM
    /// refuse — c'est le cas sur Windows 10, et l'appelant DOIT alors le dire.
    /// </summary>
    public static bool Mica(Window fenetre)
    {
        var hwnd = new WindowInteropHelper(fenetre).Handle;
        if (hwnd == IntPtr.Zero) return false;

        int sombre = 1;                                  // barre de titre sombre
        DwmSetWindowAttribute(hwnd, DWMWA_USE_IMMERSIVE_DARK_MODE, ref sombre, sizeof(int));

        int coins = DWMWCP_ROUND;                        // coins arrondis (Windows 11)
        DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, ref coins, sizeof(int));

        int fond = DWMSBT_MAINWINDOW;                    // Mica
        return DwmSetWindowAttribute(hwnd, DWMWA_SYSTEMBACKDROP_TYPE, ref fond, sizeof(int)) == 0;
    }
}
