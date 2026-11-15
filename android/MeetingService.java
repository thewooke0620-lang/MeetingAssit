package io.github.thewooke0620.meetingassit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

// '회의 기록 중' 알림을 띄워 두는 포그라운드 서비스 (마이크 종류)
// 이 서비스가 떠 있는 동안 안드로이드가 앱을 백그라운드로 보내도 마이크를 계속 쓸 수 있다
public class MeetingService extends Service {
  private static final String CH = "meeting";
  private static final int ID = 1001;

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
      NotificationChannel c = new NotificationChannel(CH, "회의 기록", NotificationManager.IMPORTANCE_LOW);
      c.setDescription("회의를 듣고 있을 때 표시합니다");
      nm.createNotificationChannel(c);
    }
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
    Notification n = b.setContentTitle("회의 기록 중")
      .setContentText("앱을 나가도 계속 듣고 있습니다. 눌러서 돌아가기")
      .setSmallIcon(getApplicationInfo().icon)
      .setContentIntent(pi)
      .setOngoing(true)
      .build();
    // 마이크 권한이 없으면(폰 소리만 듣는 경우 등) 마이크 종류로 띄울 수 없으므로 종류 없이 띄운다
    try {
      if (Build.VERSION.SDK_INT >= 30) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
      else startForeground(ID, n);
    } catch (Throwable e) {
      try { startForeground(ID, n); } catch (Throwable e2) { stopSelf(); }
    }
    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy() {
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }
}
