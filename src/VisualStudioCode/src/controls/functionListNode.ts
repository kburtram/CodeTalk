/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';

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

    private static readonly contextValue = 'queryHistoryNode';

    constructor(
        label: string,
        tooltip: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = tooltip;
        this.contextValue = FunctionListNode.contextValue;
    }

    /** Getters */
    public get functionNodeLabel(): string {
        const label = typeof this.label === 'string' ? this.label : this.label.label;
        return label;
    }
}
