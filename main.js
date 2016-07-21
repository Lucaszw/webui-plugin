// Create function to extract the filled mesh for each shape.
var shapeMeshes = _fp.mapValues(_fp.get("children[0]"));
var shapeMeshesFromArray = _fp.map(_fp.get("children[0]"));
var elementsById = _fp.flow(_fp.map((element) => [element.id, element]),
                            _.fromPairs);
var interpretPaths = _fp.mapValues((path) => two.interpret(path));


function dataFrameToShapes(df_i) {
    // Compute boundary containing all shapes.
    var boundingBox_i = boundingBox(df_i);
    // Create a `THREE.Shape` for each shape (i.e., "id") in `df_i` frame.
    var shapes = ThreeHelpers.shapesById(df_i);
    var wrappedShapes = wrapShapes(shapes);
    wrappedShapes['boundingBox'] = boundingBox_i;
    return wrappedShapes;
}


function wrapShapes(shapes) {
    // Create a `THREE.Group` for each shape, containing a filled mesh and an
    // outline.
    var shapeGroups = _.mapValues(shapes, _.unary(shapeGroup));
    // Create a parent group to hold all `THREE.Group` shape objects.
    var parentGroup = new THREE.Group();
    // Add all shape groups to single parent group.
    _.forEach(shapeGroups, function (value, key) { parentGroup.add(value); });
    // Extract `Array` containing the filled mesh for each shape.
    var shapeMeshes_i = shapeMeshes(shapeGroups);

    return {parentGroup: parentGroup,
            shapeMeshes: shapeMeshes_i};
}


function styleShapes(shapes) {
    // Raise shapes in Z-plane to render them above background plane.
    shapes.parentGroup.position.z = 0.01 * Math.min(shapes.boundingBox.height,
                                                    shapes.boundingBox.width);
    // Style each filled shape mesh.
    _.forEach(shapes.shapeMeshes, function (value, key) {
        // Tag each shape mesh with the `shape_id` for reverse lookup.
        value.shape_id = key;
        value.material.opacity = 0.3;
        value.material.transparent = true;
    });
}



function __legacy_cleanup__() {
    // Remove default shape loaded from SVG  TODO Remove SVG loading.
    this.tp.scene.remove(shapesGroup);
    var dmf_device_i = temp1;
    var df_i = new DataFrame(dmf_device_i.df_shapes);
}


function initShapes(scene, orbit, shapesGroup_i) {
    // Add parent group to scene (causes shapes to be drawn).
    scene.add(shapesGroup_i.parentGroup);
    // Position (pan and zoom) camera to center on shapes.
    centerCamera(orbit, shapesGroup_i.boundingBox);
    // Apply new camera position.
    orbit.reset();
}


function invertColor(shape) {
    var color_i = new THREE.Color(shape.object.material.color);
    shape.object.material.color.setRGB(1. - color_i.r,
                                        1. - color_i.g,
                                        1. - color_i.b);
}


function initStats() {
    stats = new Stats();
    stats.setMode(0); // 0: fps, 1: ms

    // Align top-left
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.left = '0px';
    stats.domElement.style.top = '0px';

    document.getElementById("Stats-output").appendChild(stats
                                                        .domElement);

    return stats;
}


function createMouseHandler(gl_element, shapeMeshes, camera) {
    // Create event manager to translate mouse movement and presses
    // high-level shape events.
    mouseHandler = (new ThreeHelpers
                    .MouseEventHandler({element: gl_element,
                                        shapes: shapeMeshes,
                                        camera: camera}));
    mouseHandler.on("mouseover", function (x, y, shape)
                    { invertColor(shape); });
    mouseHandler.on("mouseout", function (x, y, shape)
                    { invertColor(shape); });
    mouseHandler.on("clicked", function (x, y, shapes_i) {
        // Invert opacity of shape when it is clicked.
        shapes_i.map(function (shape_i) {
            var opacity_i = shape_i.object.material.opacity;
            shape_i.object.material.opacity = 1 - opacity_i;
        });
    });
    return mouseHandler;
}


function centerCamera(orbit, bbox_i) {
    var distance = 1.1 * Math.max(bbox_i.height, bbox_i.width);
    var center = new THREE.Vector3(bbox_i.left + .5 *
                                   bbox_i.width,
                                   bbox_i.top + .5 *
                                   bbox_i.height, 0);
    orbit.position0.set(center.x, center.y, distance);
    orbit.target0 = center;
}


function centerVideo(threePlane, bbox) {
    var position = threePlane.geometry.attributes.position.array;

    position[0] = bbox.left;
    position[1] = bbox.bottom;
    position[3] = bbox.right;
    position[4] = bbox.bottom;
    position[6] = bbox.left;
    position[7] = bbox.top;
    position[9] = bbox.right;
    position[10] = bbox.top;
}


var stats;
var orbit;
var gl_element = $("#canvasID");
var namespace;
var socket;
var threePlane;
var deviceView;


function listenSocket(deviceView) {
    // Change to an empty string to use the global namespace.
    namespace = '/zmq_plugin';

    // The socket.io documentation recommends sending an explicit
    // package upon connection.
    // This is especially important when using the global namespace.
    socket = io.connect('http://' + document.domain + ':' + '5000' +
                        namespace);
    socket.on('connect_error', function(msg) {
        socket.close();
    })
                        // location.port + namespace);

    socket.on('zmq', function(msg) {
        var source = msg.header.source;
        var target = msg.header.target;
        var msg_type = msg.header.msg_type;

        var data;
        try {
            if ((source == 'wheelerlab.device_info_plugin') &&
                (msg_type == 'execute_reply')) {
                if (msg.content.command == 'get_device') {
                    data = ZmqPlugin.decode_content_data(msg);
                    if (data) {
                        console.log("on_device_loaded", data);
                        var df_i = new DataFrame(data.df_shapes);
                        var shapes = dataFrameToShapes(df_i);
                        styleShapes(shapes);
                        deviceView.setShapes(shapes);
                    }
                }
            } else if ((source ==
                        'wheelerlab.electrode_controller_plugin') &&
                    (msg_type == 'execute_reply')) {
                if (['set_electrode_state', 'set_electrode_states']
                    .indexOf(msg['content']['command']) >= 0) {
                    data = ZmqPlugin.decode_content_data(msg);
                    console.log("on_electrode_states_updated", data);
                } else if (msg['content']['command'] ==
                        'get_channel_states') {
                    data = ZmqPlugin.decode_content_data(msg);
                    console.log("on_electrode_states_set", data);
                } else {
                    console.log('wheelerlab.electrode_controller_plugin',
                                data);
                }
            } else if ((source == 'wheelerlab.droplet_planning_plugin')
                    && (msg_type == 'execute_reply')) {
                if (msg['content']['command'] == 'add_route') {
                    console.log("TODO",
                                "execute_async('wheelerlab.droplet_planning_plugin'",
                                "get_routes");
                } else if (msg['content']['command'] == 'get_routes') {
                    data = ZmqPlugin.decode_content_data(msg);
                    console.log("on_routes_set", data);
                }
            } else {
                socket.most_recent = msg;
                console.log("zmq subscribe message:", msg);
            }
        } catch (e) {
            console.error('Error processing message from subscription socket.', e);
        }
    });
}


class DeviceView {
    constructor(canvasElement, controlHandlesElement) {
        // Create and display stats widget (displays frames per second).
        this.stats = initStats();
        // Create `three.js` scene and plane with video from webcam.
        this.threePlane = new planeTransform(canvasElement,
                                             controlHandlesElement);

        // Create orbit controls to zoom, pan, etc.  Start at center of SVG
        // drawing.
        this.orbit = new THREE.OrbitControls(this.threePlane.camera,
                                             this.threePlane.renderer
                                             .domElement);
        this.orbit.reset();
        this.orbit.enableRotate = false;

        this.menu = new dat.GUI();
        var transformFolder = this.menu.addFolder("Transforms");
        transformFolder.add(this.threePlane, 'rotateRight');
        transformFolder.add(this.threePlane, 'rotateLeft');
        transformFolder.add(this.threePlane, 'flipHorizontal');
        transformFolder.add(this.threePlane, 'flipVertical');

        this.menu.add(this.orbit, 'enableRotate');
        this.menu.add(this.threePlane, 'displayHandles');
        this.menu.add(this.orbit, 'reset');
    }

    update() {
        this.stats.update();
        this.orbit.update();
        this.threePlane.update();
    }

    resetShapes() {
        if (this.shapes) {
            this.threePlane.scene.remove(this.shapes.parentGroup);
            this.shapes = null;
        }
    }

    setShapes(shapes) {
        this.resetShapes();
        this.shapes = shapes;

        initShapes(this.threePlane.scene, this.orbit, this.shapes);
        centerVideo(this.threePlane, this.shapes.boundingBox);
    }

    loadSvg(svg_url) {
        return new Promise((resolve, reject) => {
            two.load(svg_url, (shape, svg) => {
                var paths = elementsById($(svg).find("g > path").toArray());
                var twoPaths = interpretPaths(paths);
                var threeShapes = _fp.mapValues(ThreeHelpers
                                                .extractShape)(twoPaths);
                var bounding_box = shape.getBoundingClientRect();

                // Create simplified adapter object which is compatible
                // with the `DeviceView.setShapes` API.
                var shapes = _.merge(wrapShapes(threeShapes),
                                     {boundingBox: bounding_box});
                styleShapes(shapes);
                this.setShapes(shapes);
                resolve({shape: shape, svg: svg});
            });
        });
    }
}
