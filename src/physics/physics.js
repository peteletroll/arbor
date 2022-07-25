//
// physics.js
//
// the particle system itself. either run inline or in a worker (see worker.js)
//

  function Physics(dt, stiffness, repulsion, friction, updateFn, integrator, precision){
    this.updateFn = updateFn
    this.bhTree = new BarnesHutTree() // for computing particle repulsion
    this.active = {particles:{}, springs:{}}
    this.particles = null
    this.springs = null
    this._epoch=0
    this._energy = {sum:0, max:0, mean:0}
    this._bounds = {topleft:new Point(-1,-1), bottomright:new Point(1,1)}

    this.SPEED_LIMIT = 1000 // the max particle velocity per tick

    this.p = {
      integrator:['verlet','euler'].indexOf(integrator)>=0 ? integrator : 'verlet',
      stiffness:(stiffness!==undefined) ? stiffness : 1000,
      repulsion:(repulsion!==undefined)? repulsion : 600,
      friction:(friction!==undefined)? friction : .3,
      gravity:false,
      dt:(dt!==undefined)? dt : 0.02,
      theta:(precision!==undefined) ? 1-precision : .4, // the criterion value for the barnes-hut s/d calculation
    }
  }

  Physics.prototype = {

      modifyPhysics:function(param){
        ['stiffness','repulsion','friction','gravity','dt','precision', 'integrator'].forEach((p)=>{
          if (param[p]!==undefined){
            if (p=='precision'){
              this.p.theta = 1-param[p]
              return
            }
            this.p[p] = param[p]

            if (p=='stiffness'){
              var stiff=param[p]
              for (var id in this.active.springs) {
                this.active.springs[id].k = stiff
              }
            }
          }
        })
      },

      checkLists:function(){
        if (!this.particles){
          this.particles = Object.values(this.active.particles);
	  console.log("PARTICLES", this.particles);
	}
        if (!this.springs){
          this.springs = Object.values(this.active.springs);
	  console.log("SPRINGS", this.springs);
	}
      },

      addNode:function(c){
        var id = c.id
        var mass = c.m

        var w = this._bounds.bottomright.x - this._bounds.topleft.x
        var h = this._bounds.bottomright.y - this._bounds.topleft.y
        var randomish_pt = new Point((c.x != null) ? c.x: this._bounds.topleft.x + w*Math.random(),
                                     (c.y != null) ? c.y: this._bounds.topleft.y + h*Math.random())
        this.active.particles[id] = new Particle(randomish_pt, mass);
        this.active.particles[id].fixed = (c.f===1)
        this.particles = null
      },

      dropNode:function(c){
        var id = c.id
        delete this.active.particles[id]
        this.particles = null
      },

      modifyNode:function(id, mods){
        if (id in this.active.particles){
          var pt = this.active.particles[id]
          if ('x' in mods) pt.p.x = mods.x
          if ('y' in mods) pt.p.y = mods.y
          if ('m' in mods) pt.m = mods.m
          if ('f' in mods) pt.fixed = (mods.f===1)
          if ('_m' in mods){
            if (pt._m===undefined) pt._m = pt.m
            pt.m = mods._m
          }
        }
      },

      addSpring:function(c){
        var id = c.id
        var length = c.l
        var from = this.active.particles[c.fm]
        var to = this.active.particles[c.to]

        if (from!==undefined && to!==undefined){
          this.active.springs[id] = new Spring(from, to, length, this.p.stiffness)
          this.springs = null;
        }
      },

      dropSpring:function(c){
        delete this.active.springs[c.id]
        this.springs = null;
      },

      _update:function(changes){
        // batch changes phoned in (automatically) by a ParticleSystem
        this._epoch++
        changes.forEach((c) => this[c.t](c))
        return this._epoch
      },

      tick:function(){
        this.checkLists()
        this.tendParticles()
        var p = this.p
        if (p.integrator=='euler'){
          this.updateForces()
          this.updateVelocity(p.dt)
          this.updatePosition(p.dt)
        }else{
          // default to verlet
          this.updateForces();
          this.cacheForces();           // snapshot f(t)
          this.updatePosition(p.dt); // update position to x(t + 1)
          this.updateForces();          // calculate f(t+1)
          this.updateVelocity(p.dt); // update using f(t) and f(t+1)
        }
        this.tock()
      },

      tock:function(){
        var coords = []
        for (var id in this.active.particles) {
          var pt = this.active.particles[id];
          coords.push(id)
          coords.push(pt.p.x)
          coords.push(pt.p.y)
        }

        if (this.updateFn) this.updateFn({geometry:coords, epoch:this._epoch, energy:this._energy, bounds:this._bounds})
      },

      tendParticles:function(){
        for (var id in this.active.particles) {
          var pt = this.active.particles[id];
          // decay down any of the temporary mass increases that were passed along
          // by using an {_m:} instead of an {m:} (which is to say via a Node having
          // its .tempMass attr set)
          if (pt._m!==undefined){
            if (Math.abs(pt.m-pt._m)<1){
              pt.m = pt._m
              pt._m = undefined
            }else{
              pt.m *= .98
            }
          }

          // zero out the velocity from one tick to the next
          pt.v.x = pt.v.y = 0
        }
      },

      // Physics stuff
      updateForces:function() {
        var p = this.p;
        if (p.repulsion>0){
          if (p.theta>0) this.applyBarnesHutRepulsion()
          else this.applyBruteForceRepulsion()
        }
        if (p.stiffness>0) this.applySprings()
        this.applyCenterDrift()
        if (p.gravity) this.applyCenterGravity()
      },

      cacheForces:function() {
        // keep a snapshot of the current forces for the verlet integrator
        for (var id in this.active.particles) {
           var point = this.active.particles[id];
           point._F = point.f;
        }
      },

      applyBruteForceRepulsion:function(){
        for (var id1 in this.active.particles) {
          var point1 = this.active.particles[id1];
          for (var id2 in this.active.particles) {
            if (id1 < id2) { // don't compute the same force twice
              var point2 = this.active.particles[id2];
              var d = point1.p.subtract(point2.p);
              var distance = Math.max(1.0, d.magnitude());
              var direction = ((d.magnitude()>0) ? d : Point.random(1)).normalize()

              // apply force to each end point
              // (consult the cached `real' mass value if the mass is being poked to allow
              // for repositioning. the poked mass will still be used in .applyforce() so
              // all should be well)
              var force = this.p.repulsion * (point1._m||point1.m) * (point2._m||point2.m)
                / (distance * distance);
              point1.applyForce(direction.multiply(force));
              point2.applyForce(direction.multiply(-force));
            }
          }
        }
      },

      applyBarnesHutRepulsion:function(){
        if (!this._bounds.topleft || !this._bounds.bottomright) return
        // if (Object.keys(this.active.particles).length < 2) return
        if (!objlt(this.active.particles, 2)) return
        var bottomright = this._bounds.bottomright.clone();
        var topleft = this._bounds.topleft.clone();

        // build a barnes-hut tree...
        this.bhTree.init(topleft, bottomright, this.p.theta)
        for (var id in this.active.particles) {
          this.bhTree.insert(this.active.particles[id]);
        }

        // ...and use it to approximate the repulsion forces
        for (var id in this.active.particles) {
          this.bhTree.applyForces(this.active.particles[id], this.p.repulsion)
        }
      },

      applySprings:function(){
        for (var id in this.active.springs) {
          var spring = this.active.springs[id];
          var d = spring.point2.p.subtract(spring.point1.p); // the direction of the spring
          var displacement = spring.length - d.magnitude()//Math.max(.1, d.magnitude());
          var direction = ( (d.magnitude()>0) ? d : Point.random(1) ).normalize()

          // BUG:
          // since things oscillate wildly for hub nodes, should probably normalize spring
          // forces by the number of incoming edges for each node. naive normalization
          // doesn't work very well though. what's the `right' way to do it?

          // apply force to each end point
          // the 0.5 factor is physically wrong, but it's too old a bug to fix
          var force = spring.k * displacement * 0.5;
          spring.point1.applyForce(direction.multiply(-force))
          spring.point2.applyForce(direction.multiply(force))
        }
      },

      applyCenterDrift:function(){
        // find the centroid of all the particles in the system and shift everything
        // so the cloud is centered over the origin
        var numParticles = 0
        var centroid = new Point(0,0)
        for (var id in this.active.particles) {
          centroid = centroid.add(this.active.particles[id].p)
          numParticles++
        }

        if (numParticles < 2) return

        var correction = centroid.divide(-numParticles)
        for (var id in this.active.particles) {
          this.active.particles[id].applyForce(correction)
        }
      },

      applyCenterGravity:function(){
        // attract each node to the origin
        for (var id in this.active.particles) {
          var point = this.active.particles[id];
          var direction = point.p.multiply(-1.0);
          point.applyForce(direction.multiply(this.p.repulsion / 100.0));
        }
      },

      updateVelocity:function(timestep){
        // translate forces to a new velocity for this particle
        var sum=0, max=0, n = 0;
        for (var id in this.active.particles) {
          var point = this.active.particles[id];
          if (point.fixed){
             point.v = new Point(0,0)
             point.f = new Point(0,0)
             n++;
             continue
          }

          var p = this.p;
          if (p.integrator=='euler'){
            point.v = point.v.add(point.f.multiply(timestep)).multiply(1-p.friction);
          }else{
            point.v = point.v.add(point.f.add(point._F.divide(point.m)).multiply(timestep*0.5)).multiply(1-p.friction);
          }
          point.f.x = point.f.y = 0

          var speed = point.v.magnitude()
          if (speed>this.SPEED_LIMIT) point.v = point.v.divide(speed*speed)

          var speed = point.v.magnitude();
          var e = speed*speed
          sum += e
          max = Math.max(e,max)
          n++
        }
        this._energy = {sum:sum, max:max, mean:sum/n, n:n}

      },

      updatePosition:function(timestep){
        // translate velocity to a position delta
        var bottomright = null
        var topleft = null

        for (var i in this.active.particles) {
          var point = this.active.particles[i];
          // really force fixed point to stay fixed, to combat center drift effects
          if (point.fixed){
             point.v = new Point(0,0);
             point.f = new Point(0,0);
          }
          // move the node to its new position
          if (this.p.integrator=='euler'){
            point.p = point.p.add(point.v.multiply(timestep));
          }else{
            //this should follow the equation
            //x(t+1) = x(t) + v(t) * timestep + 1/2 * timestep^2 * a(t)
            var accel = point.f.multiply(0.5 * timestep * timestep).divide(point.m);
            point.p = point.p.add(point.v.multiply(timestep)).add(accel);
          }

          if (!bottomright){
            bottomright = new Point(point.p.x, point.p.y)
            topleft = new Point(point.p.x, point.p.y)
            continue
          }

          var pt = point.p
          if (pt.x===null || pt.y===null) return
          if (pt.x > bottomright.x) bottomright.x = pt.x;
          if (pt.y > bottomright.y) bottomright.y = pt.y;
          if (pt.x < topleft.x)     topleft.x = pt.x;
          if (pt.y < topleft.y)     topleft.y = pt.y;
        }

        this._bounds = {topleft:topleft||new Point(-1,-1), bottomright:bottomright||new Point(1,1)}
      },

      systemEnergy:function(timestep){
        // system stats
        return this._energy
      }
  }
