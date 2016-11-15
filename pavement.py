import sys

from paver.easy import task, needs, path
from paver.setuputils import setup, install_distutils_tasks

sys.path.insert(0, path('.').abspath())
import version

setup(name='webui-plugin',
      version=version.getVersion(),
      description='Microdrop web browser user interface',
      keywords='',
      author='Christian Fobel',
      author_email='christian@fobel.net',
      url='https://github.com/wheeler-microfluidics/webui-plugin',
      license='GPL',
      packages=['webui_plugin'],
      install_requires=['Flask>=0.10.1', 'Flask_SocketIO', 'Jinja2>=2.7.3',
                        'MarkupSafe>=0.23', 'Werkzeug>=0.10.4',
                        'itsdangerous>=0.24', 'microdrop-plugin-manager',
                        'path-helpers', 'python-engineio', 'python-socketio',
                        'pyzmq>=15.2.0', 'rename-package-files' 'six>=1.9.0'],
      # Install data listed in `MANIFEST.in`
      include_package_data=True)


@task
@needs('generate_setup', 'minilib', 'setuptools.command.sdist')
def sdist():
    """Overrides sdist to make sure that our setup.py is generated."""
    pass
