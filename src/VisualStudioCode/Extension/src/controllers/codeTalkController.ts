/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
import * as events from 'events';
import vscode = require('vscode');
import { FunctionListProvider } from '../controls/functionListProvider';
import { FunctionListParams } from '../models/contracts/languageService';
import { Breakpoint, SourceBreakpoint } from 'vscode';
import { IErrorSettings, IExpressionTalkpoint, ITalkpoint, ITextTalkpoint } from '../models/interfaces';
import { asyncFilter } from '../models/utils';
import { debounce } from 'underscore';

import play = require('audio-play');
import load = require('audio-loader');

/**
 * The main controller class that initializes the extension
 */
export default class CodeTalkController implements vscode.Disposable {
    private _context: vscode.ExtensionContext;
    private _event: events.EventEmitter = new events.EventEmitter();
    private _internalEvents: events.EventEmitter = new events.EventEmitter();
    private _initialized: boolean = false;
    private _functionListProvider: FunctionListProvider;
    private _previousDiagnostics : vscode.Diagnostic[] = [];

    private _errorSettings : IErrorSettings;
    private _defaultErrorBeepSound : string =`${__dirname}/../assets/errorBeep.wav`;
    private _errorBeepBuffer: AudioBuffer;

    private _breakpointsLoaded: boolean = false;
    private _talkPoints: Map<string, ITalkpoint>;
    private _talkPointDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        after: {
            contentText: "   Talkpoint Enabled".replace(/ /g, '\u00a0'),
            fontStyle: 'normal',
            fontWeight: 'normal',
            color: new vscode.ThemeColor('editorLineNumber.foreground'),
            textDecoration: `none; ariaDescription: "Talkpoint Enabled;"`,
        }
    } as vscode.DecorationRenderOptions);


    /**
     * The main controller constructor
     * @constructor
     */
    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._talkPoints = new Map<string, ITalkpoint>((this._context.workspaceState.get("talkpoints") || []));
    }

    /**
     * Helper method to setup command registrations
     */
    public registerCommand(command: string): void {
        const self = this;
        this._context.subscriptions.push(vscode.commands.registerCommand(command, () => self._event.emit(command)));
    }


    /**
     * Helper method to setup text editor command registrations -- command is allowed only when editor is focused
     */
     public registerTextEditorCommand(command: string): void {
        const self = this;
        this._context.subscriptions.push(vscode.commands.registerTextEditorCommand(command,
            (textEditor: vscode.TextEditor) =>
                self._event.emit(command, textEditor)));
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
            this.registerTextEditorCommand('codeTalk.showFunctions');
            this.registerTextEditorCommand('codeTalk.showContext');
            this.registerTextEditorCommand('codeTalk.moveToParent');
            this.registerTextEditorCommand('codeTalk.addTalkpoint');

            // Can be run even if no editor is open, clears all talkpoints
            this.registerCommand('codeTalk.removeAllTalkpoints');

            this._event.on('codeTalk.showFunctions', async(textEditor: vscode.TextEditor) => {
                try {
                    let symbols : vscode.DocumentSymbol[] =
                        await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', textEditor.document.uri);
                    console.log(symbols);
                } catch (error) {
                    console.log(error);
                }

                this.handleShowFunctions();
            });

            this._event.on('codeTalk.showContext', async(textEditor: vscode.TextEditor) => {
                // TO-DO
            });

            this._event.on('codeTalk.moveToParent', async(textEditor: vscode.TextEditor) => {
                // TO-DO
            });

            this._event.on('codeTalk.addTalkpoint', async() => {
                const selection : vscode.Position = vscode.window.activeTextEditor?.selection?.anchor;
                if (selection) {
                    vscode.window.showQuickPick(["Tonal", "Text", "Expression"],
                    {
                        placeHolder: 'Choose a Talkpoint type.',
                        onDidSelectItem: this.createTalkpoint.bind(this)
                    })
                }
            });

            this._event.on('codeTalk.removeAllTalkpoints', this.removeAllTalkpoints.bind(this));

            this._internalEvents.on('talkpoints.changed', async() => {
                this.saveTalkpoints(); // don't need to block on save, even though this returns promise
                this.renderTalkpointDecorations();
            });

            vscode.workspace.onDidChangeConfiguration(async(e) => {
                if (e.affectsConfiguration('codeTalk')) {

                    //reload settings
                    await this.loadSettings();
                }
            });

            vscode.workspace.onDidOpenTextDocument((e) => {
                this._internalEvents.emit('talkpoints.changed');
            });

            vscode.workspace.onDidChangeTextDocument((e) => {
                this._internalEvents.emit('talkpoints.changed');
            });

            vscode.languages.onDidChangeDiagnostics(this.handleRealTimeErrorDetection.bind(this));

            vscode.debug.onDidChangeBreakpoints((e: vscode.BreakpointsChangeEvent) => {
                // If first time breakpoints are loaded this session, need to update talkpoints with new breakpoint ids.
                // VSCode breakpoints get new id on every workspace session.
                if (!this._breakpointsLoaded) {
                    if(e.added.length > 0) {
                        this.loadInitialTalkpoints(e.added);
                    }
                }

                // If user removes breakpoints, we also remove from talkpoints, since there's nothing to break on.
                if (e.removed.length > 0) {
                    this.removeTalkpoints(e.removed);
                }
            });

            vscode.debug.registerDebugAdapterTrackerFactory('*', {
                createDebugAdapterTracker: (session) => {
                    return {
                        onDidSendMessage: async(m) => {
                            if (m?.type === 'event' &&
                                m.event === 'stopped' &&
                                (m.body?.reason === 'breakpoint' || m.body?.reason === 'step')) {

                                // Get current stack details to be able to find breakpoint
                                const stack = await session.customRequest("stackTrace", { threadId: m.body.threadId, startFrame: 0 });
                                const currentFrame = stack.stackFrames[0];

                                const sourceBreakpoints = vscode.debug.breakpoints.map(b => b as vscode.SourceBreakpoint);
                                const matchedBreakpoints = await asyncFilter(sourceBreakpoints, async (b) => {
                                    // Get debugger's version of line number, since breakpoint is sometimes moved to another line by debugger
                                    let debugBreakpoint = await session.getDebugProtocolBreakpoint(b);
                                    let debugBreakpointLine = (debugBreakpoint as any)?.line;
                                    return b.location.uri.path === vscode.Uri.file(currentFrame.source.path).path &&
                                        debugBreakpointLine === currentFrame.line
                                });

                                matchedBreakpoints.forEach(async(b: Breakpoint) => {
                                    if (this._talkPoints.has(b.id)) {
                                        const talkpoint = this._talkPoints.get(b.id);
                                        switch(talkpoint.type) {
                                            case "Tonal":
                                                play(this._errorBeepBuffer, {}, undefined);
                                                break;
                                            case "Text":
                                                const textTalkpoint = talkpoint as ITextTalkpoint;
                                                vscode.window.showInformationMessage("Text Talkpoint Hit: " + textTalkpoint.text);
                                                break;
                                            case "Expression":
                                                const expressionTalkpoint = talkpoint as IExpressionTalkpoint;
                                                vscode.window.showInformationMessage(expressionTalkpoint.expression);
                                                const response = await session.customRequest("evaluate", {
                                                    expression: expressionTalkpoint.expression,
                                                    frameId: currentFrame.id // run in the scope of this stack frame
                                                });
                                                console.log(response);
                                                vscode.window.showInformationMessage("Expression Talkpoint Hit: " + response.result);
                                                break;
                                            default:
                                                vscode.window.showErrorMessage("Unrecognized Talkpoint type: " + talkpoint.type);
                                                break;
                                        }

                                        // Don't pause on breakpoint if shouldContinue is true
                                        if (talkpoint.shouldContinue) {
                                            session.customRequest("continue", { threadId: m.body.threadId });
                                        }
                                    }
                                })
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

        await this.loadSettings();

        // initialize language service client
        // await CodeTalkServiceClient.instance.initialize(this._context);

        this._functionListProvider = new FunctionListProvider();

        this._context.subscriptions.push(
            vscode.window.registerTreeDataProvider('codeTalkFunctionList', this._functionListProvider)
        );

        this._initialized = true;
        return true;
    }

    private async handleShowFunctions(): Promise<boolean> {
        let ownerUri: string = this.getActiveTextEditorUriString();
        let params: FunctionListParams = { ownerUri: ownerUri };
        // const result: FunctionListResult = await CodeTalkServiceClient.instance.client.sendRequest(FunctionListRequest.type, params);
        // if (result.success) {
        //     this._functionListProvider.updateFunctionList(result.functions);
        // }
        // return result.success;
        return Promise.resolve(true);
    }

    private async loadSettings() {
        this._errorSettings = vscode.workspace.getConfiguration('codeTalk').get<IErrorSettings>('errors');

        if (this._errorSettings.customErrorSound) {
            try {
                this._errorBeepBuffer = await load(this._errorSettings.customErrorSound);
            } catch (error) {
                vscode.window.showErrorMessage("Failed to load custom aound for error detection: " + error);
            }
        } else {
            this._errorBeepBuffer = await load(this._defaultErrorBeepSound);
        }
    }

    /**
     * Plays a configured error tone if diagnostic problems are encountered
     * Debounce so error tone only plays every x seconds at most (2 seconds by default)
     */
    private handleRealTimeErrorDetection() {
        return debounce((e: vscode.DiagnosticChangeEvent) => {
            const activeUri: vscode.Uri = this.getActiveTextEditorUri();
            for (const uri of e.uris) {
                if (activeUri.path === uri.path) {
                    let currentDiagnostics : vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri);
                    if (this._previousDiagnostics && currentDiagnostics.length > this._previousDiagnostics.length) {
                        play(this._errorBeepBuffer, {}, () => { console.log('played sound.')});
                    }
                    this._previousDiagnostics = currentDiagnostics;
                }
            }
        }, this._errorSettings.errorDetectionInterval);
    }

    /**
     * Saves talkpoints to the workspace storage, so it can be reloaded on the next session.
     */
    private async saveTalkpoints() {
        await this._context.workspaceState.update("talkpoints", [...this._talkPoints.entries()]);
    }

    /**
     * Removes all talkpoints from the current workspace.
    */
    private async removeAllTalkpoints() {
        let numTalkpoints = this._talkPoints.size;

        if (numTalkpoints > 0) {
            const breakpoints = vscode.debug.breakpoints.filter(b => this._talkPoints.has(b.id));
            vscode.debug.removeBreakpoints(breakpoints);
            this._talkPoints.clear();
            vscode.window.showInformationMessage(`Removed ${numTalkpoints} talkpoints from workspace.`);
            this._internalEvents.emit('talkpoints.changed');
        } else {
            vscode.window.showInformationMessage("There are no talkpoints registered.");
        }
    }

    /**
     * Removes talkpoints associated with the given breakpoints.
     * @param breakpoints
     */
    private async removeTalkpoints(breakpoints: readonly vscode.Breakpoint[]) {
        // User removed breakpoints
        if (breakpoints.length > 0) {
            // Also remove from talkpoints, since there's nothing to break on
            for (const breakpoint of breakpoints) {
                if (this._talkPoints.has(breakpoint.id)) {
                    this._talkPoints.delete(breakpoint.id);
                    vscode.window.showInformationMessage(`Removed talkpoints.`);
                }
            }
        }
    }

    /**
     * Create a new Talkpoint
     * @param type
     */
    private async createTalkpoint(type: string) {
        const activeUri: vscode.Uri = this.getActiveTextEditorUri();
        const selection : vscode.Position = vscode.window.activeTextEditor?.selection?.anchor;

        const existingBreakpoints = vscode.debug.breakpoints
            .map(b => b as vscode.SourceBreakpoint)
            .filter(b => b?.location.range.start.line == selection.line);

        let breakpoint : vscode.SourceBreakpoint;
        if (existingBreakpoints.length > 0) {
            breakpoint = existingBreakpoints[0];
        } else {
            const location = new vscode.Location(activeUri, new vscode.Position(selection.line, 0));
            breakpoint = new vscode.SourceBreakpoint(location);
        }

        if (this._talkPoints.has(breakpoint.id)) {
            // Since talkpoint already exists, treat this as toggle and remove breakpoint
            vscode.debug.removeBreakpoints([breakpoint]);
            this._talkPoints.delete(breakpoint.id);
            vscode.window.showInformationMessage(`Removed talkpoint from line ${selection.line}`);
        } else {
            this._talkPoints.set(breakpoint.id, {
                type: "Text",
                text: "Hello World",
                position: new vscode.Position(selection.line, 0),
                uri: activeUri,
                breakpointId: breakpoint.id,
                shouldContinue: true,
            } as ITextTalkpoint);
            vscode.debug.addBreakpoints([breakpoint]);
            vscode.window.showInformationMessage(`Added talkpoint to line ${selection.line}`);
        }
        this._internalEvents.emit('talkpoints.changed');
    }

    /**
     * Load initial talkpoints for the workspace after the first breakpoint create message is received.
     */
    private loadInitialTalkpoints(breakpoints: readonly vscode.Breakpoint[]) {
        // First time breakpoints are loaded this session, need to update talkpoints with new breakpoint ids
        if (!this._breakpointsLoaded) {
            const talkpointsByFileLine : Record<string, ITalkpoint> = [...this._talkPoints.entries()]
                .reduce((map, [_, talkpoint]) => {
                    map[talkpoint.uri.path + ";" + talkpoint.position.line] = talkpoint;
                    return map;
                }, {});

            this._talkPoints.clear();
            breakpoints.forEach(breakpoint => {
                const sourceBreakpoint = breakpoint as SourceBreakpoint;
                const filePath = sourceBreakpoint.location.uri.path;
                const line = sourceBreakpoint.location.range.start.line;
                const talkpoint = talkpointsByFileLine[filePath + ";" +line];
                if (talkpoint) {
                    talkpoint.breakpointId = breakpoint.id;
                    this._talkPoints.set(breakpoint.id, talkpoint);
                }
            });
            this._breakpointsLoaded = true;
            this._internalEvents.emit('talkpoints.changed');
        }
    }

    /**
     * Render talkpoint decorations next to the line with the breakpoint.
     * Debounced so it only runs at most once a second.
     */
    private renderTalkpointDecorations() {
        debounce(() => {
            let editor = vscode.window.activeTextEditor;
            if (editor) {
                let decorationsArray: vscode.DecorationOptions[] = [];
                let code = editor.document.getText();
                let lines = code.split(editor.document.eol == vscode.EndOfLine.LF ? '\n' : '\r\n');

                const breakpointsWithTalkpoints = vscode.debug.breakpoints.map(b => b as SourceBreakpoint)
                    .filter(b => b.location.uri.path === editor.document.uri.path)
                    .filter(b => this._talkPoints.has(b.id));

                for (const breakpoint of breakpointsWithTalkpoints) {
                    const talkpoint = this._talkPoints.get(breakpoint.id);

                    if (talkpoint) {
                        const endOfTalkpointLine = lines[talkpoint.position.line].length;
                        const range = new vscode.Range(
                            new vscode.Position(talkpoint.position.line, 0),
                            new vscode.Position(talkpoint.position.line, endOfTalkpointLine))
                        const decoration = { range }
                        decorationsArray.push(decoration);
                    }
                }
                editor?.setDecorations(this._talkPointDecoration, decorationsArray);
            }
        }, 1000, true);
    }

    private getActiveTextEditorUri(): vscode.Uri {
        if (typeof vscode.window.activeTextEditor !== 'undefined' &&
            typeof vscode.window.activeTextEditor.document !== 'undefined') {
            return vscode.window.activeTextEditor.document.uri;
        }
        return undefined;
    }

    /**
     * Get the URI string for the current active text editor
     */
    private getActiveTextEditorUriString(): string {
        if (typeof vscode.window.activeTextEditor !== 'undefined' &&
            typeof vscode.window.activeTextEditor.document !== 'undefined') {
            return vscode.window.activeTextEditor.document.uri.toString(true);
        }
        return undefined;
    }
}
