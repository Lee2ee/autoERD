package com.autoerd.plugin

import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import java.awt.BorderLayout
import java.awt.FlowLayout
import javax.swing.*

class AutoErdWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val serverUrl = AutoErdSettings.getInstance().serverUrl
        val panel = AutoErdPanel(serverUrl)
        val content = ContentFactory.getInstance().createContent(panel.root, "", false)
        toolWindow.contentManager.addContent(content)
    }
}

class AutoErdPanel(private var url: String) {
    val root: JPanel = JPanel(BorderLayout())

    init {
        if (JBCefApp.isSupported()) {
            val browser = JBCefBrowser(url)

            val toolbar = JPanel(FlowLayout(FlowLayout.LEFT, 8, 4))
            toolbar.border = BorderFactory.createMatteBorder(0, 0, 1, 0, java.awt.Color(68, 68, 68))

            val urlField = JTextField(url, 40)
            val goBtn = JButton("이동")
            val reloadBtn = JButton("새로고침")

            goBtn.addActionListener {
                url = urlField.text.trim()
                browser.loadURL(url)
            }
            reloadBtn.addActionListener {
                browser.cefBrowser.reload()
            }
            urlField.addActionListener {
                url = urlField.text.trim()
                browser.loadURL(url)
            }

            toolbar.add(JLabel("AutoERD"))
            toolbar.add(urlField)
            toolbar.add(goBtn)
            toolbar.add(reloadBtn)

            root.add(toolbar, BorderLayout.NORTH)
            root.add(browser.component, BorderLayout.CENTER)
        } else {
            val msg = JLabel(
                "<html><center>" +
                "<b>JCEF를 사용할 수 없습니다.</b><br><br>" +
                "Help → Find Action → <code>Registry</code> 에서<br>" +
                "<code>ide.browser.jcef.enabled</code> 를 활성화하세요." +
                "</center></html>",
                SwingConstants.CENTER
            )
            root.add(msg, BorderLayout.CENTER)
        }
    }
}
