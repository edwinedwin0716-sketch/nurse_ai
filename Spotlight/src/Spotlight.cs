using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Drawing.Text;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Spotlight")]
[assembly: AssemblyProduct("Spotlight for Windows")]
[assembly: AssemblyDescription("Shift 두 번으로 여는 빠른 검색")]
[assembly: AssemblyVersion("1.0.1.0")]
[assembly: AssemblyFileVersion("1.0.1.0")]

// Shift를 두 번 빠르게 눌렀는지 판단 (다른 키와 함께 누르거나 길게 누르면 무시)
public class ShiftTap {
    public int TapMs = 300, GapMs = 400;
    bool down, other; long downAt, lastTap = -100000;
    public bool Feed(bool isShift, bool isDown, long now) {
        if (isShift) {
            if (isDown) { if (!down) { down = true; other = false; downAt = now; } return false; }
            down = false;
            if (other || now - downAt > TapMs) { lastTap = -100000; return false; }
            if (now - lastTap <= GapMs) { lastTap = -100000; return true; }
            lastTap = now; return false;
        }
        if (isDown) { other = true; lastTap = -100000; }
        return false;
    }
}

public class KeyboardHook : IDisposable {
    delegate IntPtr Proc(int code, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc fn, IntPtr mod, uint thread);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int code, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern IntPtr GetModuleHandle(string name);
    readonly Proc proc; IntPtr hook; readonly ShiftTap tap = new ShiftTap(); readonly Stopwatch clock = Stopwatch.StartNew();
    public event EventHandler DoubleShift;
    public KeyboardHook() { proc = Callback; hook = SetWindowsHookEx(13, proc, GetModuleHandle(null), 0); }
    public bool Active { get { return hook != IntPtr.Zero; } }
    IntPtr Callback(int code, IntPtr w, IntPtr l) {
        if (code >= 0) {
            int vk = Marshal.ReadInt32(l), msg = w.ToInt32();
            bool isDown = msg == 0x100 || msg == 0x104, isUp = msg == 0x101 || msg == 0x105;
            if (isDown || isUp) {
                bool shift = vk == 0x10 || vk == 0xA0 || vk == 0xA1;
                if (tap.Feed(shift, isDown, clock.ElapsedMilliseconds) && DoubleShift != null) DoubleShift(this, EventArgs.Empty);
            }
        }
        return CallNextHookEx(hook, code, w, l);
    }
    public void Dispose() { if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; } }
}

public class Row { public bool Header; public string Title; public Entry E; public int Y, H; }

public class SpotForm : Form {
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, string l);
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mods, uint key);
    [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);

    public const int W = 680, BAR = 56, LIST = 384, LISTW = 276;
    readonly TextBox box = new TextBox();
    List<Entry> all = new List<Entry>();
    readonly object gate = new object();
    Dictionary<string, int> uses = Index.LoadUses();
    readonly Dictionary<string, Bitmap> icons = new Dictionary<string, Bitmap>(StringComparer.OrdinalIgnoreCase);
    List<Row> rows = new List<Row>();
    int sel = -1, scroll = 0;
    Bitmap backdrop; Color barColor;
    float k = 1f;
    bool dark, roundedByOs, preview;
    DateTime indexedAt = DateTime.MinValue;
    public string Hotkey = "shift2", ThemePref = "auto";
    KeyboardHook hook;
    NotifyIcon tray;

    Color Tint { get { return dark ? Color.FromArgb(214, 38, 38, 40) : Color.FromArgb(214, 246, 246, 247); } }
    Color Fore { get { return dark ? Color.FromArgb(245, 245, 247) : Color.FromArgb(29, 29, 31); } }
    Color Sub { get { return dark ? Color.FromArgb(152, 152, 157) : Color.FromArgb(110, 110, 115); } }
    Color Sep { get { return dark ? Color.FromArgb(40, 255, 255, 255) : Color.FromArgb(28, 0, 0, 0); } }
    static readonly Color Accent = Color.FromArgb(10, 100, 220);
    static string FontName = "Segoe UI";

    public SpotForm(bool previewMode) {
        preview = previewMode;
        FormBorderStyle = FormBorderStyle.None; ShowInTaskbar = false; TopMost = true; StartPosition = FormStartPosition.Manual;
        KeyPreview = true; Text = "Spotlight"; DoubleBuffered = true;
        SetStyle(ControlStyles.OptimizedDoubleBuffer | ControlStyles.AllPaintingInWmPaint | ControlStyles.UserPaint, true);
        using (var g = CreateGraphics()) k = Math.Max(1f, g.DpiX / 96f);
        foreach (var f in FontFamily.Families) if (f.Name == "Segoe UI Variable Text") FontName = f.Name;
        box.BorderStyle = BorderStyle.None; box.Font = new Font(FontName, 16.5f, FontStyle.Regular);
        box.TextChanged += delegate { Refilter(); };
        box.KeyDown += OnKey;
        Controls.Add(box);
        LoadSettings();
        ApplyTheme();
        Size = new Size(Px(W), Px(BAR));
        if (!preview) {
            Deactivate += delegate { if (Visible) HideSpot(); };
            box.HandleCreated += delegate { try { SendMessage(box.Handle, 0x1501, (IntPtr)1, "Spotlight 검색"); } catch { } };
            HandleCreated += delegate { roundedByOs = Ui.RoundCorners(Handle); };
            SetupTray();
            ApplyHotkey();
            ThreadPool.QueueUserWorkItem(delegate { Reindex(); });
        }
    }
    int Px(float v) { return (int)Math.Round(v * k); }

    // ---------- 설정 ----------
    string SettingsFile { get { return Path.Combine(Index.DataDir, "settings.txt"); } }
    void LoadSettings() {
        try { foreach (var line in File.ReadAllLines(SettingsFile)) { var p = line.Split('='); if (p.Length != 2) continue; if (p[0] == "hotkey") Hotkey = p[1]; else if (p[0] == "theme") ThemePref = p[1]; } } catch { }
    }
    void Save() { try { Directory.CreateDirectory(Index.DataDir); File.WriteAllLines(SettingsFile, new[] { "hotkey=" + Hotkey, "theme=" + ThemePref }); } catch { } }
    void ApplyTheme() {
        if (ThemePref == "auto") { dark = false; try { var v = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 1); dark = v is int && (int)v == 0; } catch { } }
        else dark = ThemePref == "dark";
        box.ForeColor = Fore;
    }
    public void SetEntries(List<Entry> list) { lock (gate) all = list; indexedAt = DateTime.Now; }
    void Reindex() { try { var list = Index.Build(); SetEntries(list); } catch { } }

    // ---------- 단축키 ----------
    void ApplyHotkey() {
        if (hook != null) { hook.Dispose(); hook = null; }
        if (IsHandleCreated) { UnregisterHotKey(Handle, 1); }
        if (Hotkey == "shift2") { hook = new KeyboardHook(); hook.DoubleShift += delegate { BeginInvoke((MethodInvoker)Toggle); }; }
        else { if (!IsHandleCreated) CreateHandle(); RegisterHotKey(Handle, 1, Hotkey == "altspace" ? 1u : 6u, 0x20); }
        Save();
    }
    protected override void WndProc(ref Message m) { if (m.Msg == 0x0312) Toggle(); base.WndProc(ref m); }
    public static string HotkeyLabel(string h) { return h == "altspace" ? "Alt + Space" : h == "ctrlshiftspace" ? "Ctrl + Shift + Space" : "Shift 두 번"; }

    // ---------- 트레이 ----------
    void SetupTray() {
        tray = new NotifyIcon { Text = "Spotlight", Visible = true };
        try { tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { tray.Icon = SystemIcons.Application; }
        var menu = new ContextMenuStrip();
        AppleMenuRenderer.Apply(menu);
        menu.Opening += delegate { BuildTrayMenu(menu); };
        menu.Items.Add("-");
        tray.ContextMenuStrip = menu;
        tray.MouseClick += (s, e) => { if (e.Button == MouseButtons.Left) Toggle(); };
        if (!File.Exists(SettingsFile)) { Save(); tray.ShowBalloonTip(5000, "Spotlight", "Shift를 두 번 빠르게 누르면 검색창이 열려요.", ToolTipIcon.Info); }
    }
    void BuildTrayMenu(ContextMenuStrip menu) {
        menu.Items.Clear();
        menu.Items.Add("Spotlight 열기  (" + HotkeyLabel(Hotkey) + ")", null, delegate { ShowSpot(); });
        var hk = new ToolStripMenuItem("단축키"); AppleMenuRenderer.Apply(hk.DropDown);
        foreach (var h in new[] { "shift2", "altspace", "ctrlshiftspace" }) { var it = new ToolStripMenuItem(HotkeyLabel(h)) { Checked = Hotkey == h, Tag = h }; it.Click += (s, e) => { Hotkey = (string)((ToolStripMenuItem)s).Tag; ApplyHotkey(); }; hk.DropDownItems.Add(it); }
        var th = new ToolStripMenuItem("테마"); AppleMenuRenderer.Apply(th.DropDown);
        foreach (var t in new[] { new[] { "auto", "Windows 설정 따르기" }, new[] { "light", "라이트" }, new[] { "dark", "다크" } }) { var it = new ToolStripMenuItem(t[1]) { Checked = ThemePref == t[0], Tag = t[0] }; it.Click += (s, e) => { ThemePref = (string)((ToolStripMenuItem)s).Tag; Save(); ApplyTheme(); }; th.DropDownItems.Add(it); }
        var run = new ToolStripMenuItem("Windows 시작 시 실행") { Checked = Startup };
        run.Click += delegate { Startup = !Startup; };
        menu.Items.AddRange(new ToolStripItem[] { hk, th, run, new ToolStripSeparator() });
        menu.Items.Add("목록 새로 고침", null, delegate { ThreadPool.QueueUserWorkItem(_ => Reindex()); });
        menu.Items.Add("종료", null, delegate { QuitApp(); });
    }
    const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
    public void QuitApp() { tray.Visible = false; Application.Exit(); }
    public static bool Startup {
        get { try { using (var r = Registry.CurrentUser.OpenSubKey(RunKey)) return r != null && r.GetValue("MySpotlight") != null; } catch { return false; } }
        set { try { using (var r = Registry.CurrentUser.CreateSubKey(RunKey)) { if (value) r.SetValue("MySpotlight", "\"" + Application.ExecutablePath + "\""); else r.DeleteValue("MySpotlight", false); } } catch { } }
    }

    // ---------- 열고 닫기 ----------
    public void Toggle() { if (Visible && ContainsFocus) HideSpot(); else ShowSpot(); }
    public void ShowSpot() {
        if ((DateTime.Now - indexedAt).TotalSeconds > 90) ThreadPool.QueueUserWorkItem(delegate { Reindex(); });
        ApplyTheme();
        var area = Screen.FromPoint(Cursor.Position).WorkingArea;
        int w = Px(W), x = area.Left + (area.Width - w) / 2, y = area.Top + (int)(area.Height * 0.2);
        if (!Visible) CaptureBackdrop(new Rectangle(x, y, w, Px(BAR + 1 + LIST)));
        Location = new Point(x, y);
        box.Text = ""; rows.Clear(); sel = -1; Relayout();
        Show(); Activate(); SetForegroundWindow(Handle); box.Focus();
    }
    public void HideSpot() { Hide(); box.Text = ""; }

    // 창 뒤 화면을 찍어 흐리게 → 유리 느낌 (Spotlight의 반투명 배경)
    void CaptureBackdrop(Rectangle r) {
        try {
            var shot = new Bitmap(r.Width, r.Height);
            using (var g = Graphics.FromImage(shot)) g.CopyFromScreen(r.Location, Point.Empty, r.Size);
            SetBackdrop(shot);
        } catch { SetBackdrop(null); }
    }
    public void SetBackdrop(Bitmap shot) {
        if (backdrop != null) backdrop.Dispose();
        if (shot == null) { backdrop = null; barColor = Blend(Color.Gray, Tint); box.BackColor = barColor; return; }
        Bitmap b = shot;
        for (int pass = 0; pass < 2; pass++) { // 작게 줄였다가 키우기 = 빠른 흐림
            var small = new Bitmap(Math.Max(1, b.Width / 14), Math.Max(1, b.Height / 14));
            using (var g = Graphics.FromImage(small)) { g.InterpolationMode = InterpolationMode.HighQualityBilinear; g.DrawImage(b, 0, 0, small.Width, small.Height); }
            var big = new Bitmap(shot.Width, shot.Height);
            using (var g = Graphics.FromImage(big)) { g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.PixelOffsetMode = PixelOffsetMode.HighQuality; g.DrawImage(small, new Rectangle(-8, -8, big.Width + 16, big.Height + 16)); }
            small.Dispose(); if (b != shot) b.Dispose(); b = big;
        }
        using (var g = Graphics.FromImage(b)) using (var br = new SolidBrush(Tint)) g.FillRectangle(br, 0, 0, b.Width, b.Height);
        shot.Dispose(); backdrop = b;
        using (var px = new Bitmap(1, 1)) { using (var g = Graphics.FromImage(px)) { g.InterpolationMode = InterpolationMode.HighQualityBilinear; g.DrawImage(b, new Rectangle(0, 0, 1, 1), new Rectangle(0, 0, b.Width, Px(BAR)), GraphicsUnit.Pixel); } barColor = px.GetPixel(0, 0); }
        box.BackColor = barColor;
    }
    static Color Blend(Color a, Color b) { float t = b.A / 255f; return Color.FromArgb((int)(a.R * (1 - t) + b.R * t), (int)(a.G * (1 - t) + b.G * t), (int)(a.B * (1 - t) + b.B * t)); }

    // ---------- 검색 결과 ----------
    public void SetQuery(string q) { box.Text = q; Refilter(); }
    void Refilter() {
        string q = box.Text.Trim();
        var list = new List<Row>();
        if (q.Length > 0) {
            string calc;
            if (Calc.TryEval(q, out calc)) { list.Add(new Row { Header = true, Title = "계산기" }); list.Add(new Row { E = new Entry(calc, "calc:" + calc, "계산기", q + " =") }); }
            List<Entry> found; lock (gate) found = Ranker.Search(all, q, uses, 60);
            if (found.Count > 0) {
                list.Add(new Row { Header = true, Title = "상위 히트" }); list.Add(new Row { E = found[0] });
                foreach (var kind in Ranker.KindOrder) {
                    var g = found.Skip(1).Where(e => e.Kind == kind).Take(kind == "문서" ? 8 : 6).ToList();
                    if (g.Count == 0) continue;
                    list.Add(new Row { Header = true, Title = kind });
                    foreach (var e in g) list.Add(new Row { E = e });
                }
            }
            list.Add(new Row { Header = true, Title = "웹 검색" });
            list.Add(new Row { E = new Entry("Google에서 '" + q + "' 검색", "https://www.google.com/search?q=" + Uri.EscapeDataString(q), "웹 검색", "google.com") });
            list.Add(new Row { E = new Entry("네이버에서 '" + q + "' 검색", "https://search.naver.com/search.naver?query=" + Uri.EscapeDataString(q), "웹 검색", "naver.com") });
        }
        rows = list; scroll = 0;
        sel = rows.FindIndex(r => !r.Header);
        Relayout();
    }
    void Relayout() {
        int y = 6;
        foreach (var r in rows) { r.Y = y; r.H = r.Header ? 26 : 32; y += r.H; }
        int h = rows.Count == 0 ? BAR : BAR + 1 + LIST;
        if (Height != Px(h)) { Height = Px(h); if (!roundedByOs) using (var p = Ui.Round(new Rectangle(0, 0, Width, Height), Px(14))) Region = new Region(p); }
        box.SetBounds(Px(54), (Px(BAR) - box.PreferredHeight) / 2 + Px(1), Width - Px(54 + 18), box.PreferredHeight);
        Invalidate();
    }
    void MoveSel(int d) {
        int i = sel;
        do { i += d; } while (i >= 0 && i < rows.Count && rows[i].Header);
        if (i < 0 || i >= rows.Count) return;
        sel = i;
        var r = rows[sel];
        if (r.Y - scroll < 0) scroll = Math.Max(0, (sel > 0 && rows[sel - 1].Header ? rows[sel - 1].Y : r.Y) - 6);
        if (r.Y + r.H - scroll > LIST - 6) scroll = r.Y + r.H - LIST + 6;
        Invalidate();
    }
    void OnKey(object s, KeyEventArgs e) {
        if (e.KeyCode == Keys.Down) { MoveSel(1); e.Handled = e.SuppressKeyPress = true; }
        else if (e.KeyCode == Keys.Up) { MoveSel(-1); e.Handled = e.SuppressKeyPress = true; }
        else if (e.KeyCode == Keys.Enter) { Launch(e.Control || e.Alt); e.Handled = e.SuppressKeyPress = true; }
        else if (e.KeyCode == Keys.Escape) { if (box.Text.Length > 0) box.Text = ""; else HideSpot(); e.Handled = e.SuppressKeyPress = true; }
    }
    protected override void OnMouseWheel(MouseEventArgs e) {
        int total = rows.Count > 0 ? rows[rows.Count - 1].Y + rows[rows.Count - 1].H + 6 : 0;
        scroll = Math.Max(0, Math.Min(Math.Max(0, total - LIST), scroll - e.Delta / 3)); Invalidate();
    }
    protected override void OnMouseDown(MouseEventArgs e) {
        int i = RowAt(e.Location); if (i >= 0) { sel = i; Invalidate(); if (e.Clicks >= 2) Launch(false); }
    }
    int RowAt(Point p) {
        if (p.Y < Px(BAR + 1) || p.X > Px(LISTW)) return -1;
        int y = (int)((p.Y - Px(BAR + 1)) / k) + scroll;
        return rows.FindIndex(r => !r.Header && y >= r.Y && y < r.Y + r.H);
    }
    void Launch(bool reveal) {
        if (sel < 0 || sel >= rows.Count || rows[sel].Header) return;
        var e = rows[sel].E;
        try {
            if (e.Kind == "계산기") { Clipboard.SetText(e.Name); if (tray != null) tray.ShowBalloonTip(1500, "Spotlight", e.Name + " 복사했어요", ToolTipIcon.None); }
            else if (reveal && (File.Exists(e.Path) || Directory.Exists(e.Path))) Process.Start("explorer.exe", "/select,\"" + e.Path + "\"");
            else if (e.Path.StartsWith("shell:AppsFolder", StringComparison.OrdinalIgnoreCase)) Process.Start("explorer.exe", e.Path);
            else Process.Start(new ProcessStartInfo(e.Path) { UseShellExecute = true });
            if (e.Kind != "웹 검색" && e.Kind != "계산기") { int n; uses.TryGetValue(e.Path, out n); uses[e.Path] = n + 1; Index.SaveUses(uses); }
        } catch (Exception ex) { MessageBox.Show("열 수 없어요: " + ex.Message, "Spotlight"); }
        HideSpot();
    }

    // ---------- 아이콘 ----------
    Bitmap IconFor(Entry e, int size) {
        string key = e.Path + "|" + size;
        Bitmap b;
        if (icons.TryGetValue(key, out b)) return b;
        b = null;
        try {
            if (e.Kind == "웹사이트") { Uri u; if (Uri.TryCreate(e.Path, UriKind.Absolute, out u)) { string f = Path.Combine(Index.LauncherIcons, u.Host.ToLowerInvariant() + ".png"); if (File.Exists(f)) using (var src = Image.FromFile(f)) b = new Bitmap(src); } }
            else if (e.Kind != "계산기" && e.Kind != "웹 검색" && e.Kind != "시스템 설정" && !preview) b = ShellImages.LoadSized(e.Path, size >= 64 ? 256 : 48) ?? ShellImages.Load(e.Path);
        } catch { b = null; }
        icons[key] = b;
        return b;
    }
    void DrawIcon(Graphics g, Entry e, Rectangle r) {
        var img = IconFor(e, r.Width >= 64 ? 128 : 32);
        if (img != null) { g.DrawImage(img, r); return; }
        Color c; string glyph; string font = "Segoe MDL2 Assets";
        if (e.Kind == "계산기") { c = Color.FromArgb(255, 149, 0); glyph = "="; font = FontName; }
        else if (e.Kind == "웹 검색") { c = Color.FromArgb(0, 122, 255); glyph = "\uE721"; }
        else if (e.Kind == "시스템 설정") { c = Color.FromArgb(142, 142, 147); glyph = "\uE713"; }
        else { int h = 0; foreach (char ch in e.Name) h = (h * 31 + ch) & 0x7fffffff; c = Theme.Tints[h % Theme.Tints.Length]; glyph = e.Name.Substring(0, 1).ToUpper(); font = FontName; }
        using (var p = Ui.Round(r, Math.Max(3, r.Width / 5))) using (var b = new LinearGradientBrush(r, ControlPaint.Light(c, .25f), c, 90f)) g.FillPath(b, p);
        using (var f = new Font(font, r.Height * 0.42f, font == FontName ? FontStyle.Bold : FontStyle.Regular, GraphicsUnit.Pixel))
            TextRenderer.DrawText(g, glyph, f, r, Color.White, TextFormatFlags.HorizontalCenter | TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
    }

    // ---------- 그리기 ----------
    protected override void OnPaint(PaintEventArgs pe) { Render(pe.Graphics, false); }
    public void Render(Graphics g, bool drawText) {
        g.SmoothingMode = SmoothingMode.AntiAlias; g.InterpolationMode = InterpolationMode.HighQualityBicubic; g.TextRenderingHint = TextRenderingHint.ClearTypeGridFit;
        if (backdrop != null) g.DrawImage(backdrop, 0, 0); else using (var b = new SolidBrush(Blend(Color.Gray, Tint))) g.FillRectangle(b, ClientRectangle);
        using (var b = new SolidBrush(barColor)) g.FillRectangle(b, 0, 0, Width, Px(BAR));
        // 돋보기
        using (var pen = new Pen(Sub, 2.1f * k)) { float cx = Px(26), cy = Px(BAR) / 2f - Px(1.5f), rr = Px(7.5f); g.DrawEllipse(pen, cx - rr, cy - rr, rr * 2, rr * 2); pen.StartCap = pen.EndCap = LineCap.Round; g.DrawLine(pen, cx + rr * 0.72f, cy + rr * 0.72f, cx + rr * 1.55f, cy + rr * 1.55f); }
        if (drawText) TextRenderer.DrawText(g, box.Text.Length > 0 ? box.Text : "Spotlight 검색", box.Font, box.Bounds, box.Text.Length > 0 ? Fore : Sub, TextFormatFlags.VerticalCenter | TextFormatFlags.NoPadding);
        if (rows.Count == 0) return;
        using (var pen = new Pen(Sep)) { g.DrawLine(pen, 0, Px(BAR), Width, Px(BAR)); g.DrawLine(pen, Px(LISTW), Px(BAR + 1), Px(LISTW), Height); }
        var clip = new Rectangle(0, Px(BAR + 1), Px(LISTW), Height - Px(BAR + 1));
        var state = g.Save(); g.SetClip(clip);
        using (var fRow = new Font(FontName, 10f)) using (var fHead = new Font(FontName, 8.5f, FontStyle.Bold)) using (var fSub = new Font(FontName, 8.5f))
            for (int i = 0; i < rows.Count; i++) {
                var r = rows[i]; int top = Px(BAR + 1) + Px(r.Y - scroll);
                if (top + Px(r.H) < clip.Top || top > clip.Bottom) continue;
                if (r.Header) { TextRenderer.DrawText(g, r.Title, fHead, new Rectangle(Px(16), top + Px(6), Px(LISTW - 24), Px(20)), Sub, TextFormatFlags.NoPadding | TextFormatFlags.EndEllipsis); continue; }
                bool on = i == sel;
                if (on) using (var p = Ui.Round(new Rectangle(Px(8), top + Px(1), Px(LISTW - 16), Px(r.H - 2)), Px(6))) using (var b = new SolidBrush(Accent)) g.FillPath(b, p);
                DrawIcon(g, r.E, new Rectangle(Px(16), top + Px(6), Px(20), Px(20)));
                TextRenderer.DrawText(g, r.E.Name, fRow, new Rectangle(Px(44), top, Px(LISTW - 56), Px(r.H)), on ? Color.White : Fore, TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis | TextFormatFlags.SingleLine | TextFormatFlags.NoPrefix | TextFormatFlags.NoPadding);
            }
        g.Restore(state);
        if (sel >= 0) DrawPreview(g, rows[sel].E);
    }
    void DrawPreview(Graphics g, Entry e) {
        int x0 = Px(LISTW + 1), w = Width - x0, top = Px(BAR + 1);
        int ic = Px(e.Kind == "계산기" ? 0 : 96);
        if (ic > 0) DrawIcon(g, e, new Rectangle(x0 + (w - ic) / 2, top + Px(34), ic, ic));
        int y = top + Px(e.Kind == "계산기" ? 90 : 146);
        var flags = TextFormatFlags.HorizontalCenter | TextFormatFlags.WordBreak | TextFormatFlags.NoPrefix | TextFormatFlags.EndEllipsis;
        using (var fTitle = new Font(FontName, e.Kind == "계산기" ? 30f : 13f, FontStyle.Bold)) { var rt = new Rectangle(x0 + Px(20), y, w - Px(40), Px(e.Kind == "계산기" ? 60 : 44)); TextRenderer.DrawText(g, e.Name, fTitle, rt, Fore, flags); y += rt.Height + Px(4); }
        using (var f = new Font(FontName, 9f)) {
            TextRenderer.DrawText(g, e.Kind, f, new Rectangle(x0 + Px(20), y, w - Px(40), Px(18)), Sub, flags); y += Px(24);
            using (var pen = new Pen(Sep)) g.DrawLine(pen, x0 + Px(24), y, Width - Px(24), y); y += Px(10);
            TextRenderer.DrawText(g, e.Detail ?? "", f, new Rectangle(x0 + Px(24), y, w - Px(48), Px(54)), Sub, flags);
            string hint = e.Kind == "계산기" ? "↵  결과 복사" : e.Kind == "웹 검색" ? "↵  브라우저에서 검색" : (File.Exists(e.Path) || Directory.Exists(e.Path) || preview) && e.Kind != "시스템 설정" ? "↵  열기        Ctrl + ↵  파일 위치 보기" : "↵  열기";
            TextRenderer.DrawText(g, hint, f, new Rectangle(x0, Height - Px(34), w, Px(20)), Sub, TextFormatFlags.HorizontalCenter | TextFormatFlags.NoPrefix);
        }
    }
}

static class Program {
    [STAThread]
    static int Main(string[] args) {
        if (args.Length > 0 && args[0] == "--selftest") return SelfTest();
        Application.EnableVisualStyles();
        if (args.Length > 2 && args[0] == "--preview") return Preview(args[1], args[2], args.Length > 3 && args[3] == "dark");
        bool created;
        var mutex = new Mutex(true, @"Local\MySpotlight", out created);
        var signal = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\MySpotlightShow");
        var quit = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\MySpotlightQuit");
        if (!created) {
            string target = Path.Combine(Index.DataDir, "Spotlight.exe");
            bool update = !string.Equals(Path.GetFullPath(Application.ExecutablePath), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase);
            if (!update) { signal.Set(); return 0; }   // 이미 실행 중이면 그 창을 연다
            // 새 버전으로 업데이트: 켜져 있는 예전 버전을 끄고, 끝나기를 기다린 뒤 설치한다
            quit.Set();
            bool got = false;
            try { got = mutex.WaitOne(4000); } catch (AbandonedMutexException) { got = true; }
            if (!got) {   // 1.0은 끄라는 신호를 모르므로 직접 끈다
                int self = Process.GetCurrentProcess().Id;
                foreach (var p in Process.GetProcessesByName("Spotlight")) { try { if (p.Id != self) { p.Kill(); p.WaitForExit(3000); } } catch { } p.Dispose(); }
                try { got = mutex.WaitOne(4000); } catch (AbandonedMutexException) { got = true; }
            }
            if (!got) { MessageBox.Show("예전 Spotlight가 꺼지지 않았어요. 작업 표시줄 아이콘 → 종료 후 다시 실행해 주세요.", "Spotlight"); return 1; }
        }
        if (Install(mutex)) return 0;
        var form = new SpotForm(false);
        var t = new Thread(() => { while (signal.WaitOne()) try { form.BeginInvoke((MethodInvoker)form.ShowSpot); } catch { return; } }) { IsBackground = true };
        form.HandleCreated += delegate { t.Start(); };
        // 새 버전이 설치되면 스스로 끈다 (트레이 아이콘도 정리)
        new Thread(() => { if (quit.WaitOne()) try { form.BeginInvoke((MethodInvoker)delegate { form.QuitApp(); }); } catch { } }) { IsBackground = true }.Start();
        var ctx = new ApplicationContext();
        form.CreateControl(); var h = form.Handle;
        Application.Run(ctx);
        GC.KeepAlive(mutex);
        return 0;
    }

    // 처음 실행: %LOCALAPPDATA%\MySpotlight 에 복사하고 Windows 시작 시 자동 실행으로 등록한 뒤 그쪽을 실행
    static bool Install(Mutex mutex) {
        string target = Path.Combine(Index.DataDir, "Spotlight.exe");
        if (string.Equals(Path.GetFullPath(Application.ExecutablePath), Path.GetFullPath(target), StringComparison.OrdinalIgnoreCase)) return false;
        try {
            Directory.CreateDirectory(Index.DataDir);
            File.Copy(Application.ExecutablePath, target, true);
            using (var r = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) r.SetValue("MySpotlight", "\"" + target + "\"");
            mutex.ReleaseMutex(); mutex.Close();
            Process.Start(target);
            MessageBox.Show("설치했어요!\n\nShift 키를 두 번 빠르게 누르면 Spotlight 검색창이 열려요.\n(Windows를 켤 때마다 자동으로 실행돼요. 끄려면 작업 표시줄 오른쪽 아이콘 → 우클릭)", "Spotlight", MessageBoxButtons.OK, MessageBoxIcon.Information);
            InstallCleanup.OfferRemoveDownloads("Spotlight", "Spotlight-", new[] { "Spotlight.exe", "설치 및 사용법.txt" }, @"^Spotlight-[0-9.]+( \(\d+\))?\.zip$", Index.DataDir);
            return true;
        } catch { return false; }   // 복사가 안 되면 그냥 이 위치에서 실행
    }

    // 화면 미리보기 (개발용): --preview out.png "검색어" [dark]
    static int Preview(string file, string query, bool dark) {
        var f = new SpotForm(true) { ThemePref = dark ? "dark" : "light" };
        typeof(SpotForm).GetMethod("ApplyTheme", BindingFlags.NonPublic | BindingFlags.Instance).Invoke(f, null);
        var list = new List<Entry> {
            new Entry("카카오톡", @"C:\Programs\KakaoTalk.lnk", "응용 프로그램", "카카오"), new Entry("간호과정 도우미", @"C:\Desktop\간호과정 도우미.lnk", "응용 프로그램", "바탕 화면"),
            new Entry("간호과정_보고서", @"C:\Users\me\Documents\간호과정_보고서.hwp", "문서", @"C:\Users\me\Documents\간호과정_보고서.hwp"),
            new Entry("간호학 실습일지", @"C:\Users\me\Desktop\간호학 실습일지.docx", "문서", @"C:\Users\me\Desktop\간호학 실습일지.docx"),
            new Entry("간호학과 과제", @"C:\Users\me\Documents\간호학과 과제", "폴더", @"C:\Users\me\Documents\간호학과 과제"),
            new Entry("Google Chrome", @"C:\Programs\Google Chrome.lnk", "응용 프로그램", ""), new Entry("ChatGPT", "https://chatgpt.com/", "웹사이트", "https://chatgpt.com/")
        };
        var wifi = new Entry("Wi-Fi", "ms-settings:network-wifi", "시스템 설정", "Windows 설정"); wifi.Keywords = "와이파이"; list.Add(wifi);
        f.SetEntries(list);
        var wall = new Bitmap(f.Width, f.Width);
        using (var g = Graphics.FromImage(wall)) using (var b = new LinearGradientBrush(new Rectangle(0, 0, wall.Width, wall.Height), Color.FromArgb(120, 170, 255), Color.FromArgb(255, 160, 190), 35f)) g.FillRectangle(b, 0, 0, wall.Width, wall.Height);
        f.SetBackdrop(wall);
        f.SetQuery(query);
        var bmp = new Bitmap(f.Width, f.Height);
        using (var g = Graphics.FromImage(bmp)) f.Render(g, true);
        bmp.Save(file);
        return 0;
    }

    static int SelfTest() {
        Func<bool, string, int> check = (ok, what) => { if (!ok) throw new Exception("self-test failed: " + what); return 0; };
        check(Hangul.Initials("카카오톡") == "ㅋㅋㅇㅌ", "initials");
        string r;
        check(Calc.TryEval("12*3+4", out r) && r == "40", "calc 1 " + r);
        check(Calc.TryEval("(5+5)/4", out r) && r == "2.5", "calc 2 " + r);
        check(Calc.TryEval("2^10", out r) && r == "1,024", "calc 3 " + r);
        check(Calc.TryEval("1500*15%", out r) && r == "225", "calc 4 " + r);
        check(!Calc.TryEval("카카오", out r) && !Calc.TryEval("2024", out r) && !Calc.TryEval("1+", out r), "calc rejects");
        var list = new List<Entry> { new Entry("카카오톡", "a", "응용 프로그램", ""), new Entry("Google Chrome", "b", "응용 프로그램", ""), new Entry("간호과정_보고서", "c", "문서", ""), new Entry("크롬 확장", "d", "폴더", "") };
        var wifi = new Entry("Wi-Fi", "e", "시스템 설정", ""); wifi.Keywords = "와이파이 인터넷"; list.Add(wifi);
        var uses = new Dictionary<string, int>();
        check(Ranker.Search(list, "ㅋㅋㅇ", uses, 5)[0].Name == "카카오톡", "chosung");
        check(Ranker.Search(list, "chr", uses, 5)[0].Name == "Google Chrome", "word prefix");
        check(Ranker.Search(list, "보고서", uses, 5)[0].Name == "간호과정_보고서", "contains");
        check(Ranker.Search(list, "와이파이", uses, 5)[0].Name == "Wi-Fi", "keywords");
        uses["d"] = 30;
        check(Ranker.Search(list, "크", uses, 5)[0].Name == "크롬 확장", "usage boost");
        var tap = new ShiftTap();
        check(!tap.Feed(true, true, 0) && !tap.Feed(true, false, 80) && !tap.Feed(true, true, 200) && tap.Feed(true, false, 260), "double shift");
        tap = new ShiftTap();
        tap.Feed(true, true, 0); tap.Feed(true, false, 80); tap.Feed(true, true, 200); tap.Feed(false, true, 220); check(!tap.Feed(true, false, 300), "shift+letter ignored");
        tap = new ShiftTap();
        tap.Feed(true, true, 0); tap.Feed(true, false, 80); check(!(tap.Feed(true, true, 900) | tap.Feed(true, false, 950)), "too slow ignored");
        tap = new ShiftTap();
        tap.Feed(true, true, 0); tap.Feed(true, false, 600); tap.Feed(true, true, 700); check(!tap.Feed(true, false, 760), "long press ignored");
        Console.WriteLine("Spotlight self-test passed");
        return 0;
    }
}
