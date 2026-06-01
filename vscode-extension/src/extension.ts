import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { parseJpaEntities } from './parsers/jpaParser'
import { parsePrismaSchema } from './parsers/prismaParser'

let panel: vscode.WebviewPanel | undefined

export function activate(context: vscode.ExtensionContext) {
  // ── 기존: AutoERD WebView 열기 ────────────────────────────────────────────
  const openCmd = vscode.commands.registerCommand('autoerd.open', () => {
    if (panel) { panel.reveal(); return }
    const config = vscode.workspace.getConfiguration('autoerd')
    const url = config.get<string>('serverUrl', 'http://localhost:3000')
    panel = vscode.window.createWebviewPanel('autoerd', 'AutoERD', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
    })
    panel.webview.html = buildHtml(url)
    panel.onDidDispose(() => { panel = undefined }, null, context.subscriptions)
  })

  // ── 신규: 파일 분석 (우클릭 → AutoERD로 분석) ────────────────────────────
  const analyzeFileCmd = vscode.commands.registerCommand('autoerd.analyzeFile', async (uri?: vscode.Uri) => {
    if (!uri) {
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      uri = editor.document.uri
    }
    await analyzeFiles([uri])
  })

  // ── 신규: 폴더 전체 분석 ─────────────────────────────────────────────────
  const analyzeFolderCmd = vscode.commands.registerCommand('autoerd.analyzeFolder', async (uri?: vscode.Uri) => {
    if (!uri) {
      vscode.window.showWarningMessage('AutoERD: 탐색기에서 폴더를 선택한 후 우클릭해 주세요.')
      return
    }
    const [javaFiles, prismaFiles] = await Promise.all([
      vscode.workspace.findFiles(new vscode.RelativePattern(uri, '**/*.java'), '**/target/**,**/build/**'),
      vscode.workspace.findFiles(new vscode.RelativePattern(uri, '**/*.prisma')),
    ])
    await analyzeFiles([...javaFiles, ...prismaFiles])
  })

  // ── 신규: DDL 마이그레이션 파일 저장 ─────────────────────────────────────
  const saveDDLCmd = vscode.commands.registerCommand('autoerd.saveDDL', async () => {
    const config = vscode.workspace.getConfiguration('autoerd')
    const format = config.get<string>('migrationFormat', 'flyway')
    const migDir = config.get<string>('migrationDir', 'src/main/resources/db/migration')

    const workspaceFolders = vscode.workspace.workspaceFolders
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('AutoERD: 열린 워크스페이스가 없습니다.')
      return
    }

    const rootPath = workspaceFolders[0].uri.fsPath
    const targetDir = path.join(rootPath, migDir)

    if (!fs.existsSync(targetDir)) {
      const create = await vscode.window.showWarningMessage(
        `AutoERD: 경로가 존재하지 않습니다 (${migDir}). 생성할까요?`,
        '생성', '취소'
      )
      if (create !== '생성') return
      fs.mkdirSync(targetDir, { recursive: true })
    }

    // AutoERD 앱에서 DDL을 다운받도록 안내
    const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000')
    const formatLabel = format === 'flyway' ? 'Flyway SQL' : format === 'liquibase' ? 'Liquibase XML' : 'plain SQL'
    const message = `AutoERD 앱(${serverUrl})의 'SQL DDL' 탭에서 '${formatLabel}' 포맷을 다운로드한 후, 아래 경로에 저장하세요:\n${targetDir}`

    vscode.window.showInformationMessage(message, '브라우저에서 AutoERD 열기').then((choice) => {
      if (choice === '브라우저에서 AutoERD 열기') {
        vscode.env.openExternal(vscode.Uri.parse(serverUrl))
      }
    })
  })

  context.subscriptions.push(openCmd, analyzeFileCmd, analyzeFolderCmd, saveDDLCmd)
}

export function deactivate() {}

// ── 파일 분석 핵심 로직 ───────────────────────────────────────────────────────

async function analyzeFiles(uris: vscode.Uri[]) {
  if (uris.length === 0) {
    vscode.window.showWarningMessage('AutoERD: 분석할 파일이 없습니다.')
    return
  }

  const javaUris = uris.filter((u) => u.fsPath.endsWith('.java'))
  const prismaUris = uris.filter((u) => u.fsPath.endsWith('.prisma'))

  const javaCode = javaUris.map((u) => fs.readFileSync(u.fsPath, 'utf-8')).join('\n\n')
  const prismaCode = prismaUris.map((u) => fs.readFileSync(u.fsPath, 'utf-8')).join('\n\n')

  const jpaResult = javaCode ? parseJpaEntities(javaCode) : { entities: [], relationships: [], warnings: [] }
  const prismaResult = prismaCode ? parsePrismaSchema(prismaCode) : { entities: [], relationships: [], warnings: [] }

  const entities = [...jpaResult.entities, ...prismaResult.entities]
  const relationships = [...jpaResult.relationships, ...prismaResult.relationships]
  const warnings = [...jpaResult.warnings, ...prismaResult.warnings]

  if (entities.length === 0) {
    vscode.window.showWarningMessage('AutoERD: @Entity 클래스나 Prisma model을 찾을 수 없습니다.')
    if (warnings.length > 0) vscode.window.showWarningMessage(`경고: ${warnings.join(' | ')}`)
    return
  }

  if (warnings.length > 0) {
    vscode.window.showWarningMessage(`AutoERD 경고: ${warnings.slice(0, 2).join(' | ')}`)
  }

  const config = vscode.workspace.getConfiguration('autoerd')
  const serverUrl = config.get<string>('serverUrl', 'http://localhost:3000')

  // 엔티티 데이터를 JSON → base64로 인코딩하여 URL 파라미터로 전달
  const payload = JSON.stringify({ entities, relationships })
  const encoded = Buffer.from(payload).toString('base64url')
  const importUrl = `${serverUrl}/projects/new#import=${encoded}`

  const choice = await vscode.window.showInformationMessage(
    `AutoERD: ${entities.length}개 엔티티, ${relationships.length}개 관계 발견 (${uris.length}개 파일)`,
    '브라우저에서 열기',
    '클립보드에 JSON 복사',
    '닫기',
  )

  if (choice === '브라우저에서 열기') {
    vscode.env.openExternal(vscode.Uri.parse(importUrl))
  } else if (choice === '클립보드에 JSON 복사') {
    await vscode.env.clipboard.writeText(payload)
    vscode.window.showInformationMessage('AutoERD: JSON이 클립보드에 복사됐습니다. AutoERD 앱에서 "코드에서 가져오기"를 이용하세요.')
  }
}

// ── WebView HTML ──────────────────────────────────────────────────────────────

function buildHtml(url: string): string {
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
    function onFrameLoad() { document.getElementById('overlay').classList.add('hidden'); }
    function onFrameError() { document.getElementById('overlay').classList.remove('hidden'); }
    function reload() {
      const iframe = document.getElementById('app');
      iframe.src = iframe.src;
      document.getElementById('overlay').classList.remove('hidden');
    }
  </script>
</body>
</html>`
}
