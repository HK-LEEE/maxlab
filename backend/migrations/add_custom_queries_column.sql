-- Add custom_queries column to data_source_configs table
-- 데이터 소스별 커스텀 쿼리 저장을 위한 컬럼 추가

ALTER TABLE data_source_configs 
ADD COLUMN IF NOT EXISTS custom_queries JSONB;

-- 컬럼 설명 추가
COMMENT ON COLUMN data_source_configs.custom_queries IS 'Custom SQL queries for each data type. Structure: {"equipment_status": "SELECT ...", "measurement_data": "SELECT ..."}';

-- 예시 쿼리 구조:
-- {
--   "equipment_status": {
--     "query": "SELECT equip_id as equipment_code, equip_nm as equipment_name, equip_type as equipment_type, run_status as status, last_update as last_run_time FROM equipment_master WHERE 1=1",
--     "description": "Equipment status query"
--   },
--   "measurement_data": {
--     "query": "SELECT m.equip_id as equipment_code, m.measure_cd as measurement_code, m.measure_val as measurement_value, m.measure_dt as timestamp FROM measurements m WHERE 1=1",
--     "description": "Measurement data query"
--   }
-- }