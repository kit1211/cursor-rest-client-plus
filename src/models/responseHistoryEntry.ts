export interface ResponseHistoryEntry {
    id: string;
    savedAt: string;
    sourceFile: string;
    requestName?: string;
    method: string;
    url: string;
    statusCode: number;
    durationMs: number;
    filePath: string;
    /** ไฟล์ที่ save ข้าง .http เมื่อ @save = true */
    persistedFilePath?: string;
}

export interface SavedResponseFile {
    _meta: {
        id: string;
        savedAt: string;
        sourceFile: string;
        requestName?: string;
        method: string;
        url: string;
        statusCode: number;
        statusMessage: string;
        httpVersion: string;
        durationMs: number;
    };
    headers: Record<string, string | string[] | undefined>;
    body: string;
}
