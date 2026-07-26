20万分の1日本シームレス地質図V2　シェープファイル
地質図更新日 2025年7月18日

 詳細ウェブサイト　https://gbank.gsj.jp/seamless

ファイル構成


　（「*」には「line」または「poly」が入ります）
　seamlessV2_*.shp : シェープファイル
　seamlessV2_*.dbf : シェープファイル
　seamlessV2_*.prj : シェープファイル
　seamlessV2_*.shx : シェープファイル
　seamlessV2_*.lyrx : ArcGIS Pro(ver.3.3)用レイヤーファイル
　swamlessV2_*.qml : QGIS(ver.3.38.1)用レイヤースタイルファイル
　swamlessV2_*.sld : WMS用スタイル定義ファイル（Styled Layer Descriptors)
　legend.tsv       : 凡例一覧ファイル(タブ区切りテキスト形式，文字コードはutf-8)
　readme.txt       : このファイル(文字コードはutf-8)

    ※タブ区切りテキスト形式
        Internet Assigned Numbers Authority (IANA).
        How To Use Tab Separated Value (TSV) Files.
        https://www.iana.org/assignments/media-types/text/tab-separated-values
　　※legend.tsvには定義されているすべての凡例が含まれており，現時点では使用されていないものも含まれます．
　　　また，一列目の通し番号は将来凡例の追加・削除に伴って変化する可能性がありますので，凡例を特定したい場合は2列目のSymbolをご利用ください．


dbfファイルの列構成

（ライン）
・Major_Code: コード
・Legend_J: 線種別（日本語）
・Legend_E: 線種別（英語）
・styleidx: スタイルインデックス
（ポリゴン）
・ser: 通し番号
・symbol: 凡例記号(例　Q22-H_sdd)

legend.tsvのt列構成

・ser: 通し番号
・symbol: 凡例記号(例　Q22-H_sdd)
・r: 標準凡例色のR値（0～255の十進数）
・g: 標準凡例色のG値（0～255の十進数）
・b: 標準凡例色のB値（0～255の十進数）
・formationAge_ja: 形成時代（日本語）
・formationAge_en: 形成時代（英語）
・group_ja: 大区分（日本語）
・group_en: 大区分（英語）
・lithology_ja: 岩相（日本語）
・lithology_en: 岩相（英語）

著作権とライセンス

  本データの著作権は，産業技術総合研究所地質調査総合センターが所有しており，内容はすべて著作権法で保護されています．また，本データは政府標準利用規約(第2.0版)の元に提供されており，利用条件は地質調査総合センターWebページ掲載の利用条件，https://www.gsj.jp/license/index.htmlに従います．

出典表示例
　産総研地質調査総合センター,20万分の1日本シームレス地質図V2(地質図更新日:2025年7月18日), https://gbank.gsj.jp/seamless/

免責
  産業技術総合研究所地質調査総合センターは，データの使用に関して生ずる一切の損害について責任を負いません．

お問い合わせ
　地質相談お問い合わせ窓口 Email: soudan@gsj.jp
