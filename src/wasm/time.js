export default function createTime() {
    return {
        js_time() {
            return Math.floor(Date.now() / 1000);
        }
    };
}
