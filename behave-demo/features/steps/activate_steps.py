# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

import time
from behave import given, when, then, step
from features.environment import call_tool_sync, get_tool_json


# Maps MMSS.APP device names (used in the Display Interface) to the
# corresponding checkbox labels in the MMSS Patient Simulator.
DEVICE_CHECKBOX_MAP = {
    "ECG_MONITOR": "ECG Monitor",
    "PULSE_OXIMETER": "Pulse Oximeter",
    "BP_MONITOR": "BP Monitor",
    "THERMAL_PROBE": "Thermal Probe",
    "CAPNOMETER": "Capnometer",
    "EEG_MONITOR": "EEG Monitor",
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
                "need_snapshot": 0
            }
        ),
        session_name="sim"
    )
    response = get_tool_json(result)
    assert response is not None and response.get("status") == "success", \
        f"Failed to toggle checkbox '{checkbox_name}' to {expected_state}: {response}"


def _configure_devices(context, connected_devices):
    for device_type, checkbox_name in DEVICE_CHECKBOX_MAP.items():
        _set_checkbox(context, checkbox_name, device_type in connected_devices)


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


@step("no devices are enabled in the simulator")
def step_no_devices_enabled(context):
    _configure_devices(context, set())
    context.activation_start_time = time.time()


@step("the {device} is enabled in the simulator")
def step_device_enabled(context, device):
    assert device in DEVICE_CHECKBOX_MAP, \
        f"Unknown device '{device}'. Known: {sorted(DEVICE_CHECKBOX_MAP.keys())}"
    _set_checkbox(context, DEVICE_CHECKBOX_MAP[device], True)
    context.activation_start_time = time.time()


@then("the device status is available on the Display Interface within 2 seconds")
def step_device_status_on_display(context):
    deadline = context.activation_start_time + 2
    failed_devices = []

    for row in context.table:
        device_type = row["device type"]
        expected_status = row["device status"]
        expected_name = f"● {device_type}: {expected_status}"

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
                        "timeout": 2
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
            failed_devices.append(
                f"{device_type}={expected_status} (elapsed: {elapsed:.1f}s)"
            )

    assert not failed_devices, \
        f"Device statuses not shown within 2s on Display Interface: {failed_devices}"
