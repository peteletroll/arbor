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
  this.m = mass;
  this.v = new Point(0, 0); // velocity
  this.f = new Point(0, 0); // force
  this.fixed = false;
  this._F = new Point(0, 0);
  this._m = undefined;
};

Particle.prototype.applyForce = function(force){
	this.f = this.f.add(force);
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

var RateMeter = function(l) {
  if (isNaN(l))
    l = 50;
  this.buf = new Array(Math.max(4, l));
  this.ptr = 0;
  this.len = 0;
};
RateMeter.prototype = {
  tick: function() {
    this.buf[this.ptr++] = Date.now();
    this.ptr %= this.buf.length;
    this.len = Math.min(this.buf.length, this.len + 1);
    return this;
  },
  rate: function() {
    if (this.len < 2)
      return NaN;
    var l = this.buf.length;
    var t1 = this.buf[(this.ptr + l - this.len) % l];
    var t2 = this.buf[(this.ptr + l - 1) % l];
    return 1000 * this.len / (t2 - t1);
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

