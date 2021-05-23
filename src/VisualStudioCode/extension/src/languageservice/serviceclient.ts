/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';
import * as vscode from 'vscode';
import {
    LanguageClient, LanguageClientOptions, ServerOptions,
    TransportKind, RequestType, NotificationType, NotificationHandler,
    ErrorAction, CloseAction
} from 'vscode-languageclient';
import * as Utils from '../models/utils';
import { Logger } from '../models/logger';
import ServerProvider from './server';
import ServiceDownloadProvider from './serviceDownloadProvider';
import DecompressProvider from './decompressProvider';
import HttpClient from './httpClient';
import ExtConfig from '../configurations/extConfig';
import { PlatformInformation } from '../models/platform';
import { ServerInitializationResult, ServerStatusView } from './serverStatus';
import StatusView from '../controllers/statusView';
import * as LanguageServiceContracts from '../models/contracts/languageService';
import { IConfig } from '../languageservice/interfaces';

let _channel: vscode.OutputChannel = undefined;

/**
 * @interface IMessage
 */
interface IMessage {
    jsonrpc: string;
}


/**
 * Handle Language Service client errors
 * @class LanguageClientErrorHandler
 */
class LanguageClientErrorHandler {

    /**
     * Creates an instance of LanguageClientErrorHandler.
     * @memberOf LanguageClientErrorHandler
     */
    constructor() {
    }

    /**
     * Show an error message prompt with a link to known issues wiki page
     * @memberOf LanguageClientErrorHandler
     */
    showOnErrorPrompt(): void {
        vscode.window.showErrorMessage(
            'Code Talk Server crashed',
            'Show Help').then(action => {
                // if (action && action === Constants.sqlToolsServiceCrashButton) {
                //     vscode.env.openExternal(vscode.Uri.parse(Constants.sqlToolsServiceCrashLink));
                // }
            });
    }

    /**
     * Callback for language service client error
     *
     * @param {Error} error
     * @param {Message} message
     * @param {number} count
     * @returns {ErrorAction}
     *
     * @memberOf LanguageClientErrorHandler
     */
    error(error: Error, message: IMessage, count: number): ErrorAction {
        this.showOnErrorPrompt();

        // we don't retry running the service since crashes leave the extension
        // in a bad, unrecovered state
        return ErrorAction.Shutdown;
    }

    /**
     * Callback for language service client closed
     *
     * @returns {CloseAction}
     *
     * @memberOf LanguageClientErrorHandler
     */
    closed(): CloseAction {
        this.showOnErrorPrompt();

        // we don't retry running the service since crashes leave the extension
        // in a bad, unrecovered state
        return CloseAction.DoNotRestart;
    }
}

// The Service Client class handles communication with the VS Code LanguageClient
export default class CodeTalkServiceClient {

    private _logPath: string;

    // singleton instance
    private static _instance: CodeTalkServiceClient = undefined;

    // VS Code Language Client
    private _client: LanguageClient = undefined;

    // getter method for the Language Client
    private get client(): LanguageClient {
        return this._client;
    }

    private set client(client: LanguageClient) {
        this._client = client;
    }

    // getter method for language client diagnostic collection
    public get diagnosticCollection(): vscode.DiagnosticCollection {
        return this._client.diagnostics;
    }

    constructor(
        private _config: IConfig,
        private _server: ServerProvider,
        private _logger: Logger,
        private _statusView: StatusView) {
    }

    // gets or creates the singleton SQL Tools service client instance
    public static get instance(): CodeTalkServiceClient {
        if (this._instance === undefined) {
            let config = new ExtConfig();
            _channel = vscode.window.createOutputChannel('Code Talk Service');
            let logger = new Logger(text => _channel.append(text));
            let serverStatusView = new ServerStatusView();
            let httpClient = new HttpClient();
            let decompressProvider = new DecompressProvider();
            let downloadProvider = new ServiceDownloadProvider(config, logger, serverStatusView, httpClient,
                decompressProvider);
            let serviceProvider = new ServerProvider(downloadProvider, config, serverStatusView);
            let statusView = new StatusView();
            this._instance = new CodeTalkServiceClient(config, serviceProvider, logger, statusView);
        }
        return this._instance;
    }

    // initialize the SQL Tools Service Client instance by launching
    // out-of-proc server through the LanguageClient
    public initialize(context: vscode.ExtensionContext): Promise<ServerInitializationResult> {
        this._logger.appendLine('Code Talk Service initializing');
        this._logPath = context.logPath;
        return PlatformInformation.getCurrent().then(platformInfo => {
            return this.initializeForPlatform(platformInfo, context);
        });
    }

    public initializeForPlatform(platformInfo: PlatformInformation, context: vscode.ExtensionContext): Promise<ServerInitializationResult> {
        return new Promise<ServerInitializationResult>((resolve, reject) => {
            this._logger.appendLine('Commands not available during service initialization');
            this._logger.appendLine();
            this._logger.append(`Platform: ${platformInfo.toString()}`);
            if (!platformInfo.isValidRuntime()) {
                Utils.showErrorMsg('Unsupported platform');
                reject('Invalid Platform');
            } else {
                if (platformInfo.runtimeId) {
                    this._logger.appendLine(` (${platformInfo.getRuntimeDisplayName()})`);
                } else {
                    this._logger.appendLine();
                }
                this._logger.appendLine();

                // For macOS we need to ensure the tools service version is set appropriately
                this.updateServiceVersion(platformInfo);

                this._server.getServerPath(platformInfo.runtimeId).then(async serverPath => {
                    if (serverPath === undefined) {
                        // Check if the service already installed and if not open the output channel to show the logs
                        if (_channel !== undefined) {
                            _channel.show();
                        }
                        let installedServerPath = await this._server.downloadServerFiles(platformInfo.runtimeId);
                        this.initializeLanguageClient(installedServerPath, context, platformInfo.isWindows());
                        await this._client.onReady();
                        resolve(new ServerInitializationResult(true, true, installedServerPath));
                    } else {
                        this.initializeLanguageClient(serverPath, context, platformInfo.isWindows());
                        await this._client.onReady();
                        resolve(new ServerInitializationResult(false, true, serverPath));
                    }
                }).catch(err => {
                    Utils.logDebug('Service initialization failed ' + err);
                    Utils.showErrorMsg('Code Talk service initialization failed');
                    reject(err);
                });
            }
        });
    }

    private updateServiceVersion(platformInfo: PlatformInformation): void {
        if (platformInfo.isMacOS() && platformInfo.isMacVersionLessThan('10.12.0')) {
            // Version 1.0 is required as this is the last one supporting downlevel macOS versions
            this._config.useServiceVersion(1);
        }
    }

    /**
     * Gets the known service version of the backing tools service. This can be useful for filtering
     * commands that are not supported if the tools service is below a certain known version
     *
     * @returns {number}
     * @memberof CodeTalkServiceClient
     */
    public getServiceVersion(): number {
        return this._config.getServiceVersion();
    }

    /**
     * Initializes the SQL language configuration
     *
     * @memberOf CodeTalkServiceClient
     */
    private initializeLanguageConfiguration(): void {
        vscode.languages.setLanguageConfiguration('sql', {
            comments: {
                lineComment: '--',
                blockComment: ['/*', '*/']
            },

            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')']
            ],

            __characterPairSupport: {
                autoClosingPairs: [
                    { open: '{', close: '}' },
                    { open: '[', close: ']' },
                    { open: '(', close: ')' },
                    { open: '"', close: '"', notIn: ['string'] },
                    { open: '\'', close: '\'', notIn: ['string', 'comment'] }
                ]
            }
        });
    }

    private initializeLanguageClient(serverPath: string, context: vscode.ExtensionContext, isWindows: boolean): void {
        if (serverPath === undefined) {
            Utils.logDebug('Invalid service path');
            throw new Error('Invalid service path');
        } else {
            let self = this;
            self.initializeLanguageConfiguration();
            let serverOptions: ServerOptions = this.createServerOptions(serverPath);
            this.client = this.createLanguageClient(serverOptions);

            if (context !== undefined) {
                // Create the language client and start the client.
                let disposable = this.client.start();

                // Push the disposable to the context's subscriptions so that the
                // client can be deactivated on extension deactivation
                context.subscriptions.push(disposable);
            }
        }
    }

    private createLanguageClient(serverOptions: ServerOptions): LanguageClient {
        // Options to control the language client
        let clientOptions: LanguageClientOptions = {
            documentSelector: ['sql'],
            diagnosticCollectionName: 'mssql',
            synchronize: {
                configurationSection: 'mssql'
            },
            errorHandler: new LanguageClientErrorHandler()
        };

        // cache the client instance for later use
        let client = new LanguageClient('CodeTalkLanguageService', serverOptions, clientOptions);
        client.onReady().then(() => {
            client.onNotification(LanguageServiceContracts.StatusChangedNotification.type, this.handleLanguageServiceStatusNotification());
        });

        return client;
    }

    /**
     * Public for testing purposes only.
     */
    public handleLanguageServiceStatusNotification(): NotificationHandler<LanguageServiceContracts.StatusChangeParams> {
        return (event: LanguageServiceContracts.StatusChangeParams): void => {
            this._statusView.languageServiceStatusChanged(event.ownerUri, event.status);
        };
    }

    private createServerOptions(servicePath): ServerOptions {
        let serverArgs = [];
        let serverCommand: string = servicePath;
        if (servicePath.endsWith('.dll')) {
            serverArgs = [servicePath];
            serverCommand = 'dotnet';
        }

        // Get the extenion's configuration
        let config = vscode.workspace.getConfiguration('codetalk');
        if (config) {
            // Enable diagnostic logging in the service if it is configured
            let logDebugInfo = config['LogDebugInfo'];
            if (logDebugInfo) {
                serverArgs.push('--enable-logging');
            }
        }

        // run the service host using dotnet.exe from the path
        let serverOptions: ServerOptions = { command: serverCommand, args: serverArgs, transport: TransportKind.stdio };
        return serverOptions;
    }

    /**
     * Send a request to the service client
     * @param type The of the request to make
     * @param params The params to pass with the request
     * @returns A thenable object for when the request receives a response
     */
    // tslint:disable-next-line:no-unused-variable
    public sendRequest<P, R, E, R0>(type: RequestType<P, R, E, R0>, params?: P): Thenable<R> {
        if (this.client !== undefined) {
            return this.client.sendRequest(type, params);
        }
    }

    /**
     * Send a notification to the service client
     * @param params The params to pass with the notification
     */
    // tslint:disable-next-line:no-unused-variable
    public sendNotification<P, R0>(type: NotificationType<P, R0>, params?: P): void {
        if (this.client !== undefined) {
            this.client.sendNotification(type, params);
        }
    }

    /**
     * Register a handler for a notification type
     * @param type The notification type to register the handler for
     * @param handler The handler to register
     */
    // tslint:disable-next-line:no-unused-variable
    public onNotification<P, R0>(type: NotificationType<P, R0>, handler: NotificationHandler<P>): void {
        if (this._client !== undefined) {
            return this.client.onNotification(type, handler);
        }
    }
}
