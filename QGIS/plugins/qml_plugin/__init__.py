def classFactory(iface):
    from .qml_plugin_main import QMLPlugin
    plugin = QMLPlugin(iface)
    return plugin
