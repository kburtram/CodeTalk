/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { FunctionInfo } from './functionListProvider';

/**
 * Empty Node shown when no queries are available
 */
export class EmptyFunctionListNode extends vscode.TreeItem {

    private static readonly contextValue = 'emptyFunctionListNode';

    constructor() {
        super("No functions", vscode.TreeItemCollapsibleState.None);
        this.contextValue = EmptyFunctionListNode.contextValue;
    }
}

/**
 * Function list node
 */
export class FunctionListNode extends vscode.TreeItem {

    private static readonly contextValue = 'functionListNode';

    constructor(
        private _uri: vscode.Uri,
        private _functionInfo: FunctionInfo
    ) {
        super(_functionInfo.spokenText, vscode.TreeItemCollapsibleState.None);
        this.tooltip = _functionInfo.displayText;
        this.iconPath = new vscode.ThemeIcon("wrench");
        this.contextValue = FunctionListNode.contextValue;
        this.command = {
            title: _functionInfo.displayText,
            command: 'vscode.open',
            arguments: [_uri, {
                    selection: new vscode.Range(new vscode.Position(_functionInfo.line, 0), new vscode.Position(_functionInfo.line, 0)),
                }],
        };
    }

    /** Getters */
    public get functionInfo() {
        return this._functionInfo;
    }

    public get uri(): vscode.Uri {
        return this._uri;
    }
}
