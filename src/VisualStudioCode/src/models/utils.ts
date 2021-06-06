/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';

export const asyncFilter = async (arr: Object[], predicate: (...args: any[]) => Promise<boolean>) => {
    const results = await Promise.all(arr.map(predicate));
    return arr.filter((_v, index) => results[index]);
}

export function createOutputChannel() : vscode.OutputChannel {
    return vscode.window.createOutputChannel('Code Talk');
}

// Helper to log messages to "Code Talk" output channel
export function logToOutputChannel(outputChannel: vscode.OutputChannel, msg: any): void {
    outputChannel.show();
    if (msg instanceof Array) {
        msg.forEach(element => {
            outputChannel.appendLine(element.toString());
        });
    } else {
        outputChannel.appendLine(msg.toString());
    }
}
