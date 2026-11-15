// 회의 통역 도우미 데스크톱 앱 (Windows)
// 화면은 웹 앱(GitHub Pages)을 그대로 불러온다. 그래서 웹을 고치면 exe를 다시 깔지 않아도 다음 실행부터 반영된다.
// 이 껍데기가 더하는 것: 컴퓨터 소리(회의 프로그램 소리) 바로 듣기, 회의 창 위에 늘 떠 있는 작은 창
const { app, BrowserWindow, session, desktopCapturer, ipcMain, shell, Menu, screen } = require("electron");
const path = require("path");

const APP_URL = process.env.MEETINGASSIT_URL || "https://thewooke0620-lang.github.io/MeetingAssit/";
const ORIGIN = new URL(APP_URL).origin;
const BG = "#10161f", FG = "#e9edf2";
const BAR_H = 48, BAR_H_SMALL = 34;

let win = null, normalBounds = null, compact = false;

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
  win.on("closed", () => { win = null; });
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

  // 작은 창: 회의 창 위에 늘 떠 있는 자막 띠. 화면 아래 가운데에 놓고, 끄면 원래 크기로 돌아간다
  ipcMain.handle("compact", (e, on) => {
    if (!trusted(e) || !win) return false;
    on = !!on;
    if (on === compact) return true;
    compact = on;
    if (on) {
      normalBounds = win.getBounds();
      if (win.isMaximized()) win.unmaximize();
      const wa = screen.getDisplayMatching(normalBounds).workArea;
      const w = Math.min(720, wa.width - 40), h = 210;
      win.setMinimumSize(320, 110);
      win.setBounds({ x: Math.round(wa.x + (wa.width - w) / 2), y: wa.y + wa.height - h - 24, width: w, height: h });
      win.setAlwaysOnTop(true, "floating");
      win.setVisibleOnAllWorkspaces(true);
      try { win.setTitleBarOverlay({ color: BG, symbolColor: FG, height: BAR_H_SMALL }); } catch (err) {}
    } else {
      win.setAlwaysOnTop(false);
      win.setVisibleOnAllWorkspaces(false);
      win.setOpacity(1);
      win.setMinimumSize(360, 140);
      if (normalBounds) win.setBounds(normalBounds);
      try { win.setTitleBarOverlay({ color: BG, symbolColor: FG, height: BAR_H }); } catch (err) {}
    }
    return true;
  });
  // 작은 창 투명도 (0.4 ~ 1)
  ipcMain.handle("opacity", (e, v) => {
    if (!trusted(e) || !win) return false;
    win.setOpacity(Math.min(1, Math.max(0.4, Number(v) || 1)));
    return true;
  });
  ipcMain.handle("info", (e) => (trusted(e) ? { version: app.getVersion(), platform: process.platform } : null));

  createWindow();
});

app.on("window-all-closed", () => app.quit());
