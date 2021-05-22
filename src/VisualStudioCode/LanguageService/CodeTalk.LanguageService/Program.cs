//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.

using System;
using System.Diagnostics;
using System.IO;
using Microsoft.SqlTools.Hosting.Utility;
using Microsoft.SqlTools.ServiceLayer.SqlContext;
using Microsoft.SqlTools.Utility;

namespace CodeTalk.LanguageService
{
    /// <summary>
    /// Main application class for Code Talk Host executable
    /// </summary>
    internal class Program
    {
        private const string ServiceName = "CodeTalkLanguageService.exe";

        /// <summary>
        /// Main entry point into the Credentials Service Host
        /// </summary>
        internal static void Main(string[] args)
        {
            try
            {
                // read command-line arguments
                CommandOptions commandOptions = new CommandOptions(args, ServiceName);
                if (commandOptions.ShouldExit)
                {
                    return;
                }

                string logFilePath = commandOptions.LogFilePath;
                if (string.IsNullOrWhiteSpace(logFilePath))
                {
                    logFilePath = Logger.GenerateLogFilePath("codetalk");
                }

                Logger.AutoFlush = commandOptions.AutoFlushLog;

                Logger.Initialize(tracingLevel: commandOptions.TracingLevel, logFilePath: logFilePath, traceSource: "codetalk");

                // set up the host details and profile paths 
                var hostDetails = new HostDetails(
                    name: "CodeTalk Language Service Provider",
                    profileId: "CodeTalk.LanguageService",
                    version: new Version(1, 0));

                SqlToolsContext sqlToolsContext = new SqlToolsContext(hostDetails);
                UtilityServiceHost serviceHost = HostLoader.CreateAndStartServiceHost(sqlToolsContext);

                serviceHost.WaitForExit();
            }
            catch (Exception e)
            {
                Logger.WriteWithCallstack(TraceEventType.Critical, $"An unhandled exception occurred: {e}");
                Environment.Exit(1);
            }
            finally
            {
                Logger.Close();
            }
        }
    }
}
