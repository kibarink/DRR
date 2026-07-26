# GCP GeoAI Sandbox PoC 作業記録

作成日: 2026-07-13  
対象期間: 2026-04-28〜2026-05-06  
GCP project: `gcp-geoai-sandbox`

## 1. 文書の目的と記録範囲

本書は、GPP（GeoPolygonProject）の技術検証としてGoogle Cloud Platform上で実施したPoCを、過去のチャット履歴および作成済み技術報告書から再構成した作業記録である。対象は、BigQuery GIS、Vertex AI Embedding、BigQuery Vector Search、Google Earth Engine、Cloud Run Job、Cloud Storageを用いた二つの検証系列である。

1. **GPP GeoSemantic 1.5 Demo**: 石油システムの `source → path → reservoir` パターンをBigQuery GISで評価し、Vertex AIとVector Searchで類似検索する検証。
2. **屋形原DRR GeoAI PoC**: 延岡市北川町屋形原地区を対象に、GSI 5 m DEMをCloud Runで水文処理し、Earth EngineとBigQueryで可視化・候補管理する検証。

両系列は同じGCP projectを利用したが、Earth EngineがGPP GeoSemantic 1.5 Demoへ直接統合されたわけではない。前者におけるEarth Engine統合は未実施であり、後者はDRRユースケースとして独立に実施した。

記録の確度は次の区分で示す。

- **実施済み**: ユーザーの完了報告、出力確認、または技術報告書で実施が確認できたもの。
- **設計・提示済み**: SQL、スクリプトまたは手順が提示されたが、実行完了を履歴から確認できないもの。
- **未実施**: 技術報告書または会話で未実装と明示されたもの。

## 2. 全体構成

| 層 | GCPサービス | 主な役割 | 主な出力 |
|---|---|---|---|
| データ保管 | Cloud Storage | DEM、COG、解析結果の保管 | GeoTIFF、COG、stream polygon、diagnostics |
| バッチ処理 | Cloud Run Job | DEMのfill、flow accumulation、流路抽出等 | `dem_filled`、`flow_accumulation`、`stream_raster`等 |
| 空間分析 | BigQuery GIS | `GEOGRAPHY`管理、空間パターン判定、ランキング | GISテーブル、validation target、map view |
| Semantic分析 | Vertex AI + BigQuery ML | テキストの768次元embedding生成 | embeddingテーブル |
| 類似検索 | BigQuery Vector Search | 成功パターンと候補のsemantic distance評価 | COSINE distance |
| ラスタ可視化 | Google Earth Engine | DEM・水文成果・候補ポリゴンの重畳確認 | EE map、Asset、BigQuery export |

## 3. 時系列サマリー

| 日付 | 作業 | 状態 | 主な結果 |
|---|---|---|---|
| 2026-04-28 | projectとBigQuery GIS基盤を準備 | 実施済み | `gcp-geoai-sandbox`、dataset `gpp_demo` |
| 2026-04-28以降 | RSTC基礎PoC | 実施済み | `rstc_polygons`、`prospectivity_scores`、`ranked_reservoir_polygons` |
| 2026-04-30 | GeoSemantic 1.5 Demoの幾何評価 | 実施済み | dry pathを除外し、`overlooked_validation_targets`を生成 |
| 2026-04-30 | semantic入力テーブル作成 | 実施済み | `pattern_units`、`pattern_units_v2` |
| 2026-04-30 | BigQuery–Vertex AI接続 | 実施済み | connection `vertex_ai_conn`、remote model、IAM付与 |
| 2026-04-30 | embedding・Vector Search | 実施済み | 768次元、COSINE distance `0.305 → 0.039` |
| 2026-05-05 | Earth Engine候補のBigQuery出力 | 実施済み | `drr_poc.kitagawa_slope_candidates_v1`とview |
| 2026-05-05 | 屋形原AOIのBigQuery登録 | 実施済み | raw tableと`v_yakatabaru_valley_aoi` |
| 2026-05-05〜06 | GSI 5 m DEM水文処理 | 実施済み | Cloud Run JobとCloud Storage成果一式 |
| 2026-05-06 | Earth EngineでCOG表示 | 実施済み | filled DEM、flow accumulation、stream rasterを確認 |
| 2026-05-06以降 | 多雨時流量・背水・氾濫proxy（Step G） | 設計段階 | 初期EE実装方針を策定。完了は確認できない |

# Part A: GPP GeoSemantic 1.5 Demo

## 4. 目的

MongoDB Atlas + Voyage AIで構想していたGPPの「見落とし候補検索」を、Google Cloudの次の構成でどこまで再現できるか検証した。

- BigQuery GISによる空間パターン評価
- BigQuery ML remote modelを介したVertex AI Embedding
- BigQuery Vector Searchによるsemantic retrieval

検証対象は、Area 1の成功パターンと、Area 2の既知dry pathである。hidden faultやhidden prospectを正解として先に入力せず、Area 2のsourceとreservoirを固定し、仮想path pointだけを変換してvalidation targetを生成する設計とした。

## 5. BigQuery基盤の準備

### 5.1 Project・API・dataset

- project: `gcp-geoai-sandbox`
- BigQuery dataset: `gpp_demo`
- location: `asia-northeast1`を使用する構成
- 有効化対象: BigQuery、Vertex AI（Earth Engineは別系列でも利用）

初期案には`US`も候補として挙がったが、connection名と履歴から実装は`asia-northeast1`で進めた。query processing location、dataset、connection、remote modelのlocationを合わせる必要がある。

### 5.2 RSTC基礎PoC

1. `rstc_polygons`にReservoir / Seal / Trap / Chargeに相当するポリゴンを`GEOGRAPHY`として格納。
2. 空間的な重なりをSQLで評価。
3. `prospectivity_scores`に要素別の重なりスコアを保存。
4. `ranked_reservoir_polygons`にgeometry付き候補ランキングを作成。

この段階で、BigQuery GISを空間解析と監査可能なSQL出力に利用できることを確認した。

## 6. 1.5 Demoのデータモデル

| テーブル／ビュー | 役割 |
|---|---|
| `nodes` | source、fault_path、reservoir、well等の地質要素 |
| `edges` | `charges`、`flows_along`、`tested_by`、`failed_at`等の関係 |
| `edge_lines` | edgeをLINESTRINGで可視化する補助テーブル |
| `generated_migration_directions_fixed_reservoir` | source/reservoir固定で生成した候補方向 |
| `scored_migration_directions` | 順序付き三点関係の幾何評価結果 |
| `overlooked_validation_targets` | validな未検討方向だけを格納する最終成果 |
| `overlooked_validation_targets_map` | BigQuery Studio地図表示用view |
| `pattern_units` | 初期semantic retrieval入力 |
| `pattern_units_v2` | patternとinterpretationを分離した改良入力 |
| `pattern_unit_embeddings` | 初期summaryのembedding |
| `pattern_unit_embeddings_v2` | `pattern_summary`のembedding |

## 7. BigQuery GISによる候補生成

### 7.1 基準パターン

Area 1の成功例を次の役割付き・順序付き関係として表現した。

```text
source_A1 → fault_A1 / path_A1 → reservoir_A1 → well_A1_success
```

比較単位は単なるL字形ではなく、`source → path → reservoir`という役割と順序を持つ三点関係である。

Area 2には次の既知失敗系列をnegative referenceとして登録した。

```text
source_A2 → fault_A2_direct_failed → reservoir_A2_direct_tested → well_A2_dry
```

### 7.2 候補変換

Area 2のsourceとreservoirを固定し、仮想path pointに4変換を適用した。

| transform | 幾何判定 | 取扱い |
|---|---|---|
| `identity` | 既知dry pathと一致 | `tested_dry_reference`として除外 |
| `flip_lr` | path pointがreservoir側に潰れる | invalid |
| `flip_ud` | path pointがsource側に潰れる | invalid |
| `flip_lr_ud` | 非退化な反転L字 | validなuntested direction |

初期scoringでは、dry pathから最も遠い`flip_lr_ud`が高得点となった。しかし「既知dry pathから遠い」ことは独立性を示すだけで、成功パターンを保持する保証にはならない。この問題を受け、sourceとreservoirを固定し、三点関係の退化・非退化と順序を明示的に評価する方式へ修正した。

`flip_lr_ud`は名前で正解扱いしたのではなく、修正後の幾何条件を満たした結果として残った。

### 7.3 最終出力

`overlooked_validation_targets`にはvalidかつ未検討のmigration directionだけを保存した。誤認防止のため、次のフラグを明示した。

| 列 | 値 |
|---|---|
| `target_type` | `migration_direction_validation_target` |
| `is_confirmed_fault` | `FALSE` |
| `is_confirmed_prospect` | `FALSE` |
| `is_drill_ready_target` | `FALSE` |
| `requires_geologic_validation` | `TRUE` |
| `requires_fault_validation` | `TRUE` |
| `requires_reservoir_trap_validation` | `TRUE` |

したがって、出力はhidden faultの発見でも油ガス存在予測でもなく、地質検証を開始するためのvalidation targetである。

## 8. BigQuery Studioでの可視化

`overlooked_validation_targets_map`を作成し、次を地図上で区別した。

- `source_node`
- `fixed_reservoir_node`
- `validation_path_point`
- `generated_migration_direction_line`
- `tested_dry_reference_line`

これにより、既知source・reservoir、既知dry path、計算生成された検証点、未検討migration directionを一画面で確認できた。

## 9. Vertex AI Embeddingの実装

### 9.1 Connection

BigQueryからVertex AIを呼び出すCloud Resource connectionとして、次のconnectionを作成した。

```sql
CREATE CONNECTION IF NOT EXISTS
  `gcp-geoai-sandbox.asia-northeast1.vertex_ai_conn`
OPTIONS (
  connection_type = 'CLOUD_RESOURCE',
  friendly_name = 'Vertex AI connection for BigQuery embedding PoC',
  description = 'Connection to Vertex AI for GCP GeoAI Sandbox embedding PoC'
);
```

作成後、connectionのservice accountへVertex AI User権限（`roles/aiplatform.user`）を付与し、BigQuery remote model経由でembedding modelを利用できるようにした。remote modelの正確なモデル名は、参照できた作業記録には残っていない。

### 9.2 初期embedding

初期の`semantic_summary`には、成功パターンの説明と、dry、not confirmed、requires validation等の解釈・注意書きが混在していた。これをembedding化してArea 1をqueryとしたところ、Area 2候補との距離は次の値だった。

```text
COSINE distance = 0.305
```

### 9.3 入力文の分離

semantic retrievalに使う構造記述と、判断上の注意書きを次の二列へ分離した。

- `pattern_summary`: 地質パターンの骨格のみ
- `interpretation_summary`: dry、not confirmed、requires validation等

例:

```text
Area 1:
source charges migration path; migration path connects to reservoir;
ordered source-path-reservoir geometry; L-shaped migration pattern

Area 2:
source charges migration direction; generated path connects source to fixed reservoir;
ordered source-path-reservoir geometry; mirrored L-shaped migration pattern
```

`pattern_units_v2`を作成し、`pattern_summary`だけをembedding対象とした。

### 9.4 Embedding出力

BigQuery ML remote modelからVertex AI embedding modelを呼び出し、`pattern_unit_embeddings_v2`へ格納した。確認されたvector次元は次のとおり。

```text
embedding_dim = 768
```

## 10. BigQuery Vector Search

Area 1成功パターンをqueryとして、Area 2 validation targetを検索した。入力文を分離した後の結果は次のとおり。

```text
COSINE distance = 0.039
```

初期値`0.305`から`0.039`へ改善し、両者が`source-path-reservoir`のパターン記述としてsemanticに近いことを確認した。ただし、この距離は地質的妥当性、油ガス存在確率、成功確率を意味しない。

BigQuery Vector Indexの本格作成は未実施であり、小規模PoCとしてVector Searchを確認した段階である。

# Part B: 屋形原DRR GeoAI PoC

## 11. 目的と対象

- 対象: 宮崎県延岡市北川町屋形原地区、屋形原北側小谷
- 主目的: 地形・植生・土砂災害区域を用いた候補抽出と、GSI 5 m DEMによる流下経路・集水傾向の把握
- project: `gcp-geoai-sandbox`
- BigQuery dataset: `drr_poc`
- Cloud Storage bucket: `gcp-geoai-sandbox-drr-export`

## 12. Earth Engineによる初期地形評価

1. 北川・屋形原周辺のAOIを設定。
2. 当初ALOS DEMを利用し、後に解像度と対象地形への適合性からGSI 5 m DEMへ置換。
3. slope、relative elevation、valley floor candidate、source slope candidate、runout attention zone等を計算・表示。
4. slopeとNDVI等から候補ポリゴン`kitagawa_slope_candidates_v1`を作成。
5. Earth Engineの`Export.table.toBigQuery`で`gcp-geoai-sandbox.drr_poc`へ出力。
6. BigQuery側に`v_kitagawa_slope_candidates_v1`を作成し、`MD5(ST_ASGEOJSON(geo))`を用いた安定IDを付与する構成とした。

屋形原小谷のAOIはCSVとしてBigQueryの`yakatabaru_valley_aoi_raw`へロードし、WKTを`ST_GEOGFROMTEXT(wkt)`で変換する`v_yakatabaru_valley_aoi`を作成した。

Earth Engine Assetsとして、少なくとも次を利用した。

| Asset | 用途 |
|---|---|
| `projects/gcp-geoai-sandbox/assets/yakatabaru_house` | 建物ポリゴン |
| `projects/gcp-geoai-sandbox/assets/yakatabaru_flood_aoi` | 水文・氾濫検討AOI |
| `yakatabaru_gsi_dem5m` | GSI 5 m DEM |
| `yakatabaru_sediment_hazard` | A33土砂災害警戒区域 |

後二つは履歴上で短縮名まで確認できたが、完全なAsset pathは記録から確認できなかった。

## 13. Cloud Run JobによるDEM水文処理

### 13.1 入力

- Cloud Run Job: `yakatabaru-hydro-job`
- 元DEM: `gs://gcp-geoai-sandbox-drr-export/DEM_Nobeoka25.tif`
- 対象: 屋形原北側小谷周辺。AOIは約200 m bufferを用いた検討履歴あり。
- clip後DEM: `yakatabaru_dem5m_clip_cog.tif`

### 13.2 処理

Cloud Run Job上で、GSI 5 m DEMに対して次の処理を行った。

1. 対象AOIへのDEM clip
2. sink/depression fill
3. flow accumulation計算
4. 閾値によるstream raster抽出
5. streamのpolygon化
6. Earth Engineから読みやすいCOG形式への変換
7. 処理診断情報の出力

利用したcontainer image名、Python package version、stream閾値、fill algorithmの正確な値は、参照できた履歴には残っていない。

### 13.3 出力

出力prefix:

```text
gs://gcp-geoai-sandbox-drr-export/yakatabaru_f6_outputs_clip/
```

確認された出力群:

- `dem_filled_cog.tif`
- `flow_accumulation_cog.tif`
- `stream_raster_cog.tif`
- stream polygons
- diagnostics

この結果により、desktop GISだけに依存せず、Cloud Storage上のDEMをCloud Runで再現可能なバッチとして処理し、Earth Engineへ渡す流れを実証した。

## 14. Earth Engineでの水文成果確認

Cloud Storage上のCOGを`ee.Image.loadGeoTIFF()`で読み込んだ。

```javascript
var f6OutputPrefix =
  'gs://gcp-geoai-sandbox-drr-export/yakatabaru_f6_outputs_clip/';

var demFilled = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'dem_filled_cog.tif');
var flowAccumulation = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'flow_accumulation_cog.tif');
var streamRaster = ee.Image.loadGeoTIFF(
  f6OutputPrefix + 'stream_raster_cog.tif');
```

Earth Engine上で次を確認した。

- filled DEM
- flow accumulation
- stream raster
- GSI DEM由来の谷線・流下傾向
- A33土砂災害警戒区域との概略整合
- 建物ポリゴンとの位置関係

統合スクリプト案では、`yakatabaru_flood_aoi`でラスタと建物をclipし、建物周辺100 m bufferから`villageArea`を作成した。flow accumulationを`log10`変換し、AOI内のmin/maxで0–1に正規化した`flow_factor`を作る処理、projection・nominal scale・feature count等のdiagnostics出力も提示された。ただし、その後のStep G全体の完了は履歴から確認できない。

## 15. Step G: 多雨・背水・氾濫proxy

次段階として、次の三層を組み合わせる方針を設計した。

1. 簡易水文: 降雨とflow accumulationから小谷流出を近似
2. 背水: 北川本川の水位上昇による排水阻害を近似
3. 氾濫proxy: relative elevation、流路、建物周辺への影響を指標化

初期はEarth Engineでproxy計算し、安定後にCloud Run Jobへ移す方針だった。浅水方程式による本格二次元氾濫解析ではない。履歴で確認できるのは設計・初期スクリプト提示までであり、予測モデルの完成、校正、実降雨による検証は未実施として扱う。

# Part C: 結果・評価・教訓

## 16. 実証できたこと

### 16.1 GPP GeoSemantic

- 地質要素をBigQuery `GEOGRAPHY`として保持できる。
- `source → path → reservoir`の役割付き・順序付き幾何をSQLで評価できる。
- known dry pathをnegative referenceとして保持し、未検討方向をvalidation targetとして出力できる。
- geometry評価とsemantic retrievalを別テーブルで監査可能にできる。
- Vertex AIで768次元embeddingを生成し、BigQuery Vector Searchを実行できる。
- `pattern_summary`と`interpretation_summary`の分離により、COSINE distanceを`0.305`から`0.039`へ改善できる。

### 16.2 Earth Engine／Cloud Run

- GSI 5 m DEMをCloud Storageへ置き、Cloud Run Jobで水文処理できる。
- Cloud Run出力をCOGとしてEarth Engineから直接読み込める。
- DEM由来の流下傾向、土砂災害区域、建物、候補ポリゴンを一つの地図環境で確認できる。
- Earth EngineからBigQueryへ候補featureを出力し、GIS viewとして管理できる。

## 17. 制約と未実施項目

### 17.1 GeoSemantic 1.5 Demo

- 実在faultの検証
- trap / seal / reservoir quality評価
- charge / timing評価
- Earth Engineラスタ属性との直接統合
- Geminiによる説明文生成
- BigQuery Vector Indexの本格作成
- 複数候補・複数basinのランキング
- 実データ投入
- GPP本体との同期
- 社内IAM / Governanceの詳細設計

### 17.2 屋形原DRR

- 降雨量から流量・水位へ変換する校正式
- 北川本川水位による背水モデルの実装・校正
- 観測水位、浸水履歴、流量データによるvalidation
- 本格的なhydrodynamic model
- Step G成果のCloud Run定常処理化

## 18. GCP PoCから得た技術的教訓

1. **BigQuery GISは強いが、手順の履歴化が別途必要。** SQLで再現・監査できる一方、Studio内の断片的なqueryだけでは、なぜその順番で実行したかが失われやすい。
2. **semantic入力設計が検索結果を支配する。** patternとinterpretationを混ぜると、地質パターンの類似性ではなく注意書きの違いがdistanceへ混入する。
3. **embeddingは地質的妥当性を保証しない。** geometry、semantic、地質validationは独立した評価層として保持すべきである。
4. **出力のepistemic statusをschemaで固定する必要がある。** `is_confirmed_fault = FALSE`等を明示し、validation targetを発見・予測と誤読させない。
5. **Earth EngineとCloud Runは役割分担が明確。** Earth Engineは探索的可視化と広域データ統合、Cloud Runは制御可能で再実行可能なバッチ処理に向く。
6. **BigQueryのRDB的堅牢性には運用コストがある。** dataset location、connection、service account、schema、SQL実行順序を厳密に合わせる必要があり、GPPの日常的な仮説更新には操作負荷が大きい。
7. **GCPとAtlasは代替というより役割分担が妥当。** GCPはGeoAnalytical validation layer、Atlasはdocument-nativeなOperational GeoSemantic storeとして整理できる。

## 19. 最終評価

本PoCは、GCP上でGPPのGeoSemantic validationを構成できること、およびCloud Run–Cloud Storage–Earth Engine–BigQueryを接続した地形解析パイプラインを構成できることを実証した。一方、UI操作中心でモジュール選択が多く、SQL・設定・実行順のproject historyが自動的には残らないため、日常的な探鉱仮説管理基盤としてのUXには課題が残った。

したがって、GPPへの示唆は次のとおりである。

> GCPは、計算負荷の高い空間解析、外部ラスタ統合、監査可能なvalidation処理に強い。一方、探鉱知識・仮説・証拠を継続的に更新する中核ストアには、MongoDB Atlas／ローカルMongoDBを含む柔軟なdocument modelが適する。GPPでは両者の強みを分離し、必要な処理だけを疎結合で接続する設計が妥当である。

## 20. 記録上の不足

次の情報は、今回参照できたチャット履歴・技術報告書では確定できなかった。再現性を完全にする場合は、GCP Console、BigQuery query history、Cloud Logging、Cloud Storage object metadataまたは元コードから補完する必要がある。

- BigQueryで実行した全SQLの原文と実行時刻
- Vertex AI remote modelの完全なmodel名とendpoint設定
- Cloud Run container image名、digest、package versions
- DEM処理algorithm、stream抽出閾値、各commandの完全な引数
- Cloud Run JobのCPU、memory、timeout、region、service account
- Earth Engine各Assetの完全なpathとversion
- BigQuery table schema、row count、処理bytes、費用
- 主要エラーのCloud Logging原文

この不足はPoCの成果を否定するものではないが、「同一条件での完全再実行」には補完が必要である。
