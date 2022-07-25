//
//  barnes-hut.js
//
//  implementation of the barnes-hut quadtree algorithm for n-body repulsion
//  http://www.cs.princeton.edu/courses/archive/fall03/cs126/assignments/barnes-hut.html
//
//  Created by Christian Swinehart on 2011-01-14.
//  Copyright (c) 2011 Samizdat Drafting Co. All rights reserved.
//

  function BarnesHutTree(){
    this.branches = []
    this.branchCtr = 0
    this.root = null
    this.theta = .5
    this.queue = new Queue();
  }

    BarnesHutTree.prototype = {
      init:function(topleft, bottomright, theta){
        this.theta = theta

        // create a fresh root node for these spatial bounds
        this.branchCtr = 0
        this.root = this.newBranch()
        this.root.origin = topleft
        this.root.size = bottomright.subtract(topleft)
      },

      insert:function(newParticle){
        // add a particle to the tree, starting at the current root and working down
        var node = this.root
        var queue = this.queue;
        queue.empty().push(newParticle);

        while (queue.length){
          var particle = queue.shift()
          var p_mass = particle._m || particle.m
          var p_quad = this.whichQuad(particle, node)

          if (node[p_quad]===undefined){
            // slot is empty, just drop this node in and update the mass/c.o.m.
            node[p_quad] = particle
            node.mass += p_mass
            if (node.p){
              node.p = node.p.add(particle.p.multiply(p_mass))
            }else{
              node.p = particle.p.multiply(p_mass)
            }
          }else if ('origin' in node[p_quad]){
            // slot contains a branch node, keep iterating with the branch
            // as our new root
            node.mass += (p_mass)
            if (node.p) node.p = node.p.add(particle.p.multiply(p_mass))
            else node.p = particle.p.multiply(p_mass)

            node = node[p_quad]
            queue.unshift(particle)
          }else{
            // slot contains a particle, create a new branch and recurse with
            // both points in the queue now
            var branch_size = node.size.divide(2)

            // if we let a zero-sized node through, we'll end up infinitely bisecting it
            // (the 'jostling' below depends upon branch_size being non-zero)
            // -- this doesn't affect the forces applied: this node will always be treated
            //    as a single body in applyForces below
            if (branch_size.magnitude() == 0) return;

            var branch_origin = node.origin.clone();
            if (p_quad[0]=='s') branch_origin.y += branch_size.y
            if (p_quad[1]=='e') branch_origin.x += branch_size.x

            // replace the previously particle-occupied quad with a new internal branch node
            var oldParticle = node[p_quad]
            node[p_quad] = this.newBranch()
            node[p_quad].origin = branch_origin
            node[p_quad].size = branch_size
            node.mass = p_mass
            node.p = particle.p.multiply(p_mass)
            node = node[p_quad]

            if (oldParticle.p.x===particle.p.x && oldParticle.p.y===particle.p.y){
              // prevent infinite bisection in the case where two particles
              // have identical coordinates by jostling one of them slightly
              var x_spread = branch_size.x*.08
              var y_spread = branch_size.y*.08
              oldParticle.p.x = Math.min(branch_origin.x+branch_size.x,
                                         Math.max(branch_origin.x,
                                                  oldParticle.p.x - x_spread/2 +
                                                  Math.random()*x_spread))
              oldParticle.p.y = Math.min(branch_origin.y+branch_size.y,
                                         Math.max(branch_origin.y,
                                                  oldParticle.p.y - y_spread/2 +
                                                  Math.random()*y_spread))
            }

            // keep iterating but now having to place both the current particle and the
            // one we just replaced with the branch node
            queue.push(oldParticle)
            queue.unshift(particle)
          }
        }
      },

      applyForces:function(particle, repulsion){
        // find all particles/branch nodes this particle interacts with and apply
        // the specified repulsion to the particle
        var pmass = particle._m || particle.m;
        var queue = this.queue;
        queue.empty().push(this.root);
        while (queue.length > 0){
          var node = queue.shift()
          if (node===undefined) continue
          if (particle===node) continue

          if ('f' in node){
            // this is a particle leafnode, so just apply the force directly
            var d = particle.p.subtract(node.p);
            var distance = Math.max(1.0, d.magnitude());
            var direction = ((d.magnitude()>0) ? d : Point.random(1)).normalize()
            var force = repulsion * pmass * (node._m||node.m) / (distance * distance);
            particle.applyForce(direction.multiply(force));
          }else{
            // it's a branch node so decide if it's cluster-y and distant enough
            // to summarize as a single point. if it's too complex, open it and deal
            // with its quadrants in turn
            // remember that node.p = Σ pᵢmᵢ, actual position is node.p / node.mass
            var node_p = node.p.divide(node.mass);
            var dist = particle.p.subtract(node_p).magnitude()
            var size = Math.sqrt(node.size.x * node.size.y)
            if (size/dist > this.theta){ // i.e., s/d > Θ
              // open the quad and recurse
              queue.push(node.ne)
              queue.push(node.nw)
              queue.push(node.se)
              queue.push(node.sw)
            }else{
              // treat the quad as a single body
              var d = particle.p.subtract(node_p);
              var distance = Math.max(1.0, d.magnitude());
              var direction = ((d.magnitude()>0) ? d : Point.random(1)).normalize()
              var force = repulsion * pmass * node.mass / (distance * distance);
              particle.applyForce(direction.multiply(force));
            }
          }
        }
      },

      whichQuad:function(particle, node){
        // sort the particle into one of the quadrants of this node
        if (particle.p.exploded()) return null
        var particle_p = particle.p.subtract(node.origin)
        var halfsize = node.size.divide(2)
        if (particle_p.y < halfsize.y){
          if (particle_p.x < halfsize.x) return 'nw'
          else return 'ne'
        }else{
          if (particle_p.x < halfsize.x) return 'sw'
          else return 'se'
        }
      },

      newBranch:function(){
        // to prevent a gc horrorshow, recycle the tree nodes between iterations
        if (this.branches[this.branchCtr]){
          var branch = this.branches[this.branchCtr]
          branch.ne = branch.nw = branch.se = branch.sw = undefined
          branch.mass = 0
          branch.p = undefined
        }else{
          branch = {origin:null, size:null,
                    nw:undefined, ne:undefined, sw:undefined, se:undefined, mass:0, p:undefined}
          this.branches[this.branchCtr] = branch
        }

        this.branchCtr++
        return branch
      }
    };

