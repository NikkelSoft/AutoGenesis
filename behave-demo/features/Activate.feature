@ID:PR_01
Feature: Activate
    As a clinician I want to retrieve real-time vital signs and alerts with the MMSS
    So that I can track the patient's vital signs continuously and respond to changes immediately

Rule: The MMSS shall reflect patient-interface (sensor) connection state changes within 3 seconds
Rule: The MMSS sensor-status overview shall identify each sensor by its clinician-facing label

Scenario: No sensors connected shows every sensor as DISCONNECTED
    Given the simulator is running
    And no sensors are connected in the simulator
    When the MMSS is activated on the OS API
    Then the sensor status is available on the Display Interface within 5 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | DISCONNECTED  |
    | PULSE_OXIMETER | SpO₂ Probe           | DISCONNECTED  |
    | BP_MONITOR     | NIBP Cuff            | DISCONNECTED  |
    | THERMAL_PROBE  | Temperature Probe    | DISCONNECTED  |
    | CAPNOMETER     | EtCO₂ Sampling Line  | DISCONNECTED  |
    | EEG_MONITOR    | EEG Electrodes       | DISCONNECTED  |

Scenario: Only ECG Electrodes connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the ECG Electrodes are connected in the simulator
    Then the sensor status is available on the Display Interface within 3 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | CONNECTED     |
    | PULSE_OXIMETER | SpO₂ Probe           | DISCONNECTED  |
    | BP_MONITOR     | NIBP Cuff            | DISCONNECTED  |
    | THERMAL_PROBE  | Temperature Probe    | DISCONNECTED  |
    | CAPNOMETER     | EtCO₂ Sampling Line  | DISCONNECTED  |
    | EEG_MONITOR    | EEG Electrodes       | DISCONNECTED  |

Scenario: Only NIBP Cuff connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the NIBP Cuff is connected in the simulator
    Then the sensor status is available on the Display Interface within 3 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | DISCONNECTED  |
    | PULSE_OXIMETER | SpO₂ Probe           | DISCONNECTED  |
    | BP_MONITOR     | NIBP Cuff            | CONNECTED     |
    | THERMAL_PROBE  | Temperature Probe    | DISCONNECTED  |
    | CAPNOMETER     | EtCO₂ Sampling Line  | DISCONNECTED  |
    | EEG_MONITOR    | EEG Electrodes       | DISCONNECTED  |

Scenario: Only SpO₂ Probe connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the SpO₂ Probe is connected in the simulator
    Then the sensor status is available on the Display Interface within 3 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | DISCONNECTED  |
    | PULSE_OXIMETER | SpO₂ Probe           | CONNECTED     |
    | BP_MONITOR     | NIBP Cuff            | DISCONNECTED  |
    | THERMAL_PROBE  | Temperature Probe    | DISCONNECTED  |
    | CAPNOMETER     | EtCO₂ Sampling Line  | DISCONNECTED  |
    | EEG_MONITOR    | EEG Electrodes       | DISCONNECTED  |

Scenario: Only Temperature Probe connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the Temperature Probe is connected in the simulator
    Then the sensor status is available on the Display Interface within 3 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | DISCONNECTED  |
    | PULSE_OXIMETER | SpO₂ Probe           | DISCONNECTED  |
    | BP_MONITOR     | NIBP Cuff            | DISCONNECTED  |
    | THERMAL_PROBE  | Temperature Probe    | CONNECTED     |
    | CAPNOMETER     | EtCO₂ Sampling Line  | DISCONNECTED  |
    | EEG_MONITOR    | EEG Electrodes       | DISCONNECTED  |

Scenario: Only EtCO₂ Sampling Line connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the EtCO₂ Sampling Line is connected in the simulator
    Then the sensor status is available on the Display Interface within 3 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | DISCONNECTED  |
    | PULSE_OXIMETER | SpO₂ Probe           | DISCONNECTED  |
    | BP_MONITOR     | NIBP Cuff            | DISCONNECTED  |
    | THERMAL_PROBE  | Temperature Probe    | DISCONNECTED  |
    | CAPNOMETER     | EtCO₂ Sampling Line  | CONNECTED     |
    | EEG_MONITOR    | EEG Electrodes       | DISCONNECTED  |

Scenario: Only EEG Electrodes connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the EEG Electrodes are connected in the simulator
    Then the sensor status is available on the Display Interface within 3 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | DISCONNECTED  |
    | PULSE_OXIMETER | SpO₂ Probe           | DISCONNECTED  |
    | BP_MONITOR     | NIBP Cuff            | DISCONNECTED  |
    | THERMAL_PROBE  | Temperature Probe    | DISCONNECTED  |
    | CAPNOMETER     | EtCO₂ Sampling Line  | DISCONNECTED  |
    | EEG_MONITOR    | EEG Electrodes       | CONNECTED     |

Scenario: All sensors connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the ECG Electrodes are connected in the simulator
    And the SpO₂ Probe is connected in the simulator
    And the NIBP Cuff is connected in the simulator
    And the Temperature Probe is connected in the simulator
    And the EtCO₂ Sampling Line is connected in the simulator
    And the EEG Electrodes are connected in the simulator
    Then the sensor status is available on the Display Interface within 3 seconds
    | device type    | sensor label         | sensor status |
    | ECG_MONITOR    | ECG Electrodes       | CONNECTED     |
    | PULSE_OXIMETER | SpO₂ Probe           | CONNECTED     |
    | BP_MONITOR     | NIBP Cuff            | CONNECTED     |
    | THERMAL_PROBE  | Temperature Probe    | CONNECTED     |
    | CAPNOMETER     | EtCO₂ Sampling Line  | CONNECTED     |
    | EEG_MONITOR    | EEG Electrodes       | CONNECTED     |
