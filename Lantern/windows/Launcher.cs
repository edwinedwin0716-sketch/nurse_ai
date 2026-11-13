// 등불 원정대 Windows 10/11 실행기: 게임 화면(HTML)을 내 PC에 설치하고 Edge 앱 창으로 연다.
using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("등불 원정대")]
[assembly: AssemblyProduct("등불 원정대")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

static class Launcher {
    const string Version = "1.0";
    const string Caption = "등불 원정대";
    static string Dir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Lantern"); } }

    [STAThread]
    static int Main(string[] args) {
        try {
            string html = Path.Combine(Dir, "등불원정대.html"), exe = Path.Combine(Dir, "등불원정대.exe");
            bool fresh = !File.Exists(html) || ReadVersion() != Version;
            if (fresh) Install(html, exe);
            if (args.Length > 0 && args[0] == "--install-only") return 0;
            Open(html);
            if (fresh) InstallCleanup.OfferRemoveDownloads(Caption, "등불원정대", new[] { "등불원정대.exe", "설치 및 사용법.txt" }, @"^Lantern-Windows-[0-9.]+( \(\d+\))?\.zip$", Dir);
            return 0;
        } catch (Exception e) {
            MessageBox.Show("실행하지 못했어요.\n\n" + e.Message, Caption, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }
    }

    static string ReadVersion() { try { return File.ReadAllText(Path.Combine(Dir, "version.txt")).Trim(); } catch { return ""; } }

    static void Install(string html, string exe) {
        Directory.CreateDirectory(Dir);
        using (var s = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.html"))
        using (var f = File.Create(html)) s.CopyTo(f);
        string self = Assembly.GetExecutingAssembly().Location;
        if (!string.Equals(Path.GetFullPath(self), Path.GetFullPath(exe), StringComparison.OrdinalIgnoreCase)) { try { File.Copy(self, exe, true); } catch (IOException) { } }  // 열려 있으면 다음에
        File.WriteAllText(Path.Combine(Dir, "version.txt"), Version);
        Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "등불 원정대.lnk"), exe);
        Shortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "등불 원정대.lnk"), exe);
    }

    // WScript.Shell 로 바로가기 만들기 (dynamic 없이 reflection)
    static void Shortcut(string lnk, string target) {
        try {
            var t = Type.GetTypeFromProgID("WScript.Shell"); object sh = Activator.CreateInstance(t);
            object sc = t.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, sh, new object[] { lnk });
            var st = sc.GetType();
            st.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
            st.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { Path.GetDirectoryName(target) });
            st.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { target + ",0" });
            st.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { "카드로 싸우는 육각 칸 동굴 모험" });
            st.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
        } catch { }
    }

    static string Edge() {
        foreach (var hive in new[] { Registry.CurrentUser, Registry.LocalMachine }) {
            try { using (var k = hive.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe")) { var p = k == null ? null : k.GetValue("") as string; if (!string.IsNullOrEmpty(p) && File.Exists(p)) return p; } } catch { }
        }
        foreach (var root in new[] { Environment.GetEnvironmentVariable("ProgramFiles(x86)"), Environment.GetEnvironmentVariable("ProgramFiles") }) {
            if (string.IsNullOrEmpty(root)) continue;
            string p = Path.Combine(root, @"Microsoft\Edge\Application\msedge.exe"); if (File.Exists(p)) return p;
        }
        return null;
    }

    static void Open(string html) {
        string url = new Uri(html).AbsoluteUri, edge = Edge();
        if (edge != null) Process.Start(new ProcessStartInfo(edge, "--app=\"" + url + "\" --window-size=1180,860") { UseShellExecute = false });
        else Process.Start(new ProcessStartInfo(html) { UseShellExecute = true });
    }
}
