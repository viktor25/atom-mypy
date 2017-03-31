'use babel';

export function assert(condition, message) {
    if (condition !== true) {
        throw new Error('AssertionError' + (message !== undefined ? ': ' + message : ''));
    }
}

export function safeParseInt(string) {
    const parsed = Number.parseInt(string, 10);
    assert(parsed.toString() === string, 'safeParseInt');
    return parsed;
}

export class ExternalError extends Error {
    constructor(message, description) {
        super(message);
        this.description = description;
    }
}

export function logInDebugMode(...args) {
    if (atom.config.get('atom-mypy.debug')) {
        console.log('atom-mypy', ...args);
    }
}

export function warnInDebugMode(...args) {
    if (atom.config.get('atom-mypy.debug')) {
        console.warn('atom-mypy', ...args);
    }
}
