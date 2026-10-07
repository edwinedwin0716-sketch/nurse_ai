package kr.nursing.helper;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private WebView web;
    private WebView printView;
    private static final Pattern KEY = Pattern.compile("AIza[0-9A-Za-z_\\-]{35}");

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(242, 242, 247));
        w.setNavigationBarColor(Color.rgb(249, 249, 251));
        if (Build.VERSION.SDK_INT >= 23) w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                openUrl(url);
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
    }

    // Android 10부터 클립보드는 앱 창에 포커스가 있을 때만 읽을 수 있다
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && web != null) web.evaluateJavascript("window.onResumeApp && window.onResumeApp()", null);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? window.onBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) finish();
            }
        });
    }

    private void openUrl(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception e) { Toast.makeText(this, "브라우저를 열 수 없어요", Toast.LENGTH_SHORT).show(); }
    }

    private class Bridge {
        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("간호과정", text));
        }

        // 클립보드에 Gemini API 키가 있으면 돌려준다 (사용 여부는 화면에서 사용자에게 묻는다)
        @JavascriptInterface
        public String clipboardKey() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (!cm.hasPrimaryClip() || cm.getPrimaryClip().getItemCount() == 0) return "";
                CharSequence t = cm.getPrimaryClip().getItemAt(0).coerceToText(MainActivity.this);
                if (t == null) return "";
                Matcher m = KEY.matcher(t);
                return m.find() ? m.group() : "";
            } catch (Exception e) { return ""; }
        }

        // 클립보드의 글 전체 (외부 AI 답변 가져오기용, 화면에서 사용자에게 먼저 묻는다)
        @JavascriptInterface
        public String clipboardText() {
            try {
                ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
                if (!cm.hasPrimaryClip() || cm.getPrimaryClip().getItemCount() == 0) return "";
                CharSequence t = cm.getPrimaryClip().getItemAt(0).coerceToText(MainActivity.this);
                return t == null ? "" : t.toString();
            } catch (Exception e) { return ""; }
        }

        // ChatGPT·Claude 앱으로 요청문 보내기: 앱에 공유 → 앱 실행 → 웹 순서로 시도
        @JavascriptInterface
        public String openAi(String pkg, String text, String webUrl) {
            copy(text);
            try {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.setPackage(pkg);
                send.putExtra(Intent.EXTRA_TEXT, text);
                if (send.resolveActivity(getPackageManager()) != null) { startActivity(send); return "shared"; }
            } catch (Exception e) { }
            try {
                Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
                if (launch != null) { startActivity(launch); return "opened"; }
            } catch (Exception e) { }
            MainActivity.this.openUrl(webUrl);
            return "web";
        }

        @JavascriptInterface
        public void share(String title, String text) {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, title);
            i.putExtra(Intent.EXTRA_TEXT, text);
            startActivity(Intent.createChooser(i, "공유"));
        }

        @JavascriptInterface
        public void openUrl(String url) { MainActivity.this.openUrl(url); }

        // 다운로드 폴더에 저장 (Android 10 이상은 권한 없이 저장)
        @JavascriptInterface
        public String saveFile(String name, String mime, String content) {
            byte[] data = content.getBytes(Charset.forName("UTF-8"));
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver cr = getContentResolver();
                    ContentValues v = new ContentValues();
                    v.put("_display_name", name);
                    v.put("mime_type", mime);
                    v.put("relative_path", Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = cr.insert(Uri.parse("content://media/external/downloads"), v);
                    if (uri == null) throw new Exception("저장 위치를 만들 수 없어요");
                    OutputStream out = cr.openOutputStream(uri);
                    out.write(data);
                    out.close();
                    return "다운로드 폴더에 저장했어요: " + name;
                }
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getFilesDir();
                File f = new File(dir, name);
                FileOutputStream out = new FileOutputStream(f);
                out.write(data);
                out.close();
                return "저장했어요: " + f.getAbsolutePath();
            } catch (Exception e) {
                return "저장하지 못했어요: " + e.getMessage();
            }
        }

        // 인쇄하거나 'PDF로 저장' (B4 워크북은 B4 가로, 제출 양식은 A4 세로)
        @JavascriptInterface
        public void print(final String name, final String html, final boolean landscape) {
            runOnUiThread(new Runnable() { @Override public void run() {
                printView = new WebView(MainActivity.this);
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(landscape ? PrintAttributes.MediaSize.ISO_B4.asLandscape() : PrintAttributes.MediaSize.ISO_A4)
                                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                .build();
                        pm.print(name, view.createPrintDocumentAdapter(name), attrs);
                    }
                });
                printView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            }});
        }
    }
}
