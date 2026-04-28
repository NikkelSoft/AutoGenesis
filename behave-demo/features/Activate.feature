@ID:PR_01
Feature: Activate
    As a clinician I want to retrieve real-time vital signs and alerts with the MMSS
    So that I can track the patient's vital signs continuously and respond to changes immediately

Rule: The MMSS shall be activated within 2 seconds

Scenario: No devices connected shows every device as INACTIVE
    Given no devices are connected to the Device Interface
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only ECG Monitor connected
    Given the following devices are connected to the Device Interface
    | device      |
    | ECG_MONITOR |
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | ACTIVE        |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only BP Monitor connected
    Given the following devices are connected to the Device Interface
    | device     |
    | BP_MONITOR |
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | ACTIVE        |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only Pulse Oximeter connected
    Given the following devices are connected to the Device Interface
    | device         |
    | PULSE_OXIMETER |
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | ACTIVE        |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only Thermal Probe connected
    Given the following devices are connected to the Device Interface
    | device        |
    | THERMAL_PROBE |
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | ACTIVE        |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only Capnometer connected
    Given the following devices are connected to the Device Interface
    | device     |
    | CAPNOMETER |
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | ACTIVE        |
    | EEG_MONITOR    | INACTIVE      |

Scenario: Only EEG Monitor connected
    Given the following devices are connected to the Device Interface
    | device      |
    | EEG_MONITOR |
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | INACTIVE      |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | INACTIVE      |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | ACTIVE        |

Scenario: BP Monitor and ECG Monitor connected
    Given the following devices are connected to the Device Interface
    | device      |
    | BP_MONITOR  |
    | ECG_MONITOR |
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | ACTIVE        |
    | PULSE_OXIMETER | INACTIVE      |
    | BP_MONITOR     | ACTIVE        |
    | THERMAL_PROBE  | INACTIVE      |
    | CAPNOMETER     | INACTIVE      |
    | EEG_MONITOR    | INACTIVE      |

Scenario: All devices connected
    Given all devices are connected to the Device Interface
    When the MMSS is activated via the OS API
    Then the device status is available on the Display Interface within 2 seconds
    | device type    | device status |
    | ECG_MONITOR    | ACTIVE        |
    | PULSE_OXIMETER | ACTIVE        |
    | BP_MONITOR     | ACTIVE        |
    | THERMAL_PROBE  | ACTIVE        |
    | CAPNOMETER     | ACTIVE        |
    | EEG_MONITOR    | ACTIVE        |
