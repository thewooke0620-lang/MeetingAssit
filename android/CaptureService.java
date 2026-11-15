package io.github.thewooke0620.meetingassit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioPlaybackCaptureConfiguration;
import android.media.AudioRecord;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.util.Arrays;

// 폰 소리 듣기 (실험): 다른 앱이 재생하는 소리(이어폰으로 나가는 소리 포함)를 받아 웹 화면에 넘긴다
// 안드로이드 10 이상, '화면·소리 캡처' 허용이 필요하다.
// 안드로이드는 음악·영상·게임 소리만 캡처를 허용한다. 통화 소리(Teams·Zoom 통화 등)와
// 캡처를 막아 둔 앱의 소리는 들어오지 않는다 (조용한 소리만 들어온다).
public class CaptureService extends Service {
  public interface Sink {
    void onPcm(byte[] pcm);       // 16kHz, 16비트, 모노
    void onState(String state);   // "ok" / "stopped" / "error:이유"
  }
  public static volatile Sink sink;

  private static final String CH = "capture";
  private static final int ID = 1002;
  private MediaProjection mp;
  private AudioRecord rec;
  private Thread th;
  private volatile boolean run = false;

  private static void state(String s) { Sink k = sink; if (k != null) k.onState(s); }

  @Override
  @SuppressWarnings("deprecation")
  public int onStartCommand(Intent intent, int flags, int startId) {
    NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CH) == null) {
      NotificationChannel c = new NotificationChannel(CH, "폰 소리 듣기", NotificationManager.IMPORTANCE_LOW);
      c.setDescription("다른 앱의 소리를 받아 적고 있을 때 표시합니다");
      nm.createNotificationChannel(c);
    }
    Intent open = new Intent(this, MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
    PendingIntent pi = PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CH) : new Notification.Builder(this);
    Notification n = b.setContentTitle("폰 소리 듣는 중")
      .setContentText("다른 앱의 소리를 받아 적고 있습니다. 눌러서 돌아가기")
      .setSmallIcon(getApplicationInfo().icon)
      .setContentIntent(pi)
      .setOngoing(true)
      .build();
    try {
      if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
      else startForeground(ID, n);
    } catch (Throwable e) {
      state("error:알림을 띄우지 못해 폰 소리를 들을 수 없습니다 (" + e.getMessage() + ")");
      stopSelf();
      return START_NOT_STICKY;
    }
    if (Build.VERSION.SDK_INT < 29) {
      state("error:폰 소리 듣기는 안드로이드 10 이상에서만 됩니다.");
      stopSelf();
      return START_NOT_STICKY;
    }
    if (rec != null) { state("ok"); return START_NOT_STICKY; }   // 이미 듣는 중
    try {
      int code = intent.getIntExtra("code", 0);
      Intent data = intent.getParcelableExtra("data");
      MediaProjectionManager mpm = (MediaProjectionManager) getSystemService(MEDIA_PROJECTION_SERVICE);
      mp = mpm.getMediaProjection(code, data);
      if (mp == null) throw new IllegalStateException("캡처 허용을 받지 못했습니다");
      mp.registerCallback(new MediaProjection.Callback() {
        @Override public void onStop() { halt(); state("stopped"); stopSelf(); }
      }, new Handler(Looper.getMainLooper()));
      AudioPlaybackCaptureConfiguration cfg = new AudioPlaybackCaptureConfiguration.Builder(mp)
        .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
        .addMatchingUsage(AudioAttributes.USAGE_GAME)
        .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
        .build();
      AudioFormat fmt = new AudioFormat.Builder()
        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
        .setSampleRate(16000)
        .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
        .build();
      int min = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
      rec = new AudioRecord.Builder()
        .setAudioFormat(fmt)
        .setBufferSizeInBytes(Math.max(min, 3200 * 4))
        .setAudioPlaybackCaptureConfig(cfg)
        .build();
      rec.startRecording();
      run = true;
      final AudioRecord r = rec;
      th = new Thread(() -> {
        byte[] buf = new byte[3200];   // 0.1초
        while (run) {
          int got = r.read(buf, 0, buf.length);
          if (got < 0) break;
          Sink k = sink;
          if (got > 0 && k != null) k.onPcm(Arrays.copyOf(buf, got));
        }
      }, "phone-capture");
      th.start();
      state("ok");
    } catch (Throwable e) {
      halt();
      state("error:폰 소리를 받지 못했습니다 (" + e.getMessage() + ")");
      stopSelf();
    }
    return START_NOT_STICKY;
  }

  private void halt() {
    run = false;
    try { if (rec != null) { rec.stop(); rec.release(); } } catch (Throwable e) {}
    rec = null;
    MediaProjection m = mp; mp = null;   // stop() 이 onStop 을 다시 부르므로 먼저 비운다
    try { if (m != null) m.stop(); } catch (Throwable e) {}
  }

  @Override
  public void onDestroy() {
    halt();
    if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) { return null; }
}
