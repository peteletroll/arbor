#!/usr/bin/nodejs

var fs = require("fs");
var vm = require("vm");

global.window = {
	location: { protocol: "" },
	console: true
};

global.$ = {
	extend: Object.assign,
	each: function(obj, callback){
		if (Array.isArray(obj)) {
			for (var i = 0, j = obj.length; i < j; i++)
				callback(i, obj[i]);
		} else {
			for (var k in obj)
				callback(k, obj[k]);
		}
	},
	isEmptyObject: function(obj) {
		return Object.keys(obj).length <= 0
	},
	map: function(arr, fn) {
		var out = [];
		$.each(arr, function(i, elt) {
			var result = fn(elt);
			if (result !== undefined)
				out.push(result)
		});
		return out;
	}
};

function gulp(file) {
	// console.log("LOADING", file);
	return fs.readFileSync(file, "utf8");
}

function load(file) {
	var content = gulp(file, "utf8");
	var script = new vm.Script("\"no strict\";" + content, file);
	script.runInNewContext(global);
}

load("../src/etc.js");
load("../src/kernel.js");
load("../src/graphics/colors.js");
load("../src/graphics/primitives.js");
load("../src/graphics/graphics.js");
load("../src/tween/easing.js");
load("../src/tween/tween.js");
load("../src/physics/atoms.js");
load("../src/physics/barnes-hut.js");
load("../src/physics/physics.js");
load("../src/physics/system.js");
load("../src/dev.js");

load("../demos/halfviz/src/parseur.js");
var json = JSON.parse(gulp("../demos/halfviz/library/the-mystery-of-chimney-rock.json"));
var graph = Parseur().parse(json.src);

var system = new ParticleSystem({ fps: 10000 });

var start = Date.now();
var last = start;
var step = 0;

system.renderer = {
	init: function(e) { },
	redraw: function(e) {
		step++;
		var now = Date.now();
		if (now - last > 1e3) {
			last = now;
			console.log("STEP", step,
				"FPS", system.fps().toFixed(2),
				"ENERGY", system.energy().sum.toPrecision(3));
		}
		if (now - start > 20e3)
			system.stop();
	}
};

system.graft(graph);

