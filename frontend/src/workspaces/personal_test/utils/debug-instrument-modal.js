// Debug helper to test InstrumentDetailModal data mapping
// This script helps verify that measurement data is properly displayed

// Sample measurement data structure from API
const sampleMeasurement = {
  measurement_code: "INST_001",
  measurement_desc: "Temperature Sensor",
  measurement_value: 25.5,
  unit: "°C",
  spec_status: 0,  // IN_SPEC
  upper_spec_limit: 30,
  lower_spec_limit: 20,
  timestamp: new Date().toISOString()
};

// Log the expected field mappings
console.log("=== Instrument Modal Field Mapping ===");
console.log("API Field -> Modal Display");
console.log("measurement_code ->", sampleMeasurement.measurement_code);
console.log("measurement_desc ->", sampleMeasurement.measurement_desc);
console.log("measurement_value ->", sampleMeasurement.measurement_value);
console.log("spec_status ->", sampleMeasurement.spec_status);
console.log("upper_spec_limit ->", sampleMeasurement.upper_spec_limit);
console.log("lower_spec_limit ->", sampleMeasurement.lower_spec_limit);

// Helper to validate measurement data
window.validateMeasurementData = function(measurements) {
  console.log("=== Validating Measurement Data ===");
  measurements.forEach((m, index) => {
    console.log(`Measurement ${index + 1}:`);
    console.log("  - Code:", m.measurement_code || "UNDEFINED");
    console.log("  - Desc:", m.measurement_desc || "UNDEFINED");
    console.log("  - Value:", m.measurement_value !== undefined ? m.measurement_value : "UNDEFINED");
    console.log("  - Spec Status:", m.spec_status !== undefined ? m.spec_status : "UNDEFINED");
    console.log("  - USL:", m.upper_spec_limit || m.usl || "Not set");
    console.log("  - LSL:", m.lower_spec_limit || m.lsl || "Not set");
  });
};

console.log("Debug helper loaded. Use window.validateMeasurementData(measurements) to validate data.");