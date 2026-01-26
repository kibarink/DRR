# domain/ports.py

# - Entities
# - RiskSegment（CRS）
# - PointScore
# - HazardPolygon（Risk geojson / AE geojson）
# - DocumentMetadata（PDF & Metadata）
# - RasterProduct（TIFF / PNG）

from typing import Protocol, List
from .entities import RiskSegment, PointScore, DocumentMetadata, RasterProduct

class IRiskSegmentRepository(Protocol):
    def save(self, segment: RiskSegment) -> None: ...
    def find_by_id(self, segment_id: str) -> RiskSegment: ...
    def find_all(self) -> List[RiskSegment]: ...

class IPointScoreRepository(Protocol):
    def save_many(self, scores: List[PointScore]) -> None: ...

class IDocumentRepository(Protocol):
    def save_metadata(self, doc: DocumentMetadata) -> None: ...
    def find_by_segment(self, segment_id: str) -> List[DocumentMetadata]: ...

class IRasterRepository(Protocol):
    def save(self, raster: RasterProduct) -> None: ...

class IImageProcessingPipeline(Protocol):
    def generate_geojson(self, input_path: str) -> str: ...

class IRiskCalculator(Protocol):
    def calculate_for_segment(self, segment: RiskSegment) -> float: ...




    # usecases/generate_risk_segments.py

#     - UseCases
# - GenerateRiskSegmentsFromGeoJSON
# - EditRiskSegmentAttributes (AE)
# - ComputePointScores
# - IntegrateDocumentsWithSegments
# - GenerateRiskAttributeMaps
# - ServeMapTilesAndIcons (for QGIS / Web)

# LLM

# ✅ 1. リスクスコアの説明生成（ExplainRiskUseCase）
# - 目的：専門家でない職員や住民に「なぜこの斜面が危険なのか」を自然言語で説明
# - DI設計：
# - 抽象ポート：ILLMExplanationService
# - 実装：OpenAILLMExplanationService（外側）
# - UseCase：ExplainRiskUseCase（内側）
# - 利点：LLMは「地形・住宅・モニタリング」など複数要因を自然言語で統合できる


# 2. 文書要約・意味抽出（SearchDocumentsUseCase）
# - 目的：地滑り関連文書（報告書・論文・行政資料）から意味的要約を抽出
# - DI設計：
# - 抽象ポート：IVectorSearchRepository（検索）＋ ILLMExplanationService（要約）
# - 実装：MongoDB Vector Search + OpenAI
# - 利点：LLMは文脈理解と要約に強く、文書の「意味的タグ付け」に使える

from typing import List
from domain.entities import RiskSegment
from domain.ports import IRiskSegmentRepository, IImageProcessingPipeline

class GenerateRiskSegmentsUseCase:
    def __init__(
        self,
        segment_repo: IRiskSegmentRepository,
        img_pipeline: IImageProcessingPipeline,
    ) -> None:
        self.segment_repo = segment_repo
        self.img_pipeline = img_pipeline

    def execute(self, input_path: str) -> List[RiskSegment]:
        geojson_path = self.img_pipeline.generate_geojson(input_path)
        segments = self._parse_geojson_to_segments(geojson_path)
        for seg in segments:
            self.segment_repo.save(seg)
        return segments

    def _parse_geojson_to_segments(self, path: str) -> List[RiskSegment]:
        ...


# anomaly/detector.py

from domain.entities import SlopeUnit, AnomalyScore
from domain.ports import IAnomalyDetectionService

class AnomalyDetectionService(IAnomalyDetectionService):

    def __init__(self, kg_repo, gis_repo, image_feature_extractor):
        self.kg = kg_repo
        self.gis = gis_repo
        self.img = image_feature_extractor

    def detect_slope_anomalies(self, slope: SlopeUnit) -> AnomalyScore:

        # 1. GIS 空間異常（2dsphere）
        nearby = self.gis.find_nearby_features(slope.geometry, radius=100)
        spatial_score = self._compute_spatial_outlier(slope, nearby)

        # 2. KG 意味論異常（関係の不整合）
        relations = self.kg.get_relations(slope.id)
        semantic_score = self._compute_semantic_anomaly(slope, relations)

        # 3. 画像特徴異常（あなたの pipeline）
        img_features = self.img.extract_features(slope.geometry)
        image_score = self._compute_image_anomaly(img_features)

        # 4. 総合異常スコア
        score = spatial_score + semantic_score + image_score

        return AnomalyScore(
            slope_id=slope.id,
            spatial=spatial_score,
            semantic=semantic_score,
            image=image_score,
            total=score
        )


        # adapters/mongo_repositories.py

# - Interface Adapters
# - MongoRepository（Point / Risk / AE / Raster / PDF）
# - FastAPI Controllers（SVG / geojson / error info）
# - QGIS Plugin / Layer Loader
# - ImageProcessingPipelineAdapter（既存の Python pipeline）

from domain.ports import IRiskSegmentRepository
from domain.entities import RiskSegment

class MongoRiskSegmentRepository(IRiskSegmentRepository):
    def __init__(self, mongo_client):
        self.col = mongo_client["db"]["risk_segments"]

    def save(self, segment: RiskSegment) -> None:
        self.col.update_one(
            {"_id": segment.id},
            {"$set": segment.to_dict()},
            upsert=True,
        )




        # adapters/image_pipeline_adapter.py



from domain.ports import IImageProcessingPipeline

class PythonImageProcessingPipeline(IImageProcessingPipeline):
    def generate_geojson(self, input_path: str) -> str:
        # ここで既存の自作 Python pipeline を呼び出す
        ...

# - Frameworks & Drivers
# - MongoDB
# - FastAPI
# - QGIS
# - Python ランタイム / ライブラリ
# - OS / ファイルシステム


        # main.py

from fastapi import FastAPI, Depends
from adapters.mongo_repositories import MongoRiskSegmentRepository
from adapters.image_pipeline_adapter import PythonImageProcessingPipeline
from usecases.generate_risk_segments import GenerateRiskSegmentsUseCase
from pymongo import MongoClient

app = FastAPI()

def get_mongo_client():
    return MongoClient("mongodb://localhost:27017")

def get_risk_segment_repo(
    client = Depends(get_mongo_client),
):
    return MongoRiskSegmentRepository(client)

def get_image_pipeline():
    return PythonImageProcessingPipeline()

def get_generate_risk_segments_uc(
    repo = Depends(get_risk_segment_repo),
    pipeline = Depends(get_image_pipeline),
):
    return GenerateRiskSegmentsUseCase(repo, pipeline)

@app.post("/risk-segments/generate")
def generate_risk_segments(
    input_path: str,
    uc: GenerateRiskSegmentsUseCase = Depends(get_generate_risk_segments_uc),
):
    segments = uc.execute(input_path)
    return {"count": len(segments)}


# - Risk segment Module
# - Point Scores Attributes
# - Document Intelligence
# を UseCase（内側） として再定義し、
# Mongo / FastAPI / QGIS / 画像処理 pipeline を Adapter + Framework（外側） に押し出すと、
# あなたの思想（透明性・再現性・差し替え可能性）と完全に一致する構造になる
# - DI コンテナ（FastAPI の Depends で十分）は、
# 「UseCase が技術を知らずに済むように、外側で配線する役」 として設計するのが最適
