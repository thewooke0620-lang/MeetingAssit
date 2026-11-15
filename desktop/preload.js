// 앱 화면(index.html)에 데스크톱 기능 몇 가지만 열어 준다. 그 밖의 컴퓨터 기능에는 접근할 수 없다
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  popup: (on) => ipcRenderer.invoke("popup", !!on),           // 자막 팝업 열기·닫기
  popupBlur: (on) => ipcRenderer.invoke("popupBlur", !!on),   // 팝업 뒤 흐림(블러)
  popupOpacity: (v) => ipcRenderer.invoke("popupOpacity", v), // 팝업 투명도
  focusMain: () => ipcRenderer.invoke("focusMain"),           // 본 창을 앞으로
  onPopupClosed: (fn) => ipcRenderer.on("popup-closed", () => fn()),
  info: () => ipcRenderer.invoke("info")                      // 앱 버전, 운영체제
});
