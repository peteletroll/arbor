var fs = require("fs");
var vm = require("vm");

global.window = { location: { protocol: "" } };

global.$ = {
	extend: Object.assign
};

function load(file) {
	console.log("LOADING", file);
	var content = fs.readFileSync(file, "utf8");
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

var system = new ParticleSystem({ fps: 10000 });
system.renderer = {
	init: function(e) { console.log("INIT", e) },
	redraw: function(e) { console.log("REDRAW", e, system.fps()) },
};

system.graft({
	nodes:{
		f: { alone: true, mass:.25 }
	}, 
	edges:{
		a:{
			b:{},
			c:{},
			d:{},
			e:{}
		}
	}
});

// process.exit(0);

