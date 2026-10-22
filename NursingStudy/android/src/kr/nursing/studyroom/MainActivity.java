package kr.nursing.studyroom;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.util.Locale;

// 간호 공부방: assets/index.html 을 띄우고, 유튜브·깃허브 같은 바깥 주소는 다른 앱으로 연다.
// 가상 EMR의 환자 말은 기기 음성 엔진(TextToSpeech)으로 읽는다 (WebView에는 음성 기능이 없어서).
public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private WebView web;
    private TextToSpeech tts;
    private boolean ttsReady;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        tts = new TextToSpeech(this, this);
        web = new WebView(this);
        web.setBackgroundColor(0xFF0B1430);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "열 수 있는 앱이 없어요", Toast.LENGTH_SHORT).show(); }
                return true;
            }
        });
        web.addJavascriptInterface(new Voice(), "Android");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            int r = tts.setLanguage(Locale.KOREAN);
            ttsReady = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
        }
    }

    class Voice {
        @JavascriptInterface
        public void speak(String text, float pitch, float rate) {
            if (!ttsReady) return;
            tts.setPitch(pitch);
            tts.setSpeechRate(rate);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "line");
        }

        @JavascriptInterface
        public void stopSpeak() { if (tts != null) tts.stop(); }
    }

    @Override
    protected void onPause() { super.onPause(); if (tts != null) tts.stop(); }

    @Override
    protected void onDestroy() { if (tts != null) tts.shutdown(); super.onDestroy(); }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.onBack ? window.onBack() : false", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) { if (!"true".equals(value)) finish(); }
        });
    }
}
