export default function createTime(wasm) {
    return {
        js_time() {
            return Math.floor(Date.now() / 1000);
        }
    }
}
