//
// atoms.js
//
// particle system- or physics-related datatypes
//

var Node = function(data){
	this._id = _nextNodeId++; // simple ints to allow the Kernel & ParticleSystem to chat
	this.data = data || {};  // the user-serviceable parts
	this._mass = (data.mass!==undefined) ? data.mass : 1
	this._fixed = (data.fixed===true) ? true : false
	this._p = new Point((typeof(data.x)=='number') ? data.x : null, 
                     (typeof(data.y)=='number') ? data.y : null)
  delete this.data.x
  delete this.data.y
  delete this.data.mass
  delete this.data.fixed
};
var _nextNodeId = 1

var Edge = function(source, target, data){
	this._id = _nextEdgeId--;
	this.source = source;
	this.target = target;
	this.length = (data.length!==undefined) ? data.length : 1
	this.data = (data!==undefined) ? data : {};
	delete this.data.length
};
var _nextEdgeId = -1

var Particle = function(position, mass){
  this.p = position;
  this.m = 1 * mass;
	this.v = new Point(0, 0); // velocity
	this.f = new Point(0, 0); // force
  this.fixed = undefined;
  this.connections = 0;
  // this._F = new Point(0, 0);
  // this._F = undefined;
  this._m = undefined;
};

var _psig_ = { };
Particle.prototype.applyForce = function(force){
	var sig = Object.keys(this).map(k => k + ":" + typeof this[k]).join(",");
	if (!_psig_[sig]) {
		console.log("P", sig);
		_psig_[sig] = true;
	}
	this._applyForce(force);
};
Particle.prototype._applyForce = function(force){
	this.f = this.f.add(force.divide(this.m));
};

var Spring = function(point1, point2, length, k)
{
	this.point1 = point1; // a particle
	this.point2 = point2; // another particle
	this.length = length; // spring length at rest
	this.k = k;           // stiffness
};
Spring.prototype.distanceToParticle = function(point)
{
  // see http://stackoverflow.com/questions/849211/shortest-distance-between-a-point-and-a-line-segment/865080#865080
  var n = that.point2.p.subtract(that.point1.p).normalize().normal();
  var ac = point.p.subtract(that.point1.p);
  return Math.abs(ac.x * n.x + ac.y * n.y);
};

var Queue = function() {
  this.p = 0;
  this.q = new Array();
  this.length = 0;
}
Queue.prototype = {
  push: function(e) {
    this.length++;
    this.q.push(e);
    return this;
  },
  shift: function() {
    if (this.p > 1024) {
      this.q.splice(0, 1024);
      this.p -= 1024;
    }
    this.length--;
    return this.q[this.p++];
  },
  unshift: function(e) {
    if (--this.p < 0)
      throw "can't unshift";
    this.length++;
    this.q[this.p] = e;
    return this;
  }
};

var Point = function(x, y){
  // if (y === undefined) throw "polymorphic Point()";
  this.x = x;
  this.y = y;
}

Point.random = function(radius){
  radius = (radius!==undefined) ? radius : 5
	return new Point(2*radius * (Math.random() - 0.5), 2*radius* (Math.random() - 0.5));
}

Point.prototype = {
  clone:function(){
    return new Point(this.x, this.y);
  },
  exploded:function(){
    return ( isNaN(this.x) || isNaN(this.y) )
  },
  add:function(v2){
  	return new Point(this.x + v2.x, this.y + v2.y);
  },
  subtract:function(v2){
  	return new Point(this.x - v2.x, this.y - v2.y);
  },
  multiply:function(n){
  	return new Point(this.x * n, this.y * n);
  },
  divide:function(n){
  	return new Point(this.x / n, this.y / n);
  },
  magnitude:function(){
  	return Math.sqrt(this.x*this.x + this.y*this.y);
  },
  normal:function(){
  	return new Point(-this.y, this.x);
  },
  normalize:function(){
  	return this.divide(this.magnitude());
  }
}

