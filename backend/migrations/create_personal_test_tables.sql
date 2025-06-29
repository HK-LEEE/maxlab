-- Personal Test Process Flow System Tables

-- 공정도 테이블
CREATE TABLE IF NOT EXISTS personal_test_process_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    flow_data JSONB NOT NULL, -- React Flow nodes and edges data
    created_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 설비 운행정보 테이블
CREATE TABLE IF NOT EXISTS personal_test_equipment_status (
    equipment_type VARCHAR(20) NOT NULL,
    equipment_code VARCHAR(30) PRIMARY KEY,
    equipment_name VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'PAUSE', 'STOP')),
    last_run_time TIMESTAMP WITH TIME ZONE
);

-- 측정 데이터 테이블
CREATE TABLE IF NOT EXISTS personal_test_measurement_data (
    id SERIAL PRIMARY KEY,
    equipment_type VARCHAR(20) NOT NULL,
    equipment_code VARCHAR(30) NOT NULL,
    measurement_code VARCHAR(30) NOT NULL,
    measurement_desc VARCHAR(100) NOT NULL,
    measurement_value DECIMAL(20,3) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (equipment_code) REFERENCES personal_test_equipment_status(equipment_code)
);

-- 인덱스 생성
CREATE INDEX idx_personal_test_flows_workspace ON personal_test_process_flows(workspace_id);
CREATE INDEX idx_personal_test_flows_updated ON personal_test_process_flows(updated_at DESC);
CREATE INDEX idx_personal_test_equipment_status ON personal_test_equipment_status(equipment_type, status);
CREATE INDEX idx_personal_test_measurements_equipment ON personal_test_measurement_data(equipment_code, timestamp DESC);
CREATE INDEX idx_personal_test_measurements_time ON personal_test_measurement_data(timestamp DESC);

-- Mock 데이터 삽입
-- 설비 운행정보
INSERT INTO personal_test_equipment_status (equipment_type, equipment_code, equipment_name, status, last_run_time) VALUES
('A1', 'A101', '감압기', 'ACTIVE', '2025-05-28 10:00:00'),
('B1', 'B101', '차압기', 'PAUSE', '2025-05-27 10:23:31'),
('C1', 'C101', '흡착기', 'ACTIVE', '2025-05-27 10:22:31'),
('C2', 'C201', '측정기', 'ACTIVE', '2025-05-27 10:21:31'),
('D1', 'D101', '압축기', 'ACTIVE', '2025-05-28 09:45:00'),
('D2', 'D201', '펌프', 'STOP', '2025-05-26 15:30:00'),
('E1', 'E101', '탱크', 'ACTIVE', '2025-05-28 10:05:00'),
('E2', 'E201', '저장탱크', 'ACTIVE', '2025-05-28 10:10:00'),
('F1', 'F101', '밸브', 'ACTIVE', '2025-05-28 10:15:00'),
('F2', 'F201', '제어밸브', 'PAUSE', '2025-05-27 18:00:00'),
('G1', 'G101', '히터', 'ACTIVE', '2025-05-28 08:00:00'),
('G2', 'G201', '예열기', 'ACTIVE', '2025-05-28 07:30:00'),
('H1', 'H101', '냉각기', 'ACTIVE', '2025-05-28 09:00:00'),
('H2', 'H201', '응축기', 'STOP', '2025-05-25 12:00:00'),
('I1', 'I101', '혼합기', 'ACTIVE', '2025-05-28 10:20:00'),
('I2', 'I201', '교반기', 'ACTIVE', '2025-05-28 10:25:00'),
('J1', 'J101', '분리기', 'PAUSE', '2025-05-27 20:00:00'),
('J2', 'J201', '여과기', 'ACTIVE', '2025-05-28 09:30:00'),
('K1', 'K101', '반응기', 'ACTIVE', '2025-05-28 06:00:00'),
('K2', 'K201', '촉매반응기', 'ACTIVE', '2025-05-28 05:00:00')
ON CONFLICT (equipment_code) DO NOTHING;

-- 측정 데이터
INSERT INTO personal_test_measurement_data (equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value) VALUES
('A1', 'A101', 'TG-001', '압력', 230.000),
('A1', 'A101', 'TG-002', '전단차압', 10.000),
('B1', 'B101', 'TF-928', '흡입력', 2900000.01),
('B1', 'B101', 'TF-929', '토출압', 3100000.00),
('C1', 'C101', 'TP-101', '온도', 25.5),
('C1', 'C101', 'TP-102', '습도', 65.3),
('C2', 'C201', 'TS-201', '유량', 1250.00),
('D1', 'D101', 'PC-101', '압축비', 3.5),
('D1', 'D101', 'TC-101', '온도', 85.2),
('D2', 'D201', 'FL-201', '유량', 450.75),
('E1', 'E101', 'LV-101', '레벨', 75.0),
('E1', 'E101', 'PR-101', '압력', 101.3),
('F1', 'F101', 'PO-101', '개도율', 85.0),
('G1', 'G101', 'TH-101', '온도', 250.0),
('G1', 'G101', 'PW-101', '전력', 125.5),
('H1', 'H101', 'TC-101', '냉각온도', -15.0),
('I1', 'I101', 'SP-101', '회전속도', 1800),
('J1', 'J101', 'DF-101', '차압', 2.5),
('K1', 'K101', 'TR-101', '반응온도', 350.0),
('K1', 'K101', 'PR-101', '반응압력', 25.0);