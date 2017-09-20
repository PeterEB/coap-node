var _ = require('busyman');

function func (cb) {
	cb();
}

var array = [0, 1, 2, 3, 4, 5];

_.forEach(array, function (num) {
	func(function () {
		console.log(num);

	});

	if (num === 3)
		return;
});
