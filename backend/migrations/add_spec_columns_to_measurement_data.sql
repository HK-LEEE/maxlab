-- Add USL, LSL, and spec_status columns to personal_test_measurement_data table
ALTER TABLE personal_test_measurement_data
ADD COLUMN IF NOT EXISTS usl FLOAT,
ADD COLUMN IF NOT EXISTS lsl FLOAT,
ADD COLUMN IF NOT EXISTS spec_status INTEGER DEFAULT 0;

-- Add index on spec_status for performance
CREATE INDEX IF NOT EXISTS idx_measurement_data_spec_status 
ON personal_test_measurement_data(spec_status);

-- Update existing records to calculate spec_status based on measurement_specs
UPDATE personal_test_measurement_data md
SET 
    usl = ms.usl,
    lsl = ms.lsl,
    spec_status = CASE 
        WHEN ms.usl IS NOT NULL AND md.measurement_value > ms.usl THEN 1
        WHEN ms.lsl IS NOT NULL AND md.measurement_value < ms.lsl THEN 1
        WHEN ms.usl IS NOT NULL OR ms.lsl IS NOT NULL THEN 0
        ELSE 0
    END
FROM personal_test_measurement_specs ms
WHERE md.equipment_code = ms.equipment_code 
AND md.measurement_code = ms.measurement_code;