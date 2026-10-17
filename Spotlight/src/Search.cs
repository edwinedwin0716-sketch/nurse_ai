using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;

// 검색 대상 하나
public class Entry {
    public string Name, Path, Kind, Detail;   // Kind: 응용 프로그램 · 시스템 설정 · 문서 · 폴더 · 웹사이트 · 계산기 · 웹 검색
    public string Initials;                    // 한글 초성 (카카오톡 → ㅋㅋㅇㅌ)
    public string Keywords = "";               // 다른 이름 (Wi-Fi → 와이파이 인터넷)
    public int Score;
    public Entry(string name, string path, string kind, string detail) { Name = name; Path = path; Kind = kind; Detail = detail; Initials = Hangul.Initials(name); }
}

public static class Hangul {
    const string CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
    public static string Initials(string s) {
        var sb = new StringBuilder();
        foreach (char c in s ?? "") {
            if (c >= '가' && c <= '힣') sb.Append(CHO[(c - 0xAC00) / 588]);
            else if (char.IsLetterOrDigit(c)) sb.Append(char.ToLowerInvariant(c));
            else if (c == ' ') sb.Append(' ');
        }
        return sb.ToString();
    }
    public static bool OnlyConsonants(string q) { if (q.Length == 0) return false; foreach (char c in q) if (CHO.IndexOf(c) < 0 && c != ' ') return false; return true; }
}

// "12*3+4", "(5+5)/2", "2^10", "15%" 같은 식을 계산한다
public static class Calc {
    public static bool TryEval(string text, out string result) {
        result = null;
        string s = (text ?? "").Replace(" ", "").Replace("×", "*").Replace("÷", "/").Replace(",", "");
        if (s.Length < 2 || !s.Any(c => "+-*/^%(".IndexOf(c) >= 0) || s.Any(c => "0123456789.+-*/^%()".IndexOf(c) < 0)) return false;
        if (!s.Any(char.IsDigit)) return false;
        try {
            int i = 0; double v = Expr(s, ref i);
            if (i != s.Length || double.IsNaN(v) || double.IsInfinity(v)) return false;
            result = Math.Abs(v - Math.Round(v)) < 1e-9 ? Math.Round(v).ToString("#,0", CultureInfo.InvariantCulture) : v.ToString("#,0.########", CultureInfo.InvariantCulture);
            return true;
        } catch { return false; }
    }
    static double Expr(string s, ref int i) { double v = Term(s, ref i); while (i < s.Length && (s[i] == '+' || s[i] == '-')) { char o = s[i++]; double r = Term(s, ref i); v = o == '+' ? v + r : v - r; } return v; }
    static double Term(string s, ref int i) { double v = Power(s, ref i); while (i < s.Length && (s[i] == '*' || s[i] == '/')) { char o = s[i++]; double r = Power(s, ref i); v = o == '*' ? v * r : v / r; } return v; }
    static double Power(string s, ref int i) { double v = Unary(s, ref i); if (i < s.Length && s[i] == '^') { i++; v = Math.Pow(v, Power(s, ref i)); } return v; }
    static double Unary(string s, ref int i) { if (i < s.Length && s[i] == '-') { i++; return -Unary(s, ref i); } if (i < s.Length && s[i] == '+') { i++; return Unary(s, ref i); } return Atom(s, ref i); }
    static double Atom(string s, ref int i) {
        double v;
        if (i < s.Length && s[i] == '(') { i++; v = Expr(s, ref i); if (i >= s.Length || s[i] != ')') throw new FormatException(); i++; }
        else { int st = i; while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '.')) i++; if (st == i) throw new FormatException(); v = double.Parse(s.Substring(st, i - st), CultureInfo.InvariantCulture); }
        if (i < s.Length && s[i] == '%') { i++; v /= 100; }
        return v;
    }
}

public static class Ranker {
    public static readonly string[] KindOrder = { "응용 프로그램", "시스템 설정", "문서", "폴더", "웹사이트" };
    // 이름이 검색어와 얼마나 잘 맞는지 (0 = 안 맞음)
    public static int Match(Entry e, string q) {
        string n = e.Name.ToLowerInvariant(); q = q.ToLowerInvariant().Trim();
        if (q.Length == 0) return 0;
        if (n == q) return 1000;
        if (n.StartsWith(q)) return 850 - Math.Min(100, n.Length - q.Length);
        foreach (string w in n.Split(new[] { ' ', '-', '_', '.', '(', ')' }, StringSplitOptions.RemoveEmptyEntries)) if (w.StartsWith(q)) return 650;
        if (Hangul.OnlyConsonants(q) || q.All(c => c < 128)) {
            string ini = e.Initials.Replace(" ", ""), qq = q.Replace(" ", "");
            if (ini.StartsWith(qq)) return 560; if (ini.Contains(qq) && qq.Length >= 2) return 320;
        }
        if (n.Contains(q)) return 420 - Math.Min(100, n.IndexOf(q, StringComparison.Ordinal));
        if (e.Keywords.Length > 0 && e.Keywords.ToLowerInvariant().Split(' ').Any(w => w.StartsWith(q))) return 380;
        int k = 0; foreach (char c in n) if (k < q.Length && c == q[k]) k++;   // 띄엄띄엄 맞음 (ktk → 카카오톡 X, chrm → chrome O)
        return k == q.Length && q.Length >= 3 ? 120 : 0;
    }
    public static List<Entry> Search(IEnumerable<Entry> all, string q, IDictionary<string, int> uses, int max) {
        var list = new List<Entry>();
        foreach (var e in all) {
            int m = Match(e, q); if (m <= 0) continue;
            int u; uses.TryGetValue(e.Path, out u);
            e.Score = m + Math.Min(200, u * 15) + (e.Kind == "응용 프로그램" ? 40 : 0);
            list.Add(e);
        }
        return list.OrderByDescending(e => e.Score).ThenBy(e => e.Name.Length).GroupBy(e => e.Path, StringComparer.OrdinalIgnoreCase).Select(g => g.First()).Take(max).ToList();
    }
}

// Windows 설정 바로가기 (ms-settings:)
public static class Settings {
    public static readonly string[][] All = {
        new[] { "Wi-Fi", "ms-settings:network-wifi", "와이파이 인터넷 네트워크" }, new[] { "블루투스", "ms-settings:bluetooth", "bluetooth 이어폰" },
        new[] { "디스플레이", "ms-settings:display", "화면 밝기 해상도" }, new[] { "소리", "ms-settings:sound", "음량 볼륨 스피커 마이크" },
        new[] { "배경 화면", "ms-settings:personalization-background", "바탕화면 테마" }, new[] { "다크 모드", "ms-settings:colors", "색 테마 라이트" },
        new[] { "배터리", "ms-settings:batterysaver", "전원 절전" }, new[] { "전원 및 절전", "ms-settings:powersleep", "잠자기 화면 끄기" },
        new[] { "앱 및 기능", "ms-settings:appsfeatures", "프로그램 제거 삭제 설치" }, new[] { "시작 프로그램", "ms-settings:startupapps", "시작 앱 부팅" },
        new[] { "Windows 업데이트", "ms-settings:windowsupdate", "업데이트" }, new[] { "저장소", "ms-settings:storagesense", "디스크 용량 정리" },
        new[] { "프린터 및 스캐너", "ms-settings:printers", "인쇄 프린터" }, new[] { "날짜 및 시간", "ms-settings:dateandtime", "시계 시간대" },
        new[] { "언어 및 입력", "ms-settings:regionlanguage", "한글 키보드 언어" }, new[] { "마우스", "ms-settings:mousetouchpad", "터치패드 커서" },
        new[] { "알림", "ms-settings:notifications", "알림 방해 금지" }, new[] { "개인 정보", "ms-settings:privacy", "권한 카메라 위치" },
        new[] { "작업 관리자", "taskmgr.exe", "프로세스 느림" }, new[] { "제어판", "control.exe", "control panel" }
    };
}
