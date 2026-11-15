package io.github.thewooke0620.meetingassit;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

// 회의 중 화면이 꺼지면 마이크 듣기가 멈추므로, 앱이 켜져 있는 동안 화면을 켜 둔다
// 웹 화면은 window.MeetingNative.keepRecording(true/false) 로 '앱을 나가도 계속 듣기'를 켜고 끈다:
//   켜면 알림이 뜨는 포그라운드 서비스(MeetingService)를 띄워, 다른 앱을 보거나 화면을 잠가도 앱이 마이크를 계속 쓰게 한다
// 뒤로 단추: 웹 화면의 기록(열린 창 → 이전 탭)을 하나씩 되돌리고, 더 돌아갈 곳이 없으면 앱을 끄지 않고 뒤로 보낸다
public class MainActivity extends BridgeActivity {
  private volatile boolean keeping = false;

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
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
    // 안드로이드 13 이상: '회의 기록 중' 알림을 보이려면 알림 권한이 필요하다 (거부해도 기록은 된다)
    if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      requestPermissions(new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7);
    }
  }

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

  @Override
  public void onDestroy() {
    stopService(new Intent(this, MeetingService.class));
    super.onDestroy();
  }

  private class NativeBridge {
    @JavascriptInterface
    public void keepRecording(final boolean on) {
      keeping = on;
      runOnUiThread(() -> {
        Intent it = new Intent(MainActivity.this, MeetingService.class);
        if (on) {
          if (Build.VERSION.SDK_INT >= 26) startForegroundService(it); else startService(it);
        } else {
          stopService(it);
        }
      });
    }
  }
}
