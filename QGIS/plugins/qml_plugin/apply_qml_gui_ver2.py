from qgis.PyQt import QtWidgets
from qgis.PyQt import QtGui
from qgis.core import (
QgsProject, QgsLayerTreeGroup,
QgsRasterLayer, QgsColorRampShader, QgsRasterShader, QgsSingleBandPseudoColorRenderer
)
from qgis.PyQt.QtGui import QColor
import os

class ApplyQMLDialog(QtWidgets.QDialog):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("QML スタイル適用")
        self.resize(500, 550)

        layout = QtWidgets.QVBoxLayout()

        # ==== QML フォルダ検出 ====
        project_dir = os.path.dirname(QgsProject.instance().fileName())
        self.qml_dir = os.path.join(project_dir, "QML")
        if not os.path.exists(self.qml_dir):
            os.makedirs(self.qml_dir)
        self.qml_files = [f for f in os.listdir(self.qml_dir) if f.endswith(".qml")]

        # ==== QML リスト ====
        layout.addWidget(QtWidgets.QLabel("適用する QML を選択"))
        self.qml_list = QtWidgets.QListWidget()
        self.qml_list.setSelectionMode(QtWidgets.QAbstractItemView.SingleSelection)
        for f in self.qml_files:
            self.qml_list.addItem(f)
        layout.addWidget(self.qml_list)

        # ==== レイヤーリスト ====
        layout.addWidget(QtWidgets.QLabel("単独レイヤーを選択（Ctrl+クリックで複数可）"))
        self.layer_list = QtWidgets.QListWidget()
        self.layer_list.setSelectionMode(QtWidgets.QAbstractItemView.MultiSelection)

        root = QgsProject.instance().layerTreeRoot()
        for child in root.children():
            if hasattr(child, "layer") and child.layer():
                self.layer_list.addItem(child.layer().name())
        layout.addWidget(self.layer_list)

        # ==== グループリスト（第2階層以下のみ）====
        layout.addWidget(QtWidgets.QLabel("グループを選択（第2階層以下のみ表示）"))
        self.group_list = QtWidgets.QListWidget()
        self.group_list.setSelectionMode(QtWidgets.QAbstractItemView.MultiSelection)

        # --- ここが変更点 ---
        self.add_deep_groups_only(root, current_depth=1, min_depth=1)
        # ---------------------

        layout.addWidget(self.group_list)

        # ==== サブグループオプション ====
        self.include_subgroups = QtWidgets.QCheckBox("サブグループも含める")
        self.include_subgroups.setChecked(False)
        layout.addWidget(self.include_subgroups)

        # ==== ボタンエリア ====
        button_layout = QtWidgets.QHBoxLayout()
        self.apply_button = QtWidgets.QPushButton("スタイルを適用")
        self.apply_button.clicked.connect(self.apply_style)
        button_layout.addWidget(self.apply_button)

        self.close_button = QtWidgets.QPushButton("閉じる")
        self.close_button.clicked.connect(self.close)
        button_layout.addWidget(self.close_button)

        layout.addLayout(button_layout)
        self.setLayout(layout)

    # ---------------------------
    # 第3階層以下のグループだけを再帰的に追加
    # ---------------------------
    def add_deep_groups_only(self, group, current_depth=1, min_depth=1):
        for child in group.children():
            if isinstance(child, QgsLayerTreeGroup):
                if current_depth >= min_depth:
                    self.group_list.addItem(child.name())
                # 深い階層があればさらに潜る
                self.add_deep_groups_only(child, current_depth + 1, min_depth)

    # ---------------------------
    # QML 適用処理
    # ---------------------------
    def apply_style(self):
        selected_qml_items = self.qml_list.selectedItems()
        selected_layers = self.layer_list.selectedItems()
        selected_groups = self.group_list.selectedItems()

        if not selected_qml_items:
            QtWidgets.QMessageBox.warning(self, "警告", "QML が選択されていません")
            return

        qml_path = os.path.join(self.qml_dir, selected_qml_items[0].text())

        # 単独レイヤーに適用
        for item in selected_layers:
            self.apply_to_layer(item.text(), qml_path)

        # グループ配下レイヤーに適用
        root = QgsProject.instance().layerTreeRoot()
        for item in selected_groups:
            group = root.findGroup(item.text())
            if group:
                self.apply_to_group(group, qml_path, self.include_subgroups.isChecked())

        QtWidgets.QMessageBox.information(self, "完了", "スタイルを適用しました")
        
    def apply_to_group(self, group, qml_path, include_subgroups=True):
        for child in group.children():
            if hasattr(child, "layer") and child.layer():
                self.apply_to_layer(child.layer().name(), qml_path)
            elif include_subgroups and isinstance(child, QgsLayerTreeGroup):
                self.apply_to_group(child, qml_path, include_subgroups)

    def apply_to_layer(self, layer_name, qml_path):
        layers = QgsProject.instance().mapLayersByName(layer_name)
        if not layers:
            return

        layer = layers[0]

        # ==================================
        # ベクター／ラスタ共通：まずQML適用
        # ==================================
        ok, error = layer.loadNamedStyle(qml_path)

        if ok:
            layer.triggerRepaint()
            layer.reload()
            return

        # ==================================
        # フォールバック（ラスタのみ）
        # ==================================
        if layer.type() == layer.RasterLayer:

            provider = layer.dataProvider()

            # 統計が無ければ計算（3.40で重要）
            if not provider.hasStatistics(1):
                provider.bandStatistics(1)

            stats = provider.bandStatistics(1)
            min_val = stats.minimumValue
            max_val = stats.maximumValue

            fnc = QgsColorRampShader()
            fnc.setColorRampType(QgsColorRampShader.Interpolated)

            items = [
                QgsColorRampShader.ColorRampItem(min_val, QtGui.QColor(0, 0, 255), "low"),
                QgsColorRampShader.ColorRampItem(
                    (min_val + max_val) / 2, QtGui.QColor(0, 255, 0), "mid"
                ),
                QgsColorRampShader.ColorRampItem(max_val, QtGui.QColor(255, 0, 0), "high"),
            ]

            fnc.setColorRampItemList(items)

            shader = QgsRasterShader()
            shader.setRasterShaderFunction(fnc)

            renderer = QgsSingleBandPseudoColorRenderer(
                layer.dataProvider(),
                1,
                shader
            )

            layer.setRenderer(renderer)
            layer.triggerRepaint()
            layer.reload()
    
