//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
//

using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.Threading.Tasks;
using CodeTalk.ServiceLayer.Hosting;
using Microsoft.SqlTools.Hosting.Protocol;
using Microsoft.SqlTools.LanguageServices.Contracts;
using Microsoft.SqlTools.ServiceLayer.SqlContext;
using Microsoft.SqlTools.ServiceLayer.Workspace;
using Microsoft.SqlTools.Utility;
using Microsoft.SqlTools.Workspace.Contracts;
using Location = Microsoft.SqlTools.Workspace.Contracts.Location;

namespace CodeTalk.LanguageService
{
    /// <summary>
    /// Main class for Language Service functionality including anything that requires knowledge of
    /// the language to perform, such as definitions, intellisense, etc.
    /// </summary>
    public class LanguageService: IDisposable
    {
        #region Singleton Instance Implementation

        private static readonly Lazy<LanguageService> instance = new Lazy<LanguageService>(() => new LanguageService());

        /// <summary>
        /// Gets the singleton instance object
        /// </summary>
        public static LanguageService Instance
        {
            get { return instance.Value; }
        }

        #endregion

        #region Instance fields and constructor

        public const string SQL_LANG = "SQL";

        public const string SQL_CMD_LANG = "SQLCMD";

        private const int OneSecond = 1000;

        private const int PrepopulateBindTimeout = 60000;

        internal const string DefaultBatchSeperator = "GO";

        internal const int DiagnosticParseDelay = 750;

        internal const int HoverTimeout = 500;

        internal const int BindingTimeout = 500;

        internal const int OnConnectionWaitTimeout = 300 * OneSecond;

        internal const int PeekDefinitionTimeout = 10 * OneSecond;

        internal const int ExtensionLoadingTimeout = 10 * OneSecond;

        internal const int CompletionExtTimeout = 200;

        // For testability only
        internal Task DelayedDiagnosticsTask = null;

        private WorkspaceService<SqlToolsSettings> workspaceServiceInstance;

        private ServiceHost serviceHostInstance;

        private object parseMapLock = new object();

        private ConcurrentDictionary<string, bool> nonMssqlUriMap = new ConcurrentDictionary<string, bool>();


        /// <summary>
        /// Default, parameterless constructor.
        /// </summary>
        internal LanguageService()
        {
        }

        #endregion

        #region Properties


        /// <summary>
        /// Gets or sets the current workspace service instance
        /// Setter for internal testing purposes only
        /// </summary>
        internal WorkspaceService<SqlToolsSettings> WorkspaceServiceInstance
        {
            get
            {
                if (workspaceServiceInstance == null)
                {
                    workspaceServiceInstance =  WorkspaceService<SqlToolsSettings>.Instance;
                }
                return workspaceServiceInstance;
            }
            set
            {
                workspaceServiceInstance = value;
            }
        }

        internal ServiceHost ServiceHostInstance
        {
            get
            {
                if (this.serviceHostInstance == null)
                {
                    this.serviceHostInstance = ServiceHost.Instance;
                }
                return this.serviceHostInstance;
            }
            set
            {
                this.serviceHostInstance = value;
            }
        }

        /// <summary>
        /// Gets the current settings
        /// </summary>
        internal SqlToolsSettings CurrentWorkspaceSettings
        {
            get { return WorkspaceServiceInstance.CurrentSettings; }
        }

        /// <summary>
        /// Gets the current workspace instance
        /// </summary>
        internal Workspace CurrentWorkspace
        {
            get { return WorkspaceServiceInstance.Workspace; }
        }

        /// <summary>
        /// Gets or sets the current SQL Tools context
        /// </summary>
        /// <returns></returns>
        internal SqlToolsContext Context { get; set; }

        #endregion

        #region Public Methods

        /// <summary>
        /// Initializes the Language Service instance
        /// </summary>
        /// <param name="serviceHost"></param>
        /// <param name="context"></param>
        public void InitializeService(ServiceHost serviceHost, SqlToolsContext context)
        {
            // Register the requests that this service will handle
            serviceHost.SetRequestHandler(SignatureHelpRequest.Type, HandleSignatureHelpRequest);
            serviceHost.SetRequestHandler(CompletionResolveRequest.Type, HandleCompletionResolveRequest);
            serviceHost.SetRequestHandler(HoverRequest.Type, HandleHoverRequest);
            serviceHost.SetRequestHandler(CompletionRequest.Type, HandleCompletionRequest);
            serviceHost.SetRequestHandler(DefinitionRequest.Type, HandleDefinitionRequest);
            serviceHost.SetRequestHandler(SyntaxParseRequest.Type, HandleSyntaxParseRequest);

            // Register a no-op shutdown task for validation of the shutdown logic
            serviceHost.RegisterShutdownTask(async (shutdownParams, shutdownRequestContext) =>
            {
                Logger.Write(TraceEventType.Verbose, "Shutting down language service");               
                this.Dispose();
                await Task.FromResult(0);
            });

            ServiceHostInstance = serviceHost;

            // Register the configuration update handler
            WorkspaceServiceInstance.RegisterConfigChangeCallback(HandleDidChangeConfigurationNotification);

            // Register the file change update handler
            WorkspaceServiceInstance.RegisterTextDocChangeCallback(HandleDidChangeTextDocumentNotification);

            // Register the file open update handler
            WorkspaceServiceInstance.RegisterTextDocOpenCallback(HandleDidOpenTextDocumentNotification);

            // Register the file open update handler
            WorkspaceServiceInstance.RegisterTextDocCloseCallback(HandleDidCloseTextDocumentNotification);

            // Store the SqlToolsContext for future use
            Context = context;

        }

        #endregion

        #region Request Handlers

        /// <summary>
        /// T-SQL syntax parse request callback
        /// </summary>
        /// <param name="param"></param>
        /// <param name="requestContext"></param>
        /// <returns></returns>
        internal async Task HandleSyntaxParseRequest(SyntaxParseParams param, RequestContext<SyntaxParseResult> requestContext)
        {
            await Task.Run(() =>
            {
                // try
                // {
                //     ParseResult result = Parser.Parse(param.Query);
                //     SyntaxParseResult syntaxResult = new SyntaxParseResult();
                //     if (result != null && result.Errors.Count() == 0)
                //     {
                //         syntaxResult.Parseable = true;
                //     } else
                //     {
                //         syntaxResult.Parseable = false;
                //         string[] errorMessages = new string[result.Errors.Count()];
                //         for (int i = 0; i < result.Errors.Count(); i++)
                //         {
                //             errorMessages[i] = result.Errors.ElementAt(i).Message;
                //         }
                //         syntaxResult.Errors = errorMessages;
                //     }
                //     await requestContext.SendResult(syntaxResult);
                // }
                // catch (Exception ex)
                // {
                //     await requestContext.SendError(ex.ToString());
                // }
            });
        }

        /// <summary>
        /// Auto-complete completion provider request callback
        /// </summary>
        /// <param name="textDocumentPosition"></param>
        /// <param name="requestContext"></param>
        /// <returns></returns>
        internal async Task HandleCompletionRequest(
            TextDocumentPosition textDocumentPosition,
            RequestContext<CompletionItem[]> requestContext)
        {
            try
            {
                var scriptFile = CurrentWorkspace.GetFile(textDocumentPosition.TextDocument.Uri);
                if (scriptFile == null)
                {
                    await requestContext.SendResult(null);
                    return;
                }
                // check if Intellisense suggestions are enabled
                // if (ShouldSkipIntellisense(scriptFile.ClientUri))
                // {
                //     await requestContext.SendResult(null);
                // }
                // else
                {
                    // // get the current list of completion items and return to client
                    // ConnectionServiceInstance.TryFindConnection(
                    //     scriptFile.ClientUri,
                    //     // out ConnectionInfo connInfo);

                    // var completionItems = await GetCompletionItems(
                    //     textDocumentPosition, scriptFile, null);

                    await requestContext.SendResult(null);
                }
            }
            catch (Exception ex)
            {
                await requestContext.SendError(ex.ToString());
            }
        }

        /// <summary>
        /// Handle the resolve completion request event to provide additional
        /// autocomplete metadata to the currently select completion item
        /// </summary>
        /// <param name="completionItem"></param>
        /// <param name="requestContext"></param>
        /// <returns></returns>
        internal async Task HandleCompletionResolveRequest(
            CompletionItem completionItem,
            RequestContext<CompletionItem> requestContext)
        {
            try
            {
                await requestContext.SendResult(completionItem);                
            }
            catch (Exception ex)
            {
                await requestContext.SendError(ex.ToString());
            }
        }

        internal async Task HandleDefinitionRequest(TextDocumentPosition textDocumentPosition, RequestContext<Location[]> requestContext)
        {
            await requestContext.SendError("not implemented");
            // try
            // {
            //     DocumentStatusHelper.SendStatusChange(requestContext, textDocumentPosition, DocumentStatusHelper.DefinitionRequested);

            //     if (!ShouldSkipIntellisense(textDocumentPosition.TextDocument.Uri))
            //     {
            //         // Retrieve document and connection
            //         ConnectionInfo connInfo;
            //         var scriptFile = CurrentWorkspace.GetFile(textDocumentPosition.TextDocument.Uri);
            //         bool isConnected = false;
            //         bool succeeded = false;
            //         DefinitionResult definitionResult = null;
            //         if (scriptFile != null)
            //         {
            //             isConnected = ConnectionServiceInstance.TryFindConnection(scriptFile.ClientUri, out connInfo);
            //             definitionResult = GetDefinition(textDocumentPosition, scriptFile, connInfo);
            //         }

            //         if (definitionResult != null && !definitionResult.IsErrorResult)
            //         {
            //             await requestContext.SendResult(definitionResult.Locations);
            //             succeeded = true;
            //         }
            //         else
            //         {
            //             await requestContext.SendResult(Array.Empty<Location>());
            //         }

            //         DocumentStatusHelper.SendTelemetryEvent(requestContext, CreatePeekTelemetryProps(succeeded, isConnected));
            //     }
            //     else
            //     {
            //         // Send an empty result so that processing does not hang when peek def service called from non-mssql clients
            //         await requestContext.SendResult(Array.Empty<Location>());
            //     }

            //     DocumentStatusHelper.SendStatusChange(requestContext, textDocumentPosition, DocumentStatusHelper.DefinitionRequestCompleted);
            // }
            // catch (Exception ex)
            // {
            //     await requestContext.SendError(ex.ToString());
            // }
        }

        private static TelemetryProperties CreatePeekTelemetryProps(bool succeeded, bool connected)
        {
            return new TelemetryProperties
            {
                Properties = new Dictionary<string, string>
                {
                    { TelemetryPropertyNames.Succeeded, succeeded.ToOneOrZeroString() },
                    { TelemetryPropertyNames.Connected, connected.ToOneOrZeroString() }
                },
                EventName = TelemetryEventNames.PeekDefinitionRequested
            };
        }

        internal async Task HandleSignatureHelpRequest(
            TextDocumentPosition textDocumentPosition,
            RequestContext<SignatureHelp> requestContext)
        {
            try
            {
                // check if Intellisense suggestions are enabled
                //if (ShouldSkipNonMssqlFile(textDocumentPosition))
                {
                    await requestContext.SendResult(null);
                }
                // else
                // {
                //     ScriptFile scriptFile = CurrentWorkspace.GetFile(
                //         textDocumentPosition.TextDocument.Uri);
                //     SignatureHelp help = null;
                //     if (scriptFile != null)
                //     {
                //         help = GetSignatureHelp(textDocumentPosition, scriptFile);
                //     }
                //     if (help != null)
                //     {
                //         await requestContext.SendResult(help);
                //     }
                //     else
                //     {
                //         await requestContext.SendResult(new SignatureHelp());
                //     }
                // }
            }
            catch (Exception ex)
            {
                await requestContext.SendError(ex.ToString());
            }
        }

        private async Task HandleHoverRequest(
            TextDocumentPosition textDocumentPosition,
            RequestContext<Hover> requestContext)
        {
            try
            {
                // check if Quick Info hover tooltips are enabled
                // if (CurrentWorkspaceSettings.IsQuickInfoEnabled
                //     && !ShouldSkipNonMssqlFile(textDocumentPosition))
                {
                    var scriptFile = CurrentWorkspace.GetFile(
                        textDocumentPosition.TextDocument.Uri);

                    // Hover hover = null;
                    // if (scriptFile != null)
                    // {
                    //     hover = GetHoverItem(textDocumentPosition, scriptFile);
                    // }
                    // if (hover != null)
                    // {
                    //     await requestContext.SendResult(hover);
                    // }
                }
                await requestContext.SendResult(null);
            }
            catch (Exception ex)
            {
                await requestContext.SendError(ex.ToString());
            }
        }

        #endregion

        #region Handlers for Events from Other Services

        /// <summary>
        /// Handle the file open notification
        /// </summary>
        /// <param name="uri"></param>
        /// <param name="scriptFile"></param>
        /// <param name="eventContext"></param>
        /// <returns></returns>
        public async Task HandleDidOpenTextDocumentNotification(
            string uri,
            ScriptFile scriptFile,
            EventContext eventContext)
        {
            try
            {
                // if not in the preview window and diagnostics are enabled then run diagnostics
                // if (!IsPreviewWindow(scriptFile)
                //     && CurrentWorkspaceSettings.IsDiagnosticsEnabled)
                // {
                //     await RunScriptDiagnostics(
                //         new ScriptFile[] { scriptFile },
                //         eventContext);
                // }

                await Task.FromResult(true);
            }
            catch (Exception ex)
            {
                Logger.Write(TraceEventType.Error, "Unknown error " + ex.ToString());
                // TODO: need mechanism return errors from event handlers
            }
        }

        /// <summary>
        /// Handles text document change events
        /// </summary>
        /// <param name="textChangeParams"></param>
        /// <param name="eventContext"></param>
        public async Task HandleDidChangeTextDocumentNotification(ScriptFile[] changedFiles, EventContext eventContext)
        {
            try
            {
                // if (CurrentWorkspaceSettings.IsDiagnosticsEnabled)
                // {
                //     // Only process files that are MSSQL flavor
                //     await this.RunScriptDiagnostics(
                //         changedFiles.ToArray(),
                //         eventContext);
                // }

                await Task.FromResult(true);
            }
            catch (Exception ex)
            {
                Logger.Write(TraceEventType.Error, "Unknown error " + ex.ToString());
                // TODO: need mechanism return errors from event handlers
            }
        }

        /// <summary>
        /// Handle the file close notification
        /// </summary>
        /// <param name="uri"></param>
        /// <param name="scriptFile"></param>
        /// <param name="eventContext"></param>
        /// <returns></returns>
        public async Task HandleDidCloseTextDocumentNotification(
            string uri,
            ScriptFile scriptFile,
            EventContext eventContext)
        {  
            await Task.Run(() => {});          
            // try
            // {
            //     // if not in the preview window and diagnostics are enabled then clear diagnostics
            //     if (!IsPreviewWindow(scriptFile)
            //         && CurrentWorkspaceSettings.IsDiagnosticsEnabled)
            //     {
            //         await DiagnosticsHelper.ClearScriptDiagnostics(uri, eventContext);
            //     }
            // }
            // catch (Exception ex)
            // {
            //     Logger.Write(TraceEventType.Error, "Unknown error " + ex.ToString());
            //     // TODO: need mechanism return errors from event handlers
            // }
        }

        /// <summary>
        /// Handle the file configuration change notification
        /// </summary>
        /// <param name="newSettings"></param>
        /// <param name="oldSettings"></param>
        /// <param name="eventContext"></param>
        public async Task HandleDidChangeConfigurationNotification(
            SqlToolsSettings newSettings,
            SqlToolsSettings oldSettings,
            EventContext eventContext)
        {
            await Task.Run(() => {});
            // try
            // {
            //     bool oldEnableIntelliSense = oldSettings.SqlTools.IntelliSense.EnableIntellisense;
            //     bool oldAlwaysEncryptedParameterizationEnabled = oldSettings.SqlTools.QueryExecutionSettings.IsAlwaysEncryptedParameterizationEnabled;
            //     bool? oldEnableDiagnostics = oldSettings.SqlTools.IntelliSense.EnableErrorChecking;

            //     // update the current settings to reflect any changes
            //     CurrentWorkspaceSettings.Update(newSettings);

            //     // if script analysis settings have changed we need to clear the current diagnostic markers
            //     if (oldEnableIntelliSense != newSettings.SqlTools.IntelliSense.EnableIntellisense
            //         || oldEnableDiagnostics != newSettings.SqlTools.IntelliSense.EnableErrorChecking
            //         || oldAlwaysEncryptedParameterizationEnabled != newSettings.SqlTools.QueryExecutionSettings.IsAlwaysEncryptedParameterizationEnabled)
            //     {
            //         // if the user just turned off diagnostics then send an event to clear the error markers
            //         if (!newSettings.IsDiagnosticsEnabled)
            //         {
            //             foreach (var scriptFile in CurrentWorkspace.GetOpenedFiles())
            //             {
            //                 await DiagnosticsHelper.ClearScriptDiagnostics(scriptFile.ClientUri, eventContext);
            //             }
            //         }
            //         // otherwise rerun diagnostic analysis on all opened SQL files
            //         else
            //         {
            //             await RunScriptDiagnostics(CurrentWorkspace.GetOpenedFiles(), eventContext);
            //         }
            //     }
            // }
            // catch (Exception ex)
            // {
            //     Logger.Write(TraceEventType.Error, "Unknown error " + ex.ToString());
            //     // TODO: need mechanism return errors from event handlers
            // }
        }

        #endregion

        public void Dispose()
        {           
        }
    }
}
