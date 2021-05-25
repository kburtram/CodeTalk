/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from 'vscode-languageclient';

// ------------------------------- < Function List Request > ----------------------------------------------

 export class FunctionListParams {
    public ownerUri: string;
}

export interface FunctionListResult {
    success: boolean;
}

export namespace FunctionListRequest {
    export const type = new RequestType<FunctionListParams, FunctionListResult, void, void>('codetalk/functionlist');
}
