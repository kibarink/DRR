# GPP クリーンアーキテクチャ適合度チェック（Cleanliness Check, v2）
（Team Q&K / Qちゃん）

> 目的：GPP（MongoDB + FastAPI + QGIS + 各種UI/画像処理）が **Clean Architecture** の原則（同心円レイヤ／Dependency Rule／境界）にどの程度乗っているかを点検し、  
> **社内サーバー展開（MongoDB/FastAPI）** と **DRRへのbranch** と **conda配布** を安全にする「最小の再構成ポイント」を明確化する。  
> ※今回は添付PDF（Uncle Bob “Clean Architecture”）の本文要点も織り込み。

---

## 1. Clean Architecture の要点（今回のチェックで使う“物差し”）
PDFの中核は以下の3つ。

### 1.1 依存性ルール（Dependency Rule）
- **「ソースコード依存は内側（より高レベルのポリシー）へだけ向ける」**  
- 内側は外側の“名前”すら知らない（外側で宣言されたクラス/関数/データ形式に触れない）  
- 外側（Web/DB/フレームワーク）は「詳細」であり、内側（ユースケース/エンティティ）を汚染してはいけない

（PDF: Clean Architecture章の定義・同心円とDependency Ruleの説明）

### 1.2 4つの円（Entities / Use Cases / Interface Adapters / Frameworks&Drivers）
- **Entities**：最も変更されにくいドメイン規則（概念と不変ルール）
- **Use Cases**：アプリの業務フロー（入力→処理→出力のオーケストレーション）
- **Interface Adapters**：UI/DB/Web向けの変換層（Controller/Presenter/Repository実装など）
- **Frameworks & Drivers**：MongoDB / FastAPI / QGIS / filesystem / OS / lib などの“詳細”

（PDF: Entities〜Frameworks&Driversの説明）

### 1.3 “Testable / Independent” が到達目標
- UI・DB・Webサーバが無くても **Use Caseを単体テストできる** こと
- フレームワークは「ツール」であり、アーキテクチャを支配させないこと

（PDF: Testable architectures / Frameworks are details の主旨）

---

## 2. 添付システム概念図（Koちゃん図）を Clean に当てはめる
添付図の主要ブロックはこう読める：

- **外側（Frameworks & Drivers）**
  - MongoDB（SSOT）
  - FastAPI（DHA merge、icon配布、GeoJSON配布などのWebドライバ）
  - QGIS viewer（外部クライアント）
  - 画像処理（GeoJSON作成）
  - Document Intelligence（PDF等取り込み）
- **内側に置きたい“政策（Policy）”**
  - risk segment module（リスク計算、polygon/cell cross section）
  - Point Scores Attributes（点の評価、誤差推定）
  - Risk segment Polygons Attribute Editor（属性の編集・合成ロジック）

> 図としては「MongoDBが中心」だけど、Clean的には **MongoDBは“詳細”で外側**。  
> 中心（内側）に置くべきは **ドメイン概念（Entities）とユースケース（Use Cases）**。

---

## 3. 現行GPPの“クリーン度”：乗っている点（Good）
### Good-1：SSOT思想はCleanと相性が良い
「MongoDBに真（canonical）を持ち、SVG/QGIS表示は派生物」という思想は、  
**“外側は詳細”**（DB/表示は交換可能）というCleanの狙いに乗せやすい。

### Good-2：FastAPIを“Driver”として整理しやすい
QGISがAPIからSVGやGeoJSONを取得する流れは、Cleanの **Frameworks&Drivers** に収まりが良い。  
（＝APIは「入口/出口」であり、ユースケースそのものではない）

### Good-3：GPP→DRRの派生可能性が構造として見えている
あなたの図は「地質探鉱」に閉じない一般形（GeoJSON・属性・ドキュメント・可視化）に抽象化されている。  
この時点で **“内側（ポリシー）を共通化し、外側（データ源/表示/配布）を差し替える”** 方向に寄せられる。

---

## 4. クリーン度を落とす“地雷”（Smell）と、GPPで起きやすい箇所
ここは、今までの実装方針・相談内容（パス直書き、API直叩き等）から **発生確率が高い順**。

### Smell-1：Use Case がファイルパスやOS環境に直結（＝内側が外側を知ってしまう）
例：
- `TEMP_GEOJSON_BASE = r"E:\MongoDB_Local\temp_geojson"` のような“絶対パス直書き”
- `export_dir = r"C:\Users\...\QGIS\geojson\DHA"` のような“ユーザー依存パス”
- サーバー/ローカルの差分をコア処理が自分で吸収しようとする

**症状**
- サーバー運用へ移行するときに、ユースケース/ロジック側まで修正が必要になる  
- DRR branch時に「巻き戻し不能」の感覚が出る（Koちゃんが懸念した点）

**Cleanな回避策（最小）**
- `TempWorkspace`（一時作業場）という **ポート（抽象インタフェース）**を core に置く  
- server/local の違いは infra 実装と設定で吸収し、Use Caseは `workspace.get_path("dha_geojson")` のように呼ぶだけにする

### Smell-2：Use Case が MongoDB / pymongo に直結
**症状**
- ローカル版（軽量キャッシュ）や別DB（PostGIS等）への差替えが困難
- テストがDB依存になり、CIしにくい

**Cleanな回避策（最小）**
- `AssessmentRepository` / `GeoFeatureStore` / `DocumentStore` のようなリポジトリポートを core に置く
- MongoDB実装は infra に置く（coreはpymongoをimportしない）

### Smell-3：HTTP（FastAPI）と業務語彙（DHA/CRS）が強結合
`/dha/merge` のように “業務固有語彙” をHTTP境界に固定すると、DRR派生や別用途で増殖する。

**Cleanな回避策（最小）**
- HTTPは表現層：`/assessment/merge` `/symbol/resolve` `/layer/upsert` のように **汎用語彙**へ寄せる
- DHA/CRS/DRRは use-case の命名として内側に閉じ込める

### Smell-4：QGIS依存がコアに侵入
QGIS固有の型・スタイル・レイヤ操作がコアロジックに混ざると、UI差替え・自動テストが難しくなる。

**Cleanな回避策（最小）**
- QGISはDriver。`StylePublisher` / `MapRenderer` のようなポート越しに操作
- コアは GeoJSON + 属性 + シンボル定義（抽象）を出すだけにする

---

## 5. “GPPサーバー版 & ローカル版” を明文化すれば、いつでもbranch可能か？
結論：**OK。条件付きで「Yes」**。

**条件**は1つだけ：
- 差分（server/local、GPP/DRR）は **設定 + Driver実装** に閉じること  
- core（Entities/Use Cases）には差分を入れないこと

これが守れれば「社内GPPに寄りすぎてDRRへ巻き戻せない」はほぼ回避できる。

---

## 6. conda化の可否（Clean視点の結論）
### 6.1 結論
- **conda化は強く推奨（特にGIS依存が重いので）**
- ただし **conda依存を“外側”に閉じる**のが絶対条件

### 6.2 condaが効く領域（外側）
- GDAL/PROJ/GEOS、rasterio/fiona/pyproj、shapely/geopandas 等の“C拡張・DLL地獄”
- QGIS連携、PyQt、GUI系
- ＝Frameworks & Drivers / apps

### 6.3 condaが危険になる兆候（内側侵入）
- coreで `import rasterio` や `import qgis` し始める
- coreで HTTP呼び出し（requests）を持ち始める
- coreでOS分岐・パス解決が増える

### 6.4 現実解（Team Q&K 推奨の“二層パッケージ”）
- **gpp-core（pip/venv前提でもOK）**：Entities + Use Cases + Ports（薄い依存だけ）
- **gpp-runtime（conda）**：infra + apps（Mongo/FastAPI/QGIS/GDAL含む）

> 「開発はpipで軽く」「配布はcondaで重い依存を丸ごと」  
> これが一番事故が少ない。

---

## 7. まとめ：クリーン度スコア（暫定）と改善の一手
※実コード全体レビューなしの暫定（会話と構成図ベース）。

| 観点 | 評価 | コメント |
|---|---:|---|
| Dependency Ruleの遵守 | B | SSOT思想は良いが、パス直書き・直結が残るとCに落ちる |
| 境界（Ports/Adapters/Infra）の明確さ | B- | “今まさに境界が必要になっているフェーズ” |
| DRR branch耐性 | B | 「サーバー&ローカル差分を明文化しDriverに閉じる」ならAに上がる |
| テスト可能性（DBなしでUse Case検証） | C+ | ports整備とDI（注入）で一気に改善できる |
| conda配布適性 | A- | GIS依存が重いので適性は高い（ただし外側に閉じる条件付き） |

---

## 8. 再構成すべき点（最小で効く順：MUST→SHOULD→NICE）
### MUST（最優先：これだけでbranch/配布が劇的に楽）
- [ ] `TempWorkspace` ポートを core に作り、**パス直書きを全廃**
- [ ] `AssessmentRepository` / `GeoFeatureStore` を core に作り、**pymongo直呼びを隔離**
- [ ] FastAPIのHTTP境界で **汎用語彙**へ寄せる方針を.mdに固定（URL設計の統一）
- [ ] coreのEntity/DTOを「純粋化」（DB型・HTTP型・QGIS型を混ぜない）

### SHOULD（次点：品質・保守性が上がる）
- [ ] UI（Streamlit/PyQt）は Use Case 呼び出しだけにする（計算/DB操作をUIに置かない）
- [ ] `SymbolService`（SVG/Style解決）をポート化（QGIS以外にも出せる）
- [ ] 設定（server/local, host, paths, auth）を **一箇所に集約**（.env or yaml）

### NICE（余力：将来の高速化）
- [ ] core/usecases の単体テスト整備（Mongo無しで回る）
- [ ] “package by component” の観点で、DHA/CRS/PolyPL/DocIntをコンポーネント単位に整理
- [ ] 配布物の分離：`gpp-core`（pip）と `gpp-runtime`（conda）を別成果物にする

---

## 9. 次のアクション（Qちゃん提案：最短でClean化を前に進める）
1) core/ports に **まず3つだけ**作る：  
   - `TempWorkspace` / `AssessmentRepository` / `GeoFeatureStore`
2) 既存の機能を1本だけ“縦スライス”で通す：  
   - apps（FastAPI endpoint） → adapter（controller） → usecase → ports → infra（mongo/filesystem）
3) その型を、そのまま CRS / PolyPL / DocInt に横展開

> 「1ルートだけCleanに通す」が最小コストで最大リターン。

---

## 付録：設計ドキュメントに入れておく“巻き戻し防止宣言”（コピペ用）
> MongoDB / FastAPI / QGIS は “Frameworks & Drivers” に属する詳細であり、  
> GPP/DRRの業務語彙（DHA/CRS/DRR 等）は Use Cases に閉じ込める。  
> server/local の差分は設定とDriver実装で吸収し、Entities/Use Cases は共通に保つ。

