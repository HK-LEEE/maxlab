-- Data Source Configuration Tables for Multi-Database Support
-- 다중 데이터베이스 지원을 위한 데이터 소스 설정 테이블

-- 1. 데이터 소스 설정 테이블
CREATE TABLE IF NOT EXISTS data_source_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    config_name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('POSTGRESQL', 'MSSQL', 'API')),
    
    -- API 설정
    api_url VARCHAR(500),
    api_key VARCHAR(500),  -- 암호화 저장
    api_headers JSONB,     -- 추가 헤더 정보
    
    -- MSSQL 설정
    mssql_connection_string VARCHAR(500),  -- 암호화 저장
    
    -- 공통 설정
    is_active BOOLEAN DEFAULT true,
    cache_ttl INTEGER DEFAULT 300,
    timeout_seconds INTEGER DEFAULT 30,
    retry_count INTEGER DEFAULT 3,
    
    -- 메타데이터
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(workspace_id, config_name)
);

-- 2. API 엔드포인트 매핑 테이블
CREATE TABLE IF NOT EXISTS api_endpoint_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_id UUID NOT NULL REFERENCES data_source_configs(id) ON DELETE CASCADE,
    data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('EQUIPMENT_STATUS', 'MEASUREMENT_DATA')),
    endpoint_path VARCHAR(500) NOT NULL,
    http_method VARCHAR(10) DEFAULT 'GET',
    request_template JSONB,  -- 요청 템플릿
    response_mapping JSONB,  -- 응답 필드 매핑
    
    UNIQUE(config_id, data_type)
);

-- 3. Measurement Spec 테이블
CREATE TABLE IF NOT EXISTS measurement_specs (
    measurement_code VARCHAR(30) PRIMARY KEY,
    usl DECIMAL(20,3),  -- Upper Spec Limit
    lsl DECIMAL(20,3),  -- Lower Spec Limit
    target DECIMAL(20,3),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 측정 데이터 뷰 (Spec 상태 포함)
CREATE OR REPLACE VIEW v_measurement_data_with_spec AS
SELECT 
    m.id,
    m.equipment_type,
    m.equipment_code,
    m.measurement_code,
    m.measurement_desc,
    m.measurement_value,
    m.timestamp,
    s.usl,
    s.lsl,
    s.target,
    CASE 
        WHEN s.usl IS NOT NULL AND s.lsl IS NOT NULL AND 
             (m.measurement_value > s.usl OR m.measurement_value < s.lsl)
        THEN 1 
        ELSE 0 
    END as spec_status
FROM personal_test_measurement_data m
LEFT JOIN measurement_specs s ON m.measurement_code = s.measurement_code;

-- 5. 인덱스 생성
CREATE INDEX idx_data_source_configs_workspace ON data_source_configs(workspace_id, is_active);
CREATE INDEX idx_api_endpoint_mappings_config ON api_endpoint_mappings(config_id, data_type);
CREATE INDEX idx_measurement_specs_code ON measurement_specs(measurement_code);

-- 6. 샘플 Spec 데이터 삽입
INSERT INTO measurement_specs (measurement_code, lsl, target, usl) VALUES
('TG-001', 200.0, 230.0, 260.0),      -- 압력
('TG-002', 5.0, 10.0, 15.0),          -- 전단차압
('TF-928', 2800000.0, 2900000.0, 3000000.0),  -- 흡입력
('TF-929', 3000000.0, 3100000.0, 3200000.0),  -- 토출압
('TP-101', 20.0, 25.0, 30.0),         -- 온도
('TP-102', 60.0, 65.0, 70.0),         -- 습도
('TS-201', 1200.0, 1250.0, 1300.0),   -- 유량
('PC-101', 3.0, 3.5, 4.0),            -- 압축비
('TC-101', 80.0, 85.0, 90.0),         -- 온도
('FL-201', 400.0, 450.0, 500.0),      -- 유량
('LV-101', 70.0, 75.0, 80.0),         -- 레벨
('PR-101', 95.0, 101.3, 107.0),       -- 압력
('PO-101', 80.0, 85.0, 90.0),         -- 개도율
('TH-101', 240.0, 250.0, 260.0),      -- 온도
('PW-101', 120.0, 125.0, 130.0),      -- 전력
('DF-101', 2.0, 2.5, 3.0),            -- 차압
('TR-101', 340.0, 350.0, 360.0),      -- 반응온도
('PR-102', 20.0, 25.0, 30.0)          -- 반응압력
ON CONFLICT (measurement_code) DO UPDATE SET
    lsl = EXCLUDED.lsl,
    target = EXCLUDED.target,
    usl = EXCLUDED.usl,
    updated_at = NOW();