package io.github.thewooke0620.meetingassit;

import android.app.Dialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

// 앱 밖에서도 보이는 떠 있는 자막 창
// - 회의 중에 홈으로 나가거나 다른 앱을 보면 뜬다. 앱으로 돌아오면 사라진다.
// - 뒤가 흐리게 비치는 반투명 창 (안드로이드 12 이상에서 흐림, 그 아래는 반투명만)
// - 위쪽 막대를 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꾼다
// - '—' 를 누르면 동그란 버블로 작아지고, 버블을 누르면 다시 커진다 (버블도 끌어서 옮긴다)
// 자막은 웹 화면이 MeetingNative.floatLines(JSON) 으로 보내 준다
public final class FloatWindow {
  public interface Cmd { void run(String cmd); }   // "stop" 을 웹 화면에 전한다
  public static volatile Cmd cmd;

  private static final Handler H = new Handler(Looper.getMainLooper());
  private static Dialog dlg;
  private static Context app;
  private static boolean bubble = false;
  private static String data = "{}";
  private static LinearLayout linesBox;
  private static TextView stateText;

  private FloatWindow() {}

  public static boolean allowed(Context c) { return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(c); }

  public static void setData(String json) {
    data = json == null ? "{}" : json;
    H.post(FloatWindow::fill);
  }

  public static void show(Context c) {
    H.post(() -> {
      app = c.getApplicationContext();
      if (dlg != null || !allowed(app)) return;
      try { build(); } catch (Throwable e) { dlg = null; }
    });
  }

  public static void hide() {
    H.post(() -> {
      try { if (dlg != null) dlg.dismiss(); } catch (Throwable e) {}
      dlg = null; linesBox = null; stateText = null;
    });
  }

  private static int dp(float v) { return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, app.getResources().getDisplayMetrics())); }
  private static SharedPreferences prefs() { return app.getSharedPreferences("float", Context.MODE_PRIVATE); }

  private static boolean blurOk() {
    if (Build.VERSION.SDK_INT < 31) return false;
    try { return ((WindowManager) app.getSystemService(Context.WINDOW_SERVICE)).isCrossWindowBlurEnabled(); } catch (Throwable e) { return false; }
  }

  private static void build() {
    dlg = new Dialog(app, android.R.style.Theme_DeviceDefault_Dialog_NoActionBar);
    Window w = dlg.getWindow();
    w.setType(Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE);
    w.clearFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
    // 창 밖을 누르면 뒤의 앱이 그대로 받는다 (키보드도 뺏지 않는다)
    w.addFlags(WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL | WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE);
    w.setGravity(Gravity.TOP | Gravity.START);
    w.setWindowAnimations(0);
    dlg.setCancelable(false);
    dlg.setCanceledOnTouchOutside(false);
    dlg.setContentView(new FrameLayout(app));
    dlg.show();
    if (bubble) asBubble(); else asPanel();
  }

  private static void place(int width, int height) {
    Window w = dlg.getWindow();
    WindowManager.LayoutParams a = w.getAttributes();
    a.x = prefs().getInt(bubble ? "bx" : "x", dp(12));
    a.y = prefs().getInt(bubble ? "by" : "y", dp(80));
    a.width = width; a.height = height;
    w.setAttributes(a);
  }

  // 펼친 창: 위쪽 막대(시간·앱 열기·버블로·정지) + 자막 + 크기 조절 모서리
  private static void asPanel() {
    bubble = false;
    Window w = dlg.getWindow();
    boolean blur = blurOk();
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(blur ? 0x8C10161F : 0xE610161F);
    bg.setCornerRadius(dp(18));
    bg.setStroke(dp(1), 0x33FFFFFF);
    w.setBackgroundDrawable(bg);
    if (Build.VERSION.SDK_INT >= 31) { try { w.setBackgroundBlurRadius(blur ? dp(26) : 0); } catch (Throwable e) {} }

    FrameLayout root = new FrameLayout(app);
    LinearLayout col = new LinearLayout(app);
    col.setOrientation(LinearLayout.VERTICAL);
    col.setPadding(dp(14), dp(8), dp(14), dp(12));

    LinearLayout bar = new LinearLayout(app);
    bar.setGravity(Gravity.CENTER_VERTICAL);
    View dot = new View(app);
    GradientDrawable dg = new GradientDrawable(); dg.setShape(GradientDrawable.OVAL); dg.setColor(0xFFF2B84B);
    dot.setBackground(dg);
    bar.addView(dot, new LinearLayout.LayoutParams(dp(9), dp(9)));
    stateText = new TextView(app);
    stateText.setTextColor(0xFFC9D2DE); stateText.setTextSize(12.5f);
    stateText.setPadding(dp(8), 0, 0, 0);
    bar.addView(stateText, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
    bar.addView(chip("앱", v -> openApp()));
    bar.addView(chip("—", v -> { saveSize(); dlg.setContentView(new FrameLayout(app)); asBubble(); }));
    TextView stop = chip("■ 정지", v -> { Cmd c = cmd; if (c != null) c.run("stop"); });
    stop.setTextColor(0xFF1B1305);
    GradientDrawable sb = new GradientDrawable(); sb.setColor(0xFFF2B84B); sb.setCornerRadius(dp(8)); stop.setBackground(sb);
    bar.addView(stop);
    dragBy(bar, false);
    col.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(34)));

    linesBox = new LinearLayout(app);
    linesBox.setOrientation(LinearLayout.VERTICAL);
    linesBox.setGravity(Gravity.BOTTOM);
    col.addView(linesBox, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
    root.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    // 오른쪽 아래: 끌어서 크기 바꾸기
    TextView grip = new TextView(app);
    grip.setText("◢"); grip.setTextColor(0x88FFFFFF); grip.setTextSize(13f); grip.setGravity(Gravity.CENTER);
    FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(dp(30), dp(30), Gravity.BOTTOM | Gravity.END);
    root.addView(grip, gp);
    grip.setOnTouchListener(new View.OnTouchListener() {
      float sx, sy; int sw, sh;
      @Override public boolean onTouch(View v, MotionEvent e) {
        WindowManager.LayoutParams a = dlg.getWindow().getAttributes();
        if (e.getAction() == MotionEvent.ACTION_DOWN) { sx = e.getRawX(); sy = e.getRawY(); sw = a.width; sh = a.height; return true; }
        if (e.getAction() == MotionEvent.ACTION_MOVE) {
          int maxW = app.getResources().getDisplayMetrics().widthPixels;
          a.width = Math.max(dp(200), Math.min(maxW, sw + Math.round(e.getRawX() - sx)));
          a.height = Math.max(dp(110), sh + Math.round(e.getRawY() - sy));
          dlg.getWindow().setAttributes(a);
          return true;
        }
        if (e.getAction() == MotionEvent.ACTION_UP) { saveSize(); return true; }
        return false;
      }
    });

    dlg.setContentView(root);
    int defW = app.getResources().getDisplayMetrics().widthPixels - dp(24);
    place(prefs().getInt("w", defW), prefs().getInt("h", dp(190)));
    fill();
  }

  // 작은 버블: 누르면 펼치고, 끌면 옮긴다
  private static void asBubble() {
    bubble = true;
    linesBox = null; stateText = null;
    Window w = dlg.getWindow();
    GradientDrawable bg = new GradientDrawable();
    bg.setShape(GradientDrawable.OVAL);
    bg.setColor(0xF010161F);
    bg.setStroke(dp(2), 0xFFF2B84B);
    w.setBackgroundDrawable(bg);
    if (Build.VERSION.SDK_INT >= 31) { try { w.setBackgroundBlurRadius(0); } catch (Throwable e) {} }
    TextView b = new TextView(app);
    b.setText("통역"); b.setTextColor(Color.WHITE); b.setTextSize(13f); b.setTypeface(Typeface.DEFAULT_BOLD); b.setGravity(Gravity.CENTER);
    dragBy(b, true);
    dlg.setContentView(b);
    place(dp(60), dp(60));
  }

  // 끌어서 옮기기. tapToOpen 이면 거의 움직이지 않고 뗐을 때 펼친다
  private static void dragBy(View v, boolean tapToOpen) {
    v.setOnTouchListener(new View.OnTouchListener() {
      float sx, sy; int ox, oy; boolean moved;
      @Override public boolean onTouch(View view, MotionEvent e) {
        WindowManager.LayoutParams a = dlg.getWindow().getAttributes();
        switch (e.getAction()) {
          case MotionEvent.ACTION_DOWN: sx = e.getRawX(); sy = e.getRawY(); ox = a.x; oy = a.y; moved = false; return true;
          case MotionEvent.ACTION_MOVE:
            float dx = e.getRawX() - sx, dy = e.getRawY() - sy;
            if (Math.abs(dx) + Math.abs(dy) > dp(6)) moved = true;
            a.x = Math.max(0, ox + Math.round(dx)); a.y = Math.max(0, oy + Math.round(dy));
            dlg.getWindow().setAttributes(a);
            return true;
          case MotionEvent.ACTION_UP:
            prefs().edit().putInt(bubble ? "bx" : "x", a.x).putInt(bubble ? "by" : "y", a.y).apply();
            if (tapToOpen && !moved) { dlg.setContentView(new FrameLayout(app)); asPanel(); }
            return true;
        }
        return false;
      }
    });
  }

  private static void saveSize() {
    if (dlg == null || bubble) return;
    WindowManager.LayoutParams a = dlg.getWindow().getAttributes();
    prefs().edit().putInt("w", a.width).putInt("h", a.height).putInt("x", a.x).putInt("y", a.y).apply();
  }

  private static TextView chip(String label, View.OnClickListener l) {
    TextView t = new TextView(app);
    t.setText(label); t.setTextColor(Color.WHITE); t.setTextSize(12.5f); t.setGravity(Gravity.CENTER);
    t.setPadding(dp(10), dp(4), dp(10), dp(4));
    GradientDrawable g = new GradientDrawable(); g.setColor(0x24FFFFFF); g.setCornerRadius(dp(8));
    t.setBackground(g);
    LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(28));
    p.leftMargin = dp(6);
    t.setLayoutParams(p);
    t.setOnClickListener(l);
    return t;
  }

  private static void openApp() {
    try {
      Intent i = new Intent(app, MainActivity.class);
      i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      app.startActivity(i);
    } catch (Throwable e) {}
  }

  // 받은 자막을 그린다: { t: "03:12", s: "듣는 중", lines: [{ en, ko, mine, partial }] }
  private static void fill() {
    if (dlg == null || bubble || linesBox == null) return;
    try {
      JSONObject j = new JSONObject(data);
      if (stateText != null) stateText.setText(j.optString("s", "듣는 중") + "  " + j.optString("t", ""));
      linesBox.removeAllViews();
      JSONArray arr = j.optJSONArray("lines");
      if (arr == null || arr.length() == 0) {
        TextView t = new TextView(app);
        t.setText("영어가 들리면 여기에 번역이 나옵니다."); t.setTextColor(0xAAC9D2DE); t.setTextSize(14f);
        linesBox.addView(t);
        return;
      }
      for (int i = 0; i < arr.length(); i++) {
        JSONObject l = arr.getJSONObject(i);
        boolean mine = l.optBoolean("mine"), partial = l.optBoolean("partial");
        String en = l.optString("en", "").trim(), ko = l.optString("ko", "").trim();
        if (!en.isEmpty()) {
          TextView a = new TextView(app);
          a.setText(en); a.setTextColor(0xFFB9C4D2); a.setTextSize(12.5f);
          a.setShadowLayer(3, 0, 1, 0x99000000);
          linesBox.addView(a);
        }
        if (!ko.isEmpty()) {
          TextView b = new TextView(app);
          b.setText(ko); b.setTextColor(mine ? 0xFF9EE6C4 : Color.WHITE); b.setTextSize(17f);
          b.setTypeface(Typeface.DEFAULT_BOLD);
          b.setShadowLayer(3, 0, 1, 0x99000000);
          LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
          p.bottomMargin = dp(6);
          linesBox.addView(b, p);
        }
        if (partial) for (int k = linesBox.getChildCount() - 1; k >= 0 && k >= linesBox.getChildCount() - 2; k--) linesBox.getChildAt(k).setAlpha(.6f);
      }
    } catch (Throwable e) {}
  }
}
