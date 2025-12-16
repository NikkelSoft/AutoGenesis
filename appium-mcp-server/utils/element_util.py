import xml.etree.ElementTree as ET


def is_element_visible(element):
    """Check if element is visible based on its attributes"""
    # Always include root hierarchy element
    if element.tag == "hierarchy":
        return True
    
    # Basic visibility checks
    if element.attrib.get("visible") == "false":
        return False
    
    if element.attrib.get("displayed") == "false":
        return False
    
    # Check width and height attributes directly
    width = element.attrib.get("width", "")
    height = element.attrib.get("height", "")
    
    if width == "0" or height == "0":
        return False
    
    return True


def filter_visible_elements(root):
    """Filter XML tree to keep only visible elements"""
    def filter_tree(element):
        """Recursively filter the tree to keep only visible elements"""
        # Always keep root element
        if element.tag == "hierarchy":
            new_element = ET.Element(element.tag, element.attrib)
            new_element.text = element.text
            new_element.tail = element.tail
            
            # Process children
            for child in element:
                filtered_child = filter_tree(child)
                if filtered_child is not None:
                    new_element.append(filtered_child)
            
            return new_element
        
        # For other elements, check if they or their children are visible
        element_is_visible = is_element_visible(element)
        
        # Recursively process children first
        visible_children = []
        for child in element:
            filtered_child = filter_tree(child)
            if filtered_child is not None:
                visible_children.append(filtered_child)
        
        # Keep element if:
        # 1. The element itself is visible, OR
        # 2. It has visible children (even if parent has size 0)
        if element_is_visible or visible_children:
            new_element = ET.Element(element.tag, element.attrib)
            new_element.text = element.text
            new_element.tail = element.tail
            
            # Add all visible children
            for child in visible_children:
                new_element.append(child)
            
            return new_element
        
        # Filter out this element (not visible and no visible children)
        return None
    
    return filter_tree(root)


def extract_element_info(element):
    info = {
        "title": element.window_text(),
        "control_type": element.element_info.control_type,
        "automation_id": element.element_info.automation_id,
        "class_name": element.element_info.class_name,
        "rectangle": {
            "left": element.rectangle().left,
            "top": element.rectangle().top,
            "right": element.rectangle().right,
            "bottom": element.rectangle().bottom,
        },
        "children": [],
    }
    if (
        element.element_info.automation_id == "RootWebArea"
        and element.element_info.control_type == "Document"
        and element.window_text() not in ["Favorites", "Downloads", "History"]
    ):
        return info

    for child in element.children():
        info["children"].append(extract_element_info(child))
    return info


def simplify_page_source(page_source: str, max_size: int = 200000) -> str:
    """Simplify page source if it's too large by keeping only essential elements"""
   # @jingping
    pass
