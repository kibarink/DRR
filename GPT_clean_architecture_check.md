# GPP クリーンアーキテクチャ適合度チェック（Cleanliness Check）
（Team Q&K / Qちゃん作成）

> 目的：GPP（MongoDB + FastAPI + QGIS + UI群）が **Clean Architecture（依存性逆転 / 境界 / “DBは詳細”）** の原則にどの程度乗っているかを点検し、  
> **DRRへのbranch（派生）** と **conda化（配布ランタイム化）** を安全にする再構成ポイントを明確化する。

---

## 0. 注意（ソース参照について）
ご提示のPDF（GitHub上のPDF）を直接参照して要点引用したかったのですが、こちらの閲覧環境の制約でPDF本文の取得ができませんでした（GitHubのファイル表示がテキスト抽出できず、raw PDFリンクにも到達できない状態）。  
そのため本ドキュメントは **Clean Architectureの一般に共有された原則（依存性ルール／同心円レイヤ／境界の明確化）** を前提に、**現行GPPの構成（会話で確定している範囲）** にマッピングして評価しています。

---

## 1. Clean Architecture “同心円” にGPPを当てはめる（現状マッピング）

### 1.1 レイヤ定義（Clean Architectureの典型）
- **Entities（企業/ドメイン規則）**：最も内側。アプリの用途が変わっても残る「概念」と「不変ルール」
- **Use Cases（アプリ規則）**：業務フロー。入出力ポートを通じて外界とやり取り
- **Interface Adapters**：DB/GUI/Webへの変換層（Repository実装、Presenter、Controller）
- **Frameworks & Drivers**：MongoDB / FastAPI / QGIS / Streamlit / OS / ファイルI/O 等の“詳細”

> 依存性ルール：**外側は内側に依存してよいが、内側は外側に依存しない**

### 1.2 GPPの構成（会話ベースの把握）
- **ドメイン成果物**：PolyPL（地質図→ポリゴン化）、DHA（評価/スコア）、CRS（統合/セグメント）、SVG/Style/QGIS表示
- **UI**：Streamlit / PyQt
- **データ基盤**：MongoDB（SSOT）、一時フォルダ（GeoJSON等）
- **サービス**：FastAPI（/dha/merge、/icon/... 等）

### 1.3 現行GPPの“円”マッピング（推定）
| Clean層 | GPPの該当要素（いまあるもの） | 状態 |
|---|---|---|
| Entities | Facies/Polygon/Well/Score/Age 等の概念、DHA/CRSの基本データ構造 | **概念はあるが、コード上の“純粋Entity”として分離されていない可能性** |
| Use Cases | 「地質図→抽出→GeoJSON→DB格納」「DHA計算→DB→SVG配布」「CRS集約→QGIS反映」 | **一部は手続き的スクリプトに埋まっている可能性** |
| Interface Adapters | MongoDBアクセス、FastAPIのrequest/response、QGIS向け出力変換、SVG生成 | **存在するが境界（インタフェース）が薄い/直結が残っている可能性** |
| Frameworks/Drivers | pymongo, fastapi, requests, qgis, rasterio, filesystem path 等 | **強い（外側が豊富）** |

---

## 2. “クリーン度”の評価（乗っている点 / 再構成すべき点）

### A. すでに Clean Architecture 的に「乗っている」点（Good）
1. **SSOT（MongoDB）を“真”とする方針**  
   - データが中心にあり、UIやSVGは派生物という思想は、Cleanの「詳細は外側」概念と整合。
2. **FastAPIを“配布/取得”の薄い層として扱っている**  
   - QGISがAPIからSVGを取るなど、外側をDriverとして整理しやすい。
3. **GPP→DRRの派生が“概念として可能”な共通基盤**  
   - GeoJSON/属性/表示という流路はDRRにも転用可能。これは「内側（概念）を共有し外側を差し替える」発想に合う。

---

### B. クリーン度を落としやすい典型“匂い”（Smell）と、GPPで起きやすい場所（要注意）
> ※以下は「今の会話で出ている症状」から、発生確率が高いものを先に書きます。

#### Smell-1：ユースケースがMongoDB/ファイルパスに直結
- 例：PolyPLやDHAスクリプト内で `export_dir = r"C:\Users\...\QGIS\geojson\DHA"` のように**OS/環境依存詳細**を直書き
- 例：ユースケース内で `pymongo` を直接呼ぶ（Repository抽象がない）

**影響**
- サーバー/ローカル分岐、GPP/DRR分岐、conda/pip分岐のたびに “内側” まで触ることになる（巻き戻し不能に近づく）

**回避（再構成）**
- Use Caseは `GeoJsonStore` / `AssessmentRepository` / `ExportService` などの**ポート（抽象）**だけに依存
- 実パスは outer（infra）で解決し、設定で注入

---

#### Smell-2：APIパスやデータモデルに“業務語彙”が固定される
- 例：`/dha/merge` のように、**GPP専用語**がHTTP層に刻まれる

**影響**
- DRR派生時にAPIを改名/複製する必要が出る（2系統保守が増える）
- “PF共通層” の粒度が曖昧になる

**回避（再構成）**
- 共通APIは `/assessment/*` `/layer/*` `/symbol/*` のような**汎用語彙**に寄せる
- `DHA` は use-case 名（内部）として持ち、HTTPは表現層として薄くする

---

#### Smell-3：QGIS依存がコアに侵入
- 例：Entity/UseCase層でQGIS特有データ型・スタイル・レイヤ操作を直接行う

**影響**
- 技術士DRR業務で “QGIS以外” を選びたくなったときに詰む
- テストが困難になる

**回避（再構成）**
- QGISは “Driver” と割り切り、`MapViewPort` / `StylePublisher` ポート越しに操作
- コアは GeoJSON・属性・シンボル定義（抽象）だけを出す

---

## 3. 「再構成の最小設計」：GPPをCleanに寄せる“現実的”な切り方

### 3.1 推奨リポジトリ構成（Python想定）
```
gpp/
  core/                 # Entities + UseCases（pure）
    entities/
    usecases/
    ports/              # interfaces (Protocol/ABC)
  adapters/             # interface adapters
    presenters/
    controllers/
    repositories/       # "port" 実装（ただしinfra依存は極力最小）
  infra/                # frameworks & drivers
    mongo/
    filesystem/
    qgis/
    fastapi/
  apps/                 # entrypoints（thin）
    api_server/
    streamlit_app/
    cli/
```

### 3.2 “ポート（抽象）”の最低セット（GPP→DRR branchを楽にする）
- `AssessmentRepository`（read/write: scores, attributes, provenance）
- `GeoFeatureStore`（GeoJSON/Vector: polygons/lines）
- `RasterStore`（GeoTIFF等）
- `SymbolService`（SVG/Styleの解決）
- `TempWorkspace`（一時出力：サーバー/ローカルの差を吸収）
- `Clock/NowProvider`（age/timeスライスの再現性用）

> これらを **core/ports** に置き、実装は infra に置く。

---

## 4. “サーバー版 & ローカル版”をCleanに沿って分離する（DRR巻き戻しの保険）

### 4.1 役割分離（推奨）
- **Server runtime**：MongoDB（共有） + FastAPI（共有）
- **Local runtime**：ローカルMongoDB or JSON cache + ローカルAPI（任意） + 開発/実験用UI

### 4.2 重要：差分は「設定 + Driver」だけに閉じ込める
- core/usecases は **どちらでも同じ**
- 変わるのは：
  - `MongoAssessmentRepository`（server）
  - `LocalAssessmentRepository`（local）
  - `TempWorkspace` 実装（server path / local path）
  - `Auth`（serverのみ）

> この形ができると「GPP社内寄りになって巻き戻せない」問題はほぼ消えます。

---

## 5. conda化の可否を “Clean Architecture観点” で評価

### 5.1 結論
- **conda化は、Clean Architectureの外側（Frameworks & Drivers）に閉じるなら“安全”**
- 危険なのは「conda環境に合わせて core/usecases を変える」こと

### 5.2 conda化が“安全に効く”領域（外側）
- GDAL/PROJ/GEOS、rasterio、fiona、pyproj 等：**infra層**
- QGIS連携に絡むDLL/依存：**infra層**
- UI依存（PyQt/Streamlit）：**apps層**

### 5.3 conda化が“危険”になる兆候（内側への侵入）
- core層で `import rasterio` してしまう（EntityがDriverに依存）
- core層でファイルパスのOS分岐を持つ
- core層で `requests` を使いHTTP呼び出しを始める

### 5.4 推奨（配布戦略）
- **開発（ロジック）**：pip/venv（coreの純度維持、テストしやすい）
- **配布（ランタイム）**：conda（infra/apps依存を丸ごと配る）

> これにより「環境が正義」にならず、Clean原則（詳細は外側）を守れる。

---

## 6. GPPの“クリーン度スコア”（現時点の暫定評価）
会話で確定している範囲からの**暫定**です（実コード確認なし）。

| 観点 | 評価 | 理由（会話ベース） |
|---|---:|---|
| 依存性ルール（内→外を避けているか） | **B** | SSOT思想は良いが、パス直書き・API直結が残りやすい |
| 境界（UseCase/Adapter/Infraの分離） | **B-** | UI/API/DBが増えた段階で境界が必要になっている |
| DRRへの派生容易性（branch耐性） | **B** | 共通基盤の芽はある。API命名と属性定義の独立が鍵 |
| テスト容易性（コアを単体テストできるか） | **C+** | Driver依存がコアに混ざると一気に落ちる（要整備） |
| conda化適性（配布用ランタイム） | **A-** | GIS依存が重いのでcondaは有効。ただし“外側に閉じる”条件付き |

---

## 7. “再構成すべき点”チェックリスト（最小で効く順）
> ここをやると、DRR branch も conda配布も一気に簡単になります。

### MUST（最優先）
- [ ] **一時出力（temp_geojson/export_dir）を `TempWorkspace` で抽象化**（サーバー/ローカル差を封じる）
- [ ] **MongoDBアクセスを `*Repository` ポートに隔離**（usecaseがpymongoを直接呼ばない）
- [ ] **FastAPIのpathを“汎用語彙”に寄せる方針を明文化**（/assessment/* など）
- [ ] **coreのデータモデル（Entity）を純粋化**（QGIS型・DB型・HTTP型を混ぜない）

### SHOULD（次点）
- [ ] **UI（Streamlit/PyQt）からUseCaseを呼ぶだけにする**（UIに計算やDB操作を持ち込まない）
- [ ] **SVG/Styleを `SymbolService` として抽象化**（QGIS以外にも出せる構造）
- [ ] **設定（server/local、paths、hosts）を1箇所に集約**（.env / yaml）

### NICE（余力）
- [ ] **core/usecases の単体テスト**（MongoDBなしで動く）
- [ ] **ドキュメント化：PF共通原則.md / API命名規則.md / スキーマ思想.md**
- [ ] **Packaging：gpp-core（pip） + gpp-runtime（conda）** に分離

---

## 8. DRRへ“巻き戻し不能”を防ぐための宣言（文書に入れる一文）
以下をGPP側の設計ドキュメントに入れておくと、将来のbranchが劇的に安全になります。

> **MongoDB / FastAPI は “PF共通基盤” であり、業務語彙（DHA/CRS/DRR等）は Application（UseCase/Adapter）層に閉じ込める。  
> PF基盤はサーバー/ローカルで差し替え可能な Driver として実装する。**

---

## 9. 次のアクション（Qちゃん提案：最短で“Clean化”を前に進める）
1) `core/ports` に **3つだけ** 先に作る：  
   - `TempWorkspace` / `AssessmentRepository` / `GeoFeatureStore`
2) 既存の1本（例：DHA merge）を“縦スライス”で移植：  
   - apps（FastAPI endpoint） → adapter（controller） → usecase → ports → infra（mongo/filesystem）
3) これが通ったら、同じ型でCRS/PolyPLへ展開

> まず「1ルートだけCleanに通す」ことが、最小コストで最大リターンです。

---

## 付録：conda化を“Clean”のまま実現する最低ルール（5行）
1. core/usecases には **GIS重依存（gdal/rasterio/fiona）を入れない**
2. それらは infra/apps のみに閉じ込める
3. condaは **配布ランタイム**、pip/venvは **開発ロジック**
4. server/local差は **設定 + Driver** で吸収する
5. “動いた環境”は lock（conda list --explicit）で保険を取る

