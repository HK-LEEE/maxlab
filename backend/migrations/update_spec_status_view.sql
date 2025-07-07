-- Update the view to return spec_status as string instead of integer
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
        WHEN s.usl IS NOT NULL AND m.measurement_value > s.usl THEN 'ABOVE_SPEC'
        WHEN s.lsl IS NOT NULL AND m.measurement_value < s.lsl THEN 'BELOW_SPEC'
        WHEN s.usl IS NOT NULL OR s.lsl IS NOT NULL THEN 'IN_SPEC'
        ELSE NULL
    END as spec_status
FROM personal_test_measurement_data m
LEFT JOIN measurement_specs s ON m.measurement_code = s.measurement_code;