// 업데이트·재설치 때 파일이 쌓이지 않게 정리한다. (Windows 프로그램 공통: 각 프로젝트 build.sh가 이 파일을 함께 컴파일)
// - 설치가 끝나면, 압축을 푼 설치 폴더(우리 파일만 들어 있을 때)와 같은 프로그램의 zip(예전 버전 포함)을 지울지 묻는다.
// - 프로그램 폴더 안의 예전 버전 폴더를 지운다.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

static class InstallCleanup {
    // folderPrefix: 압축을 풀면 생기는 폴더 이름의 앞부분 (예: "간호과정도우미-"), zipPattern: 지울 zip 이름 정규식
    public static void OfferRemoveDownloads(string caption, string folderPrefix, string[] knownFiles, string zipPattern, string installDir) {
        try {
            string dir = Path.GetDirectoryName(Path.GetFullPath(Assembly.GetExecutingAssembly().Location));
            if (Same(dir, installDir) || dir.IndexOf(Path.GetTempPath(), StringComparison.OrdinalIgnoreCase) == 0) return;
            var targets = new List<string>();
            if (Path.GetFileName(dir).StartsWith(folderPrefix, StringComparison.OrdinalIgnoreCase) && Directory.GetDirectories(dir).Length == 0) {
                bool onlyOurs = true;
                foreach (string f in Directory.GetFiles(dir)) {
                    bool known = false;
                    foreach (string k in knownFiles) if (string.Equals(Path.GetFileName(f), k, StringComparison.OrdinalIgnoreCase)) known = true;
                    if (!known) onlyOurs = false;
                }
                if (onlyOurs) targets.Add(dir);
            }
            string parent = Path.GetDirectoryName(dir);
            if (parent != null)
                foreach (string z in Directory.GetFiles(parent, "*.zip"))
                    if (Regex.IsMatch(Path.GetFileName(z), zipPattern, RegexOptions.IgnoreCase)) targets.Add(z);
            if (targets.Count == 0) return;
            var list = new StringBuilder();
            foreach (string t in targets) list.Append("· ").Append(t).Append('\n');
            if (MessageBox.Show("설치가 끝났어요. 아래 설치 파일은 이제 필요 없어요.\n같은 프로그램이 여러 번 깔리지 않게 지울까요?\n\n" + list + "\n(프로그램과 저장한 내용은 그대로 남아요)",
                caption, MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            // 이 exe가 끝난 뒤에 지워야 하므로 잠깐 기다렸다가 cmd로 지운다
            var cmd = new StringBuilder("/c ping 127.0.0.1 -n 4 > nul");
            foreach (string t in targets) cmd.Append(Directory.Exists(t) ? " & rmdir /s /q \"" + t + "\"" : " & del /f /q \"" + t + "\"");
            Process.Start(new ProcessStartInfo("cmd.exe", cmd.ToString()) { CreateNoWindow = true, UseShellExecute = false, WindowStyle = ProcessWindowStyle.Hidden });
        } catch { }
    }

    // 프로그램 폴더 안에서 지금 버전이 아닌 하위 폴더를 지운다 (예: runtime\1.4.0, runtime\1.5.0 …)
    public static void RemoveOldVersions(string parentDir, string currentName) {
        try {
            foreach (string d in Directory.GetDirectories(parentDir))
                if (!string.Equals(Path.GetFileName(d), currentName, StringComparison.OrdinalIgnoreCase))
                    try { Directory.Delete(d, true); } catch { }
        } catch { }
    }

    static bool Same(string a, string b) {
        if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b)) return false;
        return string.Equals(Path.GetFullPath(a).TrimEnd('\\', '/'), Path.GetFullPath(b).TrimEnd('\\', '/'), StringComparison.OrdinalIgnoreCase);
    }
}
