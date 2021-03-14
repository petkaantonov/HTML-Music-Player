import { callMainWindow } from "common/AbstractBackend";

export async function getIndexedDbStorageInfo() {
    const ret = { used: 0, total: 0 };
    if (!self.navigator) {
        return ret;
    }
    if (self.navigator.storage && self.navigator.storage.estimate) {
        const { usage, quota } = await self.navigator.storage.estimate();
        ret.used = usage ?? 0;
        ret.total = quota ?? 0;
    } else {
        const [usage, quota] = await callMainWindow(`queryUsageAndQuota`, []);
        ret.used = usage;
        ret.total = quota;
    }
    return ret;
}
