class planeTransform{

    constructor(){
        this.init();
        this.frame = 0;
        this.speed = 250;
        this.displayHandles = false;
    }

    init(){
        var mesh, customMaterial;
        /* global variables
        var camera, scene, renderer, geometry;
        var video, videoTexture;
        var controlPoints;*/

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
        
        
        var pointsUI = d3.controlPointsUI()(d3.select('#controlHandles')
                                      .selectAll('circle')
                                      .data(this.controlPoints)).radius(10);
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, width/height, 1, 10000);
        this.camera.position.z = this.sceneWidth;
        this.scene.add(this.camera);

        //laptop camera
        this.video = document.createElement("video");
        var video = this.video;
        var hasUserMedia = navigator.webkitGetUserMedia ? true : false;
        navigator.webkitGetUserMedia({video:true}, function(stream){
            video.src = webkitURL.createObjectURL(stream);
            }, function(error){
            console.log("Failed to get a stream due to", error);
        });
          
        if(!this.video.src){
            this.video.crossOrigin = "anonymous";
            this.video.src =
            //"https://media.w3.org/2010/05/sintel/trailer.ogv"
            "http://avideos.5min.com//415/5177415/517741401_4.mp4#t=20";
            this.video.load();
            this.video.play();
        }

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

        //draw the plane
        this.geometry = new THREE.PlaneBufferGeometry(width, height, 1, 1);
        var diagonalRatios = new Float32Array(4);
        for (var i = 0; i < 4; i++) {
            diagonalRatios[0] = 1.0;
        }
        this.geometry.addAttribute('diagonalRatio', new THREE.BufferAttribute(diagonalRatios, 1));

        this.mesh = new THREE.Mesh(this.geometry, customMaterial);
        this.scene.add(this.mesh)
        this.renderer = new THREE.WebGLRenderer({
            canvas: canvas
        });
        document.body.appendChild(this.renderer.domElement);
    }

    listen() {
        requestAnimationFrame(()=>this.listen());
        
        //datgui handling
        if(this.displayHandles)
            $("#controlHandles").show();
        else
            $("#controlHandles").hide();
            
        this.frame += 1;
        if (this.frame > this.speed && this.speed != 250){
            this.rotateRight();
            this.frame = 0;
        }
        this.render();
    }

    render() {
        if( this.video.readyState === this.video.HAVE_ENOUGH_DATA ){
            this.videoTexture.needsUpdate = true;
        }

        var vectorSet = [];
        var pos = [];
        //transform canvas space to camera space
        for (var i = 0; i < this.controlPoints.length; i++) {
            vectorSet[i] = new THREE.Vector3((this.controlPoints[i].x / this.sceneWidth) * 2 - 1,
                 -(this.controlPoints[i].y / this.sceneHeight) * 2 + 1, 0.5);
            vectorSet[i].unproject(this.camera);
            var dir = vectorSet[i].sub(this.camera.position).normalize();
            var distance = -this.camera.position.z / dir.z;
            pos[i] = this.camera.position.clone().add(dir.multiplyScalar(distance));
        }

        this.geometry.attributes.position.array[3] = pos[0].x;
        this.geometry.attributes.position.array[4] = pos[0].y;
        this.geometry.attributes.position.array[9] = pos[1].x;
        this.geometry.attributes.position.array[10] = pos[1].y;
        this.geometry.attributes.position.array[6] = pos[2].x;
        this.geometry.attributes.position.array[7] = pos[2].y;
        this.geometry.attributes.position.array[0] = pos[3].x;
        this.geometry.attributes.position.array[1] = pos[3].y;
        this.geometry.attributes.position.needsUpdate = true;

        var diagonalRatios = this.calculateDiagonalRatios();
        for (var i = 0; i < 4; i++) {
            this.geometry.attributes.diagonalRatio.array[i] = diagonalRatios[i];
        }
        this.geometry.attributes.diagonalRatio.needsUpdate = true;

        this.renderer.render(this.scene, this.camera);
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
    
    rotateLeft(){
        this.controlPoints.unshift(this.controlPoints.pop());
    }
    
    rotateRight(){
        this.controlPoints.push(this.controlPoints.shift());
    }
    
    flipHorizontal(){
        //1234-> 2143
        this.rotateLeft();
        var temp = this.controlPoints[1];
        this.controlPoints[1] = this.controlPoints[3];
        this.controlPoints[3] = temp;
    }
    
    flipVertical(){
        //1234-> 4321
        this.rotateRight();
        var temp = this.controlPoints[1];
        this.controlPoints[1] = this.controlPoints[3];
        this.controlPoints[3] = temp;
    }
}
  
