/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as events from 'events';
import vscode = require('vscode');
import { FunctionListProvider } from '../controls/functionListProvider';
import CodeTalkServiceClient from '../languageservice/serviceClient';
import { FunctionListRequest, FunctionListParams, FunctionListResult } from '../models/contracts/languageService';

/**
 * The main controller class that initializes the extension
 */
export default class CodeTalkController implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _event: events.EventEmitter = new events.EventEmitter();
    private _initialized: boolean = false;
    private _functionListProvider: FunctionListProvider;

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
                this.handleShowFunctions();
            });
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

        this._functionListProvider = new FunctionListProvider();

        this._context.subscriptions.push(
            vscode.window.registerTreeDataProvider('codeTalkFunctionList', this._functionListProvider)
        );

        this._initialized = true;
        return true;
    }

    private async handleShowFunctions(): Promise<boolean> {
        let ownerUri: string = this.getActiveTextEditorUri();
        let params: FunctionListParams = { ownerUri: ownerUri };
        const result: FunctionListResult = await CodeTalkServiceClient.instance.client.sendRequest(FunctionListRequest.type, params);
        if (result.success) {
            this._functionListProvider.updateFunctionList(result.functions);
        }
        return result.success;
    }

    /**
     * Get the URI string for the current active text editor
     */
     private  getActiveTextEditorUri(): string {
        if (typeof vscode.window.activeTextEditor !== 'undefined' &&
            typeof vscode.window.activeTextEditor.document !== 'undefined') {
            return vscode.window.activeTextEditor.document.uri.toString(true);
        }
        return undefined;
    }
}
