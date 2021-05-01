export interface Time {
    js_time: () => number;
}

export default function createTime(): Time {
    return {
        js_time() {
            return Math.floor(Date.now() / 1000);
        },
    };
}
