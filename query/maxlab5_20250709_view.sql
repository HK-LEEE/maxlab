USE [AIDB]
GO

/****** Object:  View [dbo].[vw_equipment_status_mock]    Script Date: 2025-07-09 오후 3:29:19 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO



/*
  30개의 고정된 가상 장비 데이터를 반환하는 뷰를 생성합니다.
*/
CREATE VIEW [dbo].[vw_equipment_status_mock] AS
SELECT
    equipment_id,
    equipment_name,
    equipment_type,
    status,
    location,
    last_Stop_date,
    last_run_time,
    active_alarm_count
FROM
    (VALUES
        /* =================================================================== */
        /* == 기존에 생성했던 10개 데이터 (1-10) == */
        /* =================================================================== */
        ('PUMP-001', 'Main Coolant Pump', 'Pump', 'Run', 'Section A-1', CAST('2023-10-15T08:30:00Z' AS DATETIME), CAST('2024-05-20T11:00:00Z' AS DATETIME), 1),
        ('PUMP-002', 'Auxiliary Feed Pump', 'Pump', 'Stop', 'Section A-2', CAST('2024-01-20T14:00:00Z' AS DATETIME), CAST('2024-04-22T09:15:00Z' AS DATETIME), 0),
        ('MOTOR-001', 'Conveyor Belt Motor', 'Motor', 'Stop', 'Section B-1', CAST('2024-05-21T09:00:00Z' AS DATETIME), CAST('2024-05-21T09:05:00Z' AS DATETIME), 1),
        ('VALVE-101', 'Main Steam Valve', 'Valve', 'Run', 'Section C-1', CAST('2023-11-01T10:00:00Z' AS DATETIME), CAST('2024-05-19T18:45:00Z' AS DATETIME), 2),
        ('COMP-001', 'Air Compressor Unit 1', 'Compressor', 'Run', 'Utility Room', CAST('2024-03-10T11:20:00Z' AS DATETIME), CAST('2024-05-18T16:20:00Z' AS DATETIME), 0),
        ('PUMP-003', 'Chemical Injection Pump', 'Pump', 'Run', 'Section D-3', CAST('2024-04-05T16:00:00Z' AS DATETIME), CAST('2024-05-20T14:30:00Z' AS DATETIME), 0),
        ('MOTOR-002', 'Ventilation Fan Motor', 'Motor', 'Run', 'Section B-2', CAST('2024-02-18T09:30:00Z' AS DATETIME), CAST('2024-05-21T07:10:00Z' AS DATETIME), 1),
        ('VALVE-201', 'Drain Valve', 'Valve', 'Stop', 'Section C-2', CAST('2023-12-12T12:00:00Z' AS DATETIME), CAST('2024-05-15T11:55:00Z' AS DATETIME), 0),
        ('COMP-002', 'Air Compressor Unit 2', 'Compressor', 'Pause', 'Utility Room', CAST('2024-03-11T13:45:00Z' AS DATETIME), CAST('2024-05-21T10:30:00Z' AS DATETIME), 3),
        ('HEATEX-01', 'Primary Heat Exchanger', 'HeatExchanger', 'Run', 'Section A-1', CAST('2024-01-30T10:10:00Z' AS DATETIME), CAST('2024-05-20T22:00:00Z' AS DATETIME), 0),

        /* =================================================================== */
        /* == 새롭게 추가한 20개 데이터 (11-30) == */
        /* =================================================================== */
        ('SENSOR-T-01', 'Reactor Temp Sensor', 'Sensor', 'Run', 'Reactor Core', CAST('2024-05-01T00:00:00Z' AS DATETIME), CAST('2024-05-21T12:00:00Z' AS DATETIME), 0),
        ('PUMP-004', 'Slurry Transfer Pump', 'Pump', 'Error', 'Processing Line 1', CAST('2023-12-10T11:00:00Z' AS DATETIME), CAST('2024-05-22T01:30:00Z' AS DATETIME), 5),
        ('FAN-EX-01', 'Main Exhaust Fan', 'Fan', 'Run', 'Rooftop', CAST('2024-04-15T08:00:00Z' AS DATETIME), CAST('2024-05-20T17:00:00Z' AS DATETIME), 0),
        ('TANK-CHEM-01', 'Acid Storage Tank', 'Tank', 'Stop', 'Storage Area A', CAST('2023-09-01T00:00:00Z' AS DATETIME), CAST('2024-03-10T14:20:00Z' AS DATETIME), 0),
        ('FILTER-W-01', 'Water Intake Filter', 'Filter', 'Stop', 'Water Treatment', CAST('2024-05-22T08:00:00Z' AS DATETIME), CAST('2024-05-22T08:15:00Z' AS DATETIME), 1),
        ('MOTOR-003', 'Agitator Motor', 'Motor', 'Run', 'Mixing Tank 3', CAST('2024-03-03T03:03:00Z' AS DATETIME), CAST('2024-05-19T09:00:00Z' AS DATETIME), 0),
        ('VALVE-301', 'Emergency Shutdown Valve', 'Valve', 'Stop', 'Section A-1', CAST('2024-01-01T00:00:00Z' AS DATETIME), CAST('2024-01-01T00:00:00Z' AS DATETIME), 0),
        ('ROBOT-A-01', 'Welding Robot Arm 1', 'Robot', 'Run', 'Assembly Line 1', CAST('2024-02-20T10:00:00Z' AS DATETIME), CAST('2024-05-21T05:45:00Z' AS DATETIME), 1),
        ('SENSOR-P-01', 'Steam Pressure Sensor', 'Sensor', 'Pause', 'Section C-1', CAST('2024-05-10T00:00:00Z' AS DATETIME), CAST('2024-05-21T11:50:00Z' AS DATETIME), 1),
        ('PUMP-005', 'Fire-fighting Pump', 'Pump', 'Stop', 'Safety Zone 1', CAST('2024-05-01T10:00:00Z' AS DATETIME), CAST('2024-05-15T10:05:00Z' AS DATETIME), 0),
        ('CONV-01', 'Main Conveyor Belt', 'Conveyor', 'Run', 'Packaging Line', CAST('2023-11-15T14:30:00Z' AS DATETIME), CAST('2024-05-20T19:30:00Z' AS DATETIME), 0),
        ('GENERATOR-01', 'Emergency Diesel Generator', 'Generator', 'Stop', 'Power House', CAST('2024-04-30T09:00:00Z' AS DATETIME), CAST('2024-05-18T10:00:00Z' AS DATETIME), 0),
        ('HVAC-01', 'HVAC Unit - Sector 7G', 'HVAC', 'Run', 'Office Building', CAST('2024-03-01T00:00:00Z' AS DATETIME), CAST('2024-05-17T13:00:00Z' AS DATETIME), 0),
        ('MOTOR-004', 'Crane Hoist Motor', 'Motor', 'Stop', 'Warehouse', CAST('2024-01-10T16:00:00Z' AS DATETIME), CAST('2024-05-02T11:25:00Z' AS DATETIME), 0),
        ('VALVE-401', 'Coolant Bypass Valve', 'Valve', 'Run', 'Section A-2', CAST('2023-08-20T18:00:00Z' AS DATETIME), CAST('2024-04-29T15:00:00Z' AS DATETIME), 1),
        ('PUMP-006', 'Dosing Pump', 'Pump', 'Run', 'Water Treatment', CAST('2024-02-25T11:45:00Z' AS DATETIME), CAST('2024-05-21T03:10:00Z' AS DATETIME), 0),
        ('SENSOR-L-01', 'Tank Level Sensor', 'Sensor', 'Run', 'Storage Area A', CAST('2024-05-02T00:00:00Z' AS DATETIME), CAST('2024-05-21T08:22:00Z' AS DATETIME), 0),
        ('ROBOT-A-02', 'Painting Robot Arm 2', 'Robot', 'Stop', 'Assembly Line 2', CAST('2024-05-20T09:00:00Z' AS DATETIME), CAST('2024-05-20T09:30:00Z' AS DATETIME), 1),
        ('COMP-003', 'Nitrogen Gas Compressor', 'Compressor', 'Run', 'Utility Room', CAST('2024-01-15T12:00:00Z' AS DATETIME), CAST('2024-05-16T14:50:00Z' AS DATETIME), 0),
        ('HEATEX-02', 'Secondary Heat Exchanger', 'HeatExchanger', 'Pause', 'Section A-2', CAST('2024-02-01T17:00:00Z' AS DATETIME), CAST('2024-05-21T11:40:00Z' AS DATETIME), 2)

    ) AS equipment_data (
        equipment_id, 
        equipment_name, 
        equipment_type, 
        status, 
        location, 
        last_Stop_date, 
        last_run_time, 
        active_alarm_count
    );
GO




;



USE [AIDB]
GO

/****** Object:  View [dbo].[vw_measurement_data_mock]    Script Date: 2025-07-09 오후 3:29:32 ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO




/*
  100개의 고정된 가상 측정 데이터를 반환하는 뷰를 생성합니다.
  - ID, timestamp, spec_status는 쿼리 실행 시 동적으로 계산됩니다.
*/
CREATE VIEW [dbo].[vw_measurement_data_mock] AS
WITH RawMeasurements AS (
    -- 기본 데이터를 VALUES 절로 정의합니다.
    -- 스키마: (equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, usl, lsl, random_offset_seconds)
    SELECT * FROM (
        VALUES
        /* Pump (PUMP-001) */
        ('Pump', 'PUMP-001', 'P-001-SUC', '흡입 압력', 1.5, 2.0, 1.0, 10),
        ('Pump', 'PUMP-001', 'P-001-DIS', '토출 압력', 10.2, 10.0, 8.0, 12),
        ('Pump', 'PUMP-001', 'V-001-AX', '축방향 진동', 2.1, 3.0, NULL, 15),
        ('Pump', 'PUMP-001', 'T-001-BRG', '베어링 온도', 75.5, 80.0, NULL, 20),
        /* Motor (MOTOR-001) */
        ('Motor', 'MOTOR-001', 'A-001-CUR', '전류', 15.3, 20.0, 5.0, 30),
        ('Motor', 'MOTOR-001', 'S-001-RPM', '회전속도', 1780, 1850, 1750, 33),
        ('Motor', 'MOTOR-001', 'T-001-WND', '권선 온도', 95.1, 105.0, NULL, 35),
        /* Valve (VALVE-101) */
        ('Valve', 'VALVE-101', 'POS-101', '개도율', 100.0, NULL, NULL, 50),
        ('Valve', 'VALVE-101', 'DP-101', '차압', 0.5, 0.8, 0.2, 55),
        /* Compressor (COMP-001 & COMP-002) */
        ('Compressor', 'COMP-001', 'P-C01-OUT', '토출 압력', 7.5, 8.0, 7.0, 60),
        ('Compressor', 'COMP-001', 'T-C01-OUT', '토출 온도', 88.0, 95.0, NULL, 62),
        ('Compressor', 'COMP-002', 'P-C02-OUT', '토출 압력', 8.9, 8.0, 7.0, 70), -- ABOVE_SPEC
        ('Compressor', 'COMP-002', 'T-C02-OUT', '토출 온도', 98.5, 95.0, NULL, 73), -- ABOVE_SPEC
        /* Heat Exchanger (HEATEX-01) */
        ('HeatExchanger', 'HEATEX-01', 'T-H01-IN', '입구 온도', 150.2, NULL, NULL, 80),
        ('HeatExchanger', 'HEATEX-01', 'T-H01-OUT', '출구 온도', 85.7, NULL, NULL, 81),
        ('HeatExchanger', 'HEATEX-01', 'F-H01-FLOW', '유량', 120.5, 150.0, 100.0, 85),
        /* Sensor (SENSOR-T-01) */
        ('Sensor', 'SENSOR-T-01', 'TEMP-RT-01', '반응로 온도', 850.1, 900.0, 800.0, 90),
        /* Robot (ROBOT-A-01) */
        ('Robot', 'ROBOT-A-01', 'PWR-R01', '소비 전력', 2.5, 3.0, NULL, 100),
        ('Robot', 'ROBOT-A-01', 'SPD-R01', '동작 속도', 98.5, 100.0, 90.0, 102),
        /* Generator (GENERATOR-01) */
        ('Generator', 'GENERATOR-01', 'VOLT-G01', '전압', 480.0, 485.0, 475.0, 110),
        ('Generator', 'GENERATOR-01', 'FREQ-G01', '주파수', 59.9, 60.1, 59.9, 112),
        /* Add more diverse data to reach ~100 rows */
        ('Pump', 'PUMP-002', 'P-002-SUC', '흡입 압력', 0.8, 2.0, 1.0, 120), -- BELOW_SPEC
        ('Pump', 'PUMP-002', 'P-002-DIS', '토출 압력', 7.5, 10.0, 8.0, 122), -- BELOW_SPEC
        ('Motor', 'MOTOR-002', 'A-002-CUR', '전류', 8.2, 10.0, 3.0, 130),
        ('Motor', 'MOTOR-002', 'S-002-RPM', '회전속도', 2950, 3050, 2950, 133),
        ('Valve', 'VALVE-201', 'POS-201', '개도율', 0.0, NULL, NULL, 140),
        ('Tank', 'TANK-CHEM-01', 'LVL-T01', '저장 레벨', 85.5, 95.0, 10.0, 150),
        ('Filter', 'FILTER-W-01', 'DP-F01', '필터 차압', 1.2, 1.0, 0, 160), -- ABOVE_SPEC
        ('Robot', 'ROBOT-A-02', 'ERR-R02', '에러 코드', 501, NULL, NULL, 170),
        ('Fan', 'FAN-EX-01', 'AMP-F01', '팬 전류', 4.5, 5.0, 1.0, 180),
        ('Pump', 'PUMP-004', 'P-004-SUC', '흡입 압력', 0.2, 2.0, 1.0, 190), -- BELOW_SPEC
        ('Pump', 'PUMP-004', 'T-004-MOT', '모터 온도', 110.0, 105.0, NULL, 195), -- ABOVE_SPEC
        ('Conveyor', 'CONV-01', 'SPD-C01', '벨트 속도', 1.2, 1.5, 0.5, 200),
        ('HVAC', 'HVAC-01', 'T-HVAC-RET', '리턴 공기 온도', 22.5, NULL, NULL, 210),
        ('HVAC', 'HVAC-01', 'T-HVAC-SUP', '공급 공기 온도', 18.1, NULL, 30, 211),
        ('Generator', 'GENERATOR-01', 'FUEL-G01', '연료 레벨', 65.3, 100, 20, 220),
        ('HeatExchanger', 'HEATEX-02', 'T-H02-IN', '입구 온도', 95.3, NULL, NULL, 230),
        ('HeatExchanger', 'HEATEX-02', 'T-H02-OUT', '출구 온도', 60.1, NULL, NULL, 231),
        ('Motor', 'MOTOR-003', 'VIB-M03', '진동', 4.1, 3.5, 0, 240), -- ABOVE_SPEC
        ('Motor', 'MOTOR-004', 'LOAD-M04', '부하율', 75.0, 90.0, 0, 250),
        ('Sensor', 'SENSOR-P-01', 'PRES-S01', '스팀 압력', 12.5, 12.0, 10.0, 260), -- ABOVE_SPEC
        ('Valve', 'VALVE-301', 'POS-301', '개도율', 0.0, NULL, NULL, 270),
        ('Valve', 'VALVE-401', 'POS-401', '개도율', 50.0, NULL, NULL, 280),
        ('Pump', 'PUMP-005', 'PRES-P05', '압력', 0.0, NULL, NULL, 290),
        ('Pump', 'PUMP-006', 'FLOW-P06', '유량', 5.2, 6.0, 4.0, 300),
        ('Sensor', 'SENSOR-L-01', 'LVL-S01', '탱크 레벨', 92.1, 95.0, 5.0, 310),
        ('Compressor', 'COMP-003', 'P-C03-OUT', '토출 압력', 10.1, 10.5, 9.5, 320),
        ('Compressor', 'COMP-003', 'OIL-C03', '오일 레벨', 78.0, 100.0, 50.0, 322),
        ('Pump', 'PUMP-001', 'P-001-SUC', '흡입 압력', 1.6, 2.0, 1.0, 330),
        ('Pump', 'PUMP-001', 'P-001-DIS', '토출 압력', 9.8, 10.0, 8.0, 332),
        ('Motor', 'MOTOR-001', 'S-001-RPM', '회전속도', 1805, 1850, 1750, 340),
        ('Valve', 'VALVE-101', 'DP-101', '차압', 0.4, 0.8, 0.2, 350),
        ('Compressor', 'COMP-001', 'P-C01-OUT', '토출 압력', 7.8, 8.0, 7.0, 360),
        ('HeatExchanger', 'HEATEX-01', 'F-H01-FLOW', '유량', 125.0, 150.0, 100.0, 370),
        ('Sensor', 'SENSOR-T-01', 'TEMP-RT-01', '반응로 온도', 855.2, 900.0, 800.0, 380),
        ('Robot', 'ROBOT-A-01', 'SPD-R01', '동작 속도', 99.1, 100.0, 90.0, 390),
        ('Generator', 'GENERATOR-01', 'FREQ-G01', '주파수', 60.0, 60.1, 59.9, 400),
        ('Pump', 'PUMP-002', 'P-002-DIS', '토출 압력', 8.1, 10.0, 8.0, 410),
        ('Motor', 'MOTOR-002', 'A-002-CUR', '전류', 8.5, 10.0, 3.0, 420),
        ('Tank', 'TANK-CHEM-01', 'LVL-T01', '저장 레벨', 82.1, 95.0, 10.0, 430),
        ('Filter', 'FILTER-W-01', 'DP-F01', '필터 차압', 0.9, 1.0, 0, 440),
        ('Robot', 'ROBOT-A-02', 'POS-R02-X', 'X축 위치', 1024.5, NULL, NULL, 450),
        ('Fan', 'FAN-EX-01', 'AMP-F01', '팬 전류', 4.6, 5.0, 1.0, 460),
        ('Pump', 'PUMP-004', 'P-004-SUC', '흡입 압력', 1.1, 2.0, 1.0, 470),
        ('Conveyor', 'CONV-01', 'LOAD-C01', '부하', 65.0, 80.0, 0, 480),
        ('HVAC', 'HVAC-01', 'HUMID-HVAC', '습도', 55.0, 60.0, 40.0, 490),
        ('HeatExchanger', 'HEATEX-02', 'DP-H02', '차압', 1.8, 2.0, 0.5, 500),
        ('Motor', 'MOTOR-003', 'VIB-M03', '진동', 3.4, 3.5, 0, 510),
        ('Motor', 'MOTOR-004', 'RUNTIME-M04', '가동시간(H)', 2501.5, NULL, NULL, 520),
        ('Sensor', 'SENSOR-P-01', 'PRES-S01', '스팀 압력', 11.8, 12.0, 10.0, 530),
        ('Valve', 'VALVE-401', 'POS-401', '개도율', 50.0, NULL, NULL, 540),
        ('Pump', 'PUMP-006', 'FLOW-P06', '유량', 5.5, 6.0, 4.0, 550),
        ('Sensor', 'SENSOR-L-01', 'LVL-S01', '탱크 레벨', 88.0, 95.0, 5.0, 560),
        ('Compressor', 'COMP-003', 'P-C03-OUT', '토출 압력', 10.3, 10.5, 9.5, 570),
        ('Pump', 'PUMP-001', 'T-001-BRG', '베어링 온도', 72.1, 80.0, NULL, 580),
        ('Motor', 'MOTOR-001', 'A-001-CUR', '전류', 15.8, 20.0, 5.0, 590),
        ('Valve', 'VALVE-101', 'POS-101', '개도율', 100.0, NULL, NULL, 600),
        ('Compressor', 'COMP-002', 'T-C02-OUT', '토출 온도', 96.0, 95.0, NULL, 610),
        ('HeatExchanger', 'HEATEX-01', 'T-H01-OUT', '출구 온도', 88.0, NULL, NULL, 620),
        ('Robot', 'ROBOT-A-01', 'PWR-R01', '소비 전력', 2.6, 3.0, NULL, 630),
        ('Generator', 'GENERATOR-01', 'VOLT-G01', '전압', 481.0, 485.0, 475.0, 640),
        ('Fan', 'FAN-EX-01', 'VIB-F01', '팬 진동', 1.8, 2.5, 0, 650),
        ('Tank', 'TANK-CHEM-01', 'TEMP-T01', '탱크 온도', 25.5, 30.0, 10.0, 660),
        ('Filter', 'FILTER-W-01', 'FLOW-F01', '필터 유량', 250.0, 300.0, 200.0, 670),
        ('Robot', 'ROBOT-A-02', 'CYCLE-R02', '사이클 타임(s)', 15.2, 16.0, 14.0, 680),
        ('HVAC', 'HVAC-01', 'FILTER-DP', '필터 차압', 0.8, 1.2, 0, 690),
        ('Conveyor', 'CONV-01', 'TORQUE-C01', '모터 토크', 88.0, 95.0, 0, 700),
        ('Sensor', 'SENSOR-L-01', 'LVL-S01', '탱크 레벨', 85.0, 95.0, 5.0, 710),
        ('Pump', 'PUMP-003', 'FLOW-P03', '유량', 25.5, 30.0, 20.0, 720),
        ('Motor', 'MOTOR-003', 'TEMP-M03', '모터 온도', 89.0, 105.0, NULL, 730),
        ('Valve', 'VALVE-201', 'LEAK-201', '누설 감지(ppm)', 5, 20, 0, 740),
        ('Compressor', 'COMP-001', 'HOUR-C01', '가동 시간(H)', 4502, NULL, NULL, 750),
        ('HeatExchanger', 'HEATEX-02', 'EFF-H02', '효율(%)', 92.5, 100, 90, 760)
        
    ) AS v(equipment_type, equipment_code, measurement_code, measurement_desc, measurement_value, usl, lsl, random_offset_seconds)
)
-- CTE(RawMeasurements)를 기반으로 최종 뷰 데이터를 구성합니다.
SELECT
    -- ID를 동적으로 생성
    CAST(ROW_NUMBER() OVER (ORDER BY equipment_code, measurement_code) AS INT) AS id,
    equipment_type,
    equipment_code,
    measurement_code,
    measurement_desc,
    CAST(measurement_value AS DECIMAL(18, 5)) AS measurement_value,
    
    -- 현재 시간을 기준으로 랜덤 오프셋을 적용하여 동적인 timestamp 생성
    DATEADD(second, -random_offset_seconds, GETUTCDATE()) AS timestamp,
    
    CAST(usl AS DECIMAL(18, 5)) AS usl,
    CAST(lsl AS DECIMAL(18, 5)) AS lsl,

    -- USL/LSL 값을 기준으로 spec_status를 동적으로 계산
    CASE 
        WHEN usl IS NULL AND lsl IS NULL THEN '９'
        WHEN measurement_value > usl THEN '２'
        WHEN measurement_value < lsl THEN '１'
        ELSE '０'
    END AS spec_status
FROM RawMeasurements;
GO


