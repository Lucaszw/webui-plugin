from argparse import ArgumentParser
import datetime as dt
import logging
import pkg_resources
import sys

import path_helpers as ph


logger = logging.getLogger(__name__)


def init_hooks(plugin_directory, overwrite=False):
    '''
    Copy default hook scripts to specified plugin.

    Prompt to overwrite a hook script if it already exists (unless
    ``overwrite==True``).

    Parameters
    ----------
    plugin_directory : str
        Microdrop plugin directory
    overwrite : bool
        If `True`, overwrite existing file with same name as output file.
    '''
    plugin_directory = ph.path(plugin_directory)

    # Hook files to copy from plugin template.
    hook_paths = ('hooks/Windows/on_plugin_install.bat',
                  'hooks/Linux/on_plugin_install.sh',
                  'on_plugin_install.py')

    template_hook_paths = \
        [ph.path(pkg_resources.resource_filename('webui_plugin',
                                                 p)).realpath()
         for p in hook_paths]
    plugin_hook_paths = [plugin_directory.joinpath(p).realpath()
                         for p in hook_paths]

    for plugin_path_i, template_path_i in zip(plugin_hook_paths,
                                              template_hook_paths):
        if plugin_path_i.lines() == template_path_i.lines():
            # Contents match.  Nothing to do.
            logger.debug('File contents match: "%s" and "%s"', plugin_path_i,
                         template_path_i)
            continue
        if plugin_path_i.isfile():
            if not overwrite:
                response = None
                skip_file = False
                while response is None:
                    print ('File exists: {}.  '
                           '[(s)kip]/s(k)ip all/(b)ackup/(o)verwrite/'
                           'overwrite (a)ll?'.format(plugin_path_i)),
                    response = raw_input() or 's'
                    if response in ('s', 'skip'):
                        logger.debug('Skipping: %s', plugin_path_i)
                        skip_file = True
                        break
                    elif response in ('k', 'skip all'):
                        logger.debug('Skipping all remaining files')
                        return
                    elif response in ('b', 'backup'):
                        backup_path_i = (plugin_path_i + '.' +
                                         dt.datetime.now()
                                         .strftime('%Y-%m-%dT%Hh%Mm%S'))
                        print 'Wrote backup to: {}'.format(backup_path_i)
                        plugin_path_i.copy(backup_path_i)
                        break
                    elif response in ('o', 'overwrite'):
                        logger.debug('Overwriting: %s', plugin_path_i)
                        break
                    elif response in ('a', 'overwrite all'):
                        logger.debug('Overwriting: %s', plugin_path_i)
                        overwrite = True
                        break
                    else:
                        response = None
                if skip_file:
                    continue
            else:
                logger.debug('Overwriting: %s', plugin_path_i)
        template_path_i.copy(plugin_path_i)


def parse_args(args=None):
    '''Parses arguments, returns ``(options, args)``.'''
    from mpm.bin import LOG_PARSER

    if args is None:
        args = sys.argv

    parser = ArgumentParser(description='Initialize plugin directory with '
                            'latest hook scripts from the '
                            '`webui-plugin` package.',
                            parents=[LOG_PARSER])
    parser.add_argument('-f', '--force-overwrite', action='store_true',
                        help='Force overwrite of existing files')
    parser.add_argument('plugin_directory', type=ph.path, default=ph.path('.'),
                        help='Plugin directory')

    return parser.parse_args()


if __name__ == '__main__':
    args = parse_args()

    logging.basicConfig(level=getattr(logging, args.log_level.upper()))
    #logger.debug('test')
    init_hooks(args.plugin_directory, overwrite=args.force_overwrite)
