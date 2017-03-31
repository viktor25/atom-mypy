'use babel';

import * as os from 'os';
import * as path from 'path';

export const config = {
    lintOnChange: {
        order: 1,
        title: 'Lint as you type',
        description:
            'If checked, atom-mypy will lint whenever you stop typing. If unchecked, atom-mypy will lint whenever you save the file.',
        type: 'boolean',
        default: true
    },
    mypyCommand: {order: 2, title: 'mypy command', type: 'string', default: 'python3 -m mypy'},
    envMypyPath: {order: 3, title: 'MYPYPATH environment variable', type: 'string', default: ''},
    incrementalMode: {
        order: 4,
        title: 'Incremental mode',
        description: 'Experimental. When enabled, mypy caches results from previous runs to speed up type checking.',
        type: 'boolean',
        default: false
    },
    incrementalCacheDirectory: {
        order: 5,
        title: 'Cache directory',
        description:
            'Used to store module cache info in incremental mode. If this is a name or relative path, it will be created inside every project. If it is an absolute path, atom-mypy will create subdirectories in it for each project.  This directory is only used for projects that do not already configure incremental mode in their mypy.ini',
        type: 'string',
        default: path.join(os.tmpdir(), 'atom-mypy')
    },
    debug: {
        order: 6,
        title: 'Debug',
        description:
            'Print debugging information to the Atom console. This is only useful for debugging atom-mypy itself.',
        type: 'boolean',
        default: false
    }
};
