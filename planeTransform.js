class planeTransform{

    constructor(){
        this.frame = 0;
        this.displayHandles = true;
        this.updatePos = true;
        document.addEventListener("keydown", (event)=>this.onDocumentKeyDown(event), false);
        document.addEventListener("keyup", (event)=>this.onDocumentKeyUp(event), false);
        
        this.init();
    }

    init(){
        /* global variables
         var camera, scene, renderer, geometry, prevPos, updatePos;
         var video, videoTexture;
         var controlPoints, pointsUI;*/

        var mesh, customMaterial;
        var width = window.innerWidth;
        var height = window.innerHeight;
        this.sceneWidth = width;
        this.sceneHeight = height;

        this.controlPoints = [{
            x: .9 * width,
            y: .1 * height
        }, {
            x: .9 * width,
            y: .9 * height
        }, {
            x: .1 * width,
            y: .9 * height
        }, {
            x: .1 * width,
            y: .1 * height
        }];

        var canvas = document.getElementById("canvasID");
        $(canvas).attr("width", width);
        $(canvas).attr("height", height);
        $("#controlHandles").width(width);
        $("#controlHandles").height(height);
        
        this.pointsUI = d3.controlPointsUI()(d3.select('#controlHandles')
                                            .selectAll('circle')
                                            .data(this.controlPoints)).radius(10);
        
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, width/height, 1, 10000);
        this.camera.position.z = this.sceneWidth;
        this.scene.add(this.camera);

        //webcam detection
        this.video = document.createElement("video");
        var video = this.video;
        var hasUserMedia = navigator.webkitGetUserMedia ? true : false;
        navigator.webkitGetUserMedia({video:true}, function(stream){
            video.src = webkitURL.createObjectURL(stream);
            }, function(error){
            console.log("Failed to get a stream due to", error);
        });
          
        if(!this.video.src){
            console.log("no data from webcam");
        }

        //add video texture
        this.videoTexture = new THREE.Texture( this.video );
        this.videoTexture.minFilter = THREE.LinearFilter;
        this.videoTexture.magFilter = THREE.LinearFilter;

        var customUniforms = {
            uSampler: {
            type: "t",
            value: this.videoTexture
            },
        };

        customMaterial = new THREE.ShaderMaterial({
            uniforms: customUniforms,
            vertexShader: document.getElementById('vertex_shader').textContent,
            fragmentShader: document.getElementById('fragment_shader').textContent,
            side: THREE.DoubleSide
        });

        //draw the plane and add diagonal ratios
        this.geometry = new THREE.PlaneBufferGeometry(width, height, 1, 1);
        var diagonalRatios = new Float32Array(4);
        for (var i = 0; i < 4; i++) {
            diagonalRatios[0] = 1.0;
        }
        this.geometry.addAttribute('diagonalRatio', new THREE.BufferAttribute(diagonalRatios, 1));

        this.mesh = new THREE.Mesh(this.geometry, customMaterial);
        this.scene.add(this.mesh);
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas
        });''
        document.body.appendChild(this.renderer.domElement);
        this.renderer.render(this.scene, this.camera);
        
        var diagonalRatios = this.calculateDiagonalRatios();
        for (var i = 0; i < 4; i++) {
            this.geometry.attributes.diagonalRatio.array[i] = diagonalRatios[i];
        }
        
        //this.pointsUI.on("changed", function(d){this.onControlPointChange (d, this)});
        this.pointsUI.on("changed", (d)=>this.onControlPointChange(d));
    }
    
    onControlPointChange(d){
        //d consists of points x, y and index
        var pos = [];
        var vectorSet = [];
        
        
        //canvas space to camera space
        for (var i = 0; i < this.controlPoints.length; i++) {
            vectorSet[i] = new THREE.Vector3((this.controlPoints[i].x / this.sceneWidth) * 2 - 1,
                                             -(this.controlPoints[i].y / this.sceneHeight) * 2 + 1, 0.5);
            vectorSet[i].unproject(this.camera);
            var dir = vectorSet[i].sub(this.camera.position).normalize();
            var distance = -this.camera.position.z / dir.z;
            pos[i] = this.camera.position.clone().add(dir.multiplyScalar(distance));
        }
        
        var posArray = [];
        
        //turn pos (THREE.vector array) into a array
        for(var i = 0; i < pos.length; i++){
            posArray.push(pos[i].x);
            posArray.push(pos[i].y);
        }
        
        if(!this.prevPos)
            this.prevPos = $.extend(true, [], posArray);
        var transform = PerspT(posArray, this.prevPos).coeffsInv;
        this.prevPos = $.extend(true, [], posArray);
        
        var geoPos = this.geometry.attributes.position.array;
        if(this.updatePos){
            [geoPos[3], geoPos[4]]  = this.getUpdatedPos(geoPos[3], geoPos[4], transform);
            [geoPos[9], geoPos[10]] = this.getUpdatedPos(geoPos[9], geoPos[10], transform);
            [geoPos[6], geoPos[7]] = this.getUpdatedPos(geoPos[6], geoPos[7], transform);
            [geoPos[0], geoPos[1]] = this.getUpdatedPos(geoPos[0], geoPos[1], transform);
        }
        
        //new diagonal ratios
        var diagonalRatios = this.calculateDiagonalRatios();
        for (var i = 0; i < 4; i++) {
            this.geometry.attributes.diagonalRatio.array[i] = diagonalRatios[i];
        }

    }

    listen() {
        requestAnimationFrame(()=>this.listen());
        
        //datgui handling
        if(this.displayHandles)
            $("#controlHandles").show();
        else
            $("#controlHandles").hide();
            
        this.frame += 1;
        this.render();
        
    }

    render() {
        if( this.video.readyState === this.video.HAVE_ENOUGH_DATA ){
            this.videoTexture.needsUpdate = true;
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.diagonalRatio.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
    }
                    
    onDocumentKeyDown(event){
        var keyCode = event.which;
        if(keyCode == 16){
            this.updatePos = false;
        }
    }
    
    onDocumentKeyUp(event){
        var keyCode = event.which;
        if(keyCode == 16){
            this.updatePos = true;
        }
    }

    calculateDiagonalRatios(){
        if(this.geometry === undefined)
            return false;
          
        var tr, br, tl, bl;
        tr = [this.geometry.attributes.position.array[3], this.geometry.attributes.position.array[4]];
        br = [this.geometry.attributes.position.array[9], this.geometry.attributes.position.array[10]]
        bl = [this.geometry.attributes.position.array[6], this.geometry.attributes.position.array[7]]
        tl = [this.geometry.attributes.position.array[0], this.geometry.attributes.position.array[1]]
        var slope1 = (tr[1] - bl[1])/(tr[0] - bl[0]);
        var slope2 = (tl[1] - br[1])/(tl[0] - br[0]);

        if (slope1 == slope2)
            return false;

        var intx = (tr[1] - tl[1] - (slope1*tr[0] - slope2*tl[0]))/(slope2 - slope1);
        var inty = slope1*(intx - tr[0]) + tr[1];
        var dis1 = this.calculateDistance(intx, inty, tr[0], tr[1]);
        var dis2 = this.calculateDistance(intx, inty, br[0], br[1]);
        var dis3 = this.calculateDistance(intx, inty, tl[0], tl[1]);
        var dis4 = this.calculateDistance(intx, inty, bl[0], bl[1]);

        return [(dis2 + dis3)/dis2, (dis1 + dis4)/dis4, (dis1 + dis4)/dis1, (dis2 + dis3)/dis3];
    }
  
    calculateDistance(x1, y1, x2, y2){
        return Math.sqrt((x1 - x2)*(x1 - x2) + (y1 - y2)*(y1 - y2));
    }
    
    getUpdatedPos(x, y, M){
        var W = x*M[6] + y*M[7] + M[8];
        var X = x*M[0]/W + y*M[1]/W + M[2]/W;
        var Y = x*M[3]/W + y*M[4]/W + M[5]/W;
        return [X, Y];
    }
    
    rotateLeft(){
        this.controlPoints.unshift(this.controlPoints.pop());
        this.onControlPointChange(null);
    }
    
    rotateRight(){
        this.controlPoints.push(this.controlPoints.shift());
        this.onControlPointChange(null);
    }
    
    flipHorizontal(){
        //1234-> 4321
        this.rotateRight();
        var temp = this.controlPoints[1];
        this.controlPoints[1] = this.controlPoints[3];
        this.controlPoints[3] = temp;
        this.onControlPointChange(null);
    }
    
    flipVertical(){
        //1234-> 2143
        this.rotateLeft();
        var temp = this.controlPoints[1];
        this.controlPoints[1] = this.controlPoints[3];
        this.controlPoints[3] = temp;
        this.onControlPointChange(null);
    }
}
  
