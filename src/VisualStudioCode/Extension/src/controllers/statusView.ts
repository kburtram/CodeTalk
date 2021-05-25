/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import vscode = require('vscode');
import Interfaces = require('../models/interfaces');
import * as Utils from '../models/utils';

// Status bar element for each file in the editor
class FileStatusBar {
    // Item for the language flavor status
    public statusLanguageFlavor: vscode.StatusBarItem;

    // Item for the connection status
    public statusConnection: vscode.StatusBarItem;

    // Item for the query status
    public statusQuery: vscode.StatusBarItem;

    // Item for language service status
    public statusLanguageService: vscode.StatusBarItem;

    // Timer used for displaying a progress indicator on queries
    public progressTimerId: NodeJS.Timer;

    // Item for SQLCMD Mode
    public sqlCmdMode: vscode.StatusBarItem;

    // Item for Row Count
    public rowCount: vscode.StatusBarItem;

    public currentLanguageServiceStatus: string;
}

export default class StatusView implements vscode.Disposable {
    private _statusBars: { [fileUri: string]: FileStatusBar };
    private _lastShownStatusBar: FileStatusBar;
    // private _onDidChangeActiveTextEditorEvent: vscode.Disposable;
    // private _onDidCloseTextDocumentEvent: vscode.Disposable;

    constructor() {
        this._statusBars = {};
        // this._onDidChangeActiveTextEditorEvent = this._vscodeWrapper.onDidChangeActiveTextEditor((params) => this.onDidChangeActiveTextEditor(params));
        // this._onDidCloseTextDocumentEvent = this._vscodeWrapper.onDidCloseTextDocument((params) yarn com this.onDidCloseTextDocument(params));
    }

    dispose(): void {
        for (let bar in this._statusBars) {
            if (this._statusBars.hasOwnProperty(bar)) {
                this._statusBars[bar].statusLanguageFlavor.dispose();
                this._statusBars[bar].statusConnection.dispose();
                this._statusBars[bar].statusQuery.dispose();
                this._statusBars[bar].statusLanguageService.dispose();
                this._statusBars[bar].sqlCmdMode.dispose();
                this._statusBars[bar].rowCount.dispose();
                clearInterval(this._statusBars[bar].progressTimerId);
                delete this._statusBars[bar];
            }
        }
        // this._onDidChangeActiveTextEditorEvent.dispose();
        // this._onDidCloseTextDocumentEvent.dispose();
    }

    // Create status bar item if needed
    private createStatusBar(fileUri: string): void {
        let bar = new FileStatusBar();
        // set language flavor priority as always 90 since it's to show to the right of the file type
        bar.statusLanguageFlavor = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        bar.statusConnection = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        bar.statusQuery = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        bar.statusLanguageService = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
        bar.sqlCmdMode = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
        bar.rowCount = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
        this._statusBars[fileUri] = bar;
    }

    private getStatusBar(fileUri: string): FileStatusBar {
        if (!(fileUri in this._statusBars)) {
            // Create it if it does not exist
            this.createStatusBar(fileUri);
        }

        let bar = this._statusBars[fileUri];
        if (bar.progressTimerId) {
            clearInterval(bar.progressTimerId);
        }
        return bar;
    }

    public show(fileUri: string): void {
        let bar = this.getStatusBar(fileUri);
        this.showStatusBarItem(fileUri, bar.statusLanguageFlavor);
        this.showStatusBarItem(fileUri, bar.statusConnection);
        this.showStatusBarItem(fileUri, bar.statusQuery);
        this.showStatusBarItem(fileUri, bar.statusLanguageService);
        this.showStatusBarItem(fileUri, bar.sqlCmdMode);
        this.showStatusBarItem(fileUri, bar.rowCount);
    }

    public languageServiceStatusChanged(fileUri: string, status: string): void {
        let bar = this.getStatusBar(fileUri);
        bar.currentLanguageServiceStatus = status;
        this.updateStatusMessage(status,
        () => { return bar.currentLanguageServiceStatus; }, (message) => {
            bar.statusLanguageService.text = message;
            this.showStatusBarItem(fileUri, bar.statusLanguageService);
        });
    }

    public updateStatusMessage(
        newStatus: string,
        getCurrentStatus: () => string,
        updateMessage:  (message: string) => void): void {
        switch (newStatus) {
            default:
                Utils.logDebug(`Language service status changed. ${newStatus}`);
                break;
        }
    }

    /**
     * Associate a new uri with an existing Uri's status bar
     *
     * @param existingUri The already existing URI's status bar you want to associated
     * @param newUri The new URI you want to associate with the existing status bar
     * @return True or False whether the association was able to be made. False indicated the exitingUri specified
     * did not exist
     */

    public associateWithExisting(existingUri: string, newUri: string): boolean {
        let bar = this.getStatusBar(existingUri);
        if (bar) {
            this._statusBars[newUri] = bar;
            return true;
        } else {
            return false;
        }
    }

    private showStatusBarItem(fileUri: string, statusBarItem: vscode.StatusBarItem): void {
        let currentOpenFile = Utils.getActiveTextEditorUri();

        // Only show the status bar if it matches the currently open file and is not empty
        if (fileUri === currentOpenFile && !Utils.isEmpty(statusBarItem.text) ) {
            statusBarItem.show();
            if (fileUri in this._statusBars) {
                this._lastShownStatusBar = this._statusBars[fileUri];
            }
        } else {
            statusBarItem.hide();
        }
    }
}
