@ID:PR_01
Feature: Activate
    As a clinician I want to retrieve real-time vital signs and alerts with the MMSS
    So that I can track the patient's vital signs continuously and respond to changes immediately

Rule: The MMSS shall reflect device state changes within 3 seconds

Scenario: No devices connected shows every device as INACTIVE
    Given the simulator is running
    And no devices are enabled in the simulator
    When the MMSS is activated on the OS API
    Then the device status is available on the Display Interface within 5 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only ECG Monitor connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the ECG_MONITOR is enabled in the simulator
    Then the device status is available on the Display Interface within 3 seconds
    | device type    | device status |
    | ECG_MONITOR    | ACTIVE        |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only BP Monitor connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the BP_MONITOR is enabled in the simulator
    Then the device status is available on the Display Interface within 3 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | ACTIVE        |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only Pulse Oximeter connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the PULSE_OXIMETER is enabled in the simulator
    Then the device status is available on the Display Interface within 3 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | ACTIVE        |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only Thermal Probe connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the THERMAL_PROBE is enabled in the simulator
    Then the device status is available on the Display Interface within 3 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | ACTIVE        |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only Capnometer connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the CAPNOMETER is enabled in the simulator
    Then the device status is available on the Display Interface within 3 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | ACTIVE        |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only EEG Monitor connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the EEG_MONITOR is enabled in the simulator
    Then the device status is available on the Display Interface within 3 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | ACTIVE        |

Scenario: All devices connected
    Given the simulator is running
    And no devices are enabled in the simulator
    And the MMSS is running
    When the ECG_MONITOR is enabled in the simulator
    And the PULSE_OXIMETER is enabled in the simulator
    And the BP_MONITOR is enabled in the simulator
    And the THERMAL_PROBE is enabled in the simulator
    And the CAPNOMETER is enabled in the simulator
    And the EEG_MONITOR is enabled in the simulator
    Then the device status is available on the Display Interface within 3 seconds
    | device type    | device status |
    | ECG_MONITOR    | ACTIVE        |
    | PULSE_OXIMETER | ACTIVE        |
    | BP_MONITOR     | ACTIVE        |
    | THERMAL_PROBE  | ACTIVE        |
    | CAPNOMETER     | ACTIVE        |
    | EEG_MONITOR    | ACTIVE        |
