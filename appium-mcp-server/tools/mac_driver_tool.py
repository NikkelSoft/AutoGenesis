import logging
import time
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from appium import webdriver
import json
import os
import logging
import sys
import time
import inspect

# from utils.element_util import extract_element_info
from utils.logger import log_tool_call
from utils.response_format import format_tool_response, init_tool_response
from utils.gen_code import record_calls
from utils.logger import get_mcp_logger
from tools.appium_driver_tool import get_appium_locator
from tools.appium_driver_tool import simplify_page_source


logger = get_mcp_logger()


def _select_best_element(driver, locator, locator_strategy, locator_value):
   # @jingping
    pass

def _is_menu_bar_element(element, driver):
   # @jingping
    pass

async def click_element_macos(caller: str, locator_value: str, locator_strategy: str = "", step: str = "", scenario: str = "", step_raw: str = "", driver_manager=None) -> str:
   # @jingping
    pass


def register_mac_driver_tools(mcp, driver_manager):
    """Register ios driver tools to MCP server."""

    @mcp.tool()
    @log_tool_call
    @record_calls(driver_manager)
    async def send_keys_on_macos(
        caller: str, locator_value: str, locator_strategy: str, text: str, step: str = "", scenario: str = "", step_raw: str = ""
    ) -> str:
        """enter text in element by macos script
        Args:
            caller: caller name
            locator_value: element locator value (e.g., element name, accessibility ID, etc.)
            locator_strategy: strategy of the locator (e.g., 'AppiumBy.ACCESSIBILITY_ID', 'AppiumBy.NAME', 'AppiumBy.XPATH')
            text: text to send
            step: step name
            step_raw: raw original step text
            scenario: scenario name
        """
        resp = init_tool_response()
        try:
            driver = driver_manager._driver
            locator = get_appium_locator(locator_strategy, locator_value)
            resp["status"] = ""
            element = WebDriverWait(driver, 5).until(EC.element_to_be_clickable(locator))
            element.click()
            # Clear existing text first
            element.clear()
            element.send_keys(text)
            current_text = element.get_attribute("value")
            if current_text is None or len(current_text) == 0:
                # If value is None or empty, use os-level input
                driver.execute_script("macos: keys", {"keys": list(text)})
            resp["status"] = "success"
        except Exception as e:
            logger.error(f"Error entering text in element: {e}")
            resp["status"] = "error"
            resp["error"] = f"Element {locator_value} not found or not editable"
        
        # Try to get page source safely
        try:
            driver = driver_manager._driver
            page_source = driver.page_source
            resp["data"] = {"page_source": simplify_page_source(page_source)}
        except Exception as page_e:
            logger.warning(f"Failed to get page source: {page_e}")
            resp["data"] = {"page_source": ""}

        return format_tool_response(resp)

    @mcp.tool()
    @log_tool_call
    @record_calls(driver_manager)
    async def directly_send_keys(caller: str, text: str, step: str = "", scenario: str = "", step_raw: str = "") -> str:
        """Send keys directly to the focused element

        Args:
            text: text to send
            step: step name
            step_raw: raw original step text
            scenario: scenario name
        """
        resp = init_tool_response()
        try:
            driver = driver_manager._driver
            # Use macos script to send keys directly
            time.sleep(2)
            driver.execute_script("macos: keys", {"keys": list(text)})
            resp["status"] = "success"
        except Exception as e:
            logger.error(f"Error sending keys directly: {e}")
            resp["status"] = "error"
            resp["error"] = f"Failed to send keys {text}"
        
        # Try to get page source safely
        try:
            driver = driver_manager._driver
            page_source = driver.page_source
            resp["data"] = {"page_source": simplify_page_source(page_source)}
        except Exception as page_e:
            logger.warning(f"Failed to get page source: {page_e}")
            resp["data"] = {"page_source": ""}
        resp["data"] = {"page_source": simplify_page_source(page_source)}

        return format_tool_response(resp)

    @mcp.tool()
    @log_tool_call
    @record_calls(driver_manager)
    async def right_click_element(caller: str, locator_value: str, locator_strategy: str = "", step: str = "", scenario: str = "", step_raw: str = "") -> str:
        """Right click element with smart menu filtering

        Args:
            locator_value: element locator value (e.g., element name, accessibility ID, etc.)
            locator_strategy: strategy of the locator (e.g., 'AppiumBy.ACCESSIBILITY_ID', 'AppiumBy.NAME', 'AppiumBy.XPATH')
            step: step name
            step_raw: raw original step text
            scenario: scenario name
        """
        resp = init_tool_response()
        try:
            driver = driver_manager._driver
            locator = get_appium_locator(locator_strategy, locator_value)
            
            # Apply smart menu filtering
            selected_element = _select_best_element(driver, locator, locator_strategy, locator_value)
            
            # Perform right-click
            if selected_element:
                actions = ActionChains(driver)
                actions.context_click(selected_element).perform()
                resp["status"] = "success"
            else:
                resp["status"] = "error"
                resp["error"] = f"Element {locator_value} not found"
                
        except Exception as e:
            logger.error(f"Error right-clicking element: {e}")
            resp["status"] = "error"
            resp["error"] = f"Element {locator_value} not found or not clickable"
        
        # Try to get page source safely
        try:
            driver = driver_manager._driver
            page_source = driver.page_source
            resp["data"] = {"page_source": simplify_page_source(page_source)}
        except Exception as page_e:
            logger.warning(f"Failed to get page source: {page_e}")
            resp["data"] = {"page_source": ""}

        return format_tool_response(resp)

    @mcp.tool()
    @log_tool_call
    @record_calls(driver_manager)
    async def press_key(caller: str, key: str, step: str = "", scenario: str = "", step_raw: str = "") -> str:
        """Press a key in Mac app

        Args:
            key: key to press (e.g., 'return', 'space', 'escape', 'command+c', etc.)
            step: step name
            step_raw: raw original step text
            scenario: scenario name
        """
        resp = init_tool_response()
        try:
            driver = driver_manager._driver

            # Map common key names to their actual key codes or characters
            key_mapping = {
                "return": "\n",
                "enter": "\n",
                "space": " ",
                "tab": "\t",
                "escape": "\x1b",
                "backspace": "\x08",
                "delete": "\x7f",
                ".": ".",
            }

            # Handle key combinations (e.g., 'command+c', 'shift+cmd+.')
            if "+" in key:
                parts = key.lower().split("+")
                modifiers = parts[:-1]  # All parts except the last one are modifiers
                actual_key = parts[-1]  # Last part is the actual key

                # Build modifier flags as integer bitmask
                modifier_flags = 0
                for modifier in modifiers:
                    if modifier in ["command", "cmd"]:
                        modifier_flags |= 1 << 4  # Command
                    elif modifier in ["shift"]:
                        modifier_flags |= 1 << 1  # Shift
                    elif modifier in ["control", "ctrl"]:
                        modifier_flags |= 1 << 2  # Control
                    elif modifier in ["option", "alt"]:
                        modifier_flags |= 1 << 3  # Option/Alt
                    elif modifier in ["fn", "function"]:
                        # fn(Function) key support – using next free bit (1<<5) consistent with pattern above
                        # NOTE: In native macOS NSEventModifierFlags, Function key is a higher bit (0x800000),
                        # but the simplified scheme here uses sequential bits. Adjust if upstream changes.
                        modifier_flags |= 1 << 5  # Fn

                # Map the actual key if needed
                mapped_actual_key = key_mapping.get(actual_key.lower(), actual_key)

                # Use macos: keys with proper modifier flags
                time.sleep(2)  # Ensure the app is ready to receive input
                driver.execute_script("macos: keys", {"keys": [{"key": mapped_actual_key, "modifierFlags": modifier_flags}]})
            else:
                # Handle single keys
                mapped_key = key_mapping.get(key.lower(), key)

                if len(mapped_key) == 1:
                    # Single character - use macos: keys
                    driver.execute_script("macos: keys", {"keys": [mapped_key]})
                else:
                    # Multi-character string - use typeText on focused element
                    # First try to find an active text field
                    try:
                        focused_element = driver.switch_to.active_element
                        if focused_element:
                            focused_element.send_keys(mapped_key)
                        else:
                            # No focused element, try to type at system level
                            driver.execute_script("macos: keys", {"keys": list(mapped_key)})
                    except:
                        # Fallback: convert to individual characters
                        driver.execute_script("macos: keys", {"keys": list(mapped_key)})

            resp["status"] = "success"
        except Exception as e:
            resp["error"] = repr(e)
            logger.error(f"Error pressing key: {e}")
        
        # Try to get page source safely
        try:
            driver = driver_manager._driver
            page_source = driver.page_source
            resp["data"] = {"page_source": simplify_page_source(page_source)}
        except Exception as page_e:
            logger.warning(f"Failed to get page source: {page_e}")
            resp["data"] = {"page_source": ""}

        return format_tool_response(resp)

    @mcp.tool()
    @log_tool_call
    @record_calls(driver_manager)
    async def drag_element_to_element(caller: str, source_xpath: str, target_xpath: str, drop_position: str = "center", step: str = "", scenario: str = "", step_raw: str = "") -> str:
       # @jingping
        pass

    @mcp.tool()
    @log_tool_call
    @record_calls(driver_manager)
    async def mouse_hover(caller: str, locator_value: str, locator_strategy: str = "", duration: float = 1.0, step: str = "", scenario: str = "", step_raw: str = "") -> str:
        """Hover mouse over an element with smart menu filtering

        Args:
            locator_value: element locator value (e.g., element name, accessibility ID, etc.)
            locator_strategy: strategy of the locator (e.g., 'AppiumBy.ACCESSIBILITY_ID', 'AppiumBy.NAME', 'AppiumBy.XPATH')
            duration: duration to hover in seconds
            step: step name
            step_raw: raw original step text
            scenario: scenario name
        """
        resp = init_tool_response()
        try:
            driver = driver_manager._driver
            
            # Find the element with smart menu filtering
            locator = get_appium_locator(locator_strategy, locator_value)
            selected_element = _select_best_element(driver, locator, locator_strategy, locator_value)
            
            if not selected_element:
                raise Exception(f"Element '{locator_value}' not found")
            
            # Use ActionChains to perform hover
            actions = ActionChains(driver)
            actions.move_to_element(selected_element).perform()
            
            # Wait for the specified duration
            if duration > 0:
                time.sleep(duration)

            resp["status"] = "success"
        except Exception as e:
            logger.error(f"Error hovering over element {locator_value}: {e}")
            resp["status"] = "error"
            resp["error"] = f"Failed to hover over element {locator_value}"

        # Try to get page source safely
        try:
            driver = driver_manager._driver
            page_source = driver.page_source
            resp["data"] = {"page_source": simplify_page_source(page_source)}
        except Exception as page_e:
            logger.warning(f"Failed to get page source: {page_e}")
            resp["data"] = {"page_source": ""}

        return format_tool_response(resp)

    @mcp.tool()
    @log_tool_call
    @record_calls(driver_manager)
    async def verify_elements_order(caller: str, element_xpaths: list[str], expected_orders: list[int] = [], direction: str = "vertical", step: str = "", scenario: str = "", step_raw: str = "") -> str:
       # @jingping
        pass
