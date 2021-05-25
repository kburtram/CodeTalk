/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Config from  './config';
import { workspace, WorkspaceConfiguration } from 'vscode';
import {IConfig} from '../languageservice/interfaces';

/*
* ExtConfig class handles getting values from workspace config or config.json.
*/
export default class ExtConfig implements IConfig {

    constructor(private _config?: IConfig,
                private _extensionConfig?: WorkspaceConfiguration,
                private _workspaceConfig?: WorkspaceConfiguration) {
        if (this._config === undefined) {
            this._config = new Config();
        }
        if (this._extensionConfig === undefined) {
            this._extensionConfig = workspace.getConfiguration('codetalk');
        }
        if (this._workspaceConfig === undefined) {
            this._workspaceConfig = workspace.getConfiguration();
        }
    }

    public getSqlToolsServiceDownloadUrl(): string {
       return this.getSqlToolsConfigValue('downloadUrl');
    }

    public getSqlToolsInstallDirectory(): string {
        return this.getSqlToolsConfigValue('installDir');
    }

    public getSqlToolsExecutableFiles(): string[] {
        return this.getSqlToolsConfigValue('executableFiles');
    }

    public getSqlToolsPackageVersion(): string {
        return this.getSqlToolsConfigValue('version');
    }

    public useServiceVersion(version: number): void {
        return this._config.useServiceVersion(version);
    }

    public getServiceVersion(): number {
        return this._config.getServiceVersion();
    }

    public getSqlToolsConfigValue(configKey: string): any {
        let configValue: string = <string>this.getExtensionConfig(`service.${configKey}`);
        if (!configValue) {
            configValue = this._config.getSqlToolsConfigValue(configKey);
        }
        return configValue;
    }

    public getExtensionConfig(key: string, defaultValue?: any): any {
        let configValue = this._extensionConfig.get(key);
        if (configValue === undefined) {
            configValue = defaultValue;
        }
        return configValue;
    }

    public getWorkspaceConfig(key: string, defaultValue?: any): any {
        let configValue =  this._workspaceConfig.get(key);
        if (configValue === undefined) {
            configValue = defaultValue;
        }
        return configValue;
    }
}
