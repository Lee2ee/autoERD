import * as vscode from 'vscode'

let panel: vscode.WebviewPanel | undefined

export function activate(context: vscode.ExtensionContext) {
  const openCmd = vscode.commands.registerCommand('autoerd.open', () => {
    if (panel) {
      panel.reveal()
      return
    }

    const config = vscode.workspace.getConfiguration('autoerd')
    const url = config.get<string>('serverUrl', 'http://localhost:3000')

    panel = vscode.window.createWebviewPanel(
      'autoerd',
      'AutoERD',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    )

    panel.webview.html = buildHtml(url)

    panel.onDidDispose(() => { panel = undefined }, null, context.subscriptions)
  })

  context.subscriptions.push(openCmd)
}

export function deactivate() {}

function buildHtml(url: string): string {
  // CSP: frame-src 허용으로 localhost iframe 임베드
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; frame-src http://localhost:* http://127.0.0.1:*; style-src 'unsafe-inline';">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1e1e1e; display: flex; flex-direction: column; height: 100vh; }
    #toolbar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 12px; background: #2d2d2d; border-bottom: 1px solid #444;
      font-family: sans-serif; font-size: 12px; color: #ccc;
    }
    #toolbar span { font-weight: bold; color: #4fc3f7; }
    #toolbar button {
      background: #0e639c; color: white; border: none; padding: 3px 10px;
      border-radius: 3px; cursor: pointer; font-size: 11px;
    }
    #toolbar button:hover { background: #1177bb; }
    #frame-wrap { flex: 1; position: relative; }
    iframe { width: 100%; height: 100%; border: none; display: block; }
    #overlay {
      position: absolute; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center; background: #1e1e1e;
      color: #888; font-family: sans-serif; gap: 12px;
    }
    #overlay.hidden { display: none; }
    #overlay h2 { color: #4fc3f7; font-size: 18px; }
    #overlay p { font-size: 13px; }
    #overlay code { background: #2d2d2d; padding: 2px 6px; border-radius: 3px; color: #ce9178; }
  </style>
</head>
<body>
  <div id="toolbar">
    <span>AutoERD</span>
    <div style="display:flex;gap:8px;align-items:center;">
      <span id="url-label">${url}</span>
      <button onclick="reload()">새로고침</button>
    </div>
  </div>
  <div id="frame-wrap">
    <div id="overlay">
      <h2>AutoERD</h2>
      <p>서버에 연결 중입니다...</p>
      <p>서버가 실행되지 않았다면:</p>
      <code>docker-compose up</code>
    </div>
    <iframe id="app" src="${url}" onload="onFrameLoad()" onerror="onFrameError()"></iframe>
  </div>
  <script>
    function onFrameLoad() {
      document.getElementById('overlay').classList.add('hidden');
    }
    function onFrameError() {
      document.getElementById('overlay').classList.remove('hidden');
    }
    function reload() {
      const iframe = document.getElementById('app');
      iframe.src = iframe.src;
      document.getElementById('overlay').classList.remove('hidden');
    }
  </script>
</body>
</html>`
}
