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

    public updateFunctionList(treeView: vscode.TreeView<any>, uri: string, functions: FunctionInfo[]): void {
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
            treeView.reveal(selectedNode, { focus: true });
        } else {
            this._functionListNodes = [new EmptyFunctionListNode()];
            this._onDidChangeTreeData.fire(undefined);
            treeView.reveal(this._functionListNodes[0], { focus: true });
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
        node.command = {
            command: 'codeTalk.functionListNavigate',
            title: "Navigate To Symbol",
            arguments: [node]
         };
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

    /**
     * Sets a selection range in the editor for this query
     * @param selection The selection range to select
     */
     public async navigateToFunction(node: FunctionListNode): Promise<void> {
        if (!node || !node.functionInfo) {
            return;
        }
        let line = node.functionInfo.line;
        const docExists = vscode.workspace.textDocuments.find(textDoc => textDoc.uri.toString(true) === node.uri);
        if (docExists) {
            let column = vscode.ViewColumn.One;
            const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(node.uri));
            const activeTextEditor = vscode.window.activeTextEditor;
            if (activeTextEditor) {
                column = activeTextEditor.viewColumn;
            }
            const correspondingPosition = new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 0))
            await vscode.window.showTextDocument(doc, {
                viewColumn: column,
                preserveFocus: false,
                preview: false,
                selection: correspondingPosition
            });
        }
    }
}
