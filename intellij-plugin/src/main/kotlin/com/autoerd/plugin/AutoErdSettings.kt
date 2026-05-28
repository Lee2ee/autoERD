package com.autoerd.plugin

import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.openapi.application.ApplicationManager

@State(name = "AutoErdSettings", storages = [Storage("autoerd.xml")])
@Service(Service.Level.APP)
class AutoErdSettings : PersistentStateComponent<AutoErdSettings.State> {

    data class State(var serverUrl: String = "http://localhost:3000")

    private var state = State()

    var serverUrl: String
        get() = state.serverUrl
        set(value) { state.serverUrl = value }

    override fun getState(): State = state
    override fun loadState(s: State) { state = s }

    companion object {
        fun getInstance(): AutoErdSettings =
            ApplicationManager.getApplication().getService(AutoErdSettings::class.java)
    }
}
