package kr.nursing.hwp;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
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

// HWP 편집기: 편집 화면(웹)을 띄우고, 파일 열기·저장·인쇄·공유를 맡는다.
public class MainActivity extends Activity {
    private static final int OPEN = 11, SAVE_AS = 12, EXPORT = 13, PICK = 14;
    private WebView web;
    private WebView printView;
    private ValueCallback<Uri[]> chooser;

    private byte[] loaded;           // 연 파일 (JS가 조각으로 가져간다)
    private Uri currentUri;          // 덮어쓸 수 있는 지금 문서
    private byte[] pending;          // 저장 위치를 고르는 동안 기다리는 내용
    private String pendingName = "";
    private Intent startIntent;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.WHITE);
        w.setNavigationBarColor(Color.WHITE);
        w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                openUrl(url);
                return true;
            }
            @Override
            public void onPageFinished(WebView view, String url) {
                if (startIntent != null) { Intent i = startIntent; startIntent = null; readIntent(i); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // 그림 넣기(<input type=file>)
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                i.setType(types != null && types.length > 0 && types[0].startsWith("image") ? "image/*" : "*/*");
                try { startActivityForResult(i, PICK); }
                catch (Exception e) { chooser = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
        startIntent = getIntent();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        readIntent(intent);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.HwpNative ? window.HwpNative.onBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) { if (!"true".equals(value)) finish(); }
        });
    }

    // 다른 앱에서 '열기'·'공유'로 받은 파일
    private void readIntent(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        else if (Intent.ACTION_VIEW.equals(intent.getAction())) uri = intent.getData();
        if (uri == null) return;
        boolean writable = (intent.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0;
        openUri(uri, writable);
    }

    private boolean openUri(Uri uri, boolean writable) {
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[65536];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            loaded = out.toByteArray();
            currentUri = writable ? uri : null;
            String name = displayName(uri);
            js("window.HwpNative.onOpened(" + q(name) + "," + loaded.length + "," + writable + "," + q(uri.toString()) + ")");
            return true;
        } catch (Exception e) {
            toast("파일을 열 수 없어요: " + e.getMessage());
            return false;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        if (request == PICK) {
            if (chooser != null) {
                Uri[] picked = null;
                if (result == RESULT_OK && data != null && data.getData() != null) picked = new Uri[] { data.getData() };
                chooser.onReceiveValue(picked);
                chooser = null;
            }
            return;
        }
        if (result != RESULT_OK || data == null || data.getData() == null) {
            pending = null;
            return;
        }
        Uri uri = data.getData();
        if (request == OPEN) {
            boolean writable = false;
            try {
                getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                writable = true;
            } catch (Exception e) {
                try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception x) { }
            }
            openUri(uri, writable);
        } else if (request == SAVE_AS || request == EXPORT) {
            byte[] body = pending;
            pending = null;
            if (body == null) return;
            String err = write(uri, body);
            if (request == SAVE_AS) {
                if (err == null) {
                    try { getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION); } catch (Exception e) { }
                    currentUri = uri;
                    js("window.HwpNative.onSaved(true," + q(displayName(uri)) + ",'',true)");
                } else js("window.HwpNative.onSaved(false,''," + q("저장하지 못했어요: " + err) + ",false)");
            } else {
                js("window.HwpNative.onExported(" + (err == null) + "," + q(err == null ? "저장했어요: " + displayName(uri) : "저장하지 못했어요: " + err) + ")");
            }
        }
    }

    // 덮어쓰기: 공급자마다 지원하는 모드가 달라 차례로 시도한다
    private String write(Uri uri, byte[] body) {
        String[] modes = { "wt", "rwt", "w" };
        String last = "알 수 없는 문제";
        for (String m : modes) {
            try {
                ParcelFileDescriptor pfd = getContentResolver().openFileDescriptor(uri, m);
                if (pfd == null) continue;
                FileOutputStream out = new FileOutputStream(pfd.getFileDescriptor());
                if (m.equals("w")) { try { out.getChannel().truncate(0); } catch (Exception e) { } }
                out.write(body);
                out.flush();
                out.getFD().sync();
                out.close();
                pfd.close();
                return null;
            } catch (Exception e) {
                last = e.getMessage();
            }
        }
        return last;
    }

    private void createDocument(int request, String name, String mime) {
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType(mime);
        i.putExtra(Intent.EXTRA_TITLE, name);
        try { startActivityForResult(i, request); }
        catch (Exception e) { pending = null; toast("저장 위치를 고를 수 없어요"); }
    }

    private String displayName(Uri uri) {
        String name = null;
        try {
            Cursor c = getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (c != null) { if (c.moveToFirst()) name = c.getString(0); c.close(); }
        } catch (Exception e) { }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "문서.hwp";
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        return name;
    }

    private void js(final String code) {
        runOnUiThread(new Runnable() { @Override public void run() { web.evaluateJavascript(code, null); } });
    }

    private static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' || c == '\\') b.append('\\').append(c);
            else if (c < 32 || c == 0x2028 || c == 0x2029) b.append(String.format("\\u%04x", (int) c));
            else b.append(c);
        }
        return b.append('"').toString();
    }

    private void toast(final String msg) {
        runOnUiThread(new Runnable() { @Override public void run() { Toast.makeText(MainActivity.this, msg, Toast.LENGTH_LONG).show(); } });
    }

    private void openUrl(String url) {
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
        catch (Exception e) { toast("브라우저를 열 수 없어요"); }
    }

    private class Bridge {
        @JavascriptInterface
        public void openDoc() {
            Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType("*/*");
            i.putExtra(Intent.EXTRA_MIME_TYPES, new String[] { "application/x-hwp", "application/haansofthwp", "application/vnd.hancom.hwp", "application/hwp",
                "application/hwp+zip", "application/haansofthwpx", "application/vnd.hancom.hwpx", "application/octet-stream", "application/zip", "text/plain", "text/html" });
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
            try { startActivityForResult(i, OPEN); } catch (Exception e) { toast("파일 고르기를 열 수 없어요"); }
        }

        @JavascriptInterface
        public String chunk(int offset, int length) {
            if (loaded == null || offset >= loaded.length) return "";
            int len = Math.min(length, loaded.length - offset);
            return Base64.encodeToString(loaded, offset, len, Base64.NO_WRAP);
        }

        @JavascriptInterface
        public void chunkDone() { loaded = null; }

        @JavascriptInterface
        public void pendingFile() { }

        @JavascriptInterface
        public boolean openRecent(final String uri) {
            final Uri u = Uri.parse(uri);
            runOnUiThread(new Runnable() { @Override public void run() {
                boolean writable = false;
                try {
                    for (android.content.UriPermission p : getContentResolver().getPersistedUriPermissions())
                        if (p.getUri().equals(u) && p.isWritePermission()) writable = true;
                } catch (Exception e) { }
                openUri(u, writable);
            }});
            return true;
        }

        // 저장: 덮어쓸 수 있으면 그 파일에, 아니면 저장 위치를 고른다
        @JavascriptInterface
        public void saveDoc(final String name, String b64, final boolean asNew) {
            final byte[] body = Base64.decode(b64, Base64.DEFAULT);
            runOnUiThread(new Runnable() { @Override public void run() {
                if (!asNew && currentUri != null) {
                    String err = write(currentUri, body);
                    if (err == null) { js("window.HwpNative.onSaved(true," + q(displayName(currentUri)) + ",'',true)"); return; }
                }
                pending = body;
                pendingName = name;
                createDocument(SAVE_AS, name, "application/hwp+zip");
            }});
        }

        @JavascriptInterface
        public void exportFile(final String name, final String mime, String b64) {
            final byte[] body = Base64.decode(b64, Base64.DEFAULT);
            runOnUiThread(new Runnable() { @Override public void run() {
                pending = body;
                createDocument(EXPORT, name, mime);
            }});
        }

        // 카카오톡·메일 등으로 보내기
        @JavascriptInterface
        public void share(final String name, final String mime, String b64) {
            final byte[] body = Base64.decode(b64, Base64.DEFAULT);
            runOnUiThread(new Runnable() { @Override public void run() {
                try {
                    File dir = new File(getCacheDir(), "share");
                    dir.mkdirs();
                    File[] old = dir.listFiles();
                    if (old != null) for (File f : old) f.delete();
                    File f = new File(dir, name.replace('/', '_'));
                    OutputStream out = new FileOutputStream(f);
                    out.write(body);
                    out.close();
                    Uri uri = Uri.parse("content://kr.nursing.hwp.share/" + Uri.encode(f.getName()));
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType(mime);
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(send, "문서 보내기"));
                } catch (Exception e) {
                    toast("보내지 못했어요: " + e.getMessage());
                }
            }});
        }

        @JavascriptInterface
        public String clipText() {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData c = cm.getPrimaryClip();
            if (c == null || c.getItemCount() == 0) return "";
            CharSequence t = c.getItemAt(0).coerceToText(MainActivity.this);
            return t == null ? "" : t.toString();
        }

        @JavascriptInterface
        public void openUrl(String url) { MainActivity.this.openUrl(url); }

        @JavascriptInterface
        public void exit() { runOnUiThread(new Runnable() { @Override public void run() { finish(); } }); }

        // 인쇄 또는 'PDF로 저장'
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
