"use strict";

var tmp = new Array(512);
function mergeSortedArrays(comparer, a, b) {
    var k = 0;
    var i = 0;
    var j = 0;
    var aLen = a.length;
    var bLen = b.length;
    var innerTmp = tmp;

    while (i < aLen && j < bLen) {
        var aVal = a[i];
        var bVal = b[j];

        var result = comparer(aVal, bVal);

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

    var m = 0;
    for (; i < aLen; ++i) innerTmp[k++] = a[i];
    for (; j < bLen; ++j) innerTmp[k++] = b[j];
    for (; m < k; ++m) a[m] = innerTmp[m];
    return a;
}

function removeSortedLinear(comparer, array, value, length) {
    for (var i = 0; i < length; ++i) {
        if (comparer(array[i], value) === 0) {
            for (var j = i; j < length - 1; ++j) {
                array[j] = array[j + 1];
            }
            array.length = length - 1;
            return;
        }
    }
}

function removeSorted(comparer, array, value) {
    const length = array.length;
    if (length === 0) {
        return;
    } else if (length <= 32) {
        return removeSortedLinear(comparer, array, value, length);
    } else {
        var left = 0;
        var right = length - 1;

        while (left <= right) {
            var mid = (left + right) >> 1;
            var result = comparer(array[mid], value);

            if (result === 0) {
                for (var i = mid; i < length - 1; ++i) {
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
    for (var i = 0; i < length; ++i) {
        var result = comparer(array[i], value);

        if (result === 0) {
            return;
        } else if (result > 0) {
            for (var j = length; j > i; --j) {
                array[j] = array[j - 1];
            }
            array[i] = value;
            return;
        }
    }
    array.push(value);
}

function insertSorted(comparer, array, value) {
    const length = array.length;
    if (length === 0) {
        array.push(value);
        return;
    }

    if (length <= 32) {
        return insertSortedLinear(comparer, array, value, length);
    }

    var left = 0;
    var right = length - 1;

    while (left <= right) {
        var mid = (left + right) >> 1;
        var result = comparer(array[mid], value);

        if (result === 0) {
            return;
        } else if (result > 0) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    if (left === length) {
        array.push(value);
    } else {
        for (var i = length; i > left; --i) {
            array[i] = array[i - 1];
        }
        array[left] = value;
    }
}

module.exports = {
    merge: mergeSortedArrays,
    insert: insertSorted,
    remove: removeSorted
};
