/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import vscode = require('vscode');

export async function activate(context: vscode.ExtensionContext): Promise<boolean> {
    return true;
}

// this method is called when your extension is deactivated
export async function deactivate(): Promise<void> {
}
