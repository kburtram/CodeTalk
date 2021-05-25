//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
//

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using CodeTalk.LanguageService.Contracts;
using Microsoft.CodeTalk.LanguageService;
using Microsoft.SqlTools.Hosting.Protocol;
using Microsoft.SqlTools.LanguageServices.Contracts;
using Microsoft.SqlTools.ServiceLayer.SqlContext;
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

        private WorkspaceService<CodeTalkSettings> workspaceServiceInstance;

        private ServiceHost serviceHostInstance;

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
        internal WorkspaceService<CodeTalkSettings> WorkspaceServiceInstance
        {
            get
            {
                if (workspaceServiceInstance == null)
                {
                    workspaceServiceInstance =  WorkspaceService<CodeTalkSettings>.Instance;
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
        internal CodeTalkSettings CurrentWorkspaceSettings
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

            serviceHost.SetRequestHandler(FunctionListRequest.Type, HandleFunctionListRequest);

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
            });
        }

        /// <summary>
        /// Function list command handlers
        /// </summary>
        /// <param name="param"></param>
        /// <param name="requestContext"></param>
        /// <returns></returns>
        internal async Task HandleFunctionListRequest(FunctionListParams param, RequestContext<FunctionListResult> requestContext)
        {
            var scriptFile = CurrentWorkspace.GetFile(param.OwnerUri);
            if (scriptFile == null)
            {
                await requestContext.SendResult(new FunctionListResult{ Success = false });
                return;
            }

            var content = scriptFile.Contents;

            var language = new CSharp();
            CodeFile codeFile = null;
            try
            {
                //Parsing the code
                codeFile = language.Parse(content, param.OwnerUri);
            }
            catch (Exception)
            {               
                return;
            }

            //Creating a function collector for getting all the functions
            var functionCollector = new FunctionCollector();
            functionCollector.VisitCodeFile(codeFile);

            //Getting all the functions
            var functions = functionCollector.FunctionsInFile;
            if (0 == functions.Count())
            {               
                return;
            }          

            await requestContext.SendResult(new FunctionListResult{ Success = true });
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
   
                await requestContext.SendResult(null);
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
        }

        internal async Task HandleSignatureHelpRequest(
            TextDocumentPosition textDocumentPosition,
            RequestContext<SignatureHelp> requestContext)
        {
            try
            {
               
                await requestContext.SendResult(null);              
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
                {
                    var scriptFile = CurrentWorkspace.GetFile(
                        textDocumentPosition.TextDocument.Uri);
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
        }

        /// <summary>
        /// Handle the file configuration change notification
        /// </summary>
        /// <param name="newSettings"></param>
        /// <param name="oldSettings"></param>
        /// <param name="eventContext"></param>
        public async Task HandleDidChangeConfigurationNotification(
            CodeTalkSettings newSettings,
            CodeTalkSettings oldSettings,
            EventContext eventContext)
        {
            await Task.Run(() => {});
        }

        #endregion

        public void Dispose()
        {           
        }
    }
}
