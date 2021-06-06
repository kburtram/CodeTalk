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
        private _uri: string,
        private _functionInfo: FunctionInfo
    ) {
        super(_functionInfo.spokenText, vscode.TreeItemCollapsibleState.None);
        this.tooltip = _functionInfo.displayText;
        this.contextValue = FunctionListNode.contextValue;
    }

    /** Getters */
    public get functionInfo() {
        return this._functionInfo;
    }

    public get uri() {
        return this._uri;
    }
}
