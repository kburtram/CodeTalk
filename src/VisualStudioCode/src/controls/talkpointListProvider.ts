/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { ITalkpoint } from '../models/interfaces';
import { EmptyTalkpointNode, TalkpointNode } from './talkpointListNode';

export interface TalkpointInfo {
    name: string;
    displayText: string;
    spokenText: string;
    talkpoint: ITalkpoint
}

type ITalkpointNode = TalkpointNode | EmptyTalkpointNode;

export class TalkpointListProvider implements vscode.TreeDataProvider<ITalkpointNode> {

    private _onDidChangeTreeData: vscode.EventEmitter<ITalkpointNode | undefined | null | void> = new vscode.EventEmitter<any | undefined>();
    readonly onDidChangeTreeData: vscode.Event<ITalkpointNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private _currentTalkpointNodes: ITalkpointNode[] = [new EmptyTalkpointNode()];

    constructor() {
    }

    public updateCurrentTalkpoints(treeView: vscode.TreeView<ITalkpointNode>, talkpoints: TalkpointInfo[], setFocus: boolean) {
        if (talkpoints && talkpoints.length > 0) {
            this._currentTalkpointNodes = [];
            for (const talkpoint of talkpoints) {
                let node = new TalkpointNode(talkpoint);
                this._currentTalkpointNodes.push(node);
            }
        } else {
            this._currentTalkpointNodes = [new EmptyTalkpointNode()];
        }

        this._onDidChangeTreeData.fire();

        if (setFocus) {
            treeView.reveal(this._currentTalkpointNodes[0], { focus: setFocus, select: true});
        }
    }

    clearAll(): void {
        this._onDidChangeTreeData.fire();
    }

    refresh(ownerUri: string, timeStamp: Date, hasError): void {
        this._onDidChangeTreeData.fire();
    }

    public getTreeItem(element: ITalkpointNode): vscode.TreeItem {
        return element;
    }

    public getChildren(element?: ITalkpointNode): vscode.ProviderResult<ITalkpointNode[]> {
        if (this._currentTalkpointNodes.length === 0) {
            this._currentTalkpointNodes.push(new EmptyTalkpointNode());
            return this._currentTalkpointNodes;
        }
        return this._currentTalkpointNodes;
    }

    public getParent?(element: ITalkpointNode): vscode.ProviderResult<ITalkpointNode> {
        return undefined;
    }

    public get currentTalkpointNodes(): vscode.TreeItem[] {
        return this._currentTalkpointNodes;
    }
}
