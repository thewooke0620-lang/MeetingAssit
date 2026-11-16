package io.github.thewooke0620.meetingassit;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;

// 회의 중 화면이 꺼지면 마이크 듣기가 멈추므로, 앱이 켜져 있는 동안 화면을 켜 둔다
// 웹 화면에서 부르는 것 (window.MeetingNative):
//   keepRecording(true/false): '앱을 나가도 계속 듣기' 알림 서비스(MeetingService)를 켜고 끈다
//   canCapture / startCapture / stopCapture: 폰 소리 듣기(실험, CaptureService). 받은 소리는 window.__phonePcm(base64) 로,
//     상태는 window.__phoneState("ok" | "stopped" | "error:이유") 로 넘긴다
//   canOverlay / requestOverlay / setFloat / floatLines: 앱 밖에서 떠 있는 자막 창(FloatWindow)
// 뒤로 단추: 웹 화면의 기록(열린 창 → 이전 탭)을 하나씩 되돌리고, 더 돌아갈 곳이 없으면 앱을 끄지 않고 뒤로 보낸다
public class MainActivity extends BridgeActivity {
  private static final int REQ_CAPTURE = 41, REQ_MIC_FOR_CAPTURE = 42;
  private volatile boolean keeping = false;
  private volatile boolean floatOn = true;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    // 화면을 위쪽 상태 표시줄과 아래쪽 단추 줄 사이에만 그린다 (안드로이드 15 이상은 기본으로 그 밑까지 그려 겹친다)
    // 키보드가 올라오면 그만큼 아래를 비워 입력칸이 가리지 않게 한다
    getWindow().getDecorView().setBackgroundColor(0xFF10161F);
    View content = findViewById(android.R.id.content);
    ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
      Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
      Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
      v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
      return WindowInsetsCompat.CONSUMED;
    });
    try { WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(false); } catch (Throwable e) {}
    WebView web = getBridge().getWebView();
    web.addJavascriptInterface(new NativeBridge(), "MeetingNative");
    getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
      @Override
      public void handleOnBackPressed() {
        WebView w = getBridge().getWebView();
        if (w != null && w.canGoBack()) w.goBack();
        else moveTaskToBack(true);
      }
    });
    // 폰 소리: 0.1초 조각을 웹 화면에 넘긴다
    CaptureService.sink = new CaptureService.Sink() {
      @Override public void onPcm(byte[] pcm) {
        final String b64 = Base64.encodeToString(pcm, Base64.NO_WRAP);
        js("window.__phonePcm&&window.__phonePcm('" + b64 + "')");
      }
      @Override public void onState(String s) { phoneState(s); }
    };
    // 떠 있는 자막 창의 '정지'
    FloatWindow.cmd = (c) -> js("window.__nativeCmd&&window.__nativeCmd(" + JSONObject.quote(c) + ")");
    // 안드로이드 13 이상: '회의 기록 중' 알림을 보이려면 알림 권한이 필요하다 (거부해도 기록은 된다)
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7);
    }
  }

  private void js(final String code) {
    final WebView w = getBridge() == null ? null : getBridge().getWebView();
    if (w != null) w.post(() -> w.evaluateJavascript(code, null));
  }
  private void phoneState(String s) { js("window.__phoneState&&window.__phoneState(" + JSONObject.quote(s) + ")"); }

  // 앱을 나가면 웹 화면이 멈추는데, 회의 기록 중이면 다시 깨워 계속 듣게 한다
  @Override
  public void onPause() {
    super.onPause();
    if (keeping) {
      WebView web = getBridge().getWebView();
      web.onResume();
      web.resumeTimers();
    }
  }

  // 회의 중에 앱을 벗어나면 떠 있는 자막 창을 띄우고, 돌아오면 닫는다
  @Override
  public void onStop() {
    super.onStop();
    if (keeping && floatOn && FloatWindow.allowed(this)) FloatWindow.show(this);
  }

  @Override
  public void onStart() {
    super.onStart();
    FloatWindow.hide();
  }

  @Override
  public void onDestroy() {
    stopService(new Intent(this, MeetingService.class));
    stopService(new Intent(this, CaptureService.class));
    FloatWindow.hide();
    super.onDestroy();
  }

  private void beginCapture() {
    if (Build.VERSION.SDK_INT < 29) { phoneState("error:폰 소리 듣기는 안드로이드 10 이상에서만 됩니다."); return; }
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] { Manifest.permission.RECORD_AUDIO }, REQ_MIC_FOR_CAPTURE);
      return;
    }
    askProjection();
  }

  @SuppressWarnings("deprecation")
  private void askProjection() {
    try {
      MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
      startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE);
    } catch (Throwable e) { phoneState("error:캡처 허용 창을 열지 못했습니다 (" + e.getMessage() + ")"); }
  }

  @Override
  public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    if (requestCode == REQ_MIC_FOR_CAPTURE) {
      if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) askProjection();
      else phoneState("error:소리 권한이 거부되었습니다. 휴대폰 설정 → 애플리케이션 → 회의통역 → 권한에서 마이크를 허용해 주세요.");
    }
  }

  @Override
  @SuppressWarnings("deprecation")
  protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    super.onActivityResult(requestCode, resultCode, data);
    if (requestCode != REQ_CAPTURE) return;
    if (resultCode != RESULT_OK || data == null) { phoneState("error:소리 캡처를 허용하지 않아 시작하지 못했습니다."); return; }
    Intent it = new Intent(this, CaptureService.class).putExtra("code", resultCode).putExtra("data", data);
    try {
      if (Build.VERSION.SDK_INT >= 26) startForegroundService(it); else startService(it);
    } catch (Throwable e) { phoneState("error:폰 소리 듣기를 시작하지 못했습니다 (" + e.getMessage() + ")"); }
  }

  private class NativeBridge {
    @JavascriptInterface
    public void keepRecording(final boolean on) {
      keeping = on;
      if (!on) FloatWindow.hide();
      runOnUiThread(() -> {
        Intent it = new Intent(MainActivity.this, MeetingService.class);
        if (on) {
          try { if (Build.VERSION.SDK_INT >= 26) startForegroundService(it); else startService(it); } catch (Throwable e) {}
        } else {
          stopService(it);
        }
      });
    }

    @JavascriptInterface
    public boolean canCapture() { return Build.VERSION.SDK_INT >= 29; }

    @JavascriptInterface
    public void startCapture() { runOnUiThread(() -> beginCapture()); }

    @JavascriptInterface
    public void stopCapture() { runOnUiThread(() -> stopService(new Intent(MainActivity.this, CaptureService.class))); }

    @JavascriptInterface
    public boolean canOverlay() { return FloatWindow.allowed(MainActivity.this); }

    @JavascriptInterface
    public void requestOverlay() {
      runOnUiThread(() -> {
        try {
          if (Build.VERSION.SDK_INT >= 23) startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
        } catch (Throwable e) {}
      });
    }

    @JavascriptInterface
    public void setFloat(boolean on) { floatOn = on; if (!on) FloatWindow.hide(); }

    @JavascriptInterface
    public void floatLines(String json) { FloatWindow.setData(json); }

    // ChatGPT·Claude 앱에 글을 넘겨 연다 (공유하기). 그 앱이 없으면 false
    @JavascriptInterface
    public boolean shareTo(String pkg, String text) {
      try {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, text);
        i.setPackage(pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
        return true;
      } catch (Throwable e) { return false; }
    }
  }
}
