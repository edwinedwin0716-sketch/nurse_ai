using System;
using System.IO;
using System.Net;
using System.Threading;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Text;
using System.Windows.Forms;
using System.Runtime.InteropServices;

// Apple-style palette (light / dark)
public static class Theme {
 public static bool Dark;
 static Color C(int r,int g,int b){return Color.FromArgb(r,g,b);}
 public static Color Back {get{return Dark?C(30,30,32):C(245,245,247);}}
 public static Color Surface {get{return Dark?C(44,44,46):Color.White;}}
 public static Color Hover {get{return Dark?C(58,58,61):C(232,232,237);}}
 public static Color Text {get{return Dark?C(245,245,247):C(29,29,31);}}
 public static Color Secondary {get{return Dark?C(152,152,157):C(110,110,115);}}
 public static Color Separator {get{return Dark?C(62,62,65):C(214,214,219);}}
 public static Color Accent {get{return Dark?C(10,132,255):C(0,113,227);}}
 public static Color Segment {get{return Dark?C(50,50,53):C(228,228,233);}}
 public static Color SegmentOn {get{return Dark?C(99,99,102):Color.White;}}
 public static readonly Color[] Tints = {C(0,122,255),C(52,199,89),C(175,82,222),C(255,149,0),C(255,45,85),C(90,200,250),C(88,86,214)};
 public static Color Tint(string key){int h=0;foreach(char c in key??""){h=(h*31+c)&0x7fffffff;}return Tints[h%Tints.Length];}
 public static Font UI(float size,bool bold){return new Font("Segoe UI",size,bold?FontStyle.Bold:FontStyle.Regular);}
}

public static class Ui {
 public static GraphicsPath Round(Rectangle r,int radius){var p=new GraphicsPath();int d=Math.Max(1,Math.Min(radius*2,Math.Min(r.Width,r.Height)));p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 public static void Smooth(Graphics g){g.SmoothingMode=SmoothingMode.AntiAlias;g.InterpolationMode=InterpolationMode.HighQualityBicubic;g.PixelOffsetMode=PixelOffsetMode.HighQuality;g.TextRenderingHint=TextRenderingHint.ClearTypeGridFit;}
 public static void Fill(Graphics g,Rectangle r,int radius,Color c){using(var p=Round(r,radius))using(var b=new SolidBrush(c))g.FillPath(b,p);}
 [DllImport("dwmapi.dll")]static extern int DwmSetWindowAttribute(IntPtr hwnd,int attr,ref int value,int size);
 // Windows 11: smooth system-drawn rounded corners + shadow. Returns false on Windows 10.
 public static bool RoundCorners(IntPtr hwnd){try{int pref=2;return DwmSetWindowAttribute(hwnd,33,ref pref,4)==0;}catch{return false;}}
 [DllImport("uxtheme.dll",CharSet=CharSet.Unicode)]static extern int SetWindowTheme(IntPtr hwnd,string app,string id);
 // Slim modern (Windows 11 style) scrollbars, dark or light
 public static void ModernScroll(Control c,bool dark){try{SetWindowTheme(c.Handle,dark?"DarkMode_Explorer":"Explorer",null);}catch{}}
}

// Base for owner-drawn controls
public class SoftControl : Control {
 protected bool hover;
 public SoftControl(){SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.ResizeRedraw|ControlStyles.SupportsTransparentBackColor,true);SetStyle(ControlStyles.Selectable,false);Cursor=Cursors.Hand;}
 protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
 protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
 protected Color ParentBack {get{return Parent!=null?Parent.BackColor:Theme.Back;}}
}

// Launchpad-style tile: icon in a squircle, name underneath
public class AppTile : SoftControl {
 public Image Icon {get;set;}
 public string Subtitle {get;set;}
 public bool OwnsIcon {get;set;}
 bool pressed;
 public AppTile(){Size=new Size(104,108);Margin=new Padding(4);}
 protected override void OnMouseDown(MouseEventArgs e){pressed=true;Invalidate();base.OnMouseDown(e);}
 protected override void OnMouseUp(MouseEventArgs e){pressed=false;Invalidate();base.OnMouseUp(e);}
 // Website tiles: show the site's real logo (cached on disk, downloaded in the background)
 public void LoadWebIcon(string url,string cacheDir){
  Image cached=WebIcons.Cached(url,cacheDir);if(cached!=null){Icon=cached;OwnsIcon=true;return;}
  ThreadPool.QueueUserWorkItem(delegate{Image img=WebIcons.Download(url,cacheDir);if(img==null)return;
   try{if(IsDisposed||!IsHandleCreated){img.Dispose();return;}BeginInvoke((MethodInvoker)delegate{if(IsDisposed){img.Dispose();return;}if(Icon!=null&&OwnsIcon)Icon.Dispose();Icon=img;OwnsIcon=true;Invalidate();});}catch{img.Dispose();}});
 }
 protected override void Dispose(bool disposing){if(disposing&&OwnsIcon&&Icon!=null){Icon.Dispose();Icon=null;}base.Dispose(disposing);}
 protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;Ui.Smooth(g);g.Clear(ParentBack);
  if(hover||pressed)Ui.Fill(g,new Rectangle(2,2,Width-5,Height-5),18,pressed?Theme.Separator:Theme.Hover);
  var box=new Rectangle((Width-58)/2,pressed?13:12,58,58);
  if(Icon!=null){
   using(var p=Ui.Round(box,15)){using(var b=new SolidBrush(Theme.Surface))g.FillPath(b,p);using(var pen=new Pen(Theme.Separator))g.DrawPath(pen,p);}
   int s=Icon.Width>=48?44:Math.Max(32,Icon.Width);g.DrawImage(Icon,new Rectangle(box.X+(58-s)/2,box.Y+(58-s)/2,s,s));
  } else {
   var tint=Theme.Tint(Text);
   using(var p=Ui.Round(box,15))using(var b=new LinearGradientBrush(box,ControlPaint.Light(tint,0.35f),tint,90f))g.FillPath(b,p);
   string letter=string.IsNullOrEmpty(Text)?"?":Text.Substring(0,1).ToUpper();
   using(var f=Theme.UI(20,true))TextRenderer.DrawText(g,letter,f,box,Color.White,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
  }
  using(var f=Theme.UI(9,false))TextRenderer.DrawText(g,Text,f,new Rectangle(4,76,Width-8,22),Theme.Text,TextFormatFlags.HorizontalCenter|TextFormatFlags.EndEllipsis|TextFormatFlags.SingleLine|TextFormatFlags.NoPrefix);
 }
}

// macOS window buttons
public class TrafficLight : SoftControl {
 public Color Dot {get;set;}
 public string Glyph {get;set;}
 public bool On {get;set;}
 public TrafficLight(){Size=new Size(14,14);}
 protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;Ui.Smooth(g);g.Clear(ParentBack);
  using(var b=new SolidBrush(Dot))g.FillEllipse(b,1,1,12,12);
  using(var pen=new Pen(Color.FromArgb(40,0,0,0)))g.DrawEllipse(pen,1,1,12,12);
  if(hover||On)using(var f=new Font("Segoe UI",7f,FontStyle.Bold))TextRenderer.DrawText(g,Glyph??"",f,new Rectangle(0,0,14,14),Color.FromArgb(150,0,0,0),TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
 }
}

// Round icon button (Segoe MDL2 glyph)
public class RoundButton : SoftControl {
 public string Glyph {get;set;}
 public RoundButton(){Size=new Size(32,32);}
 protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;Ui.Smooth(g);g.Clear(ParentBack);
  if(hover)using(var b=new SolidBrush(Theme.Hover))g.FillEllipse(b,0,0,Width-1,Height-1);
  using(var f=new Font("Segoe MDL2 Assets",11f))TextRenderer.DrawText(g,Glyph??"",f,ClientRectangle,Theme.Text,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
 }
}

// Spotlight-style pill search box
public class PillSearch : Panel {
 public readonly TextBox Box=new TextBox();
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr SendMessage(IntPtr h,int msg,IntPtr w,string l);
 public PillSearch(){SetStyle(ControlStyles.OptimizedDoubleBuffer|ControlStyles.UserPaint|ControlStyles.AllPaintingInWmPaint|ControlStyles.ResizeRedraw,true);
  Size=new Size(240,32);Box.BorderStyle=BorderStyle.None;Box.Font=Theme.UI(10,false);Controls.Add(Box);
  Box.HandleCreated+=delegate{try{SendMessage(Box.Handle,0x1501,(IntPtr)1,"검색");}catch{}};
  Click+=delegate{Box.Focus();};}
 protected override void OnLayout(LayoutEventArgs e){base.OnLayout(e);Box.SetBounds(32,(Height-Box.PreferredHeight)/2,Width-44,Box.PreferredHeight);}
 public void Restyle(){Box.BackColor=Theme.Hover;Box.ForeColor=Theme.Text;Invalidate();}
 protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;Ui.Smooth(g);g.Clear(Parent!=null?Parent.BackColor:Theme.Back);
  Ui.Fill(g,new Rectangle(0,0,Width-1,Height-1),Height/2,Theme.Hover);
  using(var f=new Font("Segoe MDL2 Assets",9.5f))TextRenderer.DrawText(g,"",f,new Rectangle(10,0,20,Height),Theme.Secondary,TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding);
 }
}

// iOS segmented control for categories
public class Segmented : SoftControl {
 public string[] Items=new string[0];
 public string Selected;
 public event EventHandler SelectedChanged;
 Rectangle[] cells=new Rectangle[0];
 int hot=-1;
 public Segmented(){Height=32;}
 public void SetItems(string[] items,string selected){Items=items;Selected=selected;Measure();Invalidate();}
 void Measure(){cells=new Rectangle[Items.Length];int x=3;using(var f=Theme.UI(9.5f,false)){for(int i=0;i<Items.Length;i++){int w=TextRenderer.MeasureText(Items[i],f).Width+26;cells[i]=new Rectangle(x,3,w,Height-6);x+=w;}}Width=x+3;}
 protected override void OnMouseMove(MouseEventArgs e){int h=-1;for(int i=0;i<cells.Length;i++)if(cells[i].Contains(e.Location))h=i;if(h!=hot){hot=h;Invalidate();}base.OnMouseMove(e);}
 protected override void OnMouseLeave(EventArgs e){hot=-1;base.OnMouseLeave(e);}
 protected override void OnMouseClick(MouseEventArgs e){for(int i=0;i<cells.Length;i++)if(cells[i].Contains(e.Location)&&Items[i]!=Selected){Selected=Items[i];Invalidate();if(SelectedChanged!=null)SelectedChanged(this,EventArgs.Empty);}base.OnMouseClick(e);}
 protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;Ui.Smooth(g);g.Clear(ParentBack);
  Ui.Fill(g,new Rectangle(0,0,Width-1,Height-1),9,Theme.Segment);
  for(int i=0;i<cells.Length;i++){bool on=Items[i]==Selected;
   if(on){var r=cells[i];Ui.Fill(g,new Rectangle(r.X,r.Y+1,r.Width,r.Height),7,Color.FromArgb(Theme.Dark?60:22,0,0,0));Ui.Fill(g,r,7,Theme.SegmentOn);}
   else if(i==hot)Ui.Fill(g,cells[i],7,Color.FromArgb(Theme.Dark?30:90,Theme.SegmentOn));
   using(var f=Theme.UI(9.5f,on))TextRenderer.DrawText(g,Items[i],f,cells[i],on?Theme.Text:Theme.Secondary,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.NoPadding|TextFormatFlags.NoPrefix);
  }
 }
}

// Thin macOS-style slider (used for window opacity)
public class SlimSlider : SoftControl {
 int val=100;
 public int Minimum=30,Maximum=100;
 public event EventHandler ValueChanged;
 bool drag;
 public int Value {get{return val;}set{int v=Math.Max(Minimum,Math.Min(Maximum,value));if(v!=val){val=v;Invalidate();if(ValueChanged!=null)ValueChanged(this,EventArgs.Empty);}}}
 public SlimSlider(){Size=new Size(110,24);}
 int Knob(){return 8+(int)((Width-16)*(val-Minimum)/(double)Math.Max(1,Maximum-Minimum));}
 void Track(int x){Value=Minimum+(int)Math.Round((x-8)*(Maximum-Minimum)/(double)Math.Max(1,Width-16));}
 protected override void OnMouseDown(MouseEventArgs e){drag=true;Track(e.X);base.OnMouseDown(e);}
 protected override void OnMouseMove(MouseEventArgs e){if(drag)Track(e.X);base.OnMouseMove(e);}
 protected override void OnMouseUp(MouseEventArgs e){drag=false;base.OnMouseUp(e);}
 protected override void OnMouseWheel(MouseEventArgs e){Value+=e.Delta>0?5:-5;base.OnMouseWheel(e);}
 protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;Ui.Smooth(g);g.Clear(ParentBack);int cy=Height/2,k=Knob();
  Ui.Fill(g,new Rectangle(8,cy-2,Width-16,4),2,Theme.Separator);
  Ui.Fill(g,new Rectangle(8,cy-2,Math.Max(4,k-8),4),2,Theme.Accent);
  using(var b=new SolidBrush(Color.FromArgb(45,0,0,0)))g.FillEllipse(b,k-8,cy-7,16,16);
  using(var b=new SolidBrush(Color.White))g.FillEllipse(b,k-8,cy-8,16,16);
  using(var pen=new Pen(Color.FromArgb(30,0,0,0)))g.DrawEllipse(pen,k-8,cy-8,16,16);
 }
}

// Rounded, light context menus
public class AppleMenuRenderer : ToolStripProfessionalRenderer {
 protected override void OnRenderToolStripBackground(ToolStripRenderEventArgs e){using(var b=new SolidBrush(Theme.Surface))e.Graphics.FillRectangle(b,e.AffectedBounds);}
 protected override void OnRenderToolStripBorder(ToolStripRenderEventArgs e){var g=e.Graphics;Ui.Smooth(g);using(var p=Ui.Round(new Rectangle(0,0,e.ToolStrip.Width-1,e.ToolStrip.Height-1),8))using(var pen=new Pen(Theme.Separator))g.DrawPath(pen,p);}
 protected override void OnRenderImageMargin(ToolStripRenderEventArgs e){}
 protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e){if(!e.Item.Selected||!e.Item.Enabled)return;var g=e.Graphics;Ui.Smooth(g);Ui.Fill(g,new Rectangle(4,1,e.Item.Width-8,e.Item.Height-2),6,Theme.Accent);}
 protected override void OnRenderItemText(ToolStripItemTextRenderEventArgs e){e.TextColor=e.Item.Selected?Color.White:(e.Item.Enabled?Theme.Text:Theme.Secondary);base.OnRenderItemText(e);}
 protected override void OnRenderArrow(ToolStripArrowRenderEventArgs e){e.ArrowColor=e.Item.Selected?Color.White:Theme.Secondary;base.OnRenderArrow(e);}
 protected override void OnRenderItemCheck(ToolStripItemImageRenderEventArgs e){var g=e.Graphics;Ui.Smooth(g);using(var f=Theme.UI(9,true))TextRenderer.DrawText(g,"✓",f,e.ImageRectangle,e.Item.Selected?Color.White:Theme.Accent,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);}
 protected override void OnRenderSeparator(ToolStripSeparatorRenderEventArgs e){using(var pen=new Pen(Theme.Separator))e.Graphics.DrawLine(pen,10,e.Item.Height/2,e.Item.Width-10,e.Item.Height/2);}
 public static void Apply(ToolStrip strip){strip.Renderer=new AppleMenuRenderer();strip.Font=Theme.UI(9.5f,false);strip.Padding=new Padding(2,4,2,4);strip.ShowItemToolTips=false;}
}

// Half-filled circle: the "opacity" symbol next to the slider
public class OpacityGlyph : SoftControl {
 public OpacityGlyph(){Size=new Size(24,32);Cursor=Cursors.Default;}
 protected override void OnPaint(PaintEventArgs e){var g=e.Graphics;Ui.Smooth(g);g.Clear(ParentBack);
  var r=new Rectangle((Width-14)/2,(Height-14)/2,14,14);
  using(var b=new SolidBrush(Theme.Secondary))g.FillPie(b,r,90,180);
  using(var pen=new Pen(Theme.Secondary,1.4f))g.DrawEllipse(pen,r);
 }
}

// System-wide shortcut (Ctrl+Shift+Space by default) to show / hide the launcher
public class Hotkey : NativeWindow, IDisposable {
 [DllImport("user32.dll")]static extern bool RegisterHotKey(IntPtr h,int id,uint mods,uint key);
 [DllImport("user32.dll")]static extern bool UnregisterHotKey(IntPtr h,int id);
 public event EventHandler Pressed;
 public readonly bool Registered;
 public Hotkey(uint mods,uint key){CreateHandle(new CreateParams());Registered=RegisterHotKey(Handle,1,mods|0x4000,key);}
 protected override void WndProc(ref Message m){if(m.Msg==0x0312&&Pressed!=null)Pressed(this,EventArgs.Empty);base.WndProc(ref m);}
 public void Dispose(){if(Handle!=IntPtr.Zero){UnregisterHotKey(Handle,1);DestroyHandle();}}
}

public static class WebIcons {
 static string File(string url,string dir){Uri u;if(!Uri.TryCreate(url,UriKind.Absolute,out u))return null;return Path.Combine(dir,u.Host.ToLowerInvariant()+".png");}
 static Image Read(string path){try{var info=new FileInfo(path);if(!info.Exists||info.Length<100)return null;using(var src=Image.FromFile(path))return new Bitmap(src);}catch{return null;}}
 public static Image Cached(string url,string dir){string f=File(url,dir);return f==null?null:Read(f);}
 public static Image Download(string url,string dir){
  try{string f=File(url,dir);if(f==null)return null;Directory.CreateDirectory(dir);
   ServicePointManager.SecurityProtocol|=(SecurityProtocolType)3072;
   using(var web=new WebClient()){web.Headers[HttpRequestHeader.UserAgent]="MySpaceLauncher";
    byte[] data=web.DownloadData("https://www.google.com/s2/favicons?sz=128&domain_url="+Uri.EscapeDataString(url));
    if(data.Length<100)return null;
    using(var ms=new MemoryStream(data))using(var img=Image.FromStream(ms)){if(img.Width<32)return null;img.Save(f+".tmp",System.Drawing.Imaging.ImageFormat.Png);}
    if(System.IO.File.Exists(f))System.IO.File.Delete(f);System.IO.File.Move(f+".tmp",f);
    return Read(f);}
  }catch{return null;}
 }
}

public static class ShellImages {
 [DllImport("user32.dll",CharSet=CharSet.Unicode)]static extern IntPtr FindWindow(string cls,string title);
 [DllImport("user32.dll")]static extern bool ShowWindow(IntPtr window,int command);
 [DllImport("user32.dll")]static extern bool SetForegroundWindow(IntPtr window);
 public static void ActivateExisting(){var w=FindWindow(null,"간호과정 도우미");if(w!=IntPtr.Zero){ShowWindow(w,5);SetForegroundWindow(w);}}
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]struct Info {public IntPtr icon;public int index;public uint attributes;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)]public string name;[MarshalAs(UnmanagedType.ByValTStr,SizeConst=80)]public string type;}
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern IntPtr SHGetFileInfo(string path,uint attributes,out Info info,uint size,uint flags);
 [DllImport("shell32.dll")]static extern int SHGetImageList(int list,ref Guid riid,out IntPtr ppv);
 [DllImport("comctl32.dll")]static extern IntPtr ImageList_GetIcon(IntPtr himl,int i,int flags);
 [DllImport("user32.dll")]static extern bool DestroyIcon(IntPtr icon);
 static Bitmap FromHandle(IntPtr h){if(h==IntPtr.Zero)return null;try{return Icon.FromHandle(h).ToBitmap();}finally{DestroyIcon(h);}}
 [ComImport,Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IShellItemImageFactory {[PreserveSig]int GetImage(Size size,int flags,out IntPtr bitmap);}
 [DllImport("shell32.dll",CharSet=CharSet.Unicode)]static extern int SHCreateItemFromParsingName(string path,IntPtr bind,ref Guid riid,[MarshalAs(UnmanagedType.Interface)]out IShellItemImageFactory item);
 [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr obj);
 // Copies an HBITMAP keeping its alpha channel (Image.FromHbitmap drops it)
 static Bitmap WithAlpha(IntPtr h){
  using(var raw=Image.FromHbitmap(h)){
   if(Image.GetPixelFormatSize(raw.PixelFormat)<32)return new Bitmap(raw);
   var rect=new Rectangle(0,0,raw.Width,raw.Height);var data=raw.LockBits(rect,System.Drawing.Imaging.ImageLockMode.ReadOnly,raw.PixelFormat);
   try{using(var view=new Bitmap(data.Width,data.Height,data.Stride,System.Drawing.Imaging.PixelFormat.Format32bppArgb,data.Scan0)){
     bool alpha=false;for(int y=0;y<view.Height&&!alpha;y+=4)for(int x=0;x<view.Width;x+=4)if(view.GetPixel(x,y).A!=0){alpha=true;break;}
     return alpha?new Bitmap(view):new Bitmap(raw);}}
   finally{raw.UnlockBits(data);}
  }
 }
 // 64px icon/thumbnail from the shell. Accepts file paths and "shell:AppsFolder\..." names.
 public static Bitmap LoadLarge(string path){
  try{var iid=new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");IShellItemImageFactory item;
   if(SHCreateItemFromParsingName(path,IntPtr.Zero,ref iid,out item)!=0||item==null)return null;
   try{IntPtr h;if(item.GetImage(new Size(64,64),0,out h)!=0||h==IntPtr.Zero)return null;try{return WithAlpha(h);}finally{DeleteObject(h);}}
   finally{Marshal.ReleaseComObject(item);}
  }catch{return null;}
 }
 // Best available icon: 64px shell image, then 48px, then 32px
 public static Bitmap Load(string path){Bitmap large=LoadLarge(path);if(large!=null)return large;Info i;
  try{if(SHGetFileInfo(path,0,out i,(uint)Marshal.SizeOf(typeof(Info)),0x4000)!=IntPtr.Zero){var iid=new Guid("46EB5926-582E-4017-9FDF-E8998DAA0950");IntPtr list;if(SHGetImageList(2,ref iid,out list)==0&&list!=IntPtr.Zero){var b=FromHandle(ImageList_GetIcon(list,i.index,1));if(b!=null)return b;}}}catch{}
  if(SHGetFileInfo(path,0,out i,(uint)Marshal.SizeOf(typeof(Info)),0x100)==IntPtr.Zero)return null;return FromHandle(i.icon);}
}
