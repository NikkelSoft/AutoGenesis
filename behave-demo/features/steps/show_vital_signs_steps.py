import time
from behave import then
from features.environment import call_tool_sync, get_tool_json


@then("the following vital signs are visible on the Display Interface within {seconds:d} seconds")
def step_vital_signs_visible(context, seconds):
    deadline = context.activation_start_time + seconds
    failed_vital_signs = []

    for row in context.table:
        vital_sign = row["vital sign"]

        found = False
        while time.time() < deadline:
            # The selector value label has automation_id VitalSelectorValue_<name> and
            # its UIA title mirrors Label.Text. While the device has no reading the text
            # is "--"; once a real value is shown the title changes (e.g. "85 bpm").
            # verify_element_not_exist uses fuzzy/regex matching on the title, so we
            # ask for the "--" form of this specific label to be absent.
            result = call_tool_sync(
                context,
                context.sessions["mmss"].call_tool(
                    name="verify_element_not_exist",
                    arguments={
                        "caller": "behave",
                        "control_framework": "pywinauto",
                        "name": "--",
                        "automation_id": f"VitalSelectorValue_{vital_sign}",
                        "control_type": "Text",
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
            failed_vital_signs.append(
                f"{vital_sign} (elapsed: {elapsed:.1f}s)"
            )

    assert not failed_vital_signs, \
        f"Vital signs without value within {seconds}s on Display Interface: {failed_vital_signs}"
