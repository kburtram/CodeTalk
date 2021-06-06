/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { FunctionInfo, FunctionListProvider } from '../controls/functionListProvider';
import { ContextInfo, CurrentContextProvider } from '../controls/currentContextProvider';
import { FunctionListNode } from '../controls/functionListNode';
import { IErrorSettings, IExpressionTalkpoint, ITalkpoint, ITalkpointSettings, ITextTalkpoint, ITonalTalkpoint } from '../models/interfaces';
import { asyncFilter, createOutputChannel, logToOutputChannel } from '../models/utils';
import { ITalkpointCreationState, showTalkpointCreationSteps } from '../models/talkpointMenu';
import { debounce } from 'underscore';

import * as events from 'events';
import * as vscode from 'vscode';
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
    private _outputChannel: vscode.OutputChannel;
    private _functionListProvider: FunctionListProvider;
    private _functionListTreeView: vscode.TreeView<any>;
    private _currentContextProvider: CurrentContextProvider;
    private _currentContextTreeView: vscode.TreeView<any>;

    private _errorSettings: IErrorSettings;
    private _defaultErrorBeepSound: string = `${__dirname}/../assets/errorBeep.wav`;
    private _errorSoundBuffer: AudioBuffer;
    private _errorDiagnosticsListener: vscode.Disposable;
    private _previousDiagnostics: vscode.Diagnostic[] = [];

    private _talkPointSettings: ITalkpointSettings;
    private _tonalTalkpointBuffer: AudioBuffer;
    private _talkPoints: Map<string, ITalkpoint>;
    private _talkPointDecoration = vscode.window.createTextEditorDecorationType({
        isWholeLine: true,
        after: {
            contentText: '   Talkpoint Enabled'.replace(/ /g, '\u00a0'),
            fontStyle: 'normal',
            fontWeight: 'normal',
            color: new vscode.ThemeColor('editorLineNumber.foreground'),
            textDecoration: `none; aria-description: "Talkpoint Enabled";`,
        }
    } as vscode.DecorationRenderOptions);
    private _breakpointsLoaded: boolean = false;

    /**
     * The main controller constructor
     * @constructor
     */
    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._talkPoints = new Map<string, ITalkpoint>((this._context.workspaceState.get('talkpoints') || []));
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
        this._event.removeAllListeners();
        this._internalEvents.removeAllListeners();
        this._outputChannel?.dispose();
    }

    /**
     * Initializes the extension
     */
    public async activate(): Promise<boolean> {
        // initialize async setup flow, then register all commands & listeners
        const didInitialize = await this.initialize();

        if (didInitialize) {
            // Register text editor commands that are only fired if editor is active
            this.registerTextEditorCommand('codeTalk.showFunctions');
            this.registerTextEditorCommand('codeTalk.showContext');
            this.registerTextEditorCommand('codeTalk.moveToParent');
            this.registerTextEditorCommand('codeTalk.addTalkpoint');

            // Can be run even if no text editor is open, clears all talkpoints
            this.registerCommand('codeTalk.removeAllTalkpoints');
            this.registerCommandWithArgs('codeTalk.functionListNavigate');

            this._event.on('codeTalk.showFunctions', async (textEditor: vscode.TextEditor) => {
                this.handleShowFunctions(true);
            });

            vscode.window.onDidChangeActiveTextEditor(async (params) => {
                this.handleShowFunctions(false);
            });

            this._event.on('codeTalk.functionListNavigate', async (node: FunctionListNode) => {
                this._functionListProvider.navigateToFunction(node);
            });

            this._event.on('codeTalk.showContext', this.handleShowContext.bind(this));
            this._event.on('codeTalk.moveToParent', this.handleMoveToParent.bind(this));
            this._event.on('codeTalk.addTalkpoint', this.handleAddTalkpoint.bind(this));
            this._event.on('codeTalk.removeAllTalkpoints', this.handleRemoveAllTalkpoints.bind(this));
            this._internalEvents.on('talkpoints.changed', async () => {
                this.saveTalkpoints(); // don't need to block on save, even though this returns promise
                this.renderTalkpointDecorations();
            });

            // Keep hold of dispose handler, so that we can re-register after user config change
            this._errorDiagnosticsListener = vscode.languages.onDidChangeDiagnostics(
                this.getRealTimeErrorDiagnosticsListener(this._errorSettings?.errorDetectionInterval));

            // Add all event listeners to context subscriptions, so that they are disposed properly
            this._context.subscriptions.push(
                this._errorDiagnosticsListener,
                vscode.workspace.onDidChangeConfiguration(async (e) => {
                    if (e.affectsConfiguration('codeTalk')) {
                        await this.loadSettings(); //reload if changed
                    }
                }),
                vscode.workspace.onDidOpenTextDocument(this.renderTalkpointDecorations.bind(this)),
                vscode.workspace.onDidChangeTextDocument(this.renderTalkpointDecorations.bind(this)),
                vscode.debug.onDidChangeBreakpoints(this.handleChangeBreakpointsEvent.bind(this)),
                vscode.debug.registerDebugAdapterTrackerFactory('*', this.createDebugAdapterTrackerFactory()),
            );

            this.handleShowFunctions(false);
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

        this._outputChannel = createOutputChannel();
        await this.loadSettings();

        this._functionListProvider = new FunctionListProvider();
        this._functionListTreeView = vscode.window.createTreeView('codeTalkFunctionList', {
            treeDataProvider: this._functionListProvider
        });

        this._currentContextProvider = new CurrentContextProvider();
        this._currentContextProvider.onDidChangeTreeData((d) => {
            console.log(d);
        });

        this._currentContextTreeView = vscode.window.createTreeView('codeTalkCurrentContext', {
            treeDataProvider: this._currentContextProvider
        });

        this._context.subscriptions.push(
            this._functionListTreeView,
            this._currentContextTreeView,
        );

        this._initialized = true;
        return true;
    }

    private loadSettings = debounce(async () => {
        const workspaceSettings = vscode.workspace.getConfiguration('codeTalk');
        const prevErrorSettings = this._errorSettings;
        const prevTalkPointSettings = this._talkPointSettings;
        this._errorSettings = workspaceSettings.get<IErrorSettings>('errors');
        this._talkPointSettings = workspaceSettings.get<ITalkpointSettings>('talkpoints');

        if (!prevErrorSettings || prevErrorSettings.errorDetectionInterval != this._errorSettings.errorDetectionInterval) {
            // Re-register error listener to respect new interval setting
            this._errorDiagnosticsListener?.dispose();
            this._errorDiagnosticsListener = vscode.languages.onDidChangeDiagnostics(
                this.getRealTimeErrorDiagnosticsListener(this._errorSettings?.errorDetectionInterval || 2000));
            this._context.subscriptions.push(this._errorDiagnosticsListener);
        }

        if (!prevErrorSettings || prevErrorSettings.customErrorSound != this._errorSettings.customErrorSound) {
            if (this._errorSettings.customErrorSound) {
                try {
                    this._errorSoundBuffer = await load(this._errorSettings.customErrorSound);
                } catch (error) {
                    vscode.window.showErrorMessage('Failed to load custom sound for Error Detection: ' + error);
                }
            } else {
                this._errorSoundBuffer = await load(this._defaultErrorBeepSound);
            }
        }

        if (!prevTalkPointSettings || prevTalkPointSettings?.customBreakpointSound != this._talkPointSettings.customBreakpointSound) {
            if (this._talkPointSettings.customBreakpointSound) {
                try {
                    this._tonalTalkpointBuffer = await load(this._talkPointSettings.customBreakpointSound);
                } catch (error) {
                    vscode.window.showErrorMessage('Failed to load custom sound for Tonal Talkpoint: ' + error);
                }
            } else {
                this._tonalTalkpointBuffer = await load(this._defaultErrorBeepSound);
            }
        }
    }, 2000);

    private buildFunctionList(symbols: vscode.DocumentSymbol[], functionList: FunctionInfo[]) {
        for (let i = 0; i < symbols.length; ++i) {
            let symbol: vscode.DocumentSymbol = symbols[i];
            if (symbol.kind === vscode.SymbolKind.Function
                || symbol.kind === vscode.SymbolKind.Method) {
                let displayText = symbol.name + ' at line ' + (symbol.range.start.line + 1);
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

    /**
     * Plays a configured error tone if diagnostic problems are encountered
     * Debounce so error tone only plays every x seconds at most
     */
    private getRealTimeErrorDiagnosticsListener(interval: number) {
        return debounce((e: vscode.DiagnosticChangeEvent) => {
            if (this._errorSettings?.enableErrorDetection) {
                const activeUri: vscode.Uri = this.getActiveTextEditorUri();
                for (const uri of e.uris) {
                    if (activeUri?.path === uri.path) {
                        let currentDiagnostics: vscode.Diagnostic[] = vscode.languages.getDiagnostics(uri);
                        if (currentDiagnostics.length > this._previousDiagnostics?.length) {
                            play(this._errorSoundBuffer, {}, undefined);
                        }
                        this._previousDiagnostics = currentDiagnostics;
                    }
                }
            }
        }, interval);
    }

    /**
     * Handles a breakpoint change event from the user
     * @param e A breakpoint change event
     */
    private handleChangeBreakpointsEvent(e: vscode.BreakpointsChangeEvent) {
        // If first time breakpoints are loaded this session, need to update talkpoints with new breakpoint ids.
        // VSCode breakpoints get new id on every workspace session.
        if (!this._breakpointsLoaded) {
            if (e.added.length > 0) {
                this.loadInitialTalkpoints(e.added);
            }
        }

        // If user removes breakpoints, we should also remove from talkpoints, since there's nothing to break on.
        if (e.removed.length > 0) {
            this.removeTalkpoints(e.removed);
        }

        this._internalEvents.emit('talkpoints.changed');
    }

    private async handleShowFunctions(setFocus: boolean): Promise<boolean> {
        let ownerUri: vscode.Uri = this.getActiveTextEditorUri();
        if (ownerUri) {
            let symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
                'vscode.executeDocumentSymbolProvider',
                ownerUri);
            if (symbols) {
                let functionList: FunctionInfo[] = [];
                this.buildFunctionList(symbols, functionList);
                functionList.sort((a, b) => (a.line > b.line) ? 1 : -1)
                this._functionListProvider.updateFunctionList(
                    this._functionListTreeView,
                    ownerUri.toString(true),
                    functionList,
                    setFocus);
            }
        }
        return true;
    }

    private buildContextInfo(symbols: vscode.DocumentSymbol[], current: vscode.Position) : ContextInfo[] {
        if (!symbols || symbols.length === 0) {
            return [];
        }

        let result : ContextInfo[] = []
        for (let i = 0; i < symbols.length; ++i) {
            let displayText = symbols[i].name + ' at line ' + (symbols[i].range.start.line + 1);
            let spokenText = vscode.SymbolKind[symbols[i].kind] + ' ' + displayText
            let current = {
                name: symbols[i].name,
                kind: symbols[i].kind,
                displayText: displayText,
                spokenText: spokenText,
                line: symbols[i].range.start.line + 1,
            };
            result.push(current);
        }

        // Always start context from current position
        let text = `Current position at line ${current.line + 1}`;
        result.push({
            name: "Current position",
            kind: undefined,
            displayText: text,
            spokenText: text,
            line: current.line,
        });
        return result;
    }

    private async handleShowContext(editor: vscode.TextEditor): Promise<boolean> {
        const activeUri = editor?.document?.uri;
        const position = editor?.selection?.anchor;
        let context: vscode.DocumentSymbol[] = [];

        if (activeUri && position) {
            let symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
                'vscode.executeDocumentSymbolProvider',
                activeUri);

            if (symbols) {
                for (const symbol of symbols) {
                    this.findContextOf(position, symbol, context);
                    if (context.length > 0) {
                        break;
                    }
                }
            }

            if (context.length > 0) {
                const contextList = this.buildContextInfo(context, position);
                this._currentContextProvider.updateCurrentContext(this._currentContextTreeView, activeUri, contextList);

                return true;
            } else {
                vscode.window.showErrorMessage("Could not find context.");
            }
        }
        return false;
    }

    private findContextOf(position: vscode.Position, parent: vscode.DocumentSymbol,
        context: vscode.DocumentSymbol[]) : void {
        if (parent && parent.range.contains(position)) {

            // Add to top of context
            context.push(parent);

            if (parent.children) {
                for (const child of parent.children) {
                    this.findContextOf(position, child, context);
                }
            }
        }
    }

    private async handleMoveToParent(editor: vscode.TextEditor): Promise<void> {
        const activeUri = editor?.document?.uri;
        const position = editor?.selection?.anchor;

        if (activeUri && position) {

            let symbols: vscode.DocumentSymbol[] = await vscode.commands.executeCommand(
                'vscode.executeDocumentSymbolProvider',
                activeUri);

            if (symbols) {
                let immediateParent: vscode.DocumentSymbol;
                for (const symbol of symbols) {
                    const result = this.findImmediateParentOf(position, symbol);
                    if (result) {
                        immediateParent = result;
                        continue;
                    }
                }

                if (immediateParent) {
                    editor.selections = [new vscode.Selection(immediateParent.range.start, immediateParent.range.start)];
                    vscode.window.showInformationMessage(`Moved to parent ${vscode.SymbolKind[immediateParent.kind]} ${immediateParent.name} at line ${(immediateParent.range.start.line + 1)}`);
                } else {
                    vscode.window.showInformationMessage('No parent found.');
                }
            }
        }
    }

    /**
     * Recursive function that finds the immediate parent of a position.
     * @param position the position whose parent we are seeking
     * @param parent the current parent node we are inspecting
     * @returns the immediate parent of the position if found, else null
     */
    private findImmediateParentOf(position: vscode.Position, parent: vscode.DocumentSymbol): vscode.DocumentSymbol | null {
        // Is immediate if contains position AND has no children that contain the position

        if (parent &&
            parent.range.contains(position) &&
            parent.range.start.line != position.line) {

            if (parent.children) {
                for (const child of parent.children) {
                    const result = this.findImmediateParentOf(position, child)
                    if (result) {
                        return result;
                    }
                }
            }

            return parent;
        }
        return undefined;
    }

    /**
     * Saves talkpoints to the workspace storage, so it can be reloaded on the next session.
     */
    private async saveTalkpoints() {
        await this._context.workspaceState.update('talkpoints', [...this._talkPoints.entries()]);
    }

    /**
     * Removes all talkpoints from the current workspace.
    */
    private async handleRemoveAllTalkpoints() {
        let numTalkpoints = this._talkPoints.size;

        if (numTalkpoints > 0) {
            const breakpoints = vscode.debug.breakpoints.filter(b => this._talkPoints.has(b.id));
            vscode.debug.removeBreakpoints(breakpoints);
            this._talkPoints.clear();
            vscode.window.showInformationMessage(`Removed ${numTalkpoints} talkpoints from workspace.`);
            this._internalEvents.emit('talkpoints.changed');
        } else {
            vscode.window.showInformationMessage('There are no talkpoints registered.');
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
                if (this._talkPoints.has(breakpoint?.id)) {
                    this._talkPoints.delete(breakpoint.id);
                    const line = (breakpoint as vscode.SourceBreakpoint)?.location.range.start.line;
                    vscode.window.showInformationMessage(`Removed talkpoint from line ${line + 1}.`);
                }
            }
        }
    }

    /**
     * Handles adding a talkpoint to the current line.
     * @param editor The current active editor
     */
    private async handleAddTalkpoint(editor: vscode.TextEditor) {
        const activeUri: vscode.Uri = editor?.document?.uri;
        const selection: vscode.Position = editor?.selection?.anchor;

        if (activeUri && selection) {

            const existingBreakpoints = vscode.debug.breakpoints
                .map(b => b as vscode.SourceBreakpoint)
                .filter(b => b?.location.range.start.line === selection.line &&
                    activeUri.path === b?.location.uri.path);

            let breakpoint: vscode.SourceBreakpoint;
            if (existingBreakpoints.length > 0) {
                breakpoint = existingBreakpoints[0];
            } else {
                const location = new vscode.Location(activeUri, new vscode.Position(selection.line, 0));
                breakpoint = new vscode.SourceBreakpoint(location); // Creation will be deferred until after talkpoint is created
            }

            await this.createTalkpoint(activeUri, selection, breakpoint);
        }
    }

    /**
     * Create or remove a talkpoint depending on if one exists
     * @param activeUri The current file uri
     * @param selection The current selection
     * @param breakpoint The breakpoint at this line
     * @returns
     */
    private async createTalkpoint(activeUri: vscode.Uri, selection: vscode.Position, breakpoint: vscode.Breakpoint) {
        // Since talkpoint already exists, treat this as toggle and remove breakpoint
        if (this._talkPoints.has(breakpoint.id)) {
            this.removeTalkpoints([breakpoint]);
            vscode.debug.removeBreakpoints([breakpoint]);
            // Talkpoint doesn't exist, so launch creation experience
        } else {
            const state: ITalkpointCreationState = await showTalkpointCreationSteps();

            if (state.dismissedEarly) {
                vscode.window.showWarningMessage('Dismissed talkpoint creation.');
                return;
            }

            this._talkPoints.set(breakpoint.id, {
                type: state.type,
                text: state.text,
                expression: state.expression,
                sound: state.sound,
                position: new vscode.Position(selection.line, 0),
                uri: activeUri,
                breakpointId: breakpoint.id,
                shouldContinue: state.shouldContinue,
            } as ITonalTalkpoint | ITextTalkpoint | IExpressionTalkpoint);
            vscode.debug.addBreakpoints([breakpoint]);
            vscode.window.showInformationMessage(`Added talkpoint to line ${selection.line + 1}.`);
        }
        this._internalEvents.emit('talkpoints.changed');
    }

    /**
     * Load initial talkpoints for the workspace after the first breakpoint create message is received.
     */
    private loadInitialTalkpoints(breakpoints: readonly vscode.Breakpoint[]) {
        // First time breakpoints are loaded this session, need to update talkpoints with new breakpoint ids
        if (!this._breakpointsLoaded) {
            const talkpointsByFileLine: Record<string, ITalkpoint> = [...this._talkPoints.entries()]
                .reduce((map, [_, talkpoint]) => {
                    map[talkpoint.uri.path + ';' + talkpoint.position.line] = talkpoint;
                    return map;
                }, {});

            this._talkPoints.clear();
            breakpoints.forEach(breakpoint => {
                const sourceBreakpoint = breakpoint as vscode.SourceBreakpoint;
                if (sourceBreakpoint) {
                    const filePath = sourceBreakpoint.location.uri.path;
                    const line = sourceBreakpoint.location.range.start.line;
                    const talkpoint = talkpointsByFileLine[filePath + ';' + line];
                    if (talkpoint) {
                        talkpoint.breakpointId = breakpoint.id;
                        this._talkPoints.set(breakpoint.id, talkpoint);
                    }
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
    private renderTalkpointDecorations = debounce(() => {
        let editor = vscode.window.activeTextEditor;
        if (editor) {
            let decorationsArray: vscode.DecorationOptions[] = [];
            let code = editor.document.getText();
            let lines = code.split(editor.document.eol == vscode.EndOfLine.LF ? '\n' : '\r\n');

            const breakpointsWithTalkpoints = vscode.debug.breakpoints.map(b => b as vscode.SourceBreakpoint)
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

    private createDebugAdapterTrackerFactory(): vscode.DebugAdapterTrackerFactory {
        return {
            createDebugAdapterTracker: (session) => {
                return {
                    onDidSendMessage: async (m) => {
                        if (m?.type === 'event' && m.event === 'initialized') {
                            // Start new output channel for new debug session
                            this._outputChannel.clear();
                        }
                        if (m?.type === 'event' && m.event === 'stopped' &&
                            (m.body?.reason === 'breakpoint' || m.body?.reason === 'step')) {

                            // Get current stack details to be able to find corresponding breakpoint
                            const stack = await session.customRequest('stackTrace', { threadId: m.body.threadId, startFrame: 0 });
                            const currentFrame = stack.stackFrames[0];

                            const sourceBreakpoints = vscode.debug.breakpoints.map(b => b as vscode.SourceBreakpoint);
                            const matchedBreakpoints = await asyncFilter(sourceBreakpoints, async (b) => {
                                // Get debugger's breakpoint's version of line number,
                                // since breakpoint is sometimes moved to another line by debugger (such as up a line from a brace)
                                let debugBreakpoint = await session.getDebugProtocolBreakpoint(b);
                                let debugBreakpointLine = (debugBreakpoint as any)?.line;
                                return b.location.uri.path === vscode.Uri.file(currentFrame.source.path).path &&
                                    debugBreakpointLine === currentFrame.line
                            });

                            matchedBreakpoints.forEach(async (b: vscode.Breakpoint) => {
                                if (this._talkPoints.has(b.id)) {
                                    const talkpoint = this._talkPoints.get(b.id);
                                    let message: string;

                                    switch (talkpoint.type) {
                                        case 'Tonal':
                                            play(this._tonalTalkpointBuffer, {}, undefined);
                                            break;
                                        case 'Text':
                                            message = 'Text Talkpoint Hit: ' + talkpoint.text;
                                            vscode.window.showInformationMessage(message);
                                            logToOutputChannel(this._outputChannel, message);
                                            break;
                                        case 'Expression':
                                            const expressionTalkpoint = talkpoint;
                                            try {
                                                const response = await session.customRequest('evaluate', {
                                                    expression: expressionTalkpoint.expression,
                                                    frameId: currentFrame.id // run in the scope of the most recent local stack frame
                                                });
                                                message = 'Expression Talkpoint Hit: ' + response.result;
                                            } catch (error) {
                                                message = 'Expression Talkpoint Invalid: ' + error;
                                            }
                                            vscode.window.showInformationMessage(message);
                                            logToOutputChannel(this._outputChannel, message);
                                            break;
                                        default:
                                            vscode.window.showErrorMessage('Unrecognized Talkpoint: ' + talkpoint);
                                            break;
                                    }

                                    // Don't pause on breakpoint if shouldContinue is true
                                    if (talkpoint.shouldContinue) {
                                        session.customRequest('continue', { threadId: m.body.threadId });
                                    }
                                }
                            })
                        }
                    }
                };
            }
        };
    }

    /**
     * Get the URI for the current active text editor
     * @return
     */
    private getActiveTextEditorUri(): vscode.Uri {
        if (typeof vscode.window.activeTextEditor !== 'undefined' &&
            typeof vscode.window.activeTextEditor.document !== 'undefined') {
            return vscode.window.activeTextEditor.document.uri;
        }
        return undefined;
    }
}
