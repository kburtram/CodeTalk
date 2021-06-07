/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { TalkpointInfo } from './talkpointListProvider';

/**
 * Empty Node shown when no queries are available
 */
export class EmptyTalkpointNode extends vscode.TreeItem {

    private static readonly contextValue = 'emptyTalkpointNode';

    constructor() {
        super("No talkpoints", vscode.TreeItemCollapsibleState.None);
        this.contextValue = EmptyTalkpointNode.contextValue;
    }
}

/**
 * Talkpoint list node
 */
export class TalkpointNode extends vscode.TreeItem {

    private static readonly contextValue = 'emptyTalkpointNode';

    constructor(
        private _talkpointInfo: TalkpointInfo,
    ) {
        super(_talkpointInfo.displayText, vscode.TreeItemCollapsibleState.None);
        this.tooltip = _talkpointInfo.displayText;
        this.iconPath = new vscode.ThemeIcon("debug-breakpoint");
        this.contextValue = TalkpointNode.contextValue;
        this.accessibilityInformation = {
            label: _talkpointInfo.spokenText,
        }
        this.command = {
            title: _talkpointInfo.displayText,
            command: 'vscode.open',
            arguments: [_talkpointInfo.talkpoint.uri, {
                selection: new vscode.Range(
                    new vscode.Position(this.talkpointInfo.talkpoint.position.line, 0),
                    new vscode.Position(this.talkpointInfo.talkpoint.position.line, 0),
                ),
            }],
        }
    }

    /** Getters */
    public get talkpointInfo() {
        return this._talkpointInfo;
    }

    public get uri() {
        return this._talkpointInfo.talkpoint.uri;
    }
}
