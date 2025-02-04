//
// physics.js
//
// the particle system itself. either run inline or in a worker (see worker.js)
//

  var Physics = function(dt, stiffness, repulsion, friction, updateFn, integrator, precision){
    var bhTree = BarnesHutTree() // for computing particle repulsion
    var active = {particles:{}, springs:{}}
    var particles = null
    var springs = null
    var _epoch=0
    var _energy = {sum:0, max:0, mean:0, n:0}
    var _bounds = {topleft:new Point(-1,-1), bottomright:new Point(1,1)}

    var SPEED_LIMIT = 1000 // the max particle velocity per tick
    
    var that = {
      integrator:integrator == 'euler' ? integrator : 'verlet',
      stiffness:(stiffness!==undefined) ? stiffness : 1000,
      repulsion:(repulsion!==undefined)? repulsion : 600,
      friction:(friction!==undefined)? friction : .3,
      gravity:false,
      dt:(dt!==undefined)? dt : 0.02,
      theta:(precision!==undefined) ? 1-precision : .4, // the criterion value for the barnes-hut s/d calculation
      
      modifyPhysics:function(param){
        that.checkLists();
        ['stiffness','repulsion','friction','gravity','dt','precision', 'integrator'].forEach(function(p){
          if (param[p]!==undefined){
            if (p=='precision'){
              that.theta = 1-param[p]
              return
            }
            that[p] = param[p]

            if (p=='stiffness'){
              var stiff=param[p]
              for (var spring of springs) {
                spring.k = stiff
              }
            }
          }
        })
      },

      checkLists:function(){
        if (!particles){
          particles = Object.values(active.particles);
          // console.log("PARTICLES", particles);
        }
        if (!springs){
          springs = Object.values(active.springs);
          // console.log("SPRINGS", springs);
        }
      },

      addNode:function(c){
        var id = c.id
        var mass = c.m

        var w = _bounds.bottomright.x - _bounds.topleft.x
        var h = _bounds.bottomright.y - _bounds.topleft.y
        var randomish_pt = new Point((c.x != null) ? c.x: _bounds.topleft.x + w*Math.random(),
                                     (c.y != null) ? c.y: _bounds.topleft.y + h*Math.random())

        active.particles[id] = new Particle(randomish_pt, mass);
        active.particles[id].fixed = (c.f===1)
        particles = null
      },

      dropNode:function(c){
        var id = c.id
        delete active.particles[id]
        particles = null
      },

      modifyNode:function(id, mods){
        var pt = active.particles[id]
        if (pt){
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
        var from = active.particles[c.fm]
        var to = active.particles[c.to]
        
        if (from!==undefined && to!==undefined){
          active.springs[id] = new Spring(from, to, length, that.stiffness)
          springs = null
        }
      },

      dropSpring:function(c){
        delete active.springs[c.id]
        springs = null
      },

      _update:function(changes){
        // batch changes phoned in (automatically) by a ParticleSystem
        _epoch++
        changes.forEach((c) => that[c.t](c))
        return _epoch
      },

      tick:function(){
        that.checkLists()
        that.tendParticles()
        if (that.integrator=='euler'){
          that.updateForces()
          that.updateVelocity(that.dt)
          that.updatePosition(that.dt)
        }else{
          // default to verlet
          that.updateForces();
          that.cacheForces();           // snapshot f(t)
          that.updatePosition(that.dt); // update position to x(t + 1)
          that.updateForces();          // calculate f(t+1)
          that.updateVelocity(that.dt); // update using f(t) and f(t+1) 
        }
        that.tock()
      },

      tock:function(){
        var coords = []
        for (var id in active.particles) {
          var pt = active.particles[id];
          coords.push(id)
          coords.push(pt.p.x)
          coords.push(pt.p.y)
        }

        if (updateFn) updateFn({geometry:coords, epoch:_epoch, energy:_energy, bounds:_bounds})
      },

      tendParticles:function(){
        for (var pt of particles) {
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
        if (that.repulsion>0){
          if (that.theta>0) that.applyBarnesHutRepulsion()
          else that.applyBruteForceRepulsion()
        }
        if (that.stiffness>0) that.applySprings()
        that.applyCenterDrift()
        if (that.gravity) that.applyCenterGravity()
      },
      
      cacheForces:function() {
        // keep a snapshot of the current forces for the verlet integrator
        for (var point of particles) {
           point._F = point.f;
        }
      },
      
      applyBruteForceRepulsion:function(){
        var l = particles.length;
        for (var i1 = 0; i1 < l; i1++) {
          var point1 = particles[i1];
          var m1 = (point1._m||point1.m);
          for (var i2 = i1 + 1; i2 < l; i2++) {
              var point2 = particles[i2];
              var m2 = (point2._m||point2.m);

              var d = point1.p.subtract(point2.p);
              var m = d.magnitude();
              var distance = Math.max(1.0, m);
              var direction = (m>0) ? d.divide(m) : Point.random(1).normalize()

              // apply force to each end point
              // (consult the cached `real' mass value if the mass is being poked to allow
              // for repositioning. the poked mass will still be used in .applyforce() so
              // all should be well)
              var force = that.repulsion * m1 * m2
                / (distance * distance);
              point1.applyForce(direction.multiply(force));
              point2.applyForce(direction.multiply(-force));
          }
        }
      },
      
      applyBarnesHutRepulsion:function(){
        if (!_bounds.topleft || !_bounds.bottomright) return
        // if (Object.keys(active.particles).length < 2) return
        if (!objlt(active.particles, 1)) return
        var bottomright = _bounds.bottomright.clone();
        var topleft = _bounds.topleft.clone();

        // build a barnes-hut tree...
        bhTree.init(topleft, bottomright, that.theta)        
        for (var point of particles) {
          bhTree.insert(point);
        }
        bhTree.postInsert();
        // ...and use it to approximate the repulsion forces
        for (var point of particles) {
          bhTree.applyForces(point, that.repulsion)
        }
      },

      applySprings:function(){
        for (var spring of springs) {
          var d = spring.point2.p.subtract(spring.point1.p); // the direction of the spring
          var l = d.magnitude();
          var displacement = spring.length - l //Math.max(.1, d.magnitude());
          var direction = (l>0) ? d.divide(l) : Point.random(1).normalize()

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
        if (particles.length < 2) return

        var centroid = new Point(0,0)
        for (var point of particles) {
          centroid = centroid.add(point.p)
        }

        var correction = centroid.divide(particles.length)
        for (var point of particles) {
          point.applyForce(correction)
        }
      },

      applyCenterGravity:function(){
        // attract each node to the origin
        for (var point of particles) {
          point.applyForce(point.p.multiply(that.repulsion / -100.0));
        }
      },
      
      updateVelocity:function(timestep){
        // translate forces to a new velocity for this particle
        var sum=0, max=0, n = 0;
        for (var point of particles) {
          if (point.fixed){
             point.v = new Point(0,0)
             point.f = new Point(0,0)
             n++;
             continue
          }

          var m = (point._m||point.m);
          if (that.integrator=='euler'){
            point.v = point.v.add(point.f.multiply(timestep / m)).multiply(1-that.friction);
          }else{
            point.v = point.v.add(point.f.add(point._F).multiply(0.5*timestep/m)).multiply(1-that.friction);
          }
          point.f.x = point.f.y = 0

          var speed = point.v.magnitude()          
          if (speed>SPEED_LIMIT){
            point.v = point.v.multiply(SPEED_LIMIT/speed)
            speed = SPEED_LIMIT
          }

          var e = speed*speed
          sum += e
          max = Math.max(e,max)
          n++
        }
        _energy = {sum:sum, max:max, mean:(n>0 ? sum/n : 0), n:n}
      },

      updatePosition:function(timestep){
        // translate velocity to a position delta
        var bottomright = null
        var topleft = null        
        
        for (var point of particles) {
          // really force fixed point to stay fixed, to combat center drift effects
          if (point.fixed){
             point.v = new Point(0,0);
             point.f = new Point(0,0);
          }
          // move the node to its new position
          if (that.integrator=='euler'){
            point.p = point.p.add(point.v.multiply(timestep));
          }else{
            //this should follow the equation
            //x(t+1) = x(t) + v(t) * timestep + 1/2 * timestep^2 * a(t)
            point.p = point.p.add(point.v.multiply(timestep)).add(point.f.multiply(0.5 * timestep * timestep / (point._m||point.m)));
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
        
        _bounds = {topleft:topleft||new Point(-1,-1), bottomright:bottomright||new Point(1,1)}
      },

      systemEnergy:function(timestep){
        // system stats
        return _energy
      }
    }

    return that
  }
