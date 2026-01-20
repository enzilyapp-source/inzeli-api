export type ApiOk<T> = {
    ok: true;
    message: string;
    data: T;
};
export type ApiErr = {
    ok: false;
    message: string;
    code?: string;
};
export declare const ok: <T>(message: string, data: T) => ApiOk<T>;
export declare const err: (message: string, code?: string) => ApiErr;
