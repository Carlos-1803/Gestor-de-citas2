using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("EntreCortes")]
[assembly: AssemblyProduct("EntreCortes")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class Launcher {
    [STAThread]
    static void Main() {
        const string home = "__SERVICE_URL__";
        string[] locations = {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
        };
        foreach (string app in new[] { @"Microsoft\Edge\Application\msedge.exe", @"Google\Chrome\Application\chrome.exe" }) {
            foreach (string root in locations) {
                string browser = Path.Combine(root, app);
                if (File.Exists(browser)) {
                    try {
                        Process.Start(new ProcessStartInfo(browser, "--app=" + home) { UseShellExecute = false });
                        return;
                    } catch (System.ComponentModel.Win32Exception) { }
                }
            }
        }
        try { Process.Start(new ProcessStartInfo(home) { UseShellExecute = true }); }
        catch (System.ComponentModel.Win32Exception) {
            MessageBox.Show("Abre " + home + " en Chrome o Edge para usar EntreCortes.", "EntreCortes");
        }
    }
}
