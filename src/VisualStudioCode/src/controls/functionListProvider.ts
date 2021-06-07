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

    public updateFunctionList(treeView: vscode.TreeView<any>, uri: vscode.Uri,
            functions: FunctionInfo[], setFocus: boolean): void {
        if (functions && functions.length > 0) {
            let currentLine: number = 0;
            const activeTextEditor = vscode.window.activeTextEditor;
            if (activeTextEditor) {
                currentLine = activeTextEditor.selection.active.line;
            }

            let selectedNode = new FunctionListNode(uri, functions[0]);
            this._functionListNodes = [];
            this._functionListNodes.push(selectedNode);
            for (let i = 1; i < functions.length; ++i) {
                let node = new FunctionListNode(uri, functions[i]);
                this._functionListNodes.push(node);
                let currentDist: number = Math.abs(node.functionInfo.line - currentLine);
                let functionDist: number = Math.abs(selectedNode.functionInfo.line - currentLine);
                if (currentDist < functionDist) {
                    selectedNode = node;
                }
            }
            this._onDidChangeTreeData.fire(undefined);
            if (setFocus) {
                treeView.reveal(selectedNode, { focus: setFocus, select: true });
            }
        } else {
            this._functionListNodes = [new EmptyFunctionListNode()];
            this._onDidChangeTreeData.fire(undefined);
            if (setFocus) {
                treeView.reveal(this._functionListNodes[0], { focus: setFocus, select: true });
            }
        }
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

    public getParent(element: FunctionListNode): FunctionListNode {
		return undefined;
	}

    /**
     * Getters
     */
    public get functionListNodes(): vscode.TreeItem[] {
        return this._functionListNodes;
    }
}
