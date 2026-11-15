package io.github.thewooke0620.meetingassit;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

// 회의 중 화면이 꺼지면 마이크 듣기가 멈추므로, 앱이 켜져 있는 동안 화면을 켜 둔다
public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }
}
