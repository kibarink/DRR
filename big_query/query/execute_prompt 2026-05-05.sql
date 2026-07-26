SELECT
  *
FROM
  AI.GENERATE_TEXT(
    MODEL `gcp-geoai-sandbox.drr_poc.gemini_flash_model`,
    (
      SELECT
        prompt
      FROM
        `gcp-geoai-sandbox.drr_poc.v_vertexai_cluster_interpretation_prompt_v1`
    ),
    STRUCT(
      0.2 AS temperature,
      3072 AS max_output_tokens
    )
  );