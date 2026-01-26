export declare const generateUUID: () => string;
export declare class Logger {
    private enabled;
    constructor(enabled?: boolean);
    enable(): void;
    disable(): void;
    info(...args: any[]): void;
    error(...args: any[]): void;
    warn(...args: any[]): void;
}
export declare const Storage: {
    get(key: string): string | null;
    set(key: string, value: string): void;
    remove(key: string): void;
};
