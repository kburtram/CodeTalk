/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as events from 'events';
import { DebugSession } from 'vscode';
import { FunctionInfo, FunctionListProvider } from '../controls/functionListProvider';
import vscode = require('vscode');

/**
 * The main controller class that initializes the extension
 */
export default class CodeTalkController implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _event: events.EventEmitter = new events.EventEmitter();
    private _initialized: boolean = false;
    private _functionListProvider: FunctionListProvider;
    private _previousDiagnostics = undefined;

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
    public async activate(): Promise<boolean> {
        // initialize the language client then register the commands
        const didInitialize = await this.initialize();
        if (didInitialize) {
            // register VS Code commands
            this.registerCommand('codeTalk.showFunctions');
            this._event.on('codeTalk.showFunctions', () => {
                this.handleShowFunctions();
            });

            vscode.languages.onDidChangeDiagnostics((e: vscode.DiagnosticChangeEvent) => {
                let activeUri: string = this.getActiveTextEditorUri();
                for (let uri of e.uris) {
                    if (activeUri === uri.toString(true)) {
                        let currentDiagnostics = vscode.languages.getDiagnostics(uri);
                        if (this._previousDiagnostics && currentDiagnostics.length > this._previousDiagnostics.length) {
                            vscode.window.showInformationMessage('Play sound for new error');
                        }
                        this._previousDiagnostics = currentDiagnostics;
                    }
                }
            });

            vscode.debug.registerDebugAdapterTrackerFactory('*', {
                createDebugAdapterTracker(session: DebugSession) {
                    return {
                        onWillReceiveMessage: m => { },
                        onDidSendMessage: m => {
                            if (m && m.type === 'event' && m.event === 'stopped' && m.body && m.body.reason === 'breakpoint') {
                                vscode.window.showInformationMessage('Play sound for stopped breakpoint');
                            }
                        }
                    };
                }
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

        this._functionListProvider = new FunctionListProvider();

        this._context.subscriptions.push(
            vscode.window.registerTreeDataProvider('codeTalkFunctionList', this._functionListProvider)
        );

        this._initialized = true;
        return true;
    }

    private buildFunctionList(symbols : vscode.DocumentSymbol[], functionList: FunctionInfo[]) {
        for (let i = 0; i < symbols.length; ++i) {
            let symbol: vscode.DocumentSymbol = symbols[i];
            if (symbol.kind === vscode.SymbolKind.Function
                || symbol.kind === vscode.SymbolKind.Method) {
                let displayText = symbol.name + ' at line ' + symbol.range.start.line;
                functionList.push(<FunctionInfo>{
                    name: symbol.name,
                    displayText: displayText,
                    spokenText: displayText,
                    line: symbol.range.start.line
                });
            }
            if (symbol.children && symbol.children.length > 0) {
                this.buildFunctionList(symbol.children, functionList);
            }
        }
    }

    private async handleShowFunctions(): Promise<boolean> {
        let ownerUri: string = this.getActiveTextEditorUri();
        let symbols : vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
            'vscode.executeDocumentSymbolProvider',
            vscode.Uri.parse(ownerUri));
        if (symbols) {
            let functionList: FunctionInfo[] = [];
            this.buildFunctionList(symbols, functionList);
            functionList.sort((a, b) => (a.line > b.line) ? 1 : -1)
            this._functionListProvider.updateFunctionList(functionList);
        }
        return true;
    }

    /**
     * Get the URI string for the current active text editor
     */
    private getActiveTextEditorUri(): string {
        if (typeof vscode.window.activeTextEditor !== 'undefined' &&
            typeof vscode.window.activeTextEditor.document !== 'undefined') {
            return vscode.window.activeTextEditor.document.uri.toString(true);
        }
        return undefined;
    }
}
