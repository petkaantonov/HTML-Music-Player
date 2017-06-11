

const tmp = new Array(512);
export function merge(comparer, a, b) {
    let k = 0;
    let i = 0;
    let j = 0;
    const aLen = a.length;
    const bLen = b.length;
    const innerTmp = tmp;

    while (i < aLen && j < bLen) {
        const aVal = a[i];
        const bVal = b[j];

        const result = comparer(aVal, bVal);

        if (result < 0) {
            innerTmp[k++] = aVal;
            i++;
        } else if (result > 0) {
            innerTmp[k++] = bVal;
            j++;
        } else {
            i++;
            j++;
            innerTmp[k++] = aVal;
        }
    }

    let m = 0;
    for (; i < aLen; ++i) innerTmp[k++] = a[i];
    for (; j < bLen; ++j) innerTmp[k++] = b[j];
    for (; m < k; ++m) a[m] = innerTmp[m];
    return a;
}

function removeSortedLinear(comparer, array, value, length) {
    for (let i = 0; i < length; ++i) {
        if (comparer(array[i], value) === 0) {
            for (let j = i; j < length - 1; ++j) {
                array[j] = array[j + 1];
            }
            array.length = length - 1;
            return;
        }
    }
}

export function remove(comparer, array, value) {
    const {length} = array;
    if (length > 0 && length <= 32) {
        removeSortedLinear(comparer, array, value, length);
    } else if (length > 32) {
        let left = 0;
        let right = length - 1;

        while (left <= right) {
            const mid = (left + right) >> 1;
            const result = comparer(array[mid], value);

            if (result === 0) {
                for (let i = mid; i < length - 1; ++i) {
                    array[i] = array[i + 1];
                }
                array.length = length - 1;
                return;
            } else if (result > 0) {
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }
    }
}

function insertSortedLinear(comparer, array, value, length) {
    for (let i = 0; i < length; ++i) {
        const result = comparer(array[i], value);

        if (result === 0) {
            return false;
        } else if (result > 0) {
            for (let j = length; j > i; --j) {
                array[j] = array[j - 1];
            }
            array[i] = value;
            return true;
        }
    }
    array.push(value);
    return true;
}

export function insert(comparer, array, value) {
    const {length} = array;
    if (length === 0) {
        array.push(value);
        return true;
    }

    if (length <= 32) {
        return insertSortedLinear(comparer, array, value, length);
    }

    let left = 0;
    let right = length - 1;

    while (left <= right) {
        const mid = (left + right) >> 1;
        const result = comparer(array[mid], value);

        if (result === 0) {
            return false;
        } else if (result > 0) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    if (left === length) {
        array.push(value);
    } else {
        for (let i = length; i > left; --i) {
            array[i] = array[i - 1];
        }
        array[left] = value;
    }
    return true;
}
