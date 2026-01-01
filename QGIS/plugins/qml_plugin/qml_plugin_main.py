from qgis.PyQt.QtWidgets import QAction
from qgis.PyQt.QtCore import QObject
from .apply_qml_gui_ver2 import ApplyQMLDialog

class QMLPlugin(QObject):
    def __init__(self, iface):
        super().__init__()
        self.iface = iface
        self.action = None

    def initGui(self):
        # メニュー＆ツールバーに追加
        self.action = QAction("QML 適用", self.iface.mainWindow())
        self.action.triggered.connect(self.run)
        self.iface.addPluginToMenu("QML Plugin", self.action)
        self.iface.addToolBarIcon(self.action)

    def unload(self):
        # メニュー＆ツールバーから削除
        self.iface.removePluginMenu("QML Plugin", self.action)
        self.iface.removeToolBarIcon(self.action)

    def run(self):
        dlg = ApplyQMLDialog()
        dlg.exec_()
