// 제출 양식(학교 간호과정 보고서)을 한글(.hwpx)·Word(HTML)로 만든다. Windows판 전용.
// 휴대폰·웹판(android/assets/report.js)과 같은 모양 규칙을 지킨다:
//   표지(학기, 제목, 실습장소·제출일·담당교수·학번·성명 표, 학교·학과)
//   진단마다 '▪간호과정' + 5줄 표(회색 제목 줄 / 사정(자료수집) / 간호계획 및 수행 / 합리적 근거 / 간호평가)
// App.ps1 이 Add-Type 으로 불러 쓴다. C# 5 문법만 쓴다(Windows PowerShell 5.1).
using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;

public static class HwpxReport {
    const string Font = "맑은 고딕", Blank = "#c06000";
    static readonly int[] Pad = { 141, 141, 141, 141 };            // 칸 안쪽 여백 0.5mm (HWPUNIT)

    // ---------- 문서 모델 ----------
    class Run { public string Text; public double Size = 9; public bool Bold; public string Color = "#000000"; }
    class Para { public string Align = "JUSTIFY"; public bool PageBreak; public List<Run> Runs = new List<Run>(); public Table Table; }
    class Cell { public int R, C, Cs = 1; public int W, H; public string Bg; public List<Para> Blocks = new List<Para>(); }
    class Table { public int Rows, Cols, W; public bool Center; public List<Cell> Cells = new List<Cell>(); }

    static int Mm(double x) { return (int)Math.Round(x * 7200 / 25.4); }
    static Run R(string t) { return new Run { Text = t ?? "" }; }
    static Run R(string t, double size, bool bold, string color) { return new Run { Text = t ?? "", Size = size, Bold = bold, Color = color ?? "#000000" }; }
    static Para P(string align, params Run[] runs) { var p = new Para { Align = align }; p.Runs.AddRange(runs); return p; }
    static Para T(string text) { return P("JUSTIFY", R(text)); }
    static Para B(string text) { return P("JUSTIFY", R(text, 9, true, null)); }
    static Para Gap() { return P("JUSTIFY", R("")); }
    static Para Hint(string text, string align) { return P(align ?? "JUSTIFY", R(text, 9, false, Blank)); }
    static Cell MakeCell(int r, int c, double wMm, List<Para> blocks, int cs, string bg, double hMm) {
        var cell = new Cell { R = r, C = c, Cs = cs, W = Mm(wMm), H = Mm(hMm), Bg = bg };
        cell.Blocks.AddRange(blocks.Count > 0 ? blocks : new List<Para> { Gap() });
        return cell;
    }

    // ---------- 결과(JSON) 읽기 ----------
    static readonly Regex Vital = new Regex(@"(\bBP\b|혈압|\bP\s*\d|\bPR\b|맥박|\bR\s*\d|\bRR\b|호흡수|\bBT\b|체온|V\/S|SpO2|산소포화도)", RegexOptions.IgnoreCase);
    const string Circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
    static string Circ(int n) { return n >= 1 && n <= 20 ? Circled.Substring(n - 1, 1) : "(" + n + ")"; }
    static readonly string[][] DoneEnd = { new[] { "돕는다.", "도움" }, new[] { "둔다.", "둠" }, new[] { "올린다.", "올림" }, new[] { "줄인다.", "줄임" }, new[] { "만든다.", "만듦" }, new[] { "지킨다.", "지킴" }, new[] { "피한다.", "피함" } };
    public static string ToDone(string sentence) {
        var s = (sentence ?? "").Trim();
        foreach (var d in DoneEnd) if (s.EndsWith(d[0])) return s.Substring(0, s.Length - d[0].Length) + d[1];
        if (s.EndsWith("한다.")) return s.Substring(0, s.Length - 3) + "함";
        return s.TrimEnd('.');
    }
    static List<string> Strings(object o) {
        var list = new List<string>();
        var arr = o as IEnumerable;
        if (o is string) { list.Add((string)o); return list; }
        if (arr != null) foreach (var x in arr) if (x != null) list.Add(x.ToString());
        return list;
    }
    static string Str(IDictionary<string, object> d, string key) { object v; return d != null && d.TryGetValue(key, out v) && v != null ? v.ToString() : ""; }
    static IEnumerable<IDictionary<string, object>> Objects(object o) {
        var arr = o as IEnumerable;
        if (arr == null || o is string) yield break;
        foreach (var x in arr) { var d = x as IDictionary<string, object>; if (d != null) yield return d; }
    }

    class Item { public string No, Plan, Why, Done; }
    class Group { public string Kind; public List<Item> Items = new List<Item>(); }

    // ---------- 모양 ----------
    static List<Para> Cover(IDictionary<string, object> c) {
        var o = new List<Para>();
        o.Add(P("LEFT", R(Str(c, "subject"), 16, true, null)));
        for (int i = 0; i < 3; i++) o.Add(Gap());
        o.Add(P("CENTER", R(Str(c, "title"), 20, true, null)));
        for (int i = 0; i < 5; i++) o.Add(Gap());
        var rows = new[] { new[] { "실습장소", Str(c, "place") }, new[] { "제 출 일", Str(c, "date") }, new[] { "담당교수", Str(c, "professor") }, new[] { "학 번", Str(c, "studentNo") }, new[] { "성 명", Str(c, "author") } };
        var t = new Table { Rows = 5, Cols = 2, W = Mm(119), Center = true };
        for (int r = 0; r < rows.Length; r++) {
            t.Cells.Add(MakeCell(r, 0, 40, new List<Para> { P("CENTER", R(rows[r][0], 12, false, null)) }, 1, null, 10));
            t.Cells.Add(MakeCell(r, 1, 79, new List<Para> { P("CENTER", R(rows[r][1], 12, false, null)) }, 1, null, 10));
        }
        o.Add(new Para { Table = t });
        for (int i = 0; i < 5; i++) o.Add(Gap());
        o.Add(P("CENTER", R(Str(c, "school"), 22, true, null)));
        return o;
    }

    static List<Para> Section(IDictionary<string, object> d, List<string> s, List<string> ob, List<Group> groups, int k, string md) {
        var page = Str(d, "page"); page = page.Length > 0 && page != "0" ? "p." + page : "p.____";
        var head = new List<Para> {
            P("JUSTIFY", R("간호진단 " + k + " "), R(Str(d, "statement"), 9, true, null)),
            P("JUSTIFY", R("(" + Str(d, "name") + " : ", 6, false, null), R("정의는 별책 부록 8, " + page + "에서 옮겨 적으세요", 6, false, Blank), R(")", 6, false, null)) };
        var assess = new List<Para> { B("주관적 자료") };
        if (s.Count > 0) assess.AddRange(s.Select(T)); else assess.Add(Hint("\"(대상자가 직접 한 말)\"", null));
        assess.Add(Gap()); assess.Add(B("객관적 자료"));
        if (ob.Count > 0) assess.AddRange(ob.Select(T)); else assess.Add(Hint("(V/S, 검사 결과, 관찰 내용)", null));

        var shortGoals = Strings(d.ContainsKey("short") ? d["short"] : null);
        var plan = new List<Para> { B("목표"), B("단기목표") };
        for (int i = 0; i < shortGoals.Count; i++) plan.Add(T((i + 1) + ". " + shortGoals[i]));
        plan.Add(B("장기목표")); plan.Add(T(Str(d, "long"))); plan.Add(Gap()); plan.Add(B("계획"));
        foreach (var g in groups) { plan.Add(B("(" + g.Kind + ")")); foreach (var it in g.Items) plan.Add(T(it.No + " " + it.Plan)); }
        plan.Add(Gap()); plan.Add(B("수행"));
        foreach (var g in groups) {
            plan.Add(B("(" + g.Kind + ")"));
            foreach (var it in g.Items) { plan.Add(T(it.No + " " + it.Done)); plan.Add(Hint("→ " + md + " __:__ (수행 결과·대상자 반응을 적으세요)", null)); }
        }
        var why = new List<Para>();
        foreach (var g in groups) {
            why.Add(B("(" + g.Kind + ")"));
            foreach (var it in g.Items) { why.Add(T(it.No + " " + it.Why)); why.Add(Hint("(참고문헌: 저자 외. (연도). 교재명 제_판. 출판사. p.__)", "LEFT")); }
        }
        var ev = new List<Para> { B("단기목표") };
        for (int i = 0; i < shortGoals.Count; i++) { ev.Add(T((i + 1) + ". " + shortGoals[i])); ev.Add(Hint("→ 대상자는 __ (결과를 수치로 적으세요) (달성 / 부분 달성 / 미달성)", null)); }
        ev.Add(B("장기목표")); ev.Add(T(Str(d, "long"))); ev.Add(Hint("→ 대상자는 __ (퇴원 시 상태를 적으세요) (달성 / 부분 달성 / 미달성)", null));

        Func<string, List<Para>> label = x => new List<Para> { P("CENTER", R(x)) };
        var t = new Table { Rows = 5, Cols = 2, W = Mm(150) };
        t.Cells.Add(MakeCell(0, 0, 150, head, 2, "#cccccc", 6));
        t.Cells.Add(MakeCell(1, 0, 30, label("사정(자료수집)"), 1, null, 6)); t.Cells.Add(MakeCell(1, 1, 120, assess, 1, null, 6));
        t.Cells.Add(MakeCell(2, 0, 30, label("간호계획 및 수행"), 1, null, 6)); t.Cells.Add(MakeCell(2, 1, 120, plan, 1, null, 6));
        t.Cells.Add(MakeCell(3, 0, 30, label("합리적 근거"), 1, null, 6)); t.Cells.Add(MakeCell(3, 1, 120, why, 1, null, 6));
        t.Cells.Add(MakeCell(4, 0, 30, label("간호평가"), 1, null, 6)); t.Cells.Add(MakeCell(4, 1, 120, ev, 1, null, 6));
        return new List<Para> { P("LEFT", R("▪간호과정", 12, true, null)), new Para { Table = t } };
    }

    // JSON: { md, subjective[], objective[], diags[{name,page,statement,long,short[],cues[],plans[{kind,plan,why}]}], cover{...}|null }
    static List<Para> Build(string json) {
        var root = (IDictionary<string, object>)new JavaScriptSerializer { MaxJsonLength = int.MaxValue }.DeserializeObject(json);
        object cv; root.TryGetValue("cover", out cv);
        var blocks = cv is IDictionary<string, object> ? Cover((IDictionary<string, object>)cv) : new List<Para>();
        var subj = Strings(root.ContainsKey("subjective") ? root["subjective"] : null);
        var obj = Strings(root.ContainsKey("objective") ? root["objective"] : null);
        int k = 0;
        foreach (var d in Objects(root.ContainsKey("diags") ? root["diags"] : null)) {
            k++;
            var cues = Strings(d.ContainsKey("cues") ? d["cues"] : null);
            var s = subj.Where(x => cues.Contains(x)).ToList(); if (s.Count == 0) s = subj.ToList();
            var o = obj.Where(x => cues.Contains(x) || Vital.IsMatch(x)).ToList(); if (o.Count == 0) o = obj.ToList();
            var groups = new List<Group>(); int n = 0;
            foreach (var kind in new[] { "진단적", "치료적", "교육적" }) {
                var g = new Group { Kind = kind };
                foreach (var p in Objects(d.ContainsKey("plans") ? d["plans"] : null)) {
                    if (Str(p, "kind") != kind) continue;
                    n++; g.Items.Add(new Item { No = Circ(n), Plan = Str(p, "plan"), Why = Str(p, "why"), Done = ToDone(Str(p, "plan")) });
                }
                if (g.Items.Count > 0) groups.Add(g);
            }
            var part = Section(d, s, o, groups, k, Str(root, "md"));
            if (blocks.Count > 0) part[0].PageBreak = true;
            blocks.AddRange(part);
        }
        if (blocks.Count == 0) blocks.Add(Gap());
        return blocks;
    }

    // ---------- 한글(.hwpx) ----------
    static string X(string s) { return (s ?? "").Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;"); }
    static string All(object v) { return string.Join(" ", new[] { "hangul", "latin", "hanja", "japanese", "other", "symbol", "user" }.Select(l => l + "=\"" + v + "\"")); }

    class Writer {
        public List<string> CharPrs = new List<string>(), ParaPrs = new List<string>(), Fills = new List<string>();
        readonly Dictionary<string, int> charKey = new Dictionary<string, int>(), paraKey = new Dictionary<string, int>(), fillKey = new Dictionary<string, int>();
        const int Char0 = 7, Para0 = 20, Fill0 = 3, FontId = 2;   // 뼈대(header.xml)에 있는 것 다음 번호부터
        int oid = 1000, pid = 1;
        public string Nid() { return (1000000 + oid++).ToString(CultureInfo.InvariantCulture); }

        public int CharId(Run r) {
            var key = r.Size + "|" + r.Bold + "|" + r.Color;
            int id;
            if (charKey.TryGetValue(key, out id)) return id;
            id = Char0 + CharPrs.Count;
            CharPrs.Add("<hh:charPr id=\"" + id + "\" height=\"" + (int)Math.Round(r.Size * 100) + "\" textColor=\"" + r.Color + "\" shadeColor=\"none\" useFontSpace=\"0\" useKerning=\"0\" symMark=\"NONE\" borderFillIDRef=\"2\">" +
                "<hh:fontRef " + All(FontId) + "/><hh:ratio " + All(100) + "/><hh:spacing " + All(0) + "/><hh:relSz " + All(100) + "/><hh:offset " + All(0) + "/>" +
                (r.Bold ? "<hh:bold/>" : "") +
                "<hh:underline type=\"NONE\" shape=\"SOLID\" color=\"#000000\"/><hh:strikeout shape=\"NONE\" color=\"#000000\"/><hh:outline type=\"NONE\"/><hh:shadow type=\"NONE\" color=\"#C0C0C0\" offsetX=\"10\" offsetY=\"10\"/></hh:charPr>");
            charKey[key] = id;
            return id;
        }
        public int ParaId(string align) {
            int id;
            if (paraKey.TryGetValue(align, out id)) return id;
            id = Para0 + ParaPrs.Count;
            Func<int, string> margin = d => "<hh:margin><hc:intent value=\"0\" unit=\"HWPUNIT\"/><hc:left value=\"0\" unit=\"HWPUNIT\"/><hc:right value=\"0\" unit=\"HWPUNIT\"/><hc:prev value=\"0\" unit=\"HWPUNIT\"/><hc:next value=\"0\" unit=\"HWPUNIT\"/></hh:margin><hh:lineSpacing type=\"PERCENT\" value=\"160\" unit=\"HWPUNIT\"/>";
            ParaPrs.Add("<hh:paraPr id=\"" + id + "\" tabPrIDRef=\"0\" condense=\"0\" fontLineHeight=\"0\" snapToGrid=\"1\" suppressLineNumbers=\"0\" checked=\"0\" textDir=\"LTR\">" +
                "<hh:align horizontal=\"" + align + "\" vertical=\"BASELINE\"/><hh:heading type=\"NONE\" idRef=\"0\" level=\"0\"/>" +
                "<hh:breakSetting breakLatinWord=\"KEEP_WORD\" breakNonLatinWord=\"BREAK_WORD\" widowOrphan=\"0\" keepWithNext=\"0\" keepLines=\"0\" pageBreakBefore=\"0\" lineWrap=\"BREAK\"/>" +
                "<hh:autoSpacing eAsianEng=\"0\" eAsianNum=\"0\"/>" +
                "<hp:switch><hp:case hp:required-namespace=\"http://www.hancom.co.kr/hwpml/2016/HwpUnitChar\">" + margin(1) + "</hp:case><hp:default>" + margin(2) + "</hp:default></hp:switch>" +
                "<hh:border borderFillIDRef=\"2\" offsetLeft=\"0\" offsetRight=\"0\" offsetTop=\"0\" offsetBottom=\"0\" connect=\"0\" ignoreMargin=\"0\"/></hh:paraPr>");
            paraKey[align] = id;
            return id;
        }
        public int FillId(string bg) {
            var key = bg ?? "";
            int id;
            if (fillKey.TryGetValue(key, out id)) return id;
            id = Fill0 + Fills.Count;
            Func<string, string> ln = n => "<hh:" + n + " type=\"SOLID\" width=\"0.12 mm\" color=\"#000000\"/>";
            Fills.Add("<hh:borderFill id=\"" + id + "\" threeD=\"0\" shadow=\"0\" centerLine=\"NONE\" breakCellSeparateLine=\"0\"><hh:slash type=\"NONE\" Crooked=\"0\" isCounter=\"0\"/><hh:backSlash type=\"NONE\" Crooked=\"0\" isCounter=\"0\"/>" +
                ln("leftBorder") + ln("rightBorder") + ln("topBorder") + ln("bottomBorder") + "<hh:diagonal type=\"SOLID\" width=\"0.1 mm\" color=\"#000000\"/>" +
                (bg != null ? "<hc:fillBrush><hc:winBrush faceColor=\"" + bg + "\" hatchColor=\"#999999\" alpha=\"0\"/></hc:fillBrush>" : "") + "</hh:borderFill>");
            fillKey[key] = id;
            return id;
        }

        string Pos(bool center) {
            return center ? "<hp:pos treatAsChar=\"0\" affectLSpacing=\"0\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"COLUMN\" vertAlign=\"TOP\" horzAlign=\"CENTER\" vertOffset=\"0\" horzOffset=\"0\"/>"
                : "<hp:pos treatAsChar=\"1\" affectLSpacing=\"0\" flowWithText=\"1\" allowOverlap=\"0\" holdAnchorAndSO=\"0\" vertRelTo=\"PARA\" horzRelTo=\"COLUMN\" vertAlign=\"TOP\" horzAlign=\"LEFT\" vertOffset=\"0\" horzOffset=\"0\"/>";
        }
        string TableXml(Table t) {
            var sb = new StringBuilder();
            var tableFill = FillId(null);
            int height = 0;
            for (int r = 0; r < t.Rows; r++) height += t.Cells.Where(c => c.R == r).Select(c => c.H).DefaultIfEmpty(282).Max();
            sb.Append("<hp:tbl id=\"" + Nid() + "\" zOrder=\"0\" numberingType=\"TABLE\" textWrap=\"TOP_AND_BOTTOM\" textFlow=\"BOTH_SIDES\" lock=\"0\" dropcapstyle=\"None\" pageBreak=\"CELL\" repeatHeader=\"0\" rowCnt=\"" + t.Rows + "\" colCnt=\"" + t.Cols + "\" cellSpacing=\"0\" borderFillIDRef=\"" + tableFill + "\" noAdjust=\"0\">");
            sb.Append("<hp:sz width=\"" + t.W + "\" widthRelTo=\"ABSOLUTE\" height=\"" + height + "\" heightRelTo=\"ABSOLUTE\" protect=\"0\"/>" + Pos(t.Center));
            sb.Append("<hp:outMargin left=\"0\" right=\"0\" top=\"0\" bottom=\"0\"/><hp:inMargin left=\"" + Pad[0] + "\" right=\"" + Pad[1] + "\" top=\"" + Pad[2] + "\" bottom=\"" + Pad[3] + "\"/>");
            for (int r = 0; r < t.Rows; r++) {
                sb.Append("<hp:tr>");
                foreach (var c in t.Cells.Where(x => x.R == r).OrderBy(x => x.C)) {
                    sb.Append("<hp:tc name=\"\" header=\"0\" hasMargin=\"0\" protect=\"0\" editable=\"0\" dirty=\"0\" borderFillIDRef=\"" + FillId(c.Bg) + "\">");
                    sb.Append("<hp:subList id=\"\" textDirection=\"HORIZONTAL\" lineWrap=\"BREAK\" vertAlign=\"CENTER\" linkListIDRef=\"0\" linkListNextIDRef=\"0\" textWidth=\"0\" textHeight=\"0\" hasTextRef=\"0\" hasNumRef=\"0\">");
                    foreach (var p in c.Blocks) sb.Append(ParaXml(p, ""));
                    sb.Append("</hp:subList><hp:cellAddr colAddr=\"" + c.C + "\" rowAddr=\"" + c.R + "\"/><hp:cellSpan colSpan=\"" + c.Cs + "\" rowSpan=\"1\"/><hp:cellSz width=\"" + c.W + "\" height=\"" + c.H + "\"/>");
                    sb.Append("<hp:cellMargin left=\"" + Pad[0] + "\" right=\"" + Pad[1] + "\" top=\"" + Pad[2] + "\" bottom=\"" + Pad[3] + "\"/></hp:tc>");
                }
                sb.Append("</hp:tr>");
            }
            sb.Append("</hp:tbl>");
            return sb.ToString();
        }
        public string ParaXml(Para p, string lead) {
            var sb = new StringBuilder();
            sb.Append("<hp:p id=\"" + (pid++) + "\" paraPrIDRef=\"" + ParaId(p.Align) + "\" styleIDRef=\"0\" pageBreak=\"" + (p.PageBreak ? 1 : 0) + "\" columnBreak=\"0\" merged=\"0\">");
            sb.Append(lead);
            if (p.Table != null) sb.Append("<hp:run charPrIDRef=\"" + CharId(new Run()) + "\">" + TableXml(p.Table) + "</hp:run>");
            else if (p.Runs.Count == 0) sb.Append("<hp:run charPrIDRef=\"" + CharId(new Run()) + "\"><hp:t/></hp:run>");
            foreach (var r in p.Runs) sb.Append("<hp:run charPrIDRef=\"" + CharId(r) + "\"><hp:t>" + X(r.Text) + "</hp:t></hp:run>");
            sb.Append("</hp:p>");
            return sb.ToString();
        }
    }

    static byte[] Utf8(string s) { return new UTF8Encoding(false).GetBytes(s); }

    // 한글(.hwpx) 파일로 저장 (A4, 왼·오른쪽 30mm, 위 20mm, 아래 15mm, 쪽 번호 아래 가운데)
    public static void Save(string path, string json) { File.WriteAllBytes(path, Hwpx(json)); }
    public static byte[] Hwpx(string json) {
        var blocks = Build(json);
        var w = new Writer();
        var secPr = Regex.Replace(HwpxTemplate.SecPr, "<hp:pagePr[^>]*>(<hp:margin[^>]*/>)</hp:pagePr>",
            "<hp:pagePr landscape=\"WIDELY\" width=\"59528\" height=\"84188\" gutterType=\"LEFT_ONLY\"><hp:margin header=\"" + Mm(15) + "\" footer=\"" + Mm(15) + "\" gutter=\"0\" left=\"" + Mm(30) + "\" right=\"" + Mm(30) + "\" top=\"" + Mm(20) + "\" bottom=\"" + Mm(15) + "\"/></hp:pagePr>");
        var lead = "<hp:run charPrIDRef=\"0\">" + secPr + "<hp:ctrl><hp:colPr id=\"\" type=\"NEWSPAPER\" layout=\"LEFT\" colCount=\"1\" sameSz=\"1\" sameGap=\"0\"/></hp:ctrl>" +
            "<hp:ctrl><hp:pageNum pos=\"BOTTOM_CENTER\" formatType=\"DIGIT\" sideChar=\"-\"/></hp:ctrl></hp:run>";
        var body = new StringBuilder();
        for (int i = 0; i < blocks.Count; i++) body.Append(w.ParaXml(blocks[i], i == 0 ? lead : ""));
        var section = HwpxTemplate.SecOpen + body + "</hs:sec>";

        var header = HwpxTemplate.Header;
        header = Regex.Replace(header, "<hh:fontface lang=\"([A-Z]+)\" fontCnt=\"\\d+\">([\\s\\S]*?)</hh:fontface>",
            m => "<hh:fontface lang=\"" + m.Groups[1].Value + "\" fontCnt=\"3\">" + m.Groups[2].Value + "<hh:font id=\"2\" face=\"" + Font + "\" type=\"TTF\" isEmbedded=\"0\"/></hh:fontface>");
        Func<string, string, List<string>, string> append = (h, tag, items) => Regex.Replace(h, "<hh:" + tag + " itemCnt=\"(\\d+)\">([\\s\\S]*?)</hh:" + tag + ">",
            m => "<hh:" + tag + " itemCnt=\"" + (int.Parse(m.Groups[1].Value) + items.Count) + "\">" + m.Groups[2].Value + string.Join("", items) + "</hh:" + tag + ">");
        header = append(header, "borderFills", w.Fills);
        header = append(header, "charProperties", w.CharPrs);
        header = append(header, "paraProperties", w.ParaPrs);

        var now = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", CultureInfo.InvariantCulture);
        const string NS = "xmlns:ha=\"http://www.hancom.co.kr/hwpml/2011/app\" xmlns:hp=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:hp10=\"http://www.hancom.co.kr/hwpml/2016/paragraph\" xmlns:hs=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:hc=\"http://www.hancom.co.kr/hwpml/2011/core\" xmlns:hh=\"http://www.hancom.co.kr/hwpml/2011/head\" xmlns:hhs=\"http://www.hancom.co.kr/hwpml/2011/history\" xmlns:hm=\"http://www.hancom.co.kr/hwpml/2011/master-page\" xmlns:hpf=\"http://www.hancom.co.kr/schema/2011/hpf\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:opf=\"http://www.idpf.org/2007/opf/\" xmlns:ooxmlchart=\"http://www.hancom.co.kr/hwpml/2016/ooxmlchart\" xmlns:hwpunitchar=\"http://www.hancom.co.kr/hwpml/2016/HwpUnitChar\" xmlns:epub=\"http://www.idpf.org/2007/ops\" xmlns:config=\"urn:oasis:names:tc:opendocument:xmlns:config:1.0\"";
        var hpf = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?><opf:package " + NS + " version=\"\" unique-identifier=\"\" id=\"\"><opf:metadata><opf:title>간호과정</opf:title><opf:language>ko</opf:language>" +
            "<opf:meta name=\"creator\" content=\"text\"></opf:meta><opf:meta name=\"subject\" content=\"text\"/><opf:meta name=\"description\" content=\"text\"/><opf:meta name=\"lastsaveby\" content=\"text\"></opf:meta>" +
            "<opf:meta name=\"CreatedDate\" content=\"text\">" + now + "</opf:meta><opf:meta name=\"ModifiedDate\" content=\"text\">" + now + "</opf:meta><opf:meta name=\"keyword\" content=\"text\"/></opf:metadata><opf:manifest>" +
            "<opf:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/><opf:item id=\"section0\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/><opf:item id=\"settings\" href=\"settings.xml\" media-type=\"application/xml\"/>" +
            "</opf:manifest><opf:spine><opf:itemref idref=\"header\" linear=\"yes\"/><opf:itemref idref=\"section0\" linear=\"yes\"/></opf:spine></opf:package>";
        const string rdf = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\" ?><rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\"><rdf:Description rdf:about=\"\"><ns0:hasPart xmlns:ns0=\"http://www.hancom.co.kr/hwpml/2016/meta/pkg#\" rdf:resource=\"Contents/header.xml\"/></rdf:Description><rdf:Description rdf:about=\"Contents/header.xml\"><rdf:type rdf:resource=\"http://www.hancom.co.kr/hwpml/2016/meta/pkg#HeaderFile\"/></rdf:Description><rdf:Description rdf:about=\"\"><ns0:hasPart xmlns:ns0=\"http://www.hancom.co.kr/hwpml/2016/meta/pkg#\" rdf:resource=\"Contents/section0.xml\"/></rdf:Description><rdf:Description rdf:about=\"Contents/section0.xml\"><rdf:type rdf:resource=\"http://www.hancom.co.kr/hwpml/2016/meta/pkg#SectionFile\"/></rdf:Description><rdf:Description rdf:about=\"\"><rdf:type rdf:resource=\"http://www.hancom.co.kr/hwpml/2016/meta/pkg#Document\"/></rdf:Description></rdf:RDF>";
        var preview = string.Join("\n", blocks.Where(b => b.Table == null).Select(b => string.Concat(b.Runs.Select(r => r.Text))));
        if (preview.Length > 1000) preview = preview.Substring(0, 1000);

        using (var ms = new MemoryStream()) {
            using (var zip = new ZipArchive(ms, ZipArchiveMode.Create, true)) {
                Action<string, string, bool> add = (name, text, store) => {
                    var e = zip.CreateEntry(name, store ? CompressionLevel.NoCompression : CompressionLevel.Optimal);
                    using (var s = e.Open()) { var b = Utf8(text); s.Write(b, 0, b.Length); }
                };
                add("mimetype", "application/hwp+zip", true);                // 맨 앞, 압축 없이
                add("version.xml", HwpxTemplate.Version, false);
                add("Contents/header.xml", header, false);
                add("Contents/section0.xml", section, false);
                add("Preview/PrvText.txt", preview, false);
                add("settings.xml", HwpxTemplate.Settings, false);
                add("META-INF/container.rdf", rdf, false);
                add("Contents/content.hpf", hpf, false);
                add("META-INF/container.xml", HwpxTemplate.Container, false);
                add("META-INF/manifest.xml", HwpxTemplate.Manifest, false);
            }
            return ms.ToArray();
        }
    }

    // ---------- Word(.doc)·인쇄용 HTML: 같은 모양 ----------
    static string H(string s) { return System.Net.WebUtility.HtmlEncode(s ?? ""); }
    static string ParaHtml(Para p) {
        if (p.Table != null) {
            var t = p.Table;
            var sb = new StringBuilder("<table style=\"border-collapse:collapse;table-layout:fixed;width:" + (t.W / 100.0).ToString("0.##", CultureInfo.InvariantCulture) + "pt" + (t.Center ? ";margin-left:auto;margin-right:auto" : "") + "\">");
            for (int r = 0; r < t.Rows; r++) {
                sb.Append("<tr>");
                foreach (var c in t.Cells.Where(x => x.R == r).OrderBy(x => x.C)) {
                    sb.Append("<td" + (c.Cs > 1 ? " colspan=\"" + c.Cs + "\"" : "") + " style=\"width:" + (c.W / 100.0).ToString("0.##", CultureInfo.InvariantCulture) + "pt;height:" + (c.H / 100.0).ToString("0.##", CultureInfo.InvariantCulture) +
                        "pt;border:0.12mm solid #000;padding:0.5mm;vertical-align:middle" + (c.Bg != null ? ";background:" + c.Bg : "") + "\">");
                    foreach (var b in c.Blocks) sb.Append(ParaHtml(b));
                    sb.Append("</td>");
                }
                sb.Append("</tr>");
            }
            return sb.Append("</table>").ToString();
        }
        var align = p.Align == "CENTER" ? "center" : p.Align == "LEFT" ? "left" : p.Align == "RIGHT" ? "right" : "justify";
        var inner = string.Concat(p.Runs.Select(r => "<span style=\"font-size:" + r.Size.ToString(CultureInfo.InvariantCulture) + "pt" + (r.Bold ? ";font-weight:bold" : "") + (r.Color != "#000000" ? ";color:" + r.Color : "") + "\">" + H(r.Text) + "</span>"));
        return "<p style=\"margin:0;text-align:" + align + "\">" + (inner.Length > 0 && p.Runs.Any(r => r.Text.Length > 0) ? inner : "&nbsp;") + "</p>";
    }
    public static string Html(string json) {
        var sb = new StringBuilder("<html xmlns:o=\"urn:schemas-microsoft-com:office:office\" xmlns:w=\"urn:schemas-microsoft-com:office:word\"><head><meta charset=\"utf-8\"><title>간호과정</title><style>" +
            "@page{size:210mm 297mm;margin:20mm 30mm 15mm}@page Section1{size:210mm 297mm;margin:20mm 30mm 15mm}div.Section1{page:Section1}" +
            "body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;font-size:9pt;color:#000;line-height:1.6}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><div class=Section1>");
        foreach (var p in Build(json)) {
            if (p.PageBreak) sb.Append("<br clear=all style=\"page-break-before:always\">");
            sb.Append(ParaHtml(p));
        }
        return sb.Append("</div></body></html>").ToString();
    }
}
