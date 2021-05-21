interface Module {
    run: () => void;
    noInitialRun: boolean
    cwrap: (name: string, ret: string, args: string[]) => (...args: any[]) => number
    _malloc: (amount: number) => number
    writeAsciiToMemory: (str: string, ptr: number) => void;
    setValue: (ptr: number, value: number, type: "i32") => void;
    quit: (status: number) => void;
}

declare const createFFmpegCore: (m?: Partial<Module>) => Promise<Module>;
export default createFFmpegCore;
