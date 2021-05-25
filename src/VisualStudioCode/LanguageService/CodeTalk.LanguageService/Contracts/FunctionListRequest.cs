//
// Copyright (c) Microsoft. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for full license information.
//

using Microsoft.SqlTools.Hosting.Protocol.Contracts;

namespace CodeTalk.LanguageService.Contracts
{
    public class FunctionListParams 
    {
        public string OwnerUri { get; set; }
    }

    public class FunctionListResult
    {
        public bool Success { get; set; }
    }

    public class FunctionListRequest
    {
        public static readonly
            RequestType<FunctionListParams, FunctionListResult> Type =
                RequestType<FunctionListParams, FunctionListResult>.Create("codetalk/functionlist");
    }
}
