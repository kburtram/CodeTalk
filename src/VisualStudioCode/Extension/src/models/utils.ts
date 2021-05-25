/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as path from 'path';
import * as findRemoveSync from 'find-remove';
import vscode = require('vscode');
//import fs = require('fs');

// CONSTANTS //////////////////////////////////////////////////////////////////////////////////////
const configTracingLevel = 'tracingLevel';
const configLogRetentionMinutes = 'logRetentionMinutes';
const configLogFilesRemovalLimit = 'logFilesRemovalLimit';
// const extensionConfigSectionName = 'mssql';
// const configLogDebugInfo = 'logDebugInfo';

// Return 'true' if the active editor window has a .sql file, false otherwise
export function isEditingSqlFile(): boolean {
    let sqlFile = false;
    let editor = getActiveTextEditor();
    if (editor) {
        if (editor.document.languageId === 'SQL') {
            sqlFile = true;
        }
    }
    return sqlFile;
}

// Return the active text editor if there's one
export function getActiveTextEditor(): vscode.TextEditor {
    let editor = undefined;
    if (vscode.window && vscode.window.activeTextEditor) {
        editor = vscode.window.activeTextEditor;
    }
    return editor;
}

// Retrieve the URI for the currently open file if there is one; otherwise return the empty string
export function getActiveTextEditorUri(): string {
    if (typeof vscode.window.activeTextEditor !== 'undefined' &&
        typeof vscode.window.activeTextEditor.document !== 'undefined') {
        return vscode.window.activeTextEditor.document.uri.toString(true);
    }
    return '';
}

// Helper to log messages to "MSSQL" output channel
export function logToOutputChannel(msg: any): void {
    let outputChannel = vscode.window.createOutputChannel('Code Talk');
    outputChannel.show();
    if (msg instanceof Array) {
        msg.forEach(element => {
            outputChannel.appendLine(element.toString());
        });
    } else {
        outputChannel.appendLine(msg.toString());
    }
}

// Helper to log debug messages
export function logDebug(msg: any): void {
    let config = vscode.workspace.getConfiguration('CodeTalk');
    let logDebugInfo = config.get('LogDebugInfo');
    if (logDebugInfo === true) {
        let currentTime = new Date().toLocaleTimeString();
        let outputMsg = '[' + currentTime + ']: ' + msg ? msg.toString() : '';
        console.log(outputMsg);
    }
}

// Helper to show an info message
export function showInfoMsg(msg: string): void {
    vscode.window.showInformationMessage('CodeTalk' + ': ' + msg);
}

// Helper to show an warn message
export function showWarnMsg(msg: string): void {
    vscode.window.showWarningMessage('CodeTalk' + ': ' + msg);
}

// Helper to show an error message
export function showErrorMsg(msg: string): void {
    vscode.window.showErrorMessage('CodeTalk' + ': ' + msg);
}

export function isEmpty(str: any): boolean {
    return (!str || '' === str);
}

export function isNotEmpty(str: any): boolean {
    return <boolean>(str && '' !== str);
}

/**
 * Format a string. Behaves like C#'s string.Format() function.
 */
export function formatString(str: string, ...args: any[]): string {
    // This is based on code originally from https://github.com/Microsoft/vscode/blob/master/src/vs/nls.js
    // License: https://github.com/Microsoft/vscode/blob/master/LICENSE.txt
    let result: string;
    if (args.length === 0) {
        result = str;
    } else {
        result = str.replace(/\{(\d+)\}/g, (match, rest) => {
            let index = rest[0];
            return typeof args[index] !== 'undefined' ? args[index] : match;
        });
    }
    return result;
}

function getConfiguration(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('CodeTalk');
}

export function getConfigTracingLevel(): string {
    let config = getConfiguration();
    if (config) {
        return config.get(configTracingLevel);
    } else {
        return undefined;
    }
}

export function getConfigLogFilesRemovalLimit(): number {
    let config = getConfiguration();
    if (config) {
        return Number((config.get(configLogFilesRemovalLimit, 0).toFixed(0)));
    } else {
        return undefined;
    }
}

export function getConfigLogRetentionSeconds(): number {
    let config = getConfiguration();
    if (config) {
        return Number((config.get(configLogRetentionMinutes, 0) * 60).toFixed(0));
    } else {
        return undefined;
    }
}

export function removeOldLogFiles(logPath: string, prefix: string): JSON {
    return findRemoveSync(logPath, { age: { seconds: getConfigLogRetentionSeconds() }, limit: getConfigLogFilesRemovalLimit() });
}

export function getCommonLaunchArgsAndCleanupOldLogFiles(logPath: string, fileName: string, executablePath: string): string[] {
    let launchArgs = [];
    launchArgs.push('--log-file');
    let logFile = path.join(logPath, fileName);
    launchArgs.push(logFile);

    console.log(`logFile for ${path.basename(executablePath)} is ${logFile}`);
    console.log(`This process (ui Extenstion Host) is pid: ${process.pid}`);
    // Delete old log files
    let deletedLogFiles = removeOldLogFiles(logPath, fileName);
    console.log(`Old log files deletion report: ${JSON.stringify(deletedLogFiles)}`);
    launchArgs.push('--tracing-level');
    launchArgs.push(getConfigTracingLevel());
    return launchArgs;
}

/**
 * Limits the size of a string with ellipses in the middle
 */
export function limitStringSize(input: string, forCommandPalette: boolean = false): string {
    if (!forCommandPalette) {
        if (input.length > 45) {
            return `${input.substr(0, 20)}...${input.substr(input.length - 20, input.length)}`;
        }
    } else {
        if (input.length > 100) {
            return `${input.substr(0, 45)}...${input.substr(input.length - 45, input.length)}`;
        }
    }
    return input;
}
