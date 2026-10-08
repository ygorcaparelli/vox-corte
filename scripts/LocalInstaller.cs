using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;

[assembly: AssemblyTitle("Instalador Vox Corte")]
[assembly: AssemblyProduct("Vox Corte")]
[assembly: AssemblyVersion("1.12.2.0")]
[assembly: AssemblyFileVersion("1.12.2.0")]

internal static class LocalInstaller
{
    private static string Quote(string value)
    {
        if (value.Contains("\"")) throw new ArgumentException("Caminho invalido.");
        return "\"" + value.TrimEnd('\\') + "\"";
    }

    private static void Extract(string resource, string file)
    {
        using (Stream input = Assembly.GetExecutingAssembly().GetManifestResourceStream(resource))
        using (FileStream output = File.Create(file))
        {
            if (input == null) throw new IOException("Pacote incompleto: " + resource);
            input.CopyTo(output);
        }
    }

    private static int Main(string[] args)
    {
        string work = null;
        try
        {
            string options = "";
            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "-NoLaunch" || args[i] == "-NoShortcuts") options += " " + args[i];
                else if (args[i] == "-InstallDir" && i + 1 < args.Length) options += " -InstallDir " + Quote(Path.GetFullPath(args[++i]));
                else throw new ArgumentException("Opcao desconhecida: " + args[i]);
            }
            Console.Title = "Instalador Vox Corte";
            Console.WriteLine("Preparando a instalacao do Vox Corte 1.12.2...");
            work = Path.Combine(Path.GetTempPath(), "VoxCorteInstall-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(work);
            Extract("ApplicationZip", Path.Combine(work, "aplicativo.zip"));
            Extract("ApplicationHash", Path.Combine(work, "aplicativo.sha256"));
            Extract("InstallScript", Path.Combine(work, "instalar.ps1"));
            string powershell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
            ProcessStartInfo info = new ProcessStartInfo(powershell,
                "-NoProfile -ExecutionPolicy Bypass -File " + Quote(Path.Combine(work, "instalar.ps1")) + options);
            info.UseShellExecute = false;
            info.EnvironmentVariables.Remove("PSModulePath");
            using (Process process = Process.Start(info))
            {
                process.WaitForExit();
                if (process.ExitCode != 0) throw new IOException("Nao foi possivel instalar. Confira a mensagem acima.");
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
            if (args.Length == 0) { Console.WriteLine("Pressione Enter para fechar."); Console.ReadLine(); }
            return 1;
        }
        finally
        {
            if (work != null)
            {
                string temp = Path.GetFullPath(Path.GetTempPath()).TrimEnd('\\') + "\\";
                string resolved = Path.GetFullPath(work);
                if (resolved.StartsWith(temp, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(resolved).StartsWith("VoxCorteInstall-"))
                {
                    try { Directory.Delete(resolved, true); } catch { }
                }
            }
        }
    }
}
