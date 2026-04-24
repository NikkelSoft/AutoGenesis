# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

import time
from behave import given, when, then
from features.environment import call_tool_sync, get_tool_json


@given("the BP Monitor and ECG Monitor are connected to the Device Interface")
def step_bp_ecg_connected(context):
    # Launch the simulator so the Device Interface has hardware to report.
    result = call_tool_sync(
        context,
        context.sessions["sim"].call_tool(
            name="app_launch",
            arguments={
                "caller": "behave",
                "scenario": context.scenario.name,
                "step": "the BP Monitor and ECG Monitor are connected to the Device Interface",
                "need_snapshot": 0
            }
        ),
        session_name="sim"
    )
    response = get_tool_json(result)
    assert response is not None and response.get("status") == "success", \
        f"Failed to launch MMSS Patient Simulator: {response}"


@when("the MMSS is activated via the OS API")
def step_activate_via_os_api(context):
    context.activation_start_time = time.time()

    result = call_tool_sync(
        context,
        context.session.call_tool(
            name="app_launch",
            arguments={
                "caller": "behave",
                "scenario": context.scenario.name,
                "step": "the MMSS is activated via the OS API",
                "need_snapshot": 0
            }
        )
    )
    response = get_tool_json(result)
    assert response is not None and response.get("status") == "success", \
        f"Failed to launch MMSS Application: {response}"


@then("the device status is available on the Display Interface within 10 seconds")
def step_device_status_on_display(context):
    deadline = context.activation_start_time + 10
    failed_devices = []

    for row in context.table:
        device_type = row["device type"]
        expected_status = row["device status"]
        expected_name = f"● {device_type}: {expected_status}"

        found = False
        while time.time() < deadline:
            result = call_tool_sync(
                context,
                context.session.call_tool(
                    name="verify_element_exists",
                    arguments={
                        "caller": "behave",
                        "control_framework": "pywinauto",
                        "name": expected_name,
                        "control_type": "ListItem",
                        "need_snapshot": 0,
                        "timeout": 2
                    }
                )
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
        f"Device statuses not shown within 10s on Display Interface: {failed_devices}"
