using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("바탕화면 정리")]
[assembly: AssemblyProduct("바탕화면 정리")]
[assembly: AssemblyDescription("바탕화면의 파일을 종류별 폴더로 옮겨 정리 (삭제 없음, 되돌리기 가능)")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

public class Move {
    public string Source;
    public string Target;
    public string Category;
}

// 정리 규칙: 바탕화면 맨 위의 낱개 파일만 옮긴다. 폴더·바로가기·숨김/시스템 파일은 그대로 둔다. 삭제는 하지 않는다.
public static class Tidy {
    public const string Root = "정리됨";
    static readonly string[][] Kinds = {
        new[] { "문서", ".pdf .doc .docx .hwp .hwpx .txt .ppt .pptx .xls .xlsx .csv .md .rtf .odt .key .pages .show .cell" },
        new[] { "이미지", ".png .jpg .jpeg .gif .bmp .webp .heic .svg .tif .tiff .ico .psd" },
        new[] { "영상·음악", ".mp4 .mov .avi .mkv .wmv .webm .mp3 .wav .m4a .flac .aac .ogg" },
        new[] { "압축파일", ".zip .rar .7z .alz .egg .tar .gz .bz2" },
        new[] { "설치파일", ".exe .msi .apk" }
    };
    static readonly string[] Keep = { ".lnk", ".url", ".ini", ".appref-ms" };

    public static string Category(string path) {
        string ext = Path.GetExtension(path).ToLowerInvariant();
        foreach (var k in Kinds) if (Array.IndexOf(k[1].Split(' '), ext) >= 0) return k[0];
        return "기타";
    }

    public static List<Move> Plan(string desktop, string self) {
        var moves = new List<Move>();
        var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string file in Directory.GetFiles(desktop).OrderBy(f => f, StringComparer.OrdinalIgnoreCase)) {
            string ext = Path.GetExtension(file).ToLowerInvariant();
            if (Array.IndexOf(Keep, ext) >= 0) continue;
            if (self != null && string.Equals(Path.GetFullPath(file), Path.GetFullPath(self), StringComparison.OrdinalIgnoreCase)) continue;
            FileAttributes a;
            try { a = File.GetAttributes(file); } catch { continue; }
            if ((a & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;
            string name = Path.GetFileName(file);
            if (name.StartsWith("~$")) continue; // 열려 있는 Office 문서의 임시 파일
            string cat = Category(file);
            string dir = Path.Combine(Path.Combine(desktop, Root), cat);
            moves.Add(new Move { Source = file, Target = FreeName(dir, name, taken), Category = cat });
        }
        return moves;
    }

    // 같은 이름이 있으면 "이름 (2).확장자"
    static string FreeName(string dir, string name, HashSet<string> taken) {
        string stem = Path.GetFileNameWithoutExtension(name), ext = Path.GetExtension(name);
        string target = Path.Combine(dir, name);
        for (int n = 2; File.Exists(target) || Directory.Exists(target) || taken.Contains(target); n++)
            target = Path.Combine(dir, stem + " (" + n + ")" + ext);
        taken.Add(target);
        return target;
    }

    // 옮긴 목록을 기록해 두고(되돌리기용) 실제로 옮긴다. 사용 중인 파일은 건너뛴다.
    public static List<Move> Apply(List<Move> plan, string logPath, List<string> skipped) {
        var done = new List<Move>();
        Directory.CreateDirectory(Path.GetDirectoryName(logPath));
        foreach (var m in plan) {
            try {
                Directory.CreateDirectory(Path.GetDirectoryName(m.Target));
                File.Move(m.Source, m.Target);
                done.Add(m);
            } catch (Exception e) {
                skipped.Add(Path.GetFileName(m.Source) + " — " + e.Message);
            }
        }
        var sb = new StringBuilder();
        foreach (var m in done) sb.Append(m.Source).Append('\t').Append(m.Target).Append('\n');
        File.WriteAllText(logPath, sb.ToString(), new UTF8Encoding(false));
        return done;
    }

    public static List<Move> ReadLog(string logPath) {
        var list = new List<Move>();
        if (!File.Exists(logPath)) return list;
        foreach (string line in File.ReadAllLines(logPath, Encoding.UTF8)) {
            string[] p = line.Split('\t');
            if (p.Length == 2) list.Add(new Move { Source = p[0], Target = p[1] });
        }
        return list;
    }

    // 원래 자리로 되돌린다. 원래 자리에 같은 이름의 새 파일이 생겼으면 덮어쓰지 않고 건너뛴다.
    public static List<Move> Undo(string logPath, string desktop, List<string> skipped) {
        var back = new List<Move>();
        foreach (var m in ReadLog(logPath)) {
            if (!File.Exists(m.Target)) { skipped.Add(Path.GetFileName(m.Target) + " — 정리됨 폴더에서 이미 옮겨졌거나 지워졌어요"); continue; }
            if (File.Exists(m.Source)) { skipped.Add(Path.GetFileName(m.Source) + " — 바탕화면에 같은 이름의 파일이 있어요"); continue; }
            try { File.Move(m.Target, m.Source); back.Add(m); }
            catch (Exception e) { skipped.Add(Path.GetFileName(m.Target) + " — " + e.Message); }
        }
        File.Delete(logPath);
        // 비어 버린 분류 폴더만 지운다 (파일이 남아 있으면 그대로 둔다)
        string root = Path.Combine(desktop, Root);
        if (Directory.Exists(root)) {
            foreach (string d in Directory.GetDirectories(root)) if (!Directory.EnumerateFileSystemEntries(d).Any()) Directory.Delete(d);
            if (!Directory.EnumerateFileSystemEntries(root).Any()) Directory.Delete(root);
        }
        return back;
    }

    // MySpace 런처에 등록된 경로를 새 위치로 바꿔서 타일이 깨지지 않게 한다
    public static int UpdateLauncher(string itemsJson, IEnumerable<Move> moves, bool reverse) {
        if (!File.Exists(itemsJson)) return 0;
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var m in moves) { if (reverse) map[m.Target] = m.Source; else map[m.Source] = m.Target; }
        var js = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        var data = js.DeserializeObject(File.ReadAllText(itemsJson, Encoding.UTF8)) as Dictionary<string, object>;
        if (data == null || !data.ContainsKey("items")) return 0;
        int changed = 0;
        var items = data["items"] as object[];
        if (items != null) foreach (var o in items) {
            var item = o as Dictionary<string, object>;
            if (item == null || !item.ContainsKey("path") || !(item["path"] is string)) continue;
            string to;
            if (map.TryGetValue((string)item["path"], out to)) { item["path"] = to; changed++; }
        }
        if (changed > 0) {
            File.Copy(itemsJson, itemsJson + ".before-tidy", true);
            string tmp = itemsJson + ".tmp";
            File.WriteAllText(tmp, js.Serialize(data), new UTF8Encoding(false));
            File.Copy(tmp, itemsJson, true);
            File.Delete(tmp);
        }
        return changed;
    }
}

static class Program {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr w, uint msg, IntPtr a, IntPtr b);

    static string DataDir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "DesktopTidy"); } }
    static string LogPath { get { return Path.Combine(DataDir, "last-tidy.log"); } }
    static string LauncherItems { get { return Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MySpaceLauncher"), "items.json"); } }

    [STAThread]
    static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "--selftest") return SelfTest();
        Application.EnableVisualStyles();
        Application.Run(new TidyForm(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), LogPath, LauncherItems));
        return 0;
    }

    public static bool CloseLauncherNeeded() { return FindWindow(null, "내 런처") != IntPtr.Zero; }

    // 실행 중인 MySpace 런처를 닫는다 (등록 목록을 고치는 동안 런처가 덮어쓰지 않게)
    public static bool CloseLauncher() {
        IntPtr w = FindWindow(null, "내 런처");
        if (w == IntPtr.Zero) return false;
        PostMessage(w, 0x0010, IntPtr.Zero, IntPtr.Zero);
        for (int i = 0; i < 50 && FindWindow(null, "내 런처") != IntPtr.Zero; i++) Thread.Sleep(100);
        Thread.Sleep(500);
        return true;
    }

    static int SelfTest() {
        string root = Path.Combine(Path.GetTempPath(), "tidy-test-" + Guid.NewGuid().ToString("N"));
        string desk = Path.Combine(root, "Desktop");
        Directory.CreateDirectory(Path.Combine(desk, "학기중 학습 폴더"));
        foreach (string f in new[] { "보고서.hwp", "사진.JPG", "영상.mp4", "자료.zip", "setup.exe", "메모.xyz", "카카오톡.lnk", "사이트.url", "desktop.ini", "~$보고서.docx" })
            File.WriteAllText(Path.Combine(desk, f), f);
        Directory.CreateDirectory(Path.Combine(Path.Combine(desk, Tidy.Root), "문서"));
        File.WriteAllText(Path.Combine(Path.Combine(Path.Combine(desk, Tidy.Root), "문서"), "보고서.hwp"), "old");
        string items = Path.Combine(root, "items.json");
        File.WriteAllText(items, "{\"categories\":[\"즐겨찾기\"],\"items\":[{\"id\":\"1\",\"name\":\"보고서\",\"path\":\"" + Path.Combine(desk, "보고서.hwp").Replace("\\", "\\\\") + "\",\"category\":\"문서\"}],\"autoEnabled\":true}", new UTF8Encoding(false));
        string log = Path.Combine(root, "log.txt");

        var plan = Tidy.Plan(desk, null);
        Check(plan.Count == 6, "plan count " + plan.Count);
        Check(plan.All(m => !m.Source.EndsWith(".lnk") && !m.Source.EndsWith(".url") && !m.Source.EndsWith(".ini")), "kept shortcuts");
        Check(plan.Any(m => m.Target.EndsWith(Path.Combine("문서", "보고서 (2).hwp"))), "conflict rename");
        Check(plan.Any(m => m.Category == "이미지") && plan.Any(m => m.Category == "기타"), "categories");
        var skipped = new List<string>();
        var done = Tidy.Apply(plan, log, skipped);
        Check(done.Count == 6 && skipped.Count == 0, "applied");
        Check(File.Exists(Path.Combine(desk, "카카오톡.lnk")) && Directory.Exists(Path.Combine(desk, "학기중 학습 폴더")), "untouched");
        Check(Tidy.UpdateLauncher(items, done, false) == 1, "launcher updated");
        Check(File.ReadAllText(items, Encoding.UTF8).Contains("보고서 (2).hwp"), "launcher path");
        var back = Tidy.Undo(log, desk, skipped);
        Check(back.Count == 6 && File.Exists(Path.Combine(desk, "보고서.hwp")) && File.Exists(Path.Combine(desk, "메모.xyz")), "undo");
        Check(File.ReadAllText(Path.Combine(Path.Combine(Path.Combine(desk, Tidy.Root), "문서"), "보고서.hwp")) == "old", "existing file kept");
        Check(Tidy.UpdateLauncher(items, back, true) == 1 && !File.ReadAllText(items, Encoding.UTF8).Contains("(2)"), "launcher reverted");
        Directory.Delete(root, true);
        Console.WriteLine("Tidy self-test passed");
        return 0;
    }
    static void Check(bool ok, string what) { if (!ok) throw new Exception("self-test failed: " + what); }
}

// 애플 스타일 창: 미리보기 → 정리하기 / 되돌리기
public class TidyForm : Form {
    readonly string desktop, logPath, launcherItems;
    List<Move> plan;
    readonly Panel list = new Panel();
    readonly Label summary = new Label();
    readonly PillButton tidy = new PillButton(), undo = new PillButton(), close = new PillButton();

    public TidyForm(string desktop, string logPath, string launcherItems) {
        this.desktop = desktop; this.logPath = logPath; this.launcherItems = launcherItems;
        Text = "바탕화면 정리"; ClientSize = new Size(520, 600); StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle; MaximizeBox = false; BackColor = Theme.Back; Font = Theme.UI(10, false);
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        HandleCreated += delegate { Ui.RoundCorners(Handle); };

        var title = new Label { Text = "바탕화면 정리", Font = Theme.UI(20, true), ForeColor = Theme.Text, AutoSize = true, Location = new Point(22, 18) };
        var sub = new Label { Text = "낱개 파일을 ‘정리됨’ 폴더에 종류별로 옮겨요. 삭제하지 않고, 되돌릴 수 있어요.\n바로가기 아이콘과 폴더는 그대로 둬요.", Font = Theme.UI(9, false), ForeColor = Theme.Secondary, Location = new Point(24, 58), Size = new Size(480, 36) };
        var card = new Card { Location = new Point(20, 104), Size = new Size(480, 392), Padding = new Padding(6, 10, 4, 10) };
        list.Dock = DockStyle.Fill; list.AutoScroll = true; list.BackColor = Theme.Surface;
        list.HandleCreated += delegate { Ui.ModernScroll(list, false); };
        card.Controls.Add(list);
        summary.Location = new Point(24, 504); summary.Size = new Size(480, 22); summary.ForeColor = Theme.Secondary; summary.Font = Theme.UI(9, false);

        tidy.Text = "정리하기"; tidy.Primary = true; tidy.Size = new Size(150, 40); tidy.Location = new Point(20, 540);
        undo.Text = "되돌리기"; undo.FitWidth(); undo.Height = 40; undo.Location = new Point(180, 540);
        close.Text = "닫기"; close.FitWidth(); close.Height = 40; close.Location = new Point(500 - close.Width, 540);
        tidy.Click += delegate { DoTidy(); };
        undo.Click += delegate { DoUndo(); };
        close.Click += delegate { Close(); };
        Controls.AddRange(new Control[] { title, sub, card, summary, tidy, undo, close });
        Refresh2();
    }

    void Refresh2() {
        plan = Tidy.Plan(desktop, Application.ExecutablePath);
        list.SuspendLayout();
        foreach (Control c in list.Controls.Cast<Control>().ToList()) c.Dispose();
        list.Controls.Clear();
        int y = 4;
        if (plan.Count == 0) {
            list.Controls.Add(new Label { Text = "정리할 파일이 없어요. 바탕화면이 깔끔해요 ✨", ForeColor = Theme.Secondary, Font = Theme.UI(10.5f, false), AutoSize = true, Location = new Point(14, 16) });
        }
        foreach (var g in plan.GroupBy(m => m.Category)) {
            list.Controls.Add(new Label { Text = g.Key + "  ·  " + g.Count() + "개", Font = Theme.UI(10.5f, true), ForeColor = Theme.Text, AutoSize = true, Location = new Point(12, y) });
            y += 26;
            foreach (var m in g) {
                string note = Path.GetFileName(m.Target) == Path.GetFileName(m.Source) ? "" : "  → " + Path.GetFileName(m.Target);
                list.Controls.Add(new Label { Text = Path.GetFileName(m.Source) + note, ForeColor = Theme.Secondary, Font = Theme.UI(9.5f, false), AutoEllipsis = true, Size = new Size(430, 20), Location = new Point(24, y) });
                y += 21;
            }
            y += 10;
        }
        list.ResumeLayout();
        tidy.Enabled = plan.Count > 0;
        undo.Visible = Tidy.ReadLog(logPath).Count > 0;
        summary.Text = plan.Count > 0 ? "옮길 파일 " + plan.Count + "개  →  바탕화면\\" + Tidy.Root + "\\(종류별 폴더)" : (undo.Visible ? "‘되돌리기’로 지난번 정리를 원래대로 돌릴 수 있어요." : "");
        tidy.Invalidate(); undo.Invalidate();
    }

    bool LauncherReady() {
        if (!File.Exists(launcherItems)) return false;
        if (!Program.CloseLauncherNeeded()) return true;
        var r = MessageBox.Show("MySpace 런처의 바로가기 경로도 함께 고칠게요.\n잠깐 런처를 닫아도 될까요? (정리가 끝나면 다시 열어 드려요)", "바탕화면 정리", MessageBoxButtons.YesNo);
        if (r != DialogResult.Yes) return false;
        Program.CloseLauncher();
        return true;
    }

    void Reopen(bool wasClosed) {
        if (!wasClosed) return;
        string exe = Path.Combine(Path.GetDirectoryName(launcherItems), "MySpaceLauncher.exe");
        try { if (File.Exists(exe)) Process.Start(exe); } catch { }
    }

    void DoTidy() {
        if (plan.Count == 0) return;
        if (MessageBox.Show(plan.Count + "개 파일을 바탕화면\\" + Tidy.Root + " 폴더로 옮길까요?\n(삭제하지 않아요. 나중에 ‘되돌리기’ 할 수 있어요)", "바탕화면 정리", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        bool launcherRunning = Program.CloseLauncherNeeded();
        bool fixLauncher = LauncherReady();
        var skipped = new List<string>();
        var done = Tidy.Apply(plan, logPath, skipped);
        int fixedTiles = 0;
        if (fixLauncher) { try { fixedTiles = Tidy.UpdateLauncher(launcherItems, done, false); } catch (Exception e) { skipped.Add("런처 목록 수정 실패 — " + e.Message); } }
        Reopen(fixLauncher && launcherRunning);
        string msg = done.Count + "개 파일을 정리했어요.";
        if (fixedTiles > 0) msg += "\nMySpace 런처 타일 " + fixedTiles + "개의 경로도 바꿨어요.";
        if (skipped.Count > 0) msg += "\n\n건너뛴 파일 (사용 중이거나 권한 없음):\n· " + string.Join("\n· ", skipped.Take(10));
        MessageBox.Show(msg, "바탕화면 정리");
        try { Process.Start("explorer.exe", "\"" + Path.Combine(desktop, Tidy.Root) + "\""); } catch { }
        Refresh2();
    }

    void DoUndo() {
        var log = Tidy.ReadLog(logPath);
        if (log.Count == 0) return;
        if (MessageBox.Show("지난번에 정리한 " + log.Count + "개 파일을 원래 자리로 돌려놓을까요?", "바탕화면 정리", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        bool launcherRunning = Program.CloseLauncherNeeded();
        bool fixLauncher = LauncherReady();
        var skipped = new List<string>();
        var back = Tidy.Undo(logPath, desktop, skipped);
        if (fixLauncher) { try { Tidy.UpdateLauncher(launcherItems, back, true); } catch { } }
        Reopen(fixLauncher && launcherRunning);
        string msg = back.Count + "개 파일을 원래 자리로 돌려놨어요.";
        if (skipped.Count > 0) msg += "\n\n건너뛴 파일:\n· " + string.Join("\n· ", skipped.Take(10));
        MessageBox.Show(msg, "바탕화면 정리");
        Refresh2();
    }
}
