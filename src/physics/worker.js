//
// worker.js
//
// wraps physics.js in an onMessage/postMessage protocol that the
// Kernel object can deal with
//
importScripts('atoms.js');
importScripts('barnes-hut.js');  
importScripts('physics.js');  

var PhysicsWorker = function(){
  var _timeout = 20
  var _physics = null
  var _physicsInterval = null
  var _lastTick = null
  
  var times = []
  var last = Date.now()
  
  var that = {  
    init:function(param){
      that.timeout(param.timeout)
      _physics = Physics(param.dt, param.stiffness, param.repulsion, param.friction, that.tock)
      return that
    },
    timeout:function(newTimeout){
      if (newTimeout!=_timeout){
        _timeout = newTimeout
        if (_physicsInterval!==null){
          that.stop()
          that.go()
        }
      }
    },
    go:function(){
      if (_physicsInterval!==null) return

      // postMessage('starting')
      _lastTick=null
      _physicsInterval = setInterval(that.tick, _timeout)
    },
    stop:function(){
      if (_physicsInterval===null) return
      clearInterval(_physicsInterval);
      _physicsInterval = null;
      postMessage({type:'stopping'})
    },
    tick:function(){
      // iterate the system
      _physics.tick()    


      // but stop the simulation when energy of the system goes below a threshold
      var sysEnergy = _physics.systemEnergy()
      if ((sysEnergy.mean + sysEnergy.max)/2 < 0.05){
        if (_lastTick===null) _lastTick=Date.now()
        if (Date.now()-_lastTick>1000){
          that.stop()
        }else{
          // postMessage('pausing')
        }
      }else{
        _lastTick = null
      }
      
    },

    tock:function(sysData){
      sysData.type = "geometry"
      postMessage(sysData)
    },
    
    modifyNode:function(id, mods){
      _physics.modifyNode(id, mods)  
      that.go()
    },

    modifyPhysics:function(param){
      _physics.modifyPhysics(param)
    },
    
    update:function(changes){
      var epoch = _physics._update(changes)
    }
  }
  
  return that
}


var physics = PhysicsWorker()

onmessage = function(e){
  if (!e.data.type){
    postMessage("¿kérnèl?")
    return
  }
  
  if (e.data.type=='physics'){
    var param = e.data.physics
    physics.init(e.data.physics)
    return
  }
  
  switch(e.data.type){
    case "modify":
      physics.modifyNode(e.data.id, e.data.mods)
      break

    case "changes":
      physics.update(e.data.changes)
      physics.go()
      break
      
    case "start":
      physics.go()
      break
      
    case "stop":
      physics.stop()
      break
      
    case "sys":
      var param = e.data.param || {}
      if (!isNaN(param.timeout)) physics.timeout(param.timeout)
      physics.modifyPhysics(param)
      physics.go()
      break
    }  
}
