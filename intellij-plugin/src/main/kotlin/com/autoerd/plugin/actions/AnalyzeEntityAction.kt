package com.autoerd.plugin.actions

import com.autoerd.plugin.AutoErdSettings
import com.autoerd.plugin.parsers.JpaEntityParser
import com.autoerd.plugin.parsers.JpaParseResult
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VirtualFile
import java.awt.Toolkit
import java.awt.datatransfer.StringSelection
import java.util.Base64

/**
 * 프로젝트 탐색기 우클릭 → "AutoERD로 분석"
 * 선택된 Java 파일(들) 또는 폴더를 파싱하여 AutoERD에 연동합니다.
 */
class AnalyzeEntityAction : AnAction("AutoERD로 분석") {

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.VIRTUAL_FILE)
        // Java 파일이나 폴더일 때만 메뉴 노출
        e.presentation.isEnabledAndVisible = file != null &&
            (file.isDirectory || file.extension == "java" || file.extension == "prisma")
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val selectedFile = e.getData(CommonDataKeys.VIRTUAL_FILE) ?: return

        ProgressManager.getInstance().run(object : Task.Backgroundable(project, "AutoERD: 엔티티 분석 중...", false) {
            override fun run(indicator: ProgressIndicator) {
                val javaFiles = collectFiles(selectedFile, "java")
                val prismaFiles = collectFiles(selectedFile, "prisma")

                val javaCode = javaFiles.joinToString("\n\n") { String(it.contentsToByteArray(), Charsets.UTF_8) }
                val prismaCode = prismaFiles.joinToString("\n\n") { String(it.contentsToByteArray(), Charsets.UTF_8) }

                val result = JpaEntityParser.parse(javaCode + "\n\n" + prismaCode)
                val totalFiles = javaFiles.size + prismaFiles.size

                ApplicationManager.getApplication().invokeLater {
                    showResult(result, totalFiles)
                }
            }
        })
    }

    /** 파일 또는 폴더에서 해당 확장자 VirtualFile 목록 수집 */
    private fun collectFiles(root: VirtualFile, extension: String): List<VirtualFile> {
        if (!root.isDirectory) {
            return if (root.extension == extension) listOf(root) else emptyList()
        }
        val result = mutableListOf<VirtualFile>()
        collectRecursive(root, extension, result)
        return result
    }

    private fun collectRecursive(dir: VirtualFile, extension: String, result: MutableList<VirtualFile>) {
        // build/, target/ 등 빌드 산출물 제외
        val EXCLUDED = setOf("build", "target", ".gradle", "out", "node_modules")
        for (child in dir.children) {
            if (child.isDirectory) {
                if (child.name !in EXCLUDED) collectRecursive(child, extension, result)
            } else if (child.extension == extension) {
                result.add(child)
            }
        }
    }

    private fun showResult(result: JpaParseResult, fileCount: Int) {
        val entityCount = result.entities.size
        val relCount = result.relationships.size

        if (entityCount == 0) {
            Messages.showWarningDialog(
                "@Entity 클래스나 Prisma model을 찾을 수 없습니다.\n파일 ${fileCount}개를 분석했습니다." +
                    if (result.warnings.isNotEmpty()) "\n\n경고:\n${result.warnings.take(3).joinToString("\n")}" else "",
                "AutoERD 분석 결과"
            )
            return
        }

        val warningText = if (result.warnings.isNotEmpty())
            "\n\n경고 ${result.warnings.size}건:\n${result.warnings.take(3).joinToString("\n")}"
        else ""

        val message = """
            파일 ${fileCount}개에서 엔티티를 추출했습니다.

            - 엔티티: ${entityCount}개
            - 관계: ${relCount}개
            $warningText

            AutoERD 앱에서 열거나 JSON을 복사할 수 있습니다.
        """.trimIndent()

        val choice = Messages.showDialog(
            message,
            "AutoERD 분석 결과",
            arrayOf("브라우저에서 열기", "JSON 복사", "닫기"),
            0,
            Messages.getInformationIcon()
        )

        val serverUrl = AutoErdSettings.getInstance().serverUrl

        when (choice) {
            0 -> { // 브라우저에서 열기
                val json = buildJson(result)
                val encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(json.toByteArray(Charsets.UTF_8))
                BrowserUtil.browse("$serverUrl/projects/new#import=$encoded")
            }
            1 -> { // JSON 복사
                val json = buildJson(result)
                val clipboard = Toolkit.getDefaultToolkit().systemClipboard
                clipboard.setContents(StringSelection(json), null)
                Messages.showInfoMessage("JSON이 클립보드에 복사됐습니다.\nAutoERD 앱의 '코드에서 가져오기'에서 붙여넣기 하세요.", "AutoERD")
            }
        }
    }

    /** 분석 결과를 AutoERD 가져오기 형식의 JSON으로 직렬화 */
    private fun buildJson(result: JpaParseResult): String {
        val sb = StringBuilder()
        sb.append("""{"entities":[""")
        result.entities.forEachIndexed { i, e ->
            if (i > 0) sb.append(',')
            sb.append("""{"id":"${e.id}","name":"${e.name}","tableName":"${e.tableName}",""")
            sb.append(""""description":"${e.description}","position":{"x":0,"y":0},"attributes":[""")
            e.attributes.forEachIndexed { j, a ->
                if (j > 0) sb.append(',')
                sb.append("""{"id":"${a.id}","name":"${escape(a.name)}","columnName":"${escape(a.columnName)}",""")
                sb.append(""""type":"${a.type}","isPrimary":${a.isPrimary},"isForeign":${a.isForeign},""")
                sb.append(""""isNullable":${a.isNullable},"isUnique":${a.isUnique}}""")
            }
            sb.append("]}")
        }
        sb.append("""],"relationships":[""")
        result.relationships.forEachIndexed { i, r ->
            if (i > 0) sb.append(',')
            sb.append("""{"id":"${r.id}","sourceEntityId":"${r.sourceEntityId}",""")
            sb.append(""""targetEntityId":"${r.targetEntityId}","type":"${r.type}"}""")
        }
        sb.append("]}")
        return sb.toString()
    }

    private fun escape(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"")
}
