package com.autoerd.plugin

import com.intellij.openapi.options.Configurable
import javax.swing.*
import java.awt.GridBagLayout
import java.awt.GridBagConstraints
import java.awt.Insets

class AutoErdConfigurable : Configurable {

    private var urlField: JTextField? = null

    override fun getDisplayName() = "AutoERD"

    override fun createComponent(): JComponent {
        val panel = JPanel(GridBagLayout())
        val gbc = GridBagConstraints().apply {
            insets = Insets(4, 4, 4, 4)
            fill = GridBagConstraints.HORIZONTAL
        }

        gbc.gridx = 0; gbc.gridy = 0; gbc.weightx = 0.0
        panel.add(JLabel("서버 URL:"), gbc)

        gbc.gridx = 1; gbc.weightx = 1.0
        urlField = JTextField(AutoErdSettings.getInstance().serverUrl, 40)
        panel.add(urlField!!, gbc)

        gbc.gridx = 0; gbc.gridy = 1; gbc.gridwidth = 2; gbc.weightx = 1.0
        panel.add(JLabel("<html><small>AutoERD 프론트엔드 서버 주소 (기본값: http://localhost:3000)</small></html>"), gbc)

        return panel
    }

    override fun isModified(): Boolean =
        urlField?.text != AutoErdSettings.getInstance().serverUrl

    override fun apply() {
        urlField?.text?.let { AutoErdSettings.getInstance().serverUrl = it }
    }

    override fun reset() {
        urlField?.text = AutoErdSettings.getInstance().serverUrl
    }
}
