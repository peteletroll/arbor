//
// kernel.js
//
// run-loop manager for physics and tween updates
//
    
  function Kernel(pSystem){
    // in chrome, web workers aren't available to pages with file:// urls
    var chrome_local_file = window.location.protocol == "file:" &&
                            navigator.userAgent.toLowerCase().indexOf('chrome') > -1;
    this.USE_WORKER = (window.Worker !== undefined && !chrome_local_file && pSystem.parameters().worker)
    
    this._physics = null
    this._fpsWindow = [] // for keeping track of the actual frame rate
    this._fpsWindow.last = Date.now()
    this._screenInterval = null
    this._attached = null

    this._tickInterval = null
    this._lastTick = null
    this._paused = false
    this._running = false

    this.system = pSystem;
    this.tween = null;

    this.init()
  }
    
  Kernel.prototype = {
      init:function(){ 
        if (typeof(Tween)!='undefined') this.tween = Tween()
        else if (typeof(arbor.Tween)!='undefined') this.tween = arbor.Tween()
        else var tween = this.tween = {busy:function(){return false},
                       tick:function(){return true},
                       to:function(){ trace('Please include arbor-tween.js to enable tweens'); tween.to=function(){}; return} }
        var params = this.system.parameters()
                
        if(this.USE_WORKER){
          trace('arbor.js/web-workers',params)
          this._screenInterval = setInterval(() => this.screenUpdate(), params.timeout)

          this._physics = new Worker(arbor_path()+'physics/worker.js')
          this._physics.onmessage = (e) => this.workerMsg(e)
          this._physics.onerror = function(e){ trace('physics:',e) }
          this._physics.postMessage({type:"physics",
                                physics:objmerge(params, 
                                                {timeout:Math.ceil(params.timeout)}) })
        }else{
          trace('arbor.js/single-threaded',params)
          this._physics = new Physics(params.dt, params.stiffness, params.repulsion, params.friction, this.system._updateGeometry, params.integrator, params.precision)
          this.start()
        }

        return this
      },

      //
      // updates from the ParticleSystem
      graphChanged:function(changes){
        // a node or edge was added or deleted
        if (this.USE_WORKER) this._physics.postMessage({type:"changes","changes":changes})
        else this._physics._update(changes)
        this.start() // <- is this just to kick things off in the non-worker mode? (yes)
      },

      particleModified:function(id, mods){
        // a particle's position or mass is changed
        // trace('mod',objkeys(mods))
        if (this.USE_WORKER) this._physics.postMessage({type:"modify", id:id, mods:mods})
        else this._physics.modifyNode(id, mods)
        this.start() // <- is this just to kick things off in the non-worker mode? (yes)
      },

      physicsModified:function(param){

        // intercept changes to the framerate in case we're using a worker and
        // managing our own draw timer
        if (!isNaN(param.timeout)){
          if (this.USE_WORKER){
            clearInterval(this._screenInterval)
            this._screenInterval = setInterval(() => this.screenUpdate(), param.timeout)
          }else{
            // clear the old interval then let the call to .start set the new one
            clearInterval(this._tickInterval)
            this._tickInterval=null
          }
        }

        // a change to the physics parameters 
        if (this.USE_WORKER) this._physics.postMessage({type:'sys',param:param})
        else this._physics.modifyPhysics(param)
        this.start() // <- is this just to kick things off in the non-worker mode? (yes)
      },
      
      useWorker:function(){
        return this.USE_WORKER;
      },

      workerMsg:function(e){
        switch (e.data.type) {
          case 'geometry':
            this.workerUpdate(e.data)
            break
          case 'stopping':
            this._running = false
            break
          default:
            trace('physics:',e.data)
        }
      },
      _lastPositions:null,
      workerUpdate:function(data){
        this._lastPositions = data
        this._lastBounds = data.bounds
      },
      

      // 
      // the main render loop when running in web worker mode
      _lastFrametime:Date.now(),
      _lastBounds:null,
      _currentRenderer:null,
      screenUpdate:function(){        
        var shouldRedraw = false
        if (this._lastPositions!==null){
          this.system._updateGeometry(this._lastPositions)
          this._lastPositions = null
          shouldRedraw = true
        }
        
        if (this.tween && this.tween.busy()) shouldRedraw = true

        if (this.system._updateBounds(this._lastBounds)) shouldRedraw=true
        

        if (shouldRedraw){
          var render = this.system.renderer
          if (render!==undefined){
            if (render !== this._attached){
               render.init(this.system)
               this._attached = render
            }          
            
            if (this.tween) this.tween.tick()
            render.redraw()

            var _fpsWindow = this._fpsWindow
            var prevFrame = _fpsWindow.last
            _fpsWindow.last = Date.now()
            _fpsWindow.push(_fpsWindow.last-prevFrame)
            if (_fpsWindow.length>50) _fpsWindow.shift()
          }
        }
      },

      // 
      // the main render loop when running in non-worker mode
      physicsUpdate:function(){
        if (this.tween) this.tween.tick()
        this._physics.tick()

        var stillActive = this.system._updateBounds()
        if (this.tween && this.tween.busy()) stillActive = true

        var now = Date.now()
        var render = this.system.renderer
        if (render!==undefined){
          if (render !== this._attached){
            render.init(this.system)
            this._attached = render
          }          
          render.redraw({timestamp:now})
        }

        var _fpsWindow = this._fpsWindow
        var prevFrame = _fpsWindow.last
        _fpsWindow.last = now
        _fpsWindow.push(_fpsWindow.last-prevFrame)
        if (_fpsWindow.length>50) _fpsWindow.shift()

        // but stop the simulation when energy of the system goes below a threshold
        var sysEnergy = this._physics.systemEnergy()
        if ((sysEnergy.mean + sysEnergy.max)/2 < 0.05){
          if (this._lastTick===null) this._lastTick=Date.now()
          if (Date.now()-this._lastTick>1000){
            // trace('stopping')
            clearInterval(this._tickInterval)
            this._tickInterval = null
            this._running = false;
          }else{
            // trace('pausing')
          }
        }else{
          // trace('continuing')
          this._lastTick = null
        }
      },


      fps:function(newTargetFPS){
        if (newTargetFPS!==undefined){
          var timeout = 1000/Math.max(1,targetFps)
          this.physicsModified({timeout:timeout})
        }
        
        var totInterv = 0
        for (var i=0, j=this._fpsWindow.length; i<j; i++) totInterv+=this._fpsWindow[i]
        var meanInterv = totInterv/Math.max(1,this._fpsWindow.length)
        if (!isNaN(meanInterv)) return 1000/meanInterv
        else return 0
      },

      // 
      // start/stop simulation
      // 
      start:function(unpause){
        if (this._tickInterval !== null) return; // already running
        if (this._paused && !unpause) return; // we've been .stopped before, wait for unpause
        this._paused = false
        
        if (this.USE_WORKER){
           this._physics.postMessage({type:"start"})
        }else{
          this._lastTick = null
          this._tickInterval = setInterval(() => this.physicsUpdate(),
                                      this.system.parameters().timeout)
        }

        this._running = true
      },
      stop:function(){
        this._paused = true
        if (this.USE_WORKER){
           this._physics.postMessage({type:"stop"})
        }else{
          if (this._tickInterval!==null){
            clearInterval(this._tickInterval)
            this._tickInterval = null
          }
        }

        this._running = false;
      },
      isRunning:function() {
        return this._running;
      }
  }
