/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

declare module "audio-loader" {
    interface AudioBuffer {
        readonly duration: number;
        readonly length: number;
        readonly numberOfChannels: number;
        readonly sampleRate: number;
        copyFromChannel(destination: Float32Array, channelNumber: number, bufferOffset?: number): void;
        copyToChannel(source: Float32Array, channelNumber: number, bufferOffset?: number): void;
        getChannelData(channel: number): Float32Array;
    }

    function load(path: string, options?: any, cb?: () => void) : Promise<AudioBuffer>;

    export = load;
}