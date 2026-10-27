package kr.nursing.hwp;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

// 카카오톡·내 파일 등에서 '열기'로 온 문서를 받는 화면.
// 파일을 앱 안(캐시)에 먼저 복사해 두고 편집기(MainActivity)로 넘긴다. 실패하면 이유를 창으로 보여 준다.
public class OpenActivity extends Activity {
    private TextView label;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Color.WHITE);
        ProgressBar spin = new ProgressBar(this);
        label = new TextView(this);
        label.setText("문서를 여는 중이에요…");
        label.setTextSize(16);
        label.setTextColor(Color.rgb(40, 40, 40));
        label.setGravity(Gravity.CENTER);
        label.setPadding(48, 32, 48, 0);
        box.addView(spin);
        box.addView(label);
        setContentView(box);

        final Intent in = getIntent();
        final Uri uri = uriOf(in);
        if (uri == null) { fail("받은 파일 주소가 없어요."); return; }
        final boolean writable = (in.getFlags() & Intent.FLAG_GRANT_WRITE_URI_PERMISSION) != 0;
        final String name = displayName(uri);
        label.setText("문서를 여는 중이에요…\n" + name);
        new Thread(new Runnable() { @Override public void run() {
            try {
                File dir = new File(getCacheDir(), "incoming");
                dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File f = new File(dir, "doc.bin");
                InputStream src = getContentResolver().openInputStream(uri);
                if (src == null) throw new Exception("파일을 읽을 수 없어요");
                OutputStream dst = new FileOutputStream(f);
                byte[] buf = new byte[65536];
                int n;
                long total = 0;
                while ((n = src.read(buf)) > 0) { dst.write(buf, 0, n); total += n; }
                src.close();
                dst.close();
                if (total == 0) throw new Exception("빈 파일이에요");
                final File done = f;
                runOnUiThread(new Runnable() { @Override public void run() { handOver(done, name, uri, writable); } });
            } catch (final Exception e) {
                runOnUiThread(new Runnable() { @Override public void run() { fail(e.getClass().getSimpleName() + ": " + e.getMessage()); } });
            }
        }}).start();
    }

    private void handOver(File f, String name, Uri uri, boolean writable) {
        Intent go = new Intent(this, MainActivity.class);
        go.setAction(MainActivity.OPEN_CACHED);
        go.putExtra("path", f.getAbsolutePath());
        go.putExtra("name", name);
        if (writable) {
            // 고친 뒤 원래 파일에 덮어쓸 수 있게 권한을 함께 넘긴다
            go.setData(uri);
            go.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            go.putExtra("writable", true);
        }
        go.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(go);
        finish();
    }

    private void fail(String why) {
        if (isFinishing()) return;
        new AlertDialog.Builder(this)
            .setTitle("문서를 열지 못했어요")
            .setMessage(why + "\n\n카톡에서 파일을 [저장]한 뒤, HWP 편집기의 [문서 열기]로 골라 보세요.")
            .setPositiveButton("확인", new DialogInterface.OnClickListener() {
                @Override public void onClick(DialogInterface d, int w) { finish(); }
            })
            .setOnCancelListener(new DialogInterface.OnCancelListener() {
                @Override public void onCancel(DialogInterface d) { finish(); }
            })
            .show();
    }

    static Uri uriOf(Intent intent) {
        if (intent == null) return null;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        else uri = intent.getData();
        // 주소를 ClipData에만 담아 보내는 앱도 있다
        if (uri == null && intent.getClipData() != null && intent.getClipData().getItemCount() > 0) uri = intent.getClipData().getItemAt(0).getUri();
        return uri;
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
}
