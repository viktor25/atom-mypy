'use babel';

import * as path from 'path';
import {createHash} from 'crypto';
import * as unpromisifiedFs from 'fs';
import * as Bluebird from 'bluebird';
import * as ini from 'ini';
import * as shellQuote from 'shell-quote';
import {CompositeDisposable} from 'atom';
import * as atomLinter from 'atom-linter';
import {assert, ExternalError} from './helpers';
import * as helpers from './helpers';

const fs = Bluebird.promisifyAll(unpromisifiedFs);

export class MypyLinter {
    name = 'mypy';
    scope = 'file';
    lintsOnChange = false;
    grammarScopes = ['source.python'];

    subscriptions = new CompositeDisposable();

    constructor() {
        this.subscriptions.add(atom.config.observe('atom-mypy.lintOnChange', value => {
            this.lintsOnChange = value;
        }));
    }

    async lint(textEditor) {
        const editorPath = textEditor.getPath();

        try {
            const initialEditorText = textEditor.getText();

            const config = await this.getConfig(editorPath);
            const workingDirectory = this.chooseWorkingDirectory(config, editorPath);
            const [mypyOutput, debugInfo] = await this.runMypy(textEditor, config, workingDirectory);

            let messages = null;
            if (textEditor.isAlive() && textEditor.getText() === initialEditorText) {
                messages = await this.parseMypyOutput(mypyOutput, textEditor, workingDirectory);
            }

            debugInfo.messages = messages;
            helpers.logInDebugMode(
                'lint' + (messages === null ? ' aborted because editor content changed' : ''), debugInfo);
            return messages;
        } catch (error) {
            if (error instanceof ExternalError) {
                return [{
                    severity: 'error',
                    location: {file: editorPath, position: atomLinter.generateRange(textEditor, 0, null)},
                    excerpt: error.message,
                    description: '```\n' + error.description + '\n```'
                }];
            } else {
                throw error;
            }
        }
    }

    async parseMypyOutput(mypyOutput, textEditor, workingDirectory) {
        const buffer = textEditor.getBuffer();
        const editorPath = textEditor.getPath();
        const lines = mypyOutput.split(/\r?\n/g);
        const relativeEditorPath = path.relative(workingDirectory, editorPath);
        const messages = [];

        lines.forEach(line => {
            let lineTail = null;

            if (line.indexOf(relativeEditorPath + ':') === 0) {
                lineTail = line.slice(relativeEditorPath.length);
            } else if (line.indexOf(editorPath + ':') === 0) {
                lineTail = line.slice(editorPath.length);
            }

            if (lineTail !== null) {
                const regex = /:(\d+):(?:(\d+):)? (error|warning|note): (.*)/;
                const results = regex.exec(lineTail);

                if (results !== null) {
                    // mypy shows 1-based lines and 0-based columns
                    const lineNumber = helpers.safeParseInt(results[1]) - 1;
                    // at the time of writing, mypy master doesn't show column numbers (as well as showing internal
                    // errors about __builtins__).
                    // todo: check again with next mypy version (after v0.501), remove
                    // no-column hacks if this was just alpha breakage.
                    let columnNumber = (results[2] !== undefined ? helpers.safeParseInt(results[2]) : null);
                    let severity = results[3];
                    const message = results[4];

                    if (columnNumber !== null) {
                        // sometimes mypy gives wrong column numbers (todo: file a bug)
                        // for example, if the first line is 'import datetime"', the error is at 1:17, but the line has
                        // length 16 (17 if we count the new line character, which was just \n, not \r\n), anc mypy's
                        // column numbers are 0-based. lineForRow returns the line without the ending, so the following
                        // can result in columnNumber referring to the line ending.  But this is the check done by
                        // atomLinter.generateRange.
                        const maxColumnNumber = buffer.lineForRow(lineNumber).length;
                        if (columnNumber > maxColumnNumber) {
                            if (columnNumber > maxColumnNumber + 1) {
                                helpers.warnInDebugMode('column error > 1');
                            }
                            columnNumber = maxColumnNumber;
                        }
                    }

                    if (severity === 'note') {
                        severity = 'info';
                    }

                    messages.push({
                        severity: severity,
                        location: {
                            file: editorPath,
                            // atomLinter.generateRange will highlight the whole line if columnNumber is null
                            position: atomLinter.generateRange(textEditor, lineNumber, columnNumber)
                        },
                        excerpt: message,
                    });
                } else {
                    helpers.warnInDebugMode('regex does not match', JSON.stringify(lineTail));
                }
            }
        });

        return messages;
    }

    async runMypy(textEditor, config, workingDirectory) {
        const editorPath = textEditor.getPath();
        const editorBaseName = path.basename(editorPath);
        const editorText = textEditor.getText();

        const executable = config.mypyCommand[0];
        const baseArgs = config.mypyCommand.slice(1);
        const cacheArgs =
            (config.incrementalMode ?
                 ['--incremental', '--cache-dir', this.chooseCacheDirectory(config, workingDirectory)] :
                 []);
        const execOptions =
            {stream: 'both', cwd: workingDirectory, ignoreExitCode: true, env: {MYPYPATH: config.envMypyPath}};

        let args, execResult;
        if (textEditor.isModified()) {
            execResult = await atomLinter.tempFile(editorBaseName, editorText, tempFilePath => {
                args = [
                    ...baseArgs,
                    '--show-column-numbers',
                    '--shadow-file',
                    editorPath,
                    tempFilePath,
                    ...cacheArgs,
                    editorPath,
                ];

                return atomLinter.exec(executable, args, execOptions);
            });
        } else {
            args = [
                ...baseArgs,
                '--show-column-numbers',
                ...cacheArgs,
                editorPath,
            ];

            execResult = await atomLinter.exec(executable, args, execOptions);
        }

        const debugInfo = {
            config: config,
            executable: executable,
            args: args,
            options: execOptions,
            result: execResult,
        };

        // We cannot rely on the exit code - for example, both "file not found" and "file has errors" result in
        // exit code 1.
        if (execResult.stderr !== '') {
            // todo: How do we get debug info if we throw?  Duplicating the log command is a hack.
            helpers.logInDebugMode('run', debugInfo);
            throw new ExternalError(
                'mypy failed; hover over line 1 and expand the tooltip for details', execResult.stderr);
        }

        return [execResult.stdout, debugInfo];
    }

    chooseWorkingDirectory(config, filePath) {
        // If we have a config file, run from its directory.
        if (config.CONFIG_FILE_PATH !== null) {
            return path.dirname(config.CONFIG_FILE_PATH);
        } else {
            // If we are in a project, run from the project root directory.
            const projectDirectory = atom.project.relativizePath(filePath)[0];
            if (projectDirectory !== null) {
                return projectDirectory;
            } else {
                // Fall back to the directory of the file.
                return path.dirname(filePath);
            }
        }
    }

    chooseCacheDirectory(config, workingDirectory) {
        let cacheDirectory = config.incrementalCacheDirectory;
        assert(cacheDirectory !== '', 'cache directory path is empty');

        if (path.isAbsolute(cacheDirectory)) {
            // This ensures that we don't use the same cache directory for multiple projects
            const workingDirectoryHash = createHash('md5').update(workingDirectory).digest('hex');
            const subirectoryName = path.basename(workingDirectory) + '-' + workingDirectoryHash
            cacheDirectory = path.join(cacheDirectory, subirectoryName);
        }

        return cacheDirectory;
    }

    async getConfig(filePath) {
        const config = {};

        const configFileKeys = ['envMypyPath'];
        const atomSettingsKeys =
            configFileKeys.concat(['mypyCommand', 'incrementalMode', 'incrementalCacheDirectory']);

        const atomSettingsData = atom.config.get('atom-mypy');
        atomSettingsKeys.forEach(key => {
            let value = atomSettingsData[key];
            assert(value !== undefined, `No ${key} in settings`);

            if (key === 'mypyCommand') {
                value = shellQuote.parse(value);
                if (value.some(x => typeof x !== 'string')) {
                    throw new ExternalError('Invalid mypy command in atom-mypy settings');
                }
                assert(value.length > 0, 'empty mypyCommand');
            }

            config[key] = value;
        });

        const [configFilePath, configFileData, configFileMypyData] = await this.findAndParseConfigFile(filePath);
        configFileKeys.forEach(key => {
            if (configFileData[key] !== undefined) {
                let value = configFileData[key];

                if (key === 'envMypyPath') {
                    config[key] = value + ':' + config[key];
                } else {
                    config[key] = value;
                }
            }
        });

        // Allow projects to override the global incremental mode
        if (configFileMypyData.incremental !== undefined) {
            config.incrementalMode = false;
        }

        config.CONFIG_FILE_PATH = configFilePath;

        return config;
    }

    async findAndParseConfigFile(startingPath) {
        const configFilePath = await atomLinter.findCachedAsync(path.dirname(startingPath), ['mypy.ini', 'setup.cfg']);
        let atomMypyData = {};
        let mypyData = {};
        if (configFilePath !== null) {
            const content = await fs.readFileAsync(configFilePath, 'utf-8');
            const parsed = ini.parse(content);
            if (parsed['atom-mypy'] !== undefined) {
                atomMypyData = parsed['atom-mypy'];
            }
            if (parsed['atom-mypy'] !== undefined) {
                mypyData = parsed['mypy'];
            }
        }
        return [configFilePath, atomMypyData, mypyData];
    }

    dispose() {
        this.subscriptions.dispose();
    }
}

global.shellQuote = shellQuote;
