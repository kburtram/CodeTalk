/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { ContextInfo } from './currentContextProvider';

/**
 * Empty Node shown when no queries are available
 */
export class EmptyCurrentContextNode extends vscode.TreeItem {

    private static readonly contextValue = 'emptyCurrentContextNode';

    constructor() {
        super("No context", vscode.TreeItemCollapsibleState.None);
        this.contextValue = EmptyCurrentContextNode.contextValue;
    }
}

/**
 * Function list node
 */
export class CurrentContextNode extends vscode.TreeItem {

    private static readonly contextValue = 'currentContextNode';

    constructor(
        private _uri: vscode.Uri,
        private _contextInfo: ContextInfo,
        private _collapsible: boolean,
    ) {
        super(_contextInfo.displayText,
            _collapsible ?
                vscode.TreeItemCollapsibleState.Expanded :
                vscode.TreeItemCollapsibleState.None);
        this.tooltip = _contextInfo.displayText;
        this.iconPath = new vscode.ThemeIcon("wrench");
        this.contextValue = CurrentContextNode.contextValue;
        this.accessibilityInformation = {
            label: _contextInfo.spokenText,
        }
        this.command = {
            title: _contextInfo.displayText,
            command: 'vscode.open',
            arguments: [_uri, {
                selection: new vscode.Range(
                    new vscode.Position(this.contextInfo.line, 0),
                    new vscode.Position(this.contextInfo.line, 0)
                ),
            }],
        }
    }

    /** Getters */
    public get contextInfo() {
        return this._contextInfo;
    }

    public get uri() {
        return this._uri;
    }
}
