/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';
const fs = require('fs');
import * as path from 'path';
import { IConfig } from '../languageservice/interfaces';

/*
* Config class handles getting values from config.json.
*/
export default class Config implements IConfig {
     private static _configJsonContent = undefined;
     private _sqlToolsServiceConfigKey: string;
     private version: number;

     public static get configJsonContent(): any {
        if (this._configJsonContent === undefined) {
            this._configJsonContent = this.loadConfig();
        }
        return this._configJsonContent;
    }

    constructor() {
        this._sqlToolsServiceConfigKey = 'service';
        this.version = 2;
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
        this._sqlToolsServiceConfigKey = 'service';
        this.version = version;
    }

    public getServiceVersion(): number {
        return this.version;
    }

    public getSqlToolsConfigValue(configKey: string): any {
        let json = Config.configJsonContent;
        let toolsConfig = json[this._sqlToolsServiceConfigKey];
        let configValue: string = undefined;
        if (toolsConfig !== undefined) {
            configValue = toolsConfig[configKey];
        }
        return configValue;
    }

    public getExtensionConfig(key: string, defaultValue?: any): any {
       let json = Config.configJsonContent;
       let extensionConfig = json['mssql'];
       let configValue = extensionConfig[key];
       if (!configValue) {
           configValue = defaultValue;
       }
       return configValue;
    }

    public getWorkspaceConfig(key: string, defaultValue?: any): any {
       let json = Config.configJsonContent;
       let configValue = json[key];
       if (!configValue) {
           configValue = defaultValue;
       }
       return configValue;
    }

    static loadConfig(): any {
        let configContent = fs.readFileSync(path.join(__dirname, '../config.json'));
        return JSON.parse(configContent);
    }
}
