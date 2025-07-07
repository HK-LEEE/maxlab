-- Create a function to calculate spec_status automatically
CREATE OR REPLACE FUNCTION calculate_spec_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Get the spec limits for this equipment/measurement combination
    SELECT usl, lsl INTO NEW.usl, NEW.lsl
    FROM personal_test_measurement_specs
    WHERE equipment_code = NEW.equipment_code 
    AND measurement_code = NEW.measurement_code;
    
    -- Calculate spec_status
    IF NEW.usl IS NOT NULL AND NEW.measurement_value > NEW.usl THEN
        NEW.spec_status = 1;  -- Out of spec (above USL)
    ELSIF NEW.lsl IS NOT NULL AND NEW.measurement_value < NEW.lsl THEN
        NEW.spec_status = 1;  -- Out of spec (below LSL)
    ELSIF NEW.usl IS NOT NULL OR NEW.lsl IS NOT NULL THEN
        NEW.spec_status = 0;  -- Within spec
    ELSE
        NEW.spec_status = 0;  -- No spec defined, assume OK
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically calculate spec_status on insert
CREATE TRIGGER measurement_spec_status_insert
BEFORE INSERT ON personal_test_measurement_data
FOR EACH ROW
EXECUTE FUNCTION calculate_spec_status();

-- Create trigger to automatically calculate spec_status on update
CREATE TRIGGER measurement_spec_status_update
BEFORE UPDATE OF measurement_value ON personal_test_measurement_data
FOR EACH ROW
EXECUTE FUNCTION calculate_spec_status();