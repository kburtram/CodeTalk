/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { EmptyFunctionListNode, FunctionListNode } from './functionListNode';

export interface FunctionInfo {
    name: string;
    displayText: string;
    spokenText: string;
    line: number;
}

export class FunctionListProvider implements vscode.TreeDataProvider<any> {

    private _onDidChangeTreeData: vscode.EventEmitter<any | undefined> = new vscode.EventEmitter<any | undefined>();
    readonly onDidChangeTreeData: vscode.Event<any | undefined> = this._onDidChangeTreeData.event;

    private _functionListNodes: vscode.TreeItem[] = [new EmptyFunctionListNode()];

    constructor() {
    }

    public updateFunctionList(functions: FunctionInfo[]) {
        if (functions && functions.length > 0) {
            this._functionListNodes = [];
            for (let i = 0; i < functions.length; ++i) {
                let node = new FunctionListNode(functions[i].spokenText, functions[i].displayText);
                this._functionListNodes.push(node);
            }
        } else {
            this._functionListNodes = [new EmptyFunctionListNode()];
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    clearAll(): void {
        // this._queryHistoryNodes = [new EmptyHistoryNode()];
        this._onDidChangeTreeData.fire(undefined);
    }

    refresh(ownerUri: string, timeStamp: Date, hasError): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    public getTreeItem(node: FunctionListNode): FunctionListNode {
        return node;
    }

    public getChildren(element?: any): vscode.TreeItem[] {
        if (this._functionListNodes.length === 0) {
            this._functionListNodes.push(new EmptyFunctionListNode());
        }
        return this._functionListNodes;
    }

    /**
     * Getters
     */
    public get functionListNodes(): vscode.TreeItem[] {
        return this._functionListNodes;
    }
}
