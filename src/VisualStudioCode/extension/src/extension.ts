/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import vscode = require('vscode');
import CodeTalkController from './controllers/codeTalkController';

let codeTalkController: CodeTalkController = undefined;

// this method is called when your extension is activated
export async function activate(context: vscode.ExtensionContext): Promise<boolean> {
    codeTalkController = new CodeTalkController(context);
    codeTalkController.activate();
    return true;
}

// this method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
    codeTalkController.deactivate();
}
