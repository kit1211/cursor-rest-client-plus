import * as fs from 'fs-extra';
import * as os from 'os';
import { Clipboard, commands, env, ExtensionContext, Uri, ViewColumn, WebviewPanel, window, workspace } from 'vscode';
import { ResponseHeaders } from '../models/base';
import { SystemSettings } from '../models/configurationSettings';
import { HttpRequest } from '../models/httpRequest';
import { HttpResponse } from '../models/httpResponse';
import { PreviewOption } from '../models/previewOption';
import { ResponseHistoryEntry, SavedResponseFile } from '../models/responseHistoryEntry';
import { trace } from '../utils/decorator';
import { disposeAll } from '../utils/dispose';
import { MimeUtility } from '../utils/mimeUtility';
import { base64, formatHeaders, getHeader, isJSONString } from '../utils/misc';
import { ResponseCompareUtility } from '../utils/responseCompareUtility';
import { ResponseFormatUtility } from '../utils/responseFormatUtility';
import { ResponseSaveManager } from '../utils/responseSaveManager';
import { UserDataManager } from '../utils/userDataManager';
import { BaseWebview } from './baseWebview';

const hljs = require('highlight.js');
const contentDisposition = require('content-disposition');

const OPEN = 'Open';
const COPYPATH = 'Copy Path';

const RESPONSE_VIEW_TYPE = 'rest-client-plus-response';

/** panel เดียวทั้ง extension — แก้ปัญหาเปิดหลาย tab */
let canonicalResponsePanel: WebviewPanel | undefined;

type FoldingRange = [number, number];

interface ResponsePanelContext {
    response: HttpResponse;
    sourceFile?: string;
    responseHtml: string;
    /** history ทั้งไฟล์ .http — ไม่หายเมื่อเปลี่ยน request */
    fileHistory: ResponseHistoryEntry[];
    /** history เฉพาะ request ปัจจุบัน */
    requestHistory: ResponseHistoryEntry[];
}

export class HttpResponseWebview extends BaseWebview {

    private readonly urlRegex = /(https?:\/\/[^\s"'<>\]\)\\]+)/gi;

    private readonly panelContexts: Map<WebviewPanel, ResponsePanelContext>;

    private readonly clipboard: Clipboard = env.clipboard;

    private settledViewColumn: ViewColumn | undefined;

    protected get viewType(): string {
        return RESPONSE_VIEW_TYPE;
    }

    protected get previewActiveContextKey(): string {
        return 'httpResponsePreviewFocus';
    }

    protected get isHTMLResponse(): string {
        return 'isHTMLResponse';
    }

    private get activeContext(): ResponsePanelContext | undefined {
        return this.activePanel ? this.panelContexts.get(this.activePanel) : undefined;
    }

    private get activeResponse(): HttpResponse | undefined {
        return this.activeContext?.response;
    }

    private setIsHTMLResponse(response: HttpResponse | undefined) {
        if (response?.headers['Content-Type']?.includes('text/html')) {
            commands.executeCommand('setContext', this.isHTMLResponse, true);
        } else {
            commands.executeCommand('setContext', this.isHTMLResponse, false);
        }
    }

    public constructor(context: ExtensionContext) {
        super(context);

        this.panelContexts = new Map<WebviewPanel, ResponsePanelContext>();

        this.context.subscriptions.push(commands.registerCommand('rest-client.fold-response', this.foldResponseBody, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.unfold-response', this.unfoldResponseBody, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.preview-html-response-body', this.previewResponseBody, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.show-raw-response', this.showRawResponse, this));

        this.context.subscriptions.push(commands.registerCommand('rest-client.copy-response-body', this.copyBody, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.save-response', this.save, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.save-response-body', this.saveBody, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.show-response-history', this.showResponseHistory, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.compare-response-previous', this.compareWithPrevious, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.compare-response-history', this.compareWithHistory, this));
        this.context.subscriptions.push(commands.registerCommand('rest-client.compare-response-file', this.compareWithFile, this));
    }

    public async render(response: HttpResponse, column: ViewColumn, sourceFile?: string) {
        const fileHistory = sourceFile
            ? await ResponseSaveManager.getHistoryForFile(sourceFile)
            : [];
        const requestHistory = sourceFile
            ? await ResponseSaveManager.getHistoryForRequest(sourceFile, response.request)
            : [];

        let panel: WebviewPanel;

        if (canonicalResponsePanel) {
            panel = canonicalResponsePanel;
            panel.title = this.getTitle(response);
            this.disposeExtraPanels(panel);
        } else {
            const createColumn = this.settledViewColumn ?? column;
            panel = window.createWebviewPanel(
                this.viewType,
                this.getTitle(response),
                { viewColumn: createColumn, preserveFocus: !this.settings.previewResponsePanelTakeFocus },
                {
                    enableFindWidget: true,
                    enableScripts: true,
                    retainContextWhenHidden: true
                });

            canonicalResponsePanel = panel;

            panel.onDidDispose(() => {
                if (canonicalResponsePanel === panel) {
                    canonicalResponsePanel = undefined;
                }
                if (panel === this.activePanel) {
                    this.setPreviewActiveContext(false);
                    this.activePanel = undefined;
                    this.setIsHTMLResponse(undefined);
                }

                const index = this.panels.findIndex(v => v === panel);
                if (index !== -1) {
                    this.panels.splice(index, 1);
                    this.panelContexts.delete(panel);
                }
                if (this.panels.length === 0) {
                    this.settledViewColumn = undefined;
                    this._onDidCloseAllWebviewPanels.fire();
                }
            });

            panel.iconPath = this.iconFilePath;

            panel.onDidChangeViewState(({ webviewPanel }) => {
                const active = this.panels.some(p => p.active);
                this.setPreviewActiveContext(active);
                this.activePanel = webviewPanel.active ? webviewPanel : undefined;
                this.setIsHTMLResponse(this.activeResponse);
            });

            panel.webview.onDidReceiveMessage(message => this.handleWebviewMessage(panel, message));

            this.panels.push(panel);
            this.settledViewColumn = panel.viewColumn ?? createColumn;
        }

        const responseHtml = this.getHtmlForWebview(panel, response, fileHistory, requestHistory, false);
        panel.webview.html = responseHtml;

        this.setPreviewActiveContext(this.settings.previewResponsePanelTakeFocus);

        const revealColumn = this.settledViewColumn ?? panel.viewColumn ?? column;
        panel.reveal(revealColumn, !this.settings.previewResponsePanelTakeFocus);

        this.panelContexts.set(panel, { response, sourceFile, responseHtml, fileHistory, requestHistory });
        this.activePanel = panel;
        this.panels = [panel];

        this.setIsHTMLResponse(this.activeResponse);
    }

    private handleWebviewMessage(panel: WebviewPanel, message: { command?: string; id?: string }) {
        this.activePanel = panel;

        switch (message.command) {
            case 'backToCurrent':
                void this.restoreCurrentResponse(panel);
                break;
            case 'viewHistory':
                if (message.id) {
                    void this.viewHistoryEntry(panel, message.id);
                }
                break;
            case 'refreshHistory':
                void this.refreshToolbarHistory(panel);
                break;
            case 'comparePrevious':
                void this.comparePrevious(panel);
                break;
            case 'compareWith':
                if (message.id) {
                    void this.compareWithEntry(panel, message.id);
                }
                break;
            default:
                break;
        }
    }

    private async refreshToolbarHistory(panel: WebviewPanel) {
        const context = this.panelContexts.get(panel);
        if (!context?.sourceFile) {
            return;
        }

        context.fileHistory = await ResponseSaveManager.getHistoryForFile(context.sourceFile);
        context.requestHistory = await ResponseSaveManager.getHistoryForRequest(context.sourceFile, context.response.request);

        panel.webview.postMessage({
            command: 'updateHistory',
            fileHistory: context.fileHistory.map(entry => ({
                id: entry.id,
                label: this.escapeHtml(this.formatEntryLabel(entry)),
            })),
            requestPastCount: Math.max(0, context.requestHistory.length - 1),
        });
    }

    private async restoreCurrentResponse(panel: WebviewPanel) {
        const context = this.panelContexts.get(panel);
        if (!context) {
            return;
        }

        panel.webview.html = context.responseHtml;
    }

    private async viewHistoryEntry(panel: WebviewPanel, entryId: string) {
        const context = this.panelContexts.get(panel);
        if (!context) {
            return;
        }

        const entry = context.fileHistory.find(e => e.id === entryId)
            ?? await ResponseSaveManager.findHistoryEntry(entryId);
        if (!entry) {
            window.showInformationMessage('History entry not found.');
            return;
        }

        try {
            const saved = await fs.readJson(entry.filePath) as SavedResponseFile;
            const html = this.getHistoryViewHtml(panel, saved, context.fileHistory, context.requestHistory, entry);
            panel.webview.html = html;
        } catch {
            window.showErrorMessage('Response file not found in history.');
        }
    }

    private async comparePrevious(panel: WebviewPanel) {
        const context = this.panelContexts.get(panel);
        if (!context || context.requestHistory.length < 2) {
            window.showInformationMessage('Send the same request at least twice before comparing with previous.');
            return;
        }

        const previous = context.requestHistory[1];
        await this.openNativeCompare(previous, context.response.body,
            this.formatHistoryLabel(previous), 'Current');
    }

    private async compareWithEntry(panel: WebviewPanel, entryId: string) {
        const context = this.panelContexts.get(panel);
        if (!context) {
            return;
        }

        const entry = context.fileHistory.find(e => e.id === entryId)
            ?? await ResponseSaveManager.findHistoryEntry(entryId);
        if (!entry) {
            return;
        }

        await this.openNativeCompare(entry, context.response.body,
            this.formatHistoryLabel(entry), 'Current');
    }

    private async openNativeCompare(
        historyEntry: ResponseHistoryEntry,
        currentBody: string,
        leftTitle: string,
        rightTitle: string
    ) {
        try {
            const previousBody = await ResponseCompareUtility.getBodyFromSavedFile(historyEntry.filePath);
            const leftPath = await ResponseCompareUtility.writeTempComparable('compare-left', previousBody);
            const rightPath = await ResponseCompareUtility.writeTempComparable('compare-right', currentBody);
            const diffColumn = canonicalResponsePanel?.viewColumn ?? ViewColumn.Beside;
            await ResponseCompareUtility.openDiff(leftPath, rightPath, `${leftTitle} ↔ ${rightTitle}`, diffColumn);
        } catch {
            window.showErrorMessage('Failed to compare responses.');
        }
    }

    public dispose() {
        disposeAll(this.panels);
    }

    @trace('Fold Response')
    private foldResponseBody() {
        this.activePanel?.webview.postMessage({ 'command': 'foldAll' });
    }

    @trace('Unfold Response')
    private unfoldResponseBody() {
        this.activePanel?.webview.postMessage({ 'command': 'unfoldAll' });
    }

    @trace('HTML Preview')
    private previewResponseBody() {
        if (this.activeResponse && this.activePanel) {
            this.activePanel.webview.html = this.activeResponse.body;
        }
    }

    @trace('Raw')
    private showRawResponse() {
        if (this.activeResponse && this.activePanel && this.activeContext) {
            this.activePanel.webview.html = this.getHtmlForWebview(
                this.activePanel,
                this.activeResponse,
                this.activeContext.fileHistory,
                this.activeContext.requestHistory,
                false
            );
        }
    }

    @trace('Copy Response Body')
    private async copyBody() {
        if (this.activeResponse) {
            await this.clipboard.writeText(this.activeResponse.body);
        }
    }

    @trace('Save Response')
    private async save() {
        if (this.activeResponse) {
            const fullResponse = this.getFullResponseString(this.activeResponse);
            const defaultFilePath = UserDataManager.getResponseSaveFilePath(`Response-${Date.now()}.http`);
            try {
                await this.openSaveDialog(defaultFilePath, fullResponse);
            } catch {
                window.showErrorMessage('Failed to save latest response to disk.');
            }
        }
    }

    @trace('Response History')
    private async showResponseHistory() {
        const panel = this.activePanel;
        if (panel) {
            await this.refreshToolbarHistory(panel);
        }
    }

    @trace('Compare With Previous')
    private async compareWithPrevious() {
        const panel = this.activePanel;
        if (panel) {
            await this.comparePrevious(panel);
        }
    }

    @trace('Compare With History')
    private async compareWithHistory() {
        const panel = this.activePanel;
        const context = this.activeContext;
        if (!panel || !context || context.fileHistory.length === 0) {
            window.showInformationMessage('No history available to compare.');
            return;
        }

        const selected = await window.showQuickPick(
            context.fileHistory.map(entry => ({
                label: this.formatEntryLabel(entry),
                description: new Date(entry.savedAt).toLocaleString(),
                id: entry.id,
            })),
            { placeHolder: 'Select a saved response to compare with current' }
        );

        if (selected?.id) {
            await this.compareWithEntry(panel, selected.id);
        }
    }

    @trace('Compare With File')
    private async compareWithFile() {
        const context = this.activeContext;
        if (!context) {
            return;
        }

        const uri = await window.showOpenDialog({
            canSelectMany: false,
            filters: { 'JSON': ['json'], 'All Files': ['*'] },
            openLabel: 'Compare',
        });

        if (!uri?.[0]) {
            return;
        }

        try {
            const otherBody = await ResponseCompareUtility.getBodyFromSavedFile(uri[0].fsPath);
            const leftPath = await ResponseCompareUtility.writeTempComparable('compare-file', otherBody);
            const rightPath = await ResponseCompareUtility.writeTempComparable('compare-current', context.response.body);
            const diffColumn = canonicalResponsePanel?.viewColumn ?? ViewColumn.Beside;
            await ResponseCompareUtility.openDiff(leftPath, rightPath, 'File ↔ Current', diffColumn);
        } catch {
            window.showErrorMessage('Failed to read the selected file for comparison.');
        }
    }

    private formatHistoryLabel(entry: ResponseHistoryEntry): string {
        return new Date(entry.savedAt).toLocaleString();
    }

    private formatEntryLabel(entry: ResponseHistoryEntry): string {
        const name = entry.requestName || `${entry.method} ${ResponseSaveManager.normalizeUrlForKey(entry.url)}`;
        return `[${name}] ${entry.statusCode} · ${entry.durationMs}ms · ${this.formatHistoryLabel(entry)}`;
    }

    @trace('Save Response Body')
    private async saveBody() {
        if (this.activeResponse) {
            const fileName = HttpResponseWebview.getResponseBodyOuptutFilename(this.activeResponse, this.settings);
            const defaultFilePath = UserDataManager.getResponseBodySaveFilePath(fileName);

            try {
                await this.openSaveDialog(defaultFilePath, this.activeResponse.bodyBuffer);
            } catch {
                window.showErrorMessage('Failed to save latest response body to disk');
            }
        }
    }

    private static getResponseBodyOuptutFilename(activeResponse: HttpResponse, settings: SystemSettings) {
        if (settings.useContentDispositionFilename) {
            const cdHeader = getHeader(activeResponse.headers, 'content-disposition');
            if (cdHeader) {
                const disposition = contentDisposition.parse(cdHeader);
                if ((disposition?.type === "attachment" || disposition?.type === "inline") && disposition?.parameters?.hasOwnProperty("filename")) {
                    const serverProvidedFilename = disposition.parameters.filename;
                    return serverProvidedFilename;
                }
            }
        }

        const extension = MimeUtility.getExtension(activeResponse.contentType, settings.mimeAndFileExtensionMapping);
        const defaultFileName = !extension ? `Response-${Date.now()}` : `Response-${Date.now()}.${extension}`;
        return defaultFileName;
    }

    private getTitle(response: HttpResponse): string {
        const prefix = (this.settings.requestNameAsResponseTabTitle && response.request.name) || 'Response';
        return `${prefix}(${response.timingPhases.total ?? 0}ms)`;
    }

    private getFullResponseString(response: HttpResponse): string {
        const statusLine = `HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}${os.EOL}`;
        const headerString = formatHeaders(response.headers);
        const body = response.body ? `${os.EOL}${response.body}` : '';
        return `${statusLine}${headerString}${body}`;
    }

    private async openSaveDialog(path: string, content: string | Buffer) {
        const uri = await window.showSaveDialog({ defaultUri: Uri.file(path) });
        if (!uri) {
            return;
        }

        const filePath = uri.fsPath;
        await fs.writeFile(filePath, content, { flag: 'w' });
        const btn = await window.showInformationMessage(`Saved to ${filePath}`, { title: OPEN }, { title: COPYPATH });
        if (btn?.title === OPEN) {
            workspace.openTextDocument(filePath).then(window.showTextDocument);
        } else if (btn?.title === COPYPATH) {
            await this.clipboard.writeText(filePath);
        }
    }

    private getHtmlForWebview(
        panel: WebviewPanel,
        response: HttpResponse,
        fileHistory: ResponseHistoryEntry[],
        requestHistory: ResponseHistoryEntry[],
        showBack: boolean
    ): string {
        let innerHtml: string;
        let width = 2;
        let contentType = response.contentType;
        if (contentType) {
            contentType = contentType.trim();
        }
        if (MimeUtility.isBrowserSupportedImageFormat(contentType) && !HttpResponseWebview.isHeadRequest(response)) {
            innerHtml = `<img src="data:${contentType};base64,${base64(response.bodyBuffer)}">`;
        } else {
            const code = this.highlightResponse(response);
            width = (code.split(/\r\n|\r|\n/).length + 1).toString().length;
            innerHtml = `<pre><code>${this.addLineNums(code)}</code></pre>`;
        }

        const content = this.settings.disableAddingHrefLinkForLargeResponse && response.bodySizeInBytes > this.settings.largeResponseBodySizeLimitInMB * 1024 * 1024
            ? innerHtml
            : this.addUrlLinks(innerHtml);

        return this.wrapWebviewHtml(panel, width, fileHistory, requestHistory, showBack, content);
    }

    private getHistoryViewHtml(
        panel: WebviewPanel,
        saved: SavedResponseFile,
        fileHistory: ResponseHistoryEntry[],
        requestHistory: ResponseHistoryEntry[],
        entry: ResponseHistoryEntry
    ): string {
        const display = this.formatSavedResponseDisplay(saved);
        const width = (display.split(/\r\n|\r|\n/).length + 1).toString().length;
        const content = `<pre><code>${this.escapeHtml(display)}</code></pre>`;
        const toolbar = this.buildToolbarHtml(fileHistory, requestHistory, true, entry.id);
        return this.wrapWebviewHtml(panel, width, fileHistory, requestHistory, true, content, toolbar);
    }

    private wrapWebviewHtml(
        panel: WebviewPanel,
        width: number,
        fileHistory: ResponseHistoryEntry[],
        requestHistory: ResponseHistoryEntry[],
        showBack: boolean,
        content: string,
        toolbarOverride?: string
    ): string {
        const nonce = new Date().getTime() + '' + new Date().getMilliseconds();
        const csp = this.getCsp(nonce);
        const toolbar = toolbarOverride ?? this.buildToolbarHtml(fileHistory, requestHistory, showBack);

        return `
    <head>
        <link rel="stylesheet" type="text/css" href="${panel.webview.asWebviewUri(this.baseFilePath)}">
        <link rel="stylesheet" type="text/css" href="${panel.webview.asWebviewUri(this.vscodeStyleFilePath)}">
        <link rel="stylesheet" type="text/css" href="${panel.webview.asWebviewUri(this.customStyleFilePath)}">
        ${this.getSettingsOverrideStyles(width)}
        ${csp}
        <script nonce="${nonce}">
            const vscode = acquireVsCodeApi();
            function bindToolbar() {
                const backBtn = document.getElementById('btn-back');
                if (backBtn) {
                    backBtn.addEventListener('click', function () { vscode.postMessage({ command: 'backToCurrent' }); });
                }
                const scrollBtn = document.getElementById('scroll-to-top');
                if (scrollBtn) {
                    scrollBtn.addEventListener('click', function () { window.scrollTo(0,0); });
                }
                const historySelect = document.getElementById('history-select');
                if (historySelect) {
                    historySelect.addEventListener('focus', function () { vscode.postMessage({ command: 'refreshHistory' }); });
                    historySelect.addEventListener('change', function () {
                        const id = historySelect.value;
                        if (id) {
                            vscode.postMessage({ command: 'viewHistory', id: id });
                        } else {
                            vscode.postMessage({ command: 'backToCurrent' });
                        }
                    });
                }
                const compareSelect = document.getElementById('compare-select');
                if (compareSelect) {
                    compareSelect.addEventListener('focus', function () { vscode.postMessage({ command: 'refreshHistory' }); });
                    compareSelect.addEventListener('change', function () {
                        const id = compareSelect.value;
                        if (id) {
                            vscode.postMessage({ command: 'compareWith', id: id });
                            compareSelect.value = '';
                        }
                    });
                }
                const comparePrev = document.getElementById('btn-compare-prev');
                if (comparePrev) {
                    comparePrev.addEventListener('click', function () { vscode.postMessage({ command: 'comparePrevious' }); });
                }
            }
            window.addEventListener('message', function (event) {
                const msg = event.data;
                if (msg.command !== 'updateHistory') {
                    return;
                }
                const countLabel = document.getElementById('history-count-label');
                if (countLabel) {
                    countLabel.textContent = 'History (' + msg.fileHistory.length + ')';
                }
                const historySelect = document.getElementById('history-select');
                if (historySelect) {
                    const current = historySelect.value;
                    historySelect.innerHTML = '<option value="">● Current</option>' +
                        msg.fileHistory.map(function (e) {
                            return '<option value="' + e.id + '">' + e.label + '</option>';
                        }).join('');
                    if (current) {
                        historySelect.value = current;
                    }
                }
                const compareSelect = document.getElementById('compare-select');
                if (compareSelect) {
                    compareSelect.innerHTML = '<option value="">Compare with…</option>' +
                        msg.fileHistory.map(function (e) {
                            return '<option value="' + e.id + '">Compare: ' + e.label + '</option>';
                        }).join('');
                }
                const comparePrev = document.getElementById('btn-compare-prev');
                if (comparePrev) {
                    comparePrev.disabled = msg.requestPastCount < 1;
                }
            });
            document.addEventListener('DOMContentLoaded', bindToolbar);
        </script>
    </head>
    <body>
        ${toolbar}
        <div class="response-content">
            ${content}
            <a id="scroll-to-top" role="button" aria-label="scroll to top" title="Scroll To Top"><span class="icon"></span></a>
        </div>
        <script type="text/javascript" src="${panel.webview.asWebviewUri(this.scriptFilePath)}" nonce="${nonce}" charset="UTF-8"></script>
    </body>`;
    }

    private buildToolbarHtml(
        fileHistory: ResponseHistoryEntry[],
        requestHistory: ResponseHistoryEntry[],
        showBack: boolean,
        selectedId?: string
    ): string {
        const requestPastCount = Math.max(0, requestHistory.length - 1);
        const backBtn = showBack
            ? '<button id="btn-back" class="toolbar-btn toolbar-back">← Back</button>'
            : '';

        const historyOptions = fileHistory.map(entry => {
            const label = this.formatEntryLabel(entry);
            const selected = entry.id === selectedId ? ' selected' : '';
            return `<option value="${entry.id}"${selected}>${this.escapeHtml(label)}</option>`;
        }).join('');

        const compareOptions = fileHistory.map(entry => {
            const label = this.formatEntryLabel(entry);
            return `<option value="${entry.id}">Compare: ${this.escapeHtml(label)}</option>`;
        }).join('');

        return `<div class="response-toolbar">
            ${backBtn}
            <label id="history-count-label" class="toolbar-label" for="history-select">History (${fileHistory.length})</label>
            <select id="history-select" class="history-select" title="Browse all saved responses in this file">
                <option value="">● Current</option>
                ${historyOptions}
            </select>
            <button id="btn-compare-prev" class="toolbar-btn"${requestPastCount < 1 ? ' disabled' : ''}>vs Previous</button>
            <select id="compare-select" class="history-select" title="Open IDE diff in a new tab">
                <option value="">Compare with…</option>
                ${compareOptions}
            </select>
        </div>`;
    }

    private formatSavedResponseDisplay(saved: SavedResponseFile): string {
        const statusLine = `HTTP/${saved._meta.httpVersion} ${saved._meta.statusCode} ${saved._meta.statusMessage}`;
        const headerString = formatHeaders(saved.headers as ResponseHeaders);
        const body = saved.body ? `\n${saved.body}` : '';
        return `${statusLine}\n${headerString}${body}`;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    private highlightResponse(response: HttpResponse): string {
        let code = '';
        const previewOption = this.settings.previewOption;
        if (previewOption === PreviewOption.Exchange) {
            // for add request details
            const request = response.request;
            const requestNonBodyPart = `${request.method} ${request.url} HTTP/1.1
${formatHeaders(request.headers)}`;
            code += hljs.highlight('http', requestNonBodyPart + '\r\n').value;
            if (request.body) {
                if (typeof request.body !== 'string') {
                    request.body = 'NOTE: Request Body From File Is Not Shown';
                }
                const requestBodyPart = `${ResponseFormatUtility.formatBody(request.body, request.contentType, true)}`;
                const bodyLanguageAlias = HttpResponseWebview.getHighlightLanguageAlias(request.contentType, request.body);
                if (bodyLanguageAlias) {
                    code += hljs.highlight(bodyLanguageAlias, requestBodyPart).value;
                } else {
                    code += hljs.highlightAuto(requestBodyPart).value;
                }
                code += '\r\n';
            }

            code += '\r\n'.repeat(2);
        }

        if (previewOption !== PreviewOption.Body) {
            const responseNonBodyPart = `HTTP/${response.httpVersion} ${response.statusCode} ${response.statusMessage}
${formatHeaders(response.headers)}`;
            code += hljs.highlight('http', responseNonBodyPart + (previewOption !== PreviewOption.Headers ? '\r\n' : '')).value;
        }

        if (previewOption !== PreviewOption.Headers) {
            const responseBodyPart = `${ResponseFormatUtility.formatBody(response.body, response.contentType, this.settings.suppressResponseBodyContentTypeValidationWarning)}`;
            if (this.settings.disableHighlightResponseBodyForLargeResponse &&
                response.bodySizeInBytes > this.settings.largeResponseBodySizeLimitInMB * 1024 * 1024) {
                code += responseBodyPart;
            } else {
                const bodyLanguageAlias = HttpResponseWebview.getHighlightLanguageAlias(response.contentType, responseBodyPart);
                if (bodyLanguageAlias) {
                    code += hljs.highlight(bodyLanguageAlias, responseBodyPart).value;
                } else {
                    code += hljs.highlightAuto(responseBodyPart).value;
                }
            }
        }

        return code;
    }

    private getSettingsOverrideStyles(width: number): string {
        return [
            '<style>',
            (this.settings.fontFamily || this.settings.fontSize || this.settings.fontWeight ? [
                'code {',
                this.settings.fontFamily ? `font-family: ${this.settings.fontFamily};` : '',
                this.settings.fontSize ? `font-size: ${this.settings.fontSize}px;` : '',
                this.settings.fontWeight ? `font-weight: ${this.settings.fontWeight};` : '',
                '}',
            ] : []).join('\n'),
            'code .line {',
            `padding-left: calc(${width}ch + 20px );`,
            '}',
            'code .line:before {',
            `width: ${width}ch;`,
            `margin-left: calc(-${width}ch + -30px );`,
            '}',
            '.line .icon {',
            `left: calc(${width}ch + 3px)`,
            '}',
            '.line.collapsed .icon {',
            `left: calc(${width}ch + 3px)`,
            '}',
            '</style>'].join('\n');
    }

    private getCsp(nonce: string): string {
        return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' http: https: data: vscode-resource:; script-src 'nonce-${nonce}'; style-src 'self' 'unsafe-inline' http: https: data: vscode-resource:;">`;
    }

    private addLineNums(code): string {
        code = code.replace(/([\r\n]\s*)(<\/span>)/ig, '$2$1');

        code = this.cleanLineBreaks(code);

        code = code.split(/\r\n|\r|\n/);
        const max = (1 + code.length).toString().length;

        const foldingRanges = this.getFoldingRange(code);

        code = code
            .map(function (line, i) {
                const lineNum = i + 1;
                const range = foldingRanges.has(lineNum)
                    ? ` range-start="${foldingRanges.get(lineNum)![0]}" range-end="${foldingRanges.get(lineNum)![1]}"`
                    : '';
                const folding = foldingRanges.has(lineNum) ? '<span class="icon"></span>' : '';
                return `<span class="line width-${max}" start="${lineNum}"${range}>${line}${folding}</span>`;
            })
            .join('\n');
        return code;
    }

    private cleanLineBreaks(code: string): string {
        const openSpans: string[] = [],
            matcher = /<\/?span[^>]*>|\r\n|\r|\n/ig,
            newline = /\r\n|\r|\n/,
            closingTag = /^<\//;

        return code.replace(matcher, function (match: string) {
            if (newline.test(match)) {
                if (openSpans.length) {
                    return openSpans.map(() => '</span>').join('') + match + openSpans.join('');
                } else {
                    return match;
                }
            } else if (closingTag.test(match)) {
                openSpans.pop();
                return match;
            } else {
                openSpans.push(match);
                return match;
            }
        });
    }

    private addUrlLinks(innerHtml: string) {
        return innerHtml.replace(this.urlRegex, (match: string): string => {
            const encodedEndCharacters = ["&lt;", "&gt;", "&quot;", "&apos;"];
            let urlEndPosition = match.length;

            encodedEndCharacters.forEach((char) => {
                const index = match.indexOf(char);
                if (index > -1 && index < urlEndPosition) {
                    urlEndPosition = index;
                }
            });

            const url = match.substr(0, urlEndPosition);
            const extraCharacters = match.substr(urlEndPosition);

            return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>' + extraCharacters;
        });
    }

    private getFoldingRange(lines: string[]): Map<number, FoldingRange> {
        const result = new Map<number, FoldingRange>();
        const stack: [number, number][] = [];

        const leadingSpaceCount = lines
            .map((line, index) => [index, line.search(/\S/)])
            .filter(([, num]) => num !== -1);
        for (const [index, [lineIndex, count]] of leadingSpaceCount.entries()) {
            if (index === 0) {
                continue;
            }

            const [prevLineIndex, prevCount] = leadingSpaceCount[index - 1];
            if (prevCount < count) {
                stack.push([prevLineIndex, prevCount]);
            } else if (prevCount > count) {
                let prev;
                while ((prev = stack.slice(-1)[0]) && (prev[1] >= count)) {
                    stack.pop();
                    result.set(prev[0] + 1, [prev[0] + 1, lineIndex]);
                }
            }
        }
        return result;
    }

    private static getHighlightLanguageAlias(contentType: string | undefined, content: string | null = null): string | null {
        if (MimeUtility.isJSON(contentType)) {
            return 'json';
        } else if (MimeUtility.isJavaScript(contentType)) {
            return 'javascript';
        } else if (MimeUtility.isXml(contentType)) {
            return 'xml';
        } else if (MimeUtility.isHtml(contentType)) {
            return 'html';
        } else if (MimeUtility.isCSS(contentType)) {
            return 'css';
        } else {
            // If content is provided, guess from content if not content type is matched
            if (content && isJSONString(content)) {
                return 'json';
            }
            return null;
        }
    }

    private static isHeadRequest({ request: { method } }: { request: HttpRequest }): boolean {
        return method.toLowerCase() === 'head';
    }
}
