import xml.etree.ElementTree as ET
def parse_xml(xml_string):
    tree = ET.fromstring(xml_string)  # BUG: external entities not blocked
    return tree