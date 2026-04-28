# Copyright (c) Microsoft Corporation.
# Licensed under the MIT license.

from asyncio.log import logger
import json
import os
import re
import time
import threading
import asyncio
import janus
import queue
import pathlib
from datetime import datetime
from mcp.client.session import ClientSession
from mcp.client.sse import sse_client
from mcp.client.stdio import stdio_client, StdioServerParameters
from behave.contrib.scenario_autoretry import patch_scenario_with_autoretry
from applicationinsights import TelemetryClient

# Named MCP sessions: short name -> exact server name in .vscode/mcp.json.
# Step definitions use `session_name` when calling `call_tool_sync` to pick a target.
MCP_SESSIONS = {
    "mmss": "auto-genesis-mcp-pywinauto-mmss-stdio",
    "sim": "auto-genesis-mcp-pywinauto-sim-stdio",
}

# Global package variable - loaded from environment
package = os.environ.get('PACKAGE', 'com.microsoft.emmx.canary')


def _find_mcp_config_path():
    current_dir = pathlib.Path(__file__).parent
    while True:
        candidate = current_dir / ".vscode" / "mcp.json"
        if candidate.exists():
            return candidate
        parent = current_dir.parent
        if parent == current_dir:
            raise FileNotFoundError(
                "MCP config file (.vscode/mcp.json) not found in any parent directory "
                f"starting from {pathlib.Path(__file__).parent}"
            )
        current_dir = parent


def load_mcp_config(server_name):
    """Load a specific MCP server configuration from .vscode/mcp.json."""
    mcp_config_path = _find_mcp_config_path()
    print(f"Found MCP config: {mcp_config_path}")

    with open(mcp_config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    servers = config.get("servers", {})
    if server_name not in servers:
        raise ValueError(
            f"MCP server '{server_name}' not found in mcp.json. "
            f"Available servers: {', '.join(servers.keys())}"
        )

    return _parse_server_config(server_name, servers[server_name])


def _parse_server_config(name, server_config):
    """Return a normalised config dict from a raw mcp.json server entry."""
    if "url" in server_config:
        return {"transport": "sse", "url": server_config["url"]}
    if "command" in server_config:
        return {
            "transport": "stdio",
            "command": server_config["command"],
            "args": server_config.get("args", []),
            "env": server_config.get("env", {}),
        }
    raise ValueError(
        f"MCP server '{name}' has neither 'url' (SSE) nor 'command' (stdio) configured."
    )


def _start_mcp_client(context, session_key, server_name):
    """Start a worker thread running an MCP client and store its handle on context."""
    task_queue = janus.Queue()
    result_queue = janus.Queue()
    ready = threading.Event()

    def run_loop():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def worker():
            try:
                mcp_config = load_mcp_config(server_name)
                transport = mcp_config["transport"]

                if transport == "stdio":
                    print(f"[{session_key}] Using stdio transport ({server_name})")
                    server_params = StdioServerParameters(
                        command=mcp_config["command"],
                        args=mcp_config["args"],
                        env={**os.environ, **mcp_config.get("env", {})} or None,
                    )
                    async with stdio_client(server_params) as streams:
                        async with ClientSession(*streams) as session:
                            await session.initialize()
                            context.sessions[session_key] = session
                            ready.set()
                            while True:
                                task = await task_queue.async_q.get()
                                if task is None:
                                    break
                                result = await task
                                await result_queue.async_q.put(result)
                else:
                    print(f"[{session_key}] Using SSE transport: {mcp_config['url']}")
                    async with sse_client(mcp_config["url"]) as streams:
                        async with ClientSession(*streams) as session:
                            await session.initialize()
                            context.sessions[session_key] = session
                            ready.set()
                            while True:
                                task = await task_queue.async_q.get()
                                if task is None:
                                    break
                                result = await task
                                await result_queue.async_q.put(result)
            except Exception as e:
                print(f"[{session_key}] MCP init failed: {repr(e)}")
                ready.set()

        loop.run_until_complete(worker())

    thread = threading.Thread(target=run_loop, daemon=True)
    thread.start()
    ready.wait()

    context._mcp_clients[session_key] = {
        "task_queue": task_queue,
        "result_queue": result_queue,
        "thread": thread,
    }


def call_tool_sync(context, coro, session_name="mmss", timeout=400):
    """Submit an MCP tool coroutine to the named session's worker and wait for the result."""
    client = context._mcp_clients[session_name]
    start = time.time()
    client["task_queue"].sync_q.put(coro)
    while True:
        try:
            return client["result_queue"].sync_q.get_nowait()
        except queue.Empty:
            if time.time() - start > timeout:
                raise TimeoutError(f"MCP tool invocation on '{session_name}' timed out.")
            time.sleep(0.1)


def get_tool_json(result):
    try:
        if isinstance(result, str):
            return result
        items = getattr(result, "content", None)
        if items:
            for item in items:
                if getattr(item, "text", None):
                    return json.loads(item.text)
    except Exception as e:
        print(f"Error getting tool JSON: {e}")
    return None


def take_screenshot(context, scenario_name):
    try:
        screenshot_dir = os.environ.get('SCREENSHOT_DIR')
        if not screenshot_dir:
            current_dir = pathlib.Path(__file__).parent.parent
            screenshot_dir = current_dir / 'screenshots'
            logger.warning(
                f'SCREENSHOT_DIR environment variable not set, using default: {screenshot_dir}'
            )
        else:
            screenshot_dir = pathlib.Path(screenshot_dir)

        screenshot_dir.mkdir(parents=True, exist_ok=True)

        test_name_pattern = clean_test_name(scenario_name)
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        filename = f'{test_name_pattern}_{timestamp}.png'
        screenshot_path = screenshot_dir / filename

        result = call_tool_sync(
            context,
            context.session.call_tool(name="take_screenshot", arguments={"save_path": str(screenshot_path)})
        )
        data = get_tool_json(result)
        status = data.get('status') if isinstance(data, dict) else None
        if status == "success":
            logger.info(f'Screenshot saved: {screenshot_path}')
            return str(screenshot_path)
        logger.error(f'Screenshot failed: {data}')
        return None
    except Exception as e:
        logger.error(f'Error taking screenshot: {str(e)}')
        return None


def clean_test_name(name):
    if not name:
        return ''
    cleaned = re.sub(r'[^\w\s\-]', '_', name)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip().replace(' ', '_')
    cleaned = re.sub(r'_+', '_', cleaned).strip('_')
    return cleaned


def before_all(context):
    if package:
        print(f"Package loaded from environment: {package}")
    else:
        print("Warning: 'package' environment variable not set")

    context.telemetry_client = TelemetryClient('6cfcacca-7f4d-476e-85f4-c184d70ccff9')
    context.sessions = {}
    context._mcp_clients = {}

    for session_key, server_name in MCP_SESSIONS.items():
        _start_mcp_client(context, session_key, server_name)

    # Backward compatibility alias: `context.session` means the primary (MMSS) session.
    context.session = context.sessions.get("mmss")


def after_all(context):
    pass


def before_scenario(context, scenario):
    context.scenario = scenario
    if 'wip' in scenario.tags:
        print(f"Skipping scenario '{scenario.name}' because it is marked as WIP.")
        scenario.skip("Scenario is marked as WIP")


def after_scenario(context, scenario):
    take_screenshot(context, scenario.name)


def before_feature(context, feature):
    for scenario in feature.scenarios:
        patch_scenario_with_autoretry(scenario, max_attempts=1)


def after_step(context, step):
    if step.status != 'skipped':
        context.telemetry_client.track_metric(
            "TestStepExecuted", 1,
            properties={
                "Platform": "",
                "Status": 'Passed' if step.status == 'passed' else 'Failed',
                "RunSource": "OpenSource",
            },
        )
        context.telemetry_client.flush()
