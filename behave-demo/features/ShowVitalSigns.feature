@ID:PR_02.1
Feature: Show Vital Signs
    As a clinician I want to see the patient's current vital signs on the Monitor Display within 5 second of a valid sensor reading
    So that I can make safe, timely clinical decisions at the bedside

Rule: The MMSS shall show the vital sign on the Monitor Display within 5 second after connecting the sensor correctly

Scenario: Show vital signs from ECG Monitor on Monitor Display
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the ECG_MONITOR is enabled in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign |
    | Heart Rate |

Scenario: Show vital signs from BP Monitor on Monitor Display
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the BP_MONITOR is enabled in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign   |
    | Systolic BP  |
    | Diastolic BP |
    | MAP          |

Scenario: Show vital signs from Pulse Oximeter on Monitor Display
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the PULSE_OXIMETER is enabled in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign |
    | SpO2       |
    | Pulse Rate |

Scenario: Show vital signs from Capnometer on Monitor Display
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the CAPNOMETER is enabled in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign       |
    | Respiratory Rate |
    | EtCO2            |

Scenario: Show vital signs from Thermal Probe on Monitor Display
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the THERMAL_PROBE is enabled in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign  |
    | Temperature |

Scenario: Show vital signs from EEG Monitor on Monitor Display
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the EEG_MONITOR is enabled in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign |
    | BIS        |

Scenario: Show all vital signs when all devices are connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the ECG_MONITOR is enabled in the simulator
    And the BP_MONITOR is enabled in the simulator
    And the PULSE_OXIMETER is enabled in the simulator
    And the CAPNOMETER is enabled in the simulator
    And the THERMAL_PROBE is enabled in the simulator
    And the EEG_MONITOR is enabled in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign       |
    | Heart Rate       |
    | Systolic BP      |
    | Diastolic BP     |
    | MAP              |
    | SpO2             |
    | Pulse Rate       |
    | Respiratory Rate |
    | EtCO2            |
    | Temperature      |
    | BIS              |
