using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

// 검색할 목록 만들기: 시작 메뉴 앱 · 최근 문서 · 바탕화면/문서/다운로드 · MySpace 런처 등록 항목 · Windows 설정
public static class Index {
    public static string DataDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MySpotlight"); } }
    static string LauncherDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MySpaceLauncher"); } }
    public static string LauncherIcons { get { return Path.Combine(LauncherDir, "icons"); } }
    static readonly Regex Junk = new Regex(@"uninstall|제거|삭제|help|도움말|readme|license|website|홈페이지|\.url$", RegexOptions.IgnoreCase);

    public static List<Entry> Build() {
        var list = new List<Entry>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Action<Entry> add = e => { if (e != null && !string.IsNullOrEmpty(e.Name) && seen.Add(e.Kind + "|" + e.Name + "|" + e.Path)) list.Add(e); };

        // 시작 메뉴 앱
        foreach (var root in new[] { Environment.GetFolderPath(Environment.SpecialFolder.Programs), Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms) })
            foreach (var f in Files(root, "*.lnk", true))
                if (!Junk.IsMatch(Path.GetFileName(f))) add(new Entry(Path.GetFileNameWithoutExtension(f), f, "응용 프로그램", Path.GetFileName(Path.GetDirectoryName(f))));

        // MySpace 런처에 등록한 항목
        try {
            string json = Path.Combine(LauncherDir, "items.json");
            if (File.Exists(json)) {
                var d = new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(File.ReadAllText(json, Encoding.UTF8)) as Dictionary<string, object>;
                var items = d != null && d.ContainsKey("items") ? d["items"] as object[] : null;
                if (items != null) foreach (var o in items) {
                    var it = o as Dictionary<string, object>; if (it == null) continue;
                    string name = it.ContainsKey("name") ? it["name"] as string : null, p = it.ContainsKey("path") ? it["path"] as string : null;
                    if (name == null || p == null) continue;
                    add(new Entry(name, p, KindOf(p), p));
                }
            }
        } catch { }

        // 바탕화면 · 문서 · 다운로드 (한 단계 아래 폴더까지) · 최근 문서
        foreach (var folder in new[] { Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.MyDocuments }) {
            string root = Environment.GetFolderPath(folder);
            Scan(root, 1, add);
        }
        Scan(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"), 0, add);
        foreach (var f in Files(Environment.GetFolderPath(Environment.SpecialFolder.Recent), "*.lnk", false).Take(150)) {
            string n = Path.GetFileNameWithoutExtension(f);
            if (Path.GetExtension(n).Length > 1) add(new Entry(Path.GetFileNameWithoutExtension(n), f, "문서", "최근 사용 · " + n));
        }
        foreach (var name in new[] { "Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos" }) {
            string p = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), name);
            if (Directory.Exists(p)) add(new Entry(KoreanFolder(name), p, "폴더", p));
        }
        foreach (var s in Settings.All) { var e = new Entry(s[0], s[1], "시스템 설정", "Windows 설정"); e.Keywords = s[2]; add(e); }
        return list;
    }
    static string KoreanFolder(string n) { switch (n) { case "Desktop": return "바탕 화면"; case "Documents": return "문서"; case "Downloads": return "다운로드"; case "Pictures": return "사진"; case "Music": return "음악"; default: return "동영상"; } }
    public static string KindOf(string p) {
        if (p.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return "웹사이트";
        if (p.StartsWith("steam:", StringComparison.OrdinalIgnoreCase) || p.StartsWith("shell:AppsFolder", StringComparison.OrdinalIgnoreCase)) return "응용 프로그램";
        if (Directory.Exists(p)) return "폴더";
        string ext = Path.GetExtension(p).ToLowerInvariant();
        return ext == ".lnk" || ext == ".exe" || ext == ".url" || ext == ".appref-ms" ? "응용 프로그램" : "문서";
    }
    static void Scan(string root, int depth, Action<Entry> add) {
        if (string.IsNullOrEmpty(root) || !Directory.Exists(root)) return;
        try {
            foreach (var f in Directory.GetFiles(root)) {
                string n = Path.GetFileName(f);
                if (n.StartsWith("~$") || n.StartsWith(".") || n.Equals("desktop.ini", StringComparison.OrdinalIgnoreCase)) continue;
                try { if ((File.GetAttributes(f) & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue; } catch { continue; }
                string kind = KindOf(f);
                add(new Entry(Path.GetFileNameWithoutExtension(f), f, kind, f));
            }
            foreach (var d in Directory.GetDirectories(root)) {
                try { if ((File.GetAttributes(d) & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue; } catch { continue; }
                add(new Entry(Path.GetFileName(d), d, "폴더", d));
                if (depth > 0) Scan(d, depth - 1, add);
            }
        } catch { }
    }
    static IEnumerable<string> Files(string root, string pattern, bool deep) {
        if (string.IsNullOrEmpty(root) || !Directory.Exists(root)) return new string[0];
        try { return Directory.GetFiles(root, pattern, deep ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly); } catch { return new string[0]; }
    }

    // 실행 횟수 (자주 쓰는 항목을 위로)
    public static Dictionary<string, int> LoadUses() {
        var d = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        try { foreach (var line in File.ReadAllLines(Path.Combine(DataDir, "uses.txt"), Encoding.UTF8)) { int t = line.LastIndexOf('\t'); int n; if (t > 0 && int.TryParse(line.Substring(t + 1), out n)) d[line.Substring(0, t)] = n; } } catch { }
        return d;
    }
    public static void SaveUses(Dictionary<string, int> d) {
        try { Directory.CreateDirectory(DataDir); File.WriteAllLines(Path.Combine(DataDir, "uses.txt"), d.OrderByDescending(x => x.Value).Take(500).Select(x => x.Key + "\t" + x.Value), new UTF8Encoding(false)); } catch { }
    }
}
