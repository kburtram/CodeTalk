/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { Position, Uri } from "vscode";

export interface ITalkpoint {
    breakpointId: string;
    type: "Tonal" | "Text" | "Expression";
    position: Position;
    uri: Uri;
    shouldContinue: boolean;
}

export interface ITonalTalkpoint extends ITalkpoint {
    type: "Tonal";
    sound: string,
}

export interface ITextTalkpoint extends ITalkpoint {
    type: "Text";
    text: string,
}

export interface IExpressionTalkpoint extends ITalkpoint {
    type: "Expression";
    expression: string,
}

export interface ILogger {
    logDebug(message: string): void;
    increaseIndent(): void;
    decreaseIndent(): void;
    append(message?: string): void;
    appendLine(message?: string): void;
}

export interface IErrorSettings {
    enableErrorDetection: boolean;
    errorDetectionInterval: number;
    customErrorSound: string;
}

export interface ITalkpointSettings {
    customBreakpointSound: string
}
