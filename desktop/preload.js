// 앱 화면(index.html)에 데스크톱 기능 몇 가지만 열어 준다. 그 밖의 컴퓨터 기능에는 접근할 수 없다
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  compact: (on) => ipcRenderer.invoke("compact", !!on),   // 작은 창 켜기·끄기
  opacity: (v) => ipcRenderer.invoke("opacity", v),       // 작은 창 투명도
  info: () => ipcRenderer.invoke("info")                  // 앱 버전, 운영체제
});
