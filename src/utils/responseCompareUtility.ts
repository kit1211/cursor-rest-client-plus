import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { commands, Uri, ViewColumn } from 'vscode';
import { SavedResponseFile } from '../models/responseHistoryEntry';
import { isJSONString } from './misc';

export class ResponseCompareUtility {

    public static formatBody(content: string): string {
        if (isJSONString(content)) {
            return JSON.stringify(JSON.parse(content), null, 2);
        }

        return content;
    }

    public static async writeTempComparable(name: string, content: string): Promise<string> {
        const filePath = path.join(os.tmpdir(), `rest-client-${name}-${Date.now()}.txt`);
        await fs.writeFile(filePath, this.formatBody(content), 'utf8');
        return filePath;
    }

    public static async openDiff(
        leftPath: string,
        rightPath: string,
        title: string,
        viewColumn: ViewColumn = ViewColumn.Beside
    ): Promise<void> {
        await commands.executeCommand(
            'vscode.diff',
            Uri.file(leftPath),
            Uri.file(rightPath),
            title,
            { viewColumn, preview: false }
        );
    }

    public static async getBodyFromSavedFile(filePath: string): Promise<string> {
        const data = await fs.readJson(filePath) as SavedResponseFile;
        return data.body;
    }
}
