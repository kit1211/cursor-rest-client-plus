import * as fs from 'fs-extra';
import * as path from 'path';
import { TextDocument } from 'vscode';
import { HttpRequest } from '../models/httpRequest';
import { HttpResponse } from '../models/httpResponse';
import { ResponseHistoryEntry, SavedResponseFile } from '../models/responseHistoryEntry';
import { FileVariableProvider } from './httpVariableProviders/fileVariableProvider';
import { UserDataManager } from './userDataManager';

const uuidv4 = require('uuid/v4');

const RESPONSES_DIR = '.rest-client-responses';

export class ResponseSaveManager {

    public static async isAutoSaveEnabled(document: TextDocument): Promise<boolean> {
        const { value, error, warning } = await FileVariableProvider.Instance.get('save', document);
        if (error || warning || value === undefined) {
            return false;
        }

        return String(value).trim().toLowerCase() === 'true';
    }

    /** บันทึก history ทุกครั้ง (cache) และ save ไฟล์ข้าง .http เมื่อ @save = true */
    public static async recordResponse(
        document: TextDocument,
        request: HttpRequest,
        response: HttpResponse
    ): Promise<ResponseHistoryEntry> {
        const id = uuidv4();
        const savedAt = new Date().toISOString();
        const cachePath = await this.writeResponseFile(
            UserDataManager.getResponseCacheFilePath(`${id}.json`),
            document,
            request,
            response,
            id,
            savedAt
        );

        const entry: ResponseHistoryEntry = {
            id,
            savedAt,
            sourceFile: document.uri.fsPath,
            requestName: request.name,
            method: request.method,
            url: request.url,
            statusCode: response.statusCode,
            durationMs: response.timingPhases.total ?? 0,
            filePath: cachePath,
        };

        if (await this.isAutoSaveEnabled(document)) {
            entry.persistedFilePath = await this.writeResponseFile(
                this.buildPersistedPath(document, request, savedAt),
                document,
                request,
                response,
                id,
                savedAt
            );
        }

        await UserDataManager.addToResponseHistory(entry);
        return entry;
    }

    public static normalizeUrlForKey(url: string): string {
        try {
            const parsed = new URL(url);
            return `${parsed.origin}${parsed.pathname}`;
        } catch {
            return url.split('?')[0];
        }
    }

    public static getRequestKey(entry: Pick<ResponseHistoryEntry, 'sourceFile' | 'requestName' | 'method' | 'url'>): string {
        if (entry.requestName) {
            return `${entry.sourceFile}::name::${entry.requestName}`;
        }

        return `${entry.sourceFile}::${entry.method}::${this.normalizeUrlForKey(entry.url)}`;
    }

    public static async getHistoryForFile(sourceFile: string): Promise<ResponseHistoryEntry[]> {
        const all = await UserDataManager.getResponseHistory();
        return all.filter(entry => entry.sourceFile === sourceFile);
    }

    public static async getHistoryForRequest(
        sourceFile: string,
        request: HttpRequest
    ): Promise<ResponseHistoryEntry[]> {
        const key = this.getRequestKey({
            sourceFile,
            requestName: request.name,
            method: request.method,
            url: request.url,
        });

        const all = await UserDataManager.getResponseHistory();
        return all.filter(entry => this.getRequestKey(entry) === key);
    }

    public static async findHistoryEntry(entryId: string): Promise<ResponseHistoryEntry | undefined> {
        const all = await UserDataManager.getResponseHistory();
        return all.find(entry => entry.id === entryId);
    }

    public static buildFilename(method: string, url: string, savedAt: string): string {
        const pathSegment = this.sanitizeUrlPath(url);
        const timestamp = savedAt.replace(/[:.]/g, '-');
        return `${method.toLowerCase()}_${pathSegment}_${timestamp}.json`;
    }

    private static buildPersistedPath(document: TextDocument, request: HttpRequest, savedAt: string): string {
        const sourceDir = path.dirname(document.uri.fsPath);
        const httpBaseName = path.basename(document.uri.fsPath, path.extname(document.uri.fsPath));
        const outputDir = path.join(sourceDir, RESPONSES_DIR, httpBaseName);
        return path.join(outputDir, this.buildFilename(request.method, request.url, savedAt));
    }

    private static async writeResponseFile(
        filePath: string,
        document: TextDocument,
        request: HttpRequest,
        response: HttpResponse,
        id: string,
        savedAt: string
    ): Promise<string> {
        await fs.ensureDir(path.dirname(filePath));

        const payload: SavedResponseFile = {
            _meta: {
                id,
                savedAt,
                sourceFile: document.uri.fsPath,
                requestName: request.name,
                method: request.method,
                url: request.url,
                statusCode: response.statusCode,
                statusMessage: response.statusMessage,
                httpVersion: response.httpVersion,
                durationMs: response.timingPhases.total ?? 0,
            },
            headers: response.headers,
            body: response.body,
        };

        await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
        return filePath;
    }

    private static sanitizeUrlPath(url: string): string {
        try {
            const parsed = new URL(url);
            let segment = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\//g, '_');
            if (!segment) {
                segment = parsed.host.replace(/[^a-zA-Z0-9_-]/g, '_') || 'root';
            }
            return segment.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
        } catch {
            return 'request';
        }
    }
}
