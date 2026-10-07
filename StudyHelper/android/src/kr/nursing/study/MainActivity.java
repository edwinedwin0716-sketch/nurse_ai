package kr.nursing.study;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.Charset;

public class MainActivity extends Activity {
    private static final int PICK = 7;
    private WebView web;
    private WebView printView;
    private ValueCallback<Uri[]> chooser;
    private byte[] shared;          // 다른 앱에서 공유받은 파일
    private String sharedName = "";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.rgb(242, 242, 247));
        w.setNavigationBarColor(Color.rgb(242, 242, 247));
        if (Build.VERSION.SDK_INT >= 23) w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                openUrl(url);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // <input type=file> → 파일 고르기
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                    "application/pdf",
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    "application/hwp+zip", "application/haansofthwpx", "application/octet-stream" });
                try { startActivityForResult(i, PICK); }
                catch (Exception e) { chooser = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
        readShared(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (readShared(intent)) web.evaluateJavascript("window.onShared && window.onShared()", null);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == PICK && chooser != null) {
            Uri[] picked = null;
            if (result == RESULT_OK && data != null && data.getData() != null) picked = new Uri[] { data.getData() };
            chooser.onReceiveValue(picked);
            chooser = null;
            return;
        }
        super.onActivityResult(request, result, data);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else finish();
    }

    private boolean readShared(Intent intent) {
        if (intent == null) return false;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        else if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        if (uri == null) return false;
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            shared = out.toByteArray();
            sharedName = displayName(uri);
            return true;
        } catch (Exception e) {
            Toast.makeText(this, "파일을 열 수 없어요: " + e.getMessage(), Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private String displayName(Uri uri) {
        String name = null;
        try {
            Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null) { if (c.moveToFirst()) name = c.getString(0); c.close(); }
        } catch (Exception e) { }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "공유받은 파일.pdf";
        if (!name.contains(".")) name += ".pdf";
        return name;
    }

    private void openUrl(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception e) { Toast.makeText(this, "브라우저를 열 수 없어요", Toast.LENGTH_SHORT).show(); }
    }

    private class Bridge {
        // 공유받은 파일 정보 → JS가 조각(base64)으로 나눠 읽는다
        @JavascriptInterface
        public String sharedInfo() {
            if (shared == null) return "";
            return sharedName.replace("\\", "").replace("\"", "") + "|" + shared.length;
        }

        @JavascriptInterface
        public String sharedChunk(int offset, int length) {
            if (shared == null || offset >= shared.length) return "";
            int len = Math.min(length, shared.length - offset);
            return Base64.encodeToString(shared, offset, len, Base64.NO_WRAP);
        }

        @JavascriptInterface
        public void sharedDone() { shared = null; }

        @JavascriptInterface
        public void copy(String text) {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            cm.setPrimaryClip(ClipData.newPlainText("학습 정리", text));
        }

        @JavascriptInterface
        public void openUrl(String url) { MainActivity.this.openUrl(url); }

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

        // A4로 인쇄하거나 'PDF로 저장'
        @JavascriptInterface
        public void print(final String name, final String html, final boolean landscape) {
            runOnUiThread(new Runnable() { @Override public void run() {
                printView = new WebView(MainActivity.this);
                printView.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        PrintAttributes attrs = new PrintAttributes.Builder()
                                .setMediaSize(landscape ? PrintAttributes.MediaSize.ISO_A4.asLandscape() : PrintAttributes.MediaSize.ISO_A4)
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
