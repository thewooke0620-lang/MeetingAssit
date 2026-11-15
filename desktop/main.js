// 회의 통역 도우미 데스크톱 앱 (Windows)
// 화면은 웹 앱(GitHub Pages)을 그대로 불러온다. 그래서 웹을 고치면 exe를 다시 깔지 않아도 다음 실행부터 반영된다.
// 이 껍데기가 더하는 것: 컴퓨터 소리(회의 프로그램 소리) 바로 듣기, 회의 창 위에 늘 떠 있는 반투명(블러) 자막 팝업
const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell, Menu, screen } = require("electron");
const path = require("path");

const APP_URL = process.env.MEETINGASSIT_URL || "https://thewooke0620-lang.github.io/MeetingAssit/";
const ORIGIN = new URL(APP_URL).origin;
const BG = "#10161f", FG = "#e9edf2";
const BAR_H = 48;

let win = null, popupWin = null, popupBlur = true, popupOpacity = 0.92;

// 같은 앱을 두 번 열면 이미 열린 창을 앞으로 가져온다
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

const fromApp = (url) => typeof url === "string" && (url.startsWith(ORIGIN + "/") || url === ORIGIN);

function createWindow() {
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 360, minHeight: 140,
    backgroundColor: BG, title: "회의 통역 도우미", icon: path.join(__dirname, "icon.png"),
    // 창 위쪽 막대는 앱 화면이 그리고, 최소화·최대화·닫기 단추만 Windows 것을 쓴다
    titleBarStyle: "hidden",
    titleBarOverlay: { color: BG, symbolColor: FG, height: BAR_H },
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false   // 다른 창을 보고 있어도 소리 처리가 느려지지 않게
    }
  });
  Menu.setApplicationMenu(null);
  win.loadURL(APP_URL);

  // 인터넷이 안 되면 안내 화면을 띄운다 (번역 서비스도 인터넷이 있어야 쓸 수 있다)
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => {
    if (isMain && code !== -3 && fromApp(url)) win.loadFile(path.join(__dirname, "offline.html"));
  });
  // 앱 밖의 주소는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (fromApp(url) || url.startsWith("file:")) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
  // F5·Ctrl+R: 새로고침 (새 버전 받기), Ctrl+= / Ctrl+-: 글자 크기
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F5" || (input.control && input.key.toLowerCase() === "r")) { e.preventDefault(); win.webContents.reload(); }
  });
  win.on("closed", () => { win = null; if (popupWin) popupWin.close(); });
}

// 보낸 쪽이 우리 앱 화면인지 확인한다 (다른 페이지가 창을 조작하지 못하게)
const trusted = (e) => fromApp(e.senderFrame && e.senderFrame.url);

app.whenReady().then(() => {
  const ses = session.defaultSession;
  // 마이크·화면 소리 권한은 우리 앱에만 준다
  const allowed = new Set(["media", "display-capture", "clipboard-sanitized-write", "fullscreen"]);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm) && fromApp(wc.getURL())));
  ses.setPermissionCheckHandler((wc, perm, origin) => allowed.has(perm) && fromApp(origin + "/"));
  // "컴퓨터 소리"를 고르면 공유 창 없이 바로 Windows 전체 소리(회의 프로그램 소리 포함)를 받는다
  ses.setDisplayMediaRequestHandler(async (req, cb) => {
    try {
      if (!fromApp(req.frame && req.frame.url)) return cb({});
      const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 0, height: 0 } });
      if (!sources.length) return cb({});
      cb({ video: sources[0], audio: "loopback" });
    } catch (err) { cb({}); }
  });

  // 자막 팝업: 본 창과 따로 떠 있는 반투명(블러) 창. 회의 창(Teams 등) 위에 늘 떠 있고, 뒤가 흐리게 비친다
  // 화면은 같은 웹 앱 주소의 #popup 이고, 본 창과는 BroadcastChannel 로 자막을 주고받는다
  ipcMain.handle("popup", (e, on) => {
    if (!trusted(e) || !win) return false;
    if (!on) { if (popupWin) popupWin.close(); return true; }
    if (popupWin) { popupWin.show(); popupWin.focus(); return true; }
    const wa = screen.getDisplayMatching(win.getBounds()).workArea;
    const w = Math.min(760, wa.width - 40), h = 230;
    popupWin = new BrowserWindow({
      x: Math.round(wa.x + (wa.width - w) / 2), y: wa.y + wa.height - h - 24, width: w, height: h,
      minWidth: 360, minHeight: 120, title: "자막", icon: path.join(__dirname, "icon.png"),
      alwaysOnTop: true, fullscreenable: false, maximizable: false, minimizable: false,
      titleBarStyle: "hidden",                 // 창 테두리(크기 조절)는 남기고 제목 막대만 없앤다
      backgroundMaterial: popupBlur ? "acrylic" : "none",   // Windows 11: 뒤가 흐리게 비치는 유리 효과
      backgroundColor: popupBlur ? "#00000000" : BG,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false
      }
    });
    popupWin.setAlwaysOnTop(true, "screen-saver");   // 전체 화면으로 띄운 회의 창보다도 위
    popupWin.setVisibleOnAllWorkspaces(true);
    popupWin.setOpacity(popupOpacity);
    popupWin.loadURL(APP_URL.split("#")[0] + "#popup");
    popupWin.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    popupWin.webContents.on("will-navigate", (ev, url) => { if (!fromApp(url)) ev.preventDefault(); });
    popupWin.on("closed", () => {
      popupWin = null;
      if (win) win.webContents.send("popup-closed");
    });
    return true;
  });
  // 팝업 흐림(블러) 켜기·끄기. 끄면 어두운 바탕에 투명도만 적용된다
  ipcMain.handle("popupBlur", (e, on) => {
    if (!trusted(e)) return false;
    popupBlur = !!on;
    if (popupWin) {
      try { popupWin.setBackgroundMaterial(popupBlur ? "acrylic" : "none"); } catch (err) {}
      popupWin.setBackgroundColor(popupBlur ? "#00000000" : BG);
    }
    return true;
  });
  // 팝업 투명도 (0.35 ~ 1)
  ipcMain.handle("popupOpacity", (e, v) => {
    if (!trusted(e)) return false;
    popupOpacity = Math.min(1, Math.max(0.35, Number(v) || 1));
    if (popupWin) popupWin.setOpacity(popupOpacity);
    return true;
  });
  // 팝업에서 "본 화면" 을 누르면 본 창을 앞으로
  ipcMain.handle("focusMain", (e) => {
    if (!trusted(e) || !win) return false;
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    return true;
  });
  ipcMain.handle("info", (e) => (trusted(e) ? { version: app.getVersion(), platform: process.platform } : null));

  createWindow();
});

app.on("window-all-closed", () => app.quit());
