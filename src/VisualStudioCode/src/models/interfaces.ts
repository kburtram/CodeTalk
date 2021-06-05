/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position, Uri } from "vscode";

export interface TalkpointBase {
    breakpointId: string;
    position: Position;
    uri: Uri;
    shouldContinue: boolean;
}

export interface ITonalTalkpoint extends TalkpointBase {
    type: "Tonal";
    sound: string,
}

export interface ITextTalkpoint extends TalkpointBase {
    type: "Text";
    text: string,
}

export interface IExpressionTalkpoint extends TalkpointBase {
    type: "Expression";
    expression: string,
}

export type ITalkpoint = ITonalTalkpoint | ITextTalkpoint | IExpressionTalkpoint;

export interface IErrorSettings {
    enableErrorDetection: boolean;
    errorDetectionInterval: number;
    customErrorSound: string;
}

export interface ITalkpointSettings {
    customBreakpointSound: string
}
