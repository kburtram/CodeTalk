/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { CurrentContextNode, EmptyCurrentContextNode } from "./currentContextNode";

export interface ContextInfo {
    name: string;
    kind?: vscode.SymbolKind;
    displayText: string;
    spokenText: string;
    line: number;
}

type ContextNode = CurrentContextNode | EmptyCurrentContextNode;

export class CurrentContextProvider implements vscode.TreeDataProvider<ContextNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<any | undefined> = new vscode.EventEmitter<any | undefined>();
    readonly onDidChangeTreeData: vscode.Event<any | undefined> = this._onDidChangeTreeData.event;

    private _currentContextNodes: ContextNode[] = [new EmptyCurrentContextNode()];

    constructor() {
    }

    public updateCurrentContext(treeView: vscode.TreeView<ContextNode>, uri: vscode.Uri, context: ContextInfo[], setFocus: boolean) {
        if (context && context.length > 0) {
            this._currentContextNodes = [];
            for (let i = 0; i < context.length; ++i) {
                const isLast = i === context.length - 1;
                const isCollapsible = !isLast;
                let node = new CurrentContextNode(uri, context[i], isCollapsible);
                this._currentContextNodes.push(node);
            }
        } else {
            this._currentContextNodes = [new EmptyCurrentContextNode()];
        }
        this._onDidChangeTreeData.fire(undefined);
        if (setFocus) {
            treeView.reveal(this._currentContextNodes[this._currentContextNodes.length - 1], { focus: setFocus, select: true, expand: true });
        }
    }

    clearAll(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    refresh(ownerUri: string, timeStamp: Date, hasError): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public getTreeItem(element: ContextNode): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: ContextNode): vscode.ProviderResult<ContextNode[]> {
        if (this._currentContextNodes.length === 0) {
            this._currentContextNodes.push(new EmptyCurrentContextNode());
            return this._currentContextNodes;
        }

        if (!element) {
            return [this._currentContextNodes[0]];
        }

        const pos = this.currentContextNodes.indexOf(element);
        if (pos >= 0 && pos < this.currentContextNodes.length - 1) {
            return [this.currentContextNodes[pos + 1]]
        }

        return [];
    }

    public getParent?(element: ContextNode): vscode.ProviderResult<ContextNode> {
        const pos = this.currentContextNodes.indexOf(element);
        if (pos <= 0) {
            return undefined;
        }
        return this.currentContextNodes[pos - 1];
    }

    public get currentContextNodes(): vscode.TreeItem[] {
        return this._currentContextNodes;
    }
}
