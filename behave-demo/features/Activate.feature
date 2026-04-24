@ID:PR_01
Feature: Activate
    As a clinician I want to retrieve real-time vital signs and alerts with the MMSS
    So that I can track the patient's vital signs continuously and respond to changes immediately

Rule: The MMSS shall be activated within 10 seconds

Scenario: Show device status on monitor display
    Given the BP Monitor and ECG Monitor are connected to the Device Interface
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 10 seconds
    | device type    | device status |
    | ECG_MONITOR    | ACTIVE        |
    | PULSE_OXIMETER | ACTIVE        |
    | BP_MONITOR     | ACTIVE        |
    | THERMAL_PROBE  | ACTIVE        |
    | CAPNOMETER     | ACTIVE        |
    | EEG_MONITOR    | ACTIVE        |
