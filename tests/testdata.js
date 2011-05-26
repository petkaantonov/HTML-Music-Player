var tests = [{
    array: [0, 2, 3, 7, 8, 9, 11, 13, 15, 16, 17, 18, 23, 24, 28],
    expected: [ [1, 1], [4, 6], [10, 10], [12, 12], [14, 14], [19, 22], [25,27], [29, 30]]
}, {
    array: [1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 15, 16, 17, 18, 23, 24, 28],
    expected: [ [0, 0], [6, 6], [10, 10], [12, 12], [14, 14], [19, 22], [25,27], [29, 30]]
}, {
    array: [1, 3, 4, 5, 7, 8, 9, 11, 13, 15, 16, 17, 18, 23, 24, 28],
    expected: [ [0, 0], [2, 2], [6, 6], [10, 10], [12, 12], [14, 14], [19, 22], [25,27], [29, 30]]
}, {
    array: [0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 15, 16, 17, 18, 23, 24, 28],
    expected: [ [6, 6], [10, 10], [12, 12], [14, 14], [19, 22], [25,27], [29, 30]]
}, {
    array: [0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 15, 16, 17, 18, 23, 24, 28, 29, 30],
    expected: [ [6, 6], [10, 10], [12, 12], [14, 14], [19, 22], [25,27]]
}, {
    array: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30],
    expected: []
}, {
    array: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
    expected: [[30, 30]]
}, {
    array: [0, 1, 2, 3, 4, 5, 7, 8, 9, 11, 13, 15, 16, 17, 18, 23, 24, 28, 29],
    expected: [ [6, 6], [10, 10], [12, 12], [14, 14], [19, 22], [25,27], [30, 30]]
}];

function test() {
    tests.forEach(function(test, index) {
        console.log("test", index+1, test.expected.join(","));
        var expected = test.expected;
        var actual = buildInverseRanges(test.array, 30);

        if (actual.length !== expected.length) {
            console.log(actual.join(","));
            console.log("!==")
            console.log(expected.join(","));
            throw new Error("d")
        }

        if (actual.join(",") !== expected.join(",")) {
            console.log(actual.join(","));
            console.log("!==")
            console.log(expected.join(","));
            throw new Error("d")
        }
        console.log("success");
    });
}

function times(count, value) {
    var ret = [];
    for (var i = 0; i < count; ++i) {
        ret.push(value);
    }
    return ret;
}

function makeTest(weighs) {
    var ret = [];
    for (var i = 0; i < weighs.length; ++i) {
        ret = ret.concat(times(weighs[i], i));
    }
    return ret;
}


function doIt(weighs, target) {
    var maxWeight = 0;
    for (var i = 0; i < weighs.length; ++i) {
        maxWeight += weighs[i];
    }

    var currentWeight = -1;
    for (var i = 0; i < weighs.length; ++i) {
        var weight = weighs[i];

        if (currentWeight + weight >= target) {
            return i;
        }
        currentWeight += weight;
    }
    return i;
}

var tests = [
    [3, 1, 10, 10, 0, 0, 3, 10, 30, 3, 0],
    [0],
    [0, 0, 0, 0],
    [1, 1, 1],
    [0, 1, 0, 1],
    [3, 0, 0, 3],
    [10, 0, 0, 10],
    [3, 0, 0, 0],
    [0, 0, 0, 3],
    [10, 0, 0, 0],
    [0, 0, 0, 10],
    [1, 0, 0, 0],
    [0, 0, 0, 1],

    [0, 0, 3, 0],
    [0, 0, 10, 0],
    [0, 10, 0, 0],
    [0, 3, 0, 0],
    [0, 0, 1, 0],
    [0, 1, 0, 0],

];

tests.forEach(function(test) {
    var expect = makeTest(test);
    var actual = [];
    for (var i = 0; i < expect.length; ++i) {
        actual.push(doIt(test, i));
    }
    console.log(actual.join() === expect.join())
})
