/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as events from 'events';
import vscode = require('vscode');
import CodeTalkServiceClient from '../languageservice/serviceClient';

/**
 * The main controller class that initializes the extension
 */
export default class CodeTalkController implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _event: events.EventEmitter = new events.EventEmitter();
    private _initialized: boolean = false;

    /**
     * The main controller constructor
     * @constructor
     */
    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    /**
     * Helper method to setup command registrations
     */
    public registerCommand(command: string): void {
        const self = this;
        this._context.subscriptions.push(vscode.commands.registerCommand(command, () => self._event.emit(command)));
    }

    /**
     * Helper method to setup command registrations with arguments
     */
    private registerCommandWithArgs(command: string): void {
        const self = this;
        this._context.subscriptions.push(vscode.commands.registerCommand(command, (args: any) => {
            self._event.emit(command, args);
        }));
    }

    /**
     * Disposes the controller
     */
    dispose(): void {
        this.deactivate();
    }

    /**
     * Deactivates the extension
     */
    public async deactivate(): Promise<void> {
    }

    /**
     * Initializes the extension
     */
    public async activate():  Promise<boolean> {
        // initialize the language client then register the commands
        const didInitialize = await this.initialize();
        if (didInitialize) {
            // register VS Code commands
            this.registerCommand('codeTalk.showFunctions');
            this._event.on('codeTalk.showFunctions', () => {
                vscode.window.showInformationMessage('Show Function command run');
            });

            // Add handlers for VS Code generated commands
            // this._vscodeWrapper.onDidCloseTextDocument(async (params) => await this.onDidCloseTextDocument(params));
            // this._vscodeWrapper.onDidOpenTextDocument(params => this.onDidOpenTextDocument(params));
            // this._vscodeWrapper.onDidSaveTextDocument(params => this.onDidSaveTextDocument(params));
            // this._vscodeWrapper.onDidChangeConfiguration(params => this.onDidChangeConfiguration(params));
            return true;
        }
    }

    public isInitialized(): boolean {
        return this._initialized;
    }

    /**
     * Initializes the extension
     */
    public async initialize(): Promise<boolean> {
        // initialize language service client
        await CodeTalkServiceClient.instance.initialize(this._context);

        this._initialized = true;
        return true;
    }
}
