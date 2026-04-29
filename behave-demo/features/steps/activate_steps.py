# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

import time
from behave import given, when, then, step
from features.environment import call_tool_sync, get_tool_json


# Sensor (patient interface) checkbox labels in the MMSS Patient Simulator.
# Each label matches the CheckBox text exactly so it can be addressed by name.
SENSOR_CHECKBOXES = {
    "ECG Electrodes",
    "NIBP Cuff",
    "SpO₂ Probe",
    "Temperature Probe",
    "EtCO₂ Sampling Line",
    "EEG Electrodes",
}


def _launch_simulator(context, step_label):
    result = call_tool_sync(
        context,
        context.sessions["sim"].call_tool(
            name="app_launch",
            arguments={
                "caller": "behave",
                "scenario": context.scenario.name,
                "step": step_label,
                "need_snapshot": 0
            }
        ),
        session_name="sim"
    )
    response = get_tool_json(result)
    assert response is not None and response.get("status") == "success", \
        f"Failed to launch MMSS Patient Simulator: {response}"


def _set_checkbox(context, checkbox_name, desired_checked):
    expected_state = "checked" if desired_checked else "unchecked"

    result = call_tool_sync(
        context,
        context.sessions["sim"].call_tool(
            name="verify_checkbox_state",
            arguments={
                "caller": "behave",
                "control_framework": "pywinauto",
                "name": checkbox_name,
                "expected_state": expected_state,
                "control_type": "CheckBox",
                "need_snapshot": 0,
                "timeout": 2
            }
        ),
        session_name="sim"
    )
    response = get_tool_json(result)
    if response is not None and response.get("status") == "success":
        return  # already in the desired state

    result = call_tool_sync(
        context,
        context.sessions["sim"].call_tool(
            name="element_click",
            arguments={
                "caller": "behave",
                "control_framework": "pywinauto",
                "name": checkbox_name,
                "control_type": "CheckBox",
                "need_snapshot": 0,
                "wait_after": 0.2
            }
        ),
        session_name="sim"
    )
    response = get_tool_json(result)
    assert response is not None and response.get("status") == "success", \
        f"Failed to toggle checkbox '{checkbox_name}' to {expected_state}: {response}"


def _set_all_sensors(context, connected_sensors):
    for sensor in SENSOR_CHECKBOXES:
        _set_checkbox(context, sensor, sensor in connected_sensors)


@given("the simulator is running")
def step_simulator_is_running(context):
    _launch_simulator(context, "the simulator is running")


@given("the MMSS is running")
def step_mmss_is_running(context):
    result = call_tool_sync(
        context,
        context.sessions["mmss"].call_tool(
            name="app_launch",
            arguments={
                "caller": "behave",
                "scenario": context.scenario.name,
                "step": "the MMSS is running",
                "need_snapshot": 0
            }
        ),
        session_name="mmss"
    )
    response = get_tool_json(result)
    assert response is not None and response.get("status") == "success", \
        f"Failed to launch MMSS Application: {response}"


@when("the MMSS is activated on the OS API")
def step_mmss_activated_on_os_api(context):
    context.activation_start_time = time.time()
    result = call_tool_sync(
        context,
        context.sessions["mmss"].call_tool(
            name="app_launch",
            arguments={
                "caller": "behave",
                "scenario": context.scenario.name,
                "step": "the MMSS is activated on the OS API",
                "kill_existing": 1,
                "need_snapshot": 0
            }
        ),
        session_name="mmss"
    )
    response = get_tool_json(result)
    assert response is not None and response.get("status") == "success", \
        f"Failed to activate MMSS Application: {response}"


@step("no sensors are connected in the simulator")
def step_no_sensors_connected(context):
    _set_all_sensors(context, set())
    context.activation_start_time = time.time()


# Two phrasings: singular "is" and plural "are" — Behave registers the same
# function under both patterns so the feature file reads naturally.
@step("the {sensor} is connected in the simulator")
@step("the {sensor} are connected in the simulator")
def step_sensor_connected(context, sensor):
    assert sensor in SENSOR_CHECKBOXES, \
        f"Unknown sensor '{sensor}'. Known: {sorted(SENSOR_CHECKBOXES)}"
    _set_checkbox(context, sensor, True)
    context.activation_start_time = time.time()


@then("the sensor status is available on the Display Interface within {seconds:d} seconds")
def step_sensor_status_on_display(context, seconds):
    deadline = context.activation_start_time + seconds
    failed_sensors = []

    for row in context.table:
        sensor_label = row["sensor label"]
        expected_status = row["sensor status"]
        toggle = "●" if expected_status == "CONNECTED" else "○"
        expected_name = f"{toggle} {sensor_label}: {expected_status}"

        found = False
        while time.time() < deadline:
            result = call_tool_sync(
                context,
                context.sessions["mmss"].call_tool(
                    name="verify_element_exists",
                    arguments={
                        "caller": "behave",
                        "control_framework": "pywinauto",
                        "name": expected_name,
                        "control_type": "ListItem",
                        "need_snapshot": 0,
                        "timeout": 1
                    }
                ),
                session_name="mmss"
            )
            response = get_tool_json(result)
            if response is not None and response.get("status") == "success":
                found = True
                break
            time.sleep(0.2)

        if not found:
            elapsed = time.time() - context.activation_start_time
            failed_sensors.append(
                f"{sensor_label}={expected_status} (elapsed: {elapsed:.1f}s)"
            )

    assert not failed_sensors, \
        f"Sensor statuses not shown within {seconds}s on Display Interface: {failed_sensors}"
