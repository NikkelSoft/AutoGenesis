@ID:PR_02.1
Feature: Show Vital Signs
    As a clinician I want to see the patient's current vital signs on the Monitor Display within 5 second of a valid sensor reading
    So that I can make safe, timely clinical decisions at the bedside

Rule: The MMSS shall show the vital sign on the Monitor Display within 5 second after connecting the sensor correctly

Scenario: Show vital signs from ECG Electrodes on Monitor Display
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the ECG Electrodes are connected in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign |
    | Heart Rate |

Scenario: Show vital signs from NIBP Cuff on Monitor Display
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the NIBP Cuff is connected in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign   |
    | Systolic BP  |
    | Diastolic BP |
    | MAP          |

Scenario: Show vital signs from SpO₂ Probe on Monitor Display
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the SpO₂ Probe is connected in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign |
    | SpO2       |
    | Pulse Rate |

Scenario: Show vital signs from EtCO₂ Sampling Line on Monitor Display
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the EtCO₂ Sampling Line is connected in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign       |
    | Respiratory Rate |
    | EtCO2            |

Scenario: Show vital signs from Temperature Probe on Monitor Display
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the Temperature Probe is connected in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign  |
    | Temperature |

Scenario: Show vital signs from EEG Electrodes on Monitor Display
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the EEG Electrodes are connected in the simulator
    Then the following vital signs are visible on the Display Interface within 10 seconds
    | vital sign |
    | BIS        |

Scenario: Show all vital signs when all sensors are connected
    Given the simulator is running
    And no sensors are connected in the simulator
    And the MMSS is running
    When the ECG Electrodes are connected in the simulator
    And the NIBP Cuff is connected in the simulator
    And the SpO₂ Probe is connected in the simulator
    And the EtCO₂ Sampling Line is connected in the simulator
    And the Temperature Probe is connected in the simulator
    And the EEG Electrodes are connected in the simulator
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
