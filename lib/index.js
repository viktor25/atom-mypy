'use babel';

import {assert} from './helpers';
export {config} from './config';
import {MypyLinter} from './linter';

let linter = null;

export function activate() {
    assert(linter === null);
    linter = new MypyLinter();
}

export function deactivate() {
    linter.dispose();
    linter = null;
}

export function provideLinter() {
    assert(linter !== null);
    return linter;
}
