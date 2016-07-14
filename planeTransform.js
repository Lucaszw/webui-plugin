class planeTransform{
    constructor(canvas_element, control_handles_element){
        //datgui is messing up the camera to world space action
        //if two points are the same, the texture disappears
        //plane jumps to other side
        this.frame = 0;
        this.displayHandles = true;
        this.updatePos = true;
        this.canvas_element = canvas_element;
        this.control_handles_element = control_handles_element;
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

        $(this.canvas_element).attr("width", width);
        $(this.canvas_element).attr("height", height);
        $(this.control_handles_element).width(width);
        $(this.control_handles_element).height(height);

        this.pointsUI =
            d3.controlPointsUI()(d3.select(this.control_handles_element)
                                 .selectAll('circle')
                                 .data(this.controlPoints)).radius(10);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, width / height, 1,
                                                  10000);
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
        this.videoTexture.minFilter = THREE.NearestFilter;
        this.videoTexture.magFilter = THREE.NearestFilter;

        var customUniforms = {
            uSampler: {
            type: "t",
            value: this.videoTexture
            },
        };

        var vertexShader = `
varying vec4 textureCoord;
attribute float diagonalRatio;
void main() {
    textureCoord = vec4(uv.xy, 0.0, 1.0);
    textureCoord.w = diagonalRatio;
    textureCoord.xy *= textureCoord.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

        var fragmentShader = `
uniform sampler2D uSampler;
varying vec4 textureCoord;
void main() {
    gl_FragColor = texture2D(uSampler, textureCoord.xy/textureCoord.w);
}`;

        customMaterial = new THREE.ShaderMaterial({
            uniforms: customUniforms,
            side: THREE.DoubleSide,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });

        //draw the plane and add diagonal ratios
        this.geometry = new THREE.PlaneBufferGeometry(width, height, 1, 1);
        var diagonalRatios = new Float32Array(4);
        for (var i = 0; i < 4; i++) {
            diagonalRatios[0] = 1.0;
        }
        this.geometry.addAttribute('diagonalRatio', new
                                   THREE.BufferAttribute(diagonalRatios, 1));

        this.mesh = new THREE.Mesh(this.geometry, customMaterial);
        this.scene.add(this.mesh);
        this.renderer = new THREE.WebGLRenderer({canvas: this.canvas_element});
        document.body.appendChild(this.renderer.domElement);
        this.renderer.render(this.scene, this.camera);


        var diagonalRatios = this.calculateDiagonalRatios();
        if(diagonalRatios){
            for (var i = 0; i < 4; i++) {
                this.geometry.attributes.diagonalRatio.array[i] = diagonalRatios[i];
            }
        }
        this.pointsUI.on("changed", (d) => this.onControlPointChange(d));
    }

    onControlPointChange(d){
    }

    listen() {
        requestAnimationFrame(() => this.listen());

        //datgui handling
        if(this.displayHandles)
            $(this.control_handles_element).show();
        else
            $(this.control_handles_element).hide();

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

        if(!(dis1 && dis2 && dis3 && dis4))
            return false;

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

