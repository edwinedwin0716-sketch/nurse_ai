using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("간호과정 도우미")]
[assembly: AssemblyProduct("간호과정 도우미")]
[assembly: AssemblyDescription("간호과정(사정·진단·계획·중재·평가) 틀 자동 작성")]
[assembly: AssemblyVersion("1.2.0.0")]
[assembly: AssemblyFileVersion("1.2.0.0")]

static class Bootstrap {
 const string Version = "1.2.0";
 const string Caption = "간호과정 도우미";
 static readonly object logLock = new object();
 static readonly string[] Payload = { "App.ps1", "Templates.ps1", "ModernControls.cs" };

 [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
 [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint msg, IntPtr w, IntPtr l);

 [STAThread]
 static int Main(string[] args) {
  try {
   string dataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "NursingHelper");
   bool check = false;
   bool install = string.Equals(Path.GetFileNameWithoutExtension(Application.ExecutablePath), "NursingHelperSetup", StringComparison.OrdinalIgnoreCase);
   for (int i = 0; i < args.Length; i++) {
    if (args[i] == "--check") check = true;
    else if (args[i] == "--install") install = true;
    else if (args[i] == "--data-dir" && i + 1 < args.Length) dataDir = Path.GetFullPath(args[++i]);
    else throw new ArgumentException("지원하지 않는 실행 옵션: " + args[i]);
   }
   Directory.CreateDirectory(dataDir);
   string installedExe = Path.Combine(dataDir, "NursingHelper.exe");
   if (install) CleanPreviousInstall(dataDir);

   string runtime = Path.Combine(Path.Combine(dataDir, "runtime"), Version);
   Directory.CreateDirectory(runtime);
   foreach (string name in Payload) {
    using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name)) {
     if (stream == null) throw new FileNotFoundException(name);
     using (var reader = new StreamReader(stream, Encoding.UTF8, true))
      File.WriteAllText(Path.Combine(runtime, name), reader.ReadToEnd(), new UTF8Encoding(true));
    }
   }

   if (install) {
    if (!string.Equals(installedExe, Application.ExecutablePath, StringComparison.OrdinalIgnoreCase))
     File.Copy(Application.ExecutablePath, installedExe, true);
    CreateShortcut(installedExe, dataDir);
    int code = RunPowerShell(runtime, dataDir, installedExe, true);
    if (code != 0) { MessageBox.Show("설치 확인 중 문제가 발생했습니다.\n\n" + Tail(Path.Combine(dataDir, "check.log")) + "\n\n진단 기록: " + Path.Combine(dataDir, "check.log") + "\n(이 창을 캡처해서 보내 주세요)", Caption); return code; }
    MessageBox.Show("간호과정 도우미 " + Version + " 설치를 마쳤습니다.\n\n바탕화면의 간호과정 도우미를 더블클릭하세요.", Caption);
    Process.Start(new ProcessStartInfo(installedExe) { UseShellExecute = true, WorkingDirectory = dataDir });
    return 0;
   }

   int exit = RunPowerShell(runtime, dataDir, Application.ExecutablePath, check);
   if (exit != 0) { string log = Path.Combine(dataDir, check ? "check.log" : "runtime.log"); MessageBox.Show("실행에 실패했습니다.\n\n" + Tail(log) + "\n\n진단 기록: " + log + "\n(이 창을 캡처해서 보내 주세요)", Caption); }
   return exit;
  } catch (Exception ex) {
   MessageBox.Show(ex.Message, Caption);
   return 1;
  }
 }

 // Close a running launcher, then remove files left by older versions.
 // settings.json (encrypted API key, model) is kept.
 static void CleanPreviousInstall(string dataDir) {
  IntPtr window = FindWindow(null, "간호과정 도우미");
  if (window != IntPtr.Zero) PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero); // WM_CLOSE
  int self = Process.GetCurrentProcess().Id;
  for (int wait = 0; wait < 50; wait++) {
   bool running = false;
   foreach (Process p in Process.GetProcessesByName("NursingHelper")) { if (p.Id != self) running = true; p.Dispose(); }
   if (!running && FindWindow(null, "간호과정 도우미") == IntPtr.Zero) break;
   Thread.Sleep(100);
  }
  foreach (Process p in Process.GetProcessesByName("NursingHelper")) {
   try { if (p.Id != self) { p.Kill(); p.WaitForExit(3000); } } catch { }
   p.Dispose();
  }
  // the launcher UI itself runs in a hidden powershell.exe started from the runtime folder
  try {
   using (var search = new System.Management.ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'powershell.exe'"))
    foreach (System.Management.ManagementObject row in search.Get()) {
     string line = Convert.ToString(row["CommandLine"]);
     if (line.IndexOf("NursingHelper", StringComparison.OrdinalIgnoreCase) >= 0 && line.IndexOf("App.ps1", StringComparison.OrdinalIgnoreCase) >= 0)
      try { using (Process p = Process.GetProcessById(Convert.ToInt32(row["ProcessId"]))) { p.Kill(); p.WaitForExit(3000); } } catch { }
     row.Dispose();
    }
  } catch { }


  TryDelete(() => Directory.Delete(Path.Combine(dataDir, "runtime"), true));
  foreach (string name in new[] { "runtime.log", "check.log", "preview.png", "NursingHelper.exe" })
   TryDelete(() => File.Delete(Path.Combine(dataDir, name)));
  string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
  foreach (string name in new[] { "간호과정 도우미.lnk" })
   TryDelete(() => File.Delete(Path.Combine(desktop, name)));
 }

 // Last lines of a log file, so error dialogs say what went wrong
 static string Tail(string path) {
  try {
   string[] lines = File.ReadAllLines(path, Encoding.UTF8);
   int start = Math.Max(0, lines.Length - 12);
   return string.Join("\n", lines, start, lines.Length - start).Trim();
  } catch { return "(기록을 읽지 못했습니다)"; }
 }

 static void TryDelete(Action action) { try { action(); } catch (DirectoryNotFoundException) { } catch (IOException) { } catch (UnauthorizedAccessException) { } }

 static void CreateShortcut(string target, string dataDir) {
  Type shellType = Type.GetTypeFromProgID("WScript.Shell");
  object shell = Activator.CreateInstance(shellType);
  string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "간호과정 도우미.lnk");
  object link = shellType.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
  Type linkType = link.GetType();
  linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { target });
  linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { dataDir });
  linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { target + ",0" });
  linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "간호과정 틀 자동 작성" });
  linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
  Marshal.FinalReleaseComObject(link);
  Marshal.FinalReleaseComObject(shell);
 }

 static int RunPowerShell(string runtime, string dataDir, string exePath, bool check) {
  string log = Path.Combine(dataDir, check ? "check.log" : "runtime.log");
  File.WriteAllText(log, "", Encoding.UTF8);
  string powershell = Path.Combine(Path.Combine(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell"), "v1.0"), "powershell.exe");
  var info = new ProcessStartInfo(powershell);
  info.Arguments = "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File \"" + Path.Combine(runtime, "App.ps1") + "\"" + (check ? " -Check -SelfTest" : "");
  info.WorkingDirectory = runtime;
  info.UseShellExecute = false;
  info.CreateNoWindow = true;
  info.RedirectStandardError = true;
  info.RedirectStandardOutput = true;
  info.EnvironmentVariables["MYSPACE_DATA_DIR"] = dataDir;
  info.EnvironmentVariables["MYSPACE_EXE"] = exePath;
  using (var process = new Process()) {
   process.StartInfo = info;
   DataReceivedEventHandler write = (s, e) => { if (e.Data == null) return; lock (logLock) File.AppendAllText(log, e.Data + Environment.NewLine, Encoding.UTF8); };
   process.OutputDataReceived += write;
   process.ErrorDataReceived += write;
   process.Start();
   process.BeginOutputReadLine();
   process.BeginErrorReadLine();
   process.WaitForExit();
   return process.ExitCode;
  }
 }
}
