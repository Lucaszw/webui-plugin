from path_helpers import path
from webui_plugin import install_requirements


if __name__ == '__main__':
    plugin_root = path(__file__).parent.abspath()
    install_requirements(plugin_root)
