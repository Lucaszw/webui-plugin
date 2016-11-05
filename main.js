var two = two || new Two({type: Two.Types['svg']});

// Create function to extract the filled mesh for each shape.
var shapeMeshes = _fp.mapValues(_fp.get("children[0]"));
var shapeMeshesFromArray = _fp.map(_fp.get("children[0]"));
var elementsById = _fp.flow(_fp.map((element) => [element.id, element]),
                            _.fromPairs);
var interpretPaths = _fp.mapValues((path) => two.interpret(path));

var extractElectrodeStates = _fp.flow(_fp.at(["electrode_states.index",
                                              "electrode_states.values"]),
                                      _fp.spread(_.zipObject));

/* Function: `computeMeshBoundingBoxes`
 *
 * Parameters
 * ----------
 * object
 *     `key->mesh` mapping, where each mesh is a `THREE.Mesh`.
 *
 * Returns
 * -------
 * object
 *     `key->bounding box` mapping, where each bounding box is an `Object` with
 *     the properties `min` and `max` (as `THREE.Vector3` instances).
 */
var computeMeshBoundingBoxes = _fp.flow(_fp.forEach(function (value, key) {
                                                        value.geometry
                                                        .computeBoundingBox();
                                                    }),
                                        _fp.mapValues(
                                            _fp.get("geometry.boundingBox")));
/* Function: `computeCenters`
 *
 * Parameters
 * ----------
 * object
 *     `key->bounding box` mapping, where each bounding box is an `Object` with
 *     the properties `min` and `max` (as `THREE.Vector3` instances).
 *
 * Returns
 * -------
 * object
 *     `key->center` mapping, where each center is a `THREE.Vector3`.
 */
var computeCenters = _fp.mapValues(function (bbox_i) {
    return (bbox_i.clone().max.sub(bbox_i.min).multiplyScalar(.5)
            .add(bbox_i.min));
});


function dataFrameToShapes(df_i) {
    // Compute boundary containing all shapes.
    var boundingBox_i = ThreeHelpers.boundingBox(df_i);
    // Create a `THREE.Shape` for each shape (i.e., "id") in `df_i` frame.
    var shapes = ThreeHelpers.shapesById(df_i);
    var wrappedShapes = wrapShapes(shapes);
    wrappedShapes['boundingBox'] = boundingBox_i;
    return wrappedShapes;
}


function wrapShapes(shapes) {
    // Create a `THREE.Group` for each shape, containing a filled mesh and an
    // outline.
    var shapeGroups = _.mapValues(shapes, _.unary(ThreeHelpers.shapeGroup));
    // Create a parent group to hold all `THREE.Group` shape objects.
    var parentGroup = new THREE.Group();
    // Add all shape groups to single parent group.
    _.forEach(shapeGroups, (shape_mesh) => parentGroup.add(shape_mesh));
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
    var stats = new Stats();
    stats.setMode(0); // 0: fps, 1: ms

    // Align top-left
    stats.domElement.style.position = 'absolute';
    stats.domElement.style.left = '0px';
    stats.domElement.style.top = '0px';

    document.getElementById("Stats-output").appendChild(stats
                                                        .domElement);

    return stats;
}


function bindDemoMouseHandlers(mouseHandler) {
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

    threePlane.geometry.attributes.position.needsUpdate = true;
}


var namespace;

class EventHandler {
    constructor(deviceView) {
        _.extend(this, Backbone.Events);
        this.device_view = deviceView;
        this.electrode_queue = [];
        this.queuing_active = false;
    }

    listen() {
      this.device_view.on("shapes-set", (shapes) => {
        /*
         * Draw routes using mouse to explicitly drag along a path.
         *
         *  * On electrode button press:
         *      - Create new queue containing electrode.
         *  * On electrode `mouseover`:
         *      - Add electrode to queue.
         *      - Trigger "electrode_queue_updated".
         *  * On button released over electrode:
         *      - If queue contains a single electrode, toggle electrode state
         *        by triggering "set_electrode_state".
         *      - If queue contains multiple electrodes, trigger
         *        "electrode_queue_finished".
         */
        this.device_view.mouseHandler.on("mousedown",
          (x, y, intersections, event) => {
            var intersection = intersections[0];
            var mesh = intersection.object;
            var scenePoint = intersection.point;
            var electrode_id = mesh.shape_id;

            if (event.button == 0) {
              this.electrode_queue = [electrode_id];
              this.trigger("electrode_queue_started", this.electrode_queue);
              this.queuing_active = true;
            }
          });
        this.device_view.mouseHandler.on("mouseover",
          (x, y, intersection, event) => {
            var mesh = intersection.object;
            var scenePoint = intersection.point;
            var data = {"world_position": scenePoint,
                        "electrode_id": mesh.shape_id,
                        "event": event};
            if (this.queuing_active) {
              this.electrode_queue.push(data.electrode_id);
              this.trigger("electrode_queue_updated", this.electrode_queue);
            }
            this.trigger("mouseover", data);
          });
        this.device_view.mouseHandler.on("mouseout",
          (x, y, intersection, event) => {
            var mesh = intersection.object;
            var scenePoint = intersection.point;
            var data = {"world_position": scenePoint,
                        "electrode_id": mesh.shape_id,
                        "event": event};
            this.trigger("mouseout", data);
          });
        this.device_view.mouseHandler.on("mouseup",
          (x, y, intersections, event) => {
            var intersection = intersections[0];
            var mesh = intersection.object;
            var scenePoint = intersection.point;
            if (this.queuing_active && (event.button == 0)) {
                if (this.electrode_queue.length == 1) {
                    this.trigger("set_electrode_state",
                                 {"electrode_id": mesh.shape_id,
                                  "state": !(mesh.material.opacity > .5)});
                } else if (this.electrode_queue.length > 1) {
                  this.trigger("electrode_queue_finished",
                               this.electrode_queue);
                }
            }
            this.queuing_active = false;
          });
        this.device_view.mouseHandler.on(
          "contextmenu", (x, y, intersections, event) => {
            const intersection = intersections[0];
            const mesh = intersection.object;
            const scenePoint = intersection.point;
            const electrode_id = mesh.shape_id;

            const Menu = PhosphorMenus.Menu;
            const MenuItem = PhosphorMenus.MenuItem;

            var logHandler = (item) => console.log(item.text)
            var contextMenu = new Menu([
                new MenuItem({
                  text: '&Modify electrode channels...',
                  icon: 'fa fa-copy',
                  handler: logHandler
                }),
                new MenuItem({
                  text: '&Clear electrode routes',
                  handler: () => this.trigger('clear-routes', electrode_id)
                }),
                new MenuItem({
                  text: 'Clear &all electrode routes',
                  handler: () => this.trigger('clear-routes')
                }),
                new MenuItem({
                  text: 'E&xecute electrode routes',
                  handler: () => this.trigger('execute-routes', electrode_id)
                }),
                new MenuItem({
                  text: 'Execute a&ll electrode routes',
                  handler: () => this.trigger('execute-routes')
                })
              ]);

            event.preventDefault();
            var x = event.clientX;
            var y = event.clientY;
            contextMenu.popup(x, y);
        });
      });
    }

    abortQueuing() {
        this.queuing_active = false;
        this.electrode_queue = [];
        this.trigger("electrode_queue_updated", this.electrode_queue);
    }
}


class DeviceUIPlugin {
    constructor(deviceView) {
        this.device_view = deviceView;
        this.socket = null;
        this.device = null;
        this.routes = null;
        this.queue_mesh = null;

        this.route_material = new THREE.ShaderMaterial(
            THREELine2d.BasicShader({side: THREE.DoubleSide,
                                     diffuse: 0x5da5da,
                                     thickness: 0.3}));
        this.queue_material = new THREE.ShaderMaterial(
            THREELine2d.BasicShader({side: THREE.DoubleSide,
                                     diffuse: 0x60bd68,
                                     opacity: 0.2,
                                     thickness: 0.3}));
    }

    applyElectrodeStates(states) {
        return (_fp.forEach.convert({'cap': false})
                ((value, key) => {
                    this.device_view.shapes.shapeMeshes[key].material.opacity =
                        (value) ? 0.7 : 0.3;
                 }))(states);
    }

    setRoutes(df_routes) {
        this.routes = df_routes;
        if (this.device_view.circles_group) {
            this.device_view.resetCircleStyles();
            this.device_view.styleRoutes(this.routes.groupBy("route_i"));

            var f_route_geometries =
                (centers) => _fp.map((df_i) =>
                    THREELine2d.Line(this.centerCoordinates
                                     (df_i.get("electrode_i"))));
            var route_geometries =
                f_route_geometries(this.device_view.shapeCenters)
                (this.routes.groupBy("route_i"));
            var route_meshes = _.map(route_geometries,
                                     (geom) =>
                                     new THREE.Mesh(geom,
                                                    this.route_material));
            this.device_view.setRoutes(route_meshes);
        }
    }

    setDevice(device) {
        this.device = device;
        var shapes = dataFrameToShapes(this.device
                                        .df_shapes);
        styleShapes(shapes);
        this.device_view.setShapes(shapes);

        var min_median_extent = _.min(_.values(device.median_size));
        var radius = .5 * .5 * min_median_extent;
        this.device_view.setCircles(ThreeHelpers.f_circles(radius)
                                    (this.device_view.shapeCenters));
    }

    centerCoordinates(electrode_ids, centers=null) {
        centers = centers || this.device_view.shapeCenters;
        return _fp.pipe(_fp.at.convert({"rearg": false})(centers),
                        _fp.map(_fp.at(["x", "y"])))(electrode_ids);
    }

    listen(zmq_uri) {
        this.event_handler = new EventHandler(this.device_view);
        this.event_handler.listen();
        Key("escape", {el: this.device_view.three_widget.canvas},
            () => this.event_handler.abortQueuing());
        this.event_handler.on("execute-routes", (electrode_id) => {
            /* Send request to execute routes for the specified electrode (or
             * all routes if `electrode_id` is `null`) */
            var request =
              {"args": ["wheelerlab.droplet_planning_plugin", "execute_routes"],
               "kwargs": {electrode_id: electrode_id}};
            this.socket.emit("execute", request);
        });
        this.event_handler.on("clear-routes", (electrode_id) => {
            /* Send request to clear routes for the specified electrode (or all
             * routes if `electrode_id` is `null`) */
            const target = "wheelerlab.droplet_planning_plugin";
            this.socket.emit("execute", {args: [target, "clear_routes"],
                                         kwargs: {electrode_id:
                                                  electrode_id}});
            // Send request to get updated set of routes to refresh UI.
            this.socket.emit("execute", {args: [target, "get_routes"],
                                         kwargs: {}});
        });
        this.event_handler.on("set_electrode_state", (kwargs) => {
            // Send request to toggle state of clicked electrodes.
            var request =
              {"args":
               ["wheelerlab.electrode_controller_plugin",
                "set_electrode_state"],
               "kwargs": kwargs};
            this.socket.emit("execute", request);
        });
        this.event_handler.on("electrode_queue_updated", (electrode_ids) => {
            if (this.queue_mesh) {
                this.device_view.three_widget.scene.remove(this.queue_mesh);
            }
            var queue_geometry =
                THREELine2d.Line(this.centerCoordinates(electrode_ids),
                                 {distances: true});
            this.queue_mesh = new THREE.Mesh(queue_geometry,
                                             this.queue_material);
            this.device_view.three_widget.scene.add(this.queue_mesh);
        });
        this.event_handler.on("electrode_queue_finished", (electrode_ids) => {
            if (this.queue_mesh) {
                this.device_view.three_widget.scene.remove(this.queue_mesh);
            }
            if (!electrode_ids || electrode_ids.length < 0) {
                return;
            }
            // Send request to toggle state of clicked electrodes.
            var request =
              {"args":
               ["wheelerlab.droplet_planning_plugin", "add_route"],
               "kwargs": {"drop_route": electrode_ids}};
            this.socket.emit("execute", request);
        });
        this.event_handler.on("mouseover", (data) => {
            var circle_mesh = this.device_view.circles[data.electrode_id];
            if (!circle_mesh.material.visible) {
              circle_mesh.material.visible = true;
            }
        });
        this.event_handler.on("mouseout", (data) => {
            var circle_mesh = this.device_view.circles[data.electrode_id];
            if (circle_mesh.material.color ==
                ThreeHelpers.COLORS["light blue"]) {
              circle_mesh.material.visible = false;
            }
        });

        this.socket = io.connect(zmq_uri);

        this.refresh_device = () => {
            this.socket.emit("execute",
                             {"args": ["wheelerlab.device_info_plugin",
                                       "get_device"], "kwargs": {}})
        }
        this.device_view.menu.add(this, 'refresh_device');

        this.socket.on('connect', (msg) => this.refresh_device());

        this.socket.on('connect_error', (msg) => this.socket.close());

        this.socket.on('execute_reply', (msg) => {
            console.log("execute_reply", msg);
            var data = ZmqPlugin.decode_content_data({"content":
                                                      msg["response"]});
            if (data) {
              // Log execute_reply target, command, and reply data.
              _.spread(console.log)(_.concat(msg.request.args, [data]));
            }
        });

        this.socket.on('zmq', (msg) => {
            // A message was received from 0MQ hub subscription.
            var source = msg.header.source;
            var target = msg.header.target;
            var msg_type = msg.header.msg_type;

            var data;
            try {
                if ((source == 'wheelerlab.device_info_plugin') &&
                    (msg_type == 'execute_reply')) {
                    if (msg.content.command == 'get_device') {
                        // A plugin requested device configuration from device
                        // info plugin.
                        data = ZmqPlugin.decode_content_data(msg);
                        if (data) {
                            // Refresh local device configuration.
                            this.setDevice(new Device(data));
                        }
                    }
                } else if ((source ==
                            'wheelerlab.electrode_controller_plugin') &&
                        (msg_type == 'execute_reply')) {
                    if (['set_electrode_state', 'set_electrode_states']
                        .indexOf(msg['content']['command']) >= 0) {
                        // The state of one or more electrodes has changed.
                        data = ZmqPlugin.decode_content_data(msg);
                        var electrode_states = extractElectrodeStates(data);
                        this.applyElectrodeStates(electrode_states);
                    } else if (msg['content']['command'] ==
                            'get_channel_states') {
                        // A plugin has requested the state of all
                        // channels/electrodes.
                        data = ZmqPlugin.decode_content_data(msg);
                        var electrode_states = extractElectrodeStates(data);
                        this.applyElectrodeStates(electrode_states);
                    } else {
                        console.log('wheelerlab.electrode_controller_plugin',
                                    data);
                    }
                } else if ((source == 'wheelerlab.droplet_planning_plugin')
                        && (msg_type == 'execute_reply')) {
                    if (msg['content']['command'] == 'add_route') {
                        this.socket.emit("execute",
                                         {"args":
                                          ["wheelerlab" +
                                           ".droplet_planning_plugin",
                                           "get_routes"], "kwargs": {}});
                    } else if (msg['content']['command'] == 'get_routes') {
                        data = ZmqPlugin.decode_content_data(msg);
                        var df_routes = new DataFrame(data);
                        this.setRoutes(df_routes);
                    }
                } else {
                    this.socket.most_recent = msg;
                }
            } catch (e) {
                console.error('Error processing message from subscription socket.', e);
            }
        });
    }
}


class Device {
    constructor(json_device) {
        _.map(['df_shapes', 'df_shape_connections', 'df_electrode_channels'],
              (key) => { this[key] = new DataFrame(json_device[key]); });

        // Flip device shapes along x-axis.
        var y_column = this.df_shapes.columnPositions["y"];
        var getY = _fp.get(y_column);
        var setY = _.curry(_.set)(_, y_column);
        var max_y = _.max(_fp.map(getY)(this.df_shapes.values));
        var flipY = _fp.map((row) => setY(_.clone(row),
                                          max_y - getY(row)));
        this.df_shapes.values = flipY(this.df_shapes.values);

        this.electrode_ids_by_channel = _.map(this.df_electrode_channels
                                              .groupRecordsBy("channel"),
                                              _fp.map(_fp
                                                      .get("electrode_id")));
        this.channels_by_electrode_id =
            _.mapValues(this.df_electrode_channels
                        .groupRecordsBy("electrode_id"),
                        _fp.map(_fp.get("channel")));

        function boundingBox(xy_arrays) {
          function bounds(data) {
            var funcs = ["min", "max", "mean"];
            var result = _.zipObject(funcs, _.map(funcs, (f_ij) =>
                                                  _[f_ij](data)));
            result["length"] = result["max"] - result["min"];
            return result;
          }
          var f_xy_bounds = _fp.pipe(_fp.mapValues(bounds), _fp.at(["x", "y"]),
                                     _fp.zipObject(["x", "y"]));
          var xy_bounds = f_xy_bounds(xy_arrays);
          return {"x": xy_bounds.x.min, "x_center": xy_bounds.x.mean,
                  "width": xy_bounds.x.length,
                  "y": xy_bounds.y.min, "y_center": xy_bounds.y.mean,
                  "height": xy_bounds.y.length};
        }

        // Compute bounding box (including center) of each electrode shape.
        this.electrode_bounds = _.mapValues(this.df_shapes.groupBy("id"),
                                            (df_i) =>
                                            boundingBox(df_i.get(["x", "y"])));

        /*
         * Set radius of circles based on minimum of median x/median y
         * electrode size.
         */
        this.median_size = _.mapValues(ThreeHelpers.f_sizes(this
                                                            .electrode_bounds),
                                       ThreeHelpers.getMedian);
    }
}


class DeviceView {
    //constructor(canvasElement, controlHandlesElement, scene, camera, menu) {
    constructor(three_widget, menu) {
        // Allow canvas to receive focus.
        $(three_widget.canvas).attr("tabindex", 0);
        /* Set focus to canvas on click (enables, e.g., use of keyboard
         * shortcuts). */
        $(three_widget.canvas).on("mousedown", function () { this.focus(); });
        // Create and display stats widget (displays frames per second).
        this.stats = initStats();
        // Create `three.js` scene and plane with video from webcam.
        this.threePlane = new PlaneTransform(three_widget.scene,
                                             three_widget.camera,
                                             three_widget.renderer);

        // Create orbit controls to zoom, pan, etc.  Start at center of SVG
        // drawing.
        this.orbit = new OrbitControls(three_widget.camera,
                                       three_widget.renderer.domElement);
        this.orbit.reset();
        this.orbit.enableRotate = false;
        this.three_widget = three_widget;
        this.three_widget.on("onResize", () => this.orbit.reset())

        this.menu = menu;
        var transformFolder = this.menu.addFolder("Video");
        transformFolder.add(this, "display_anchors");
        transformFolder.add(this, "resetAnchors");
        transformFolder.add(this.threePlane, 'rotateRight');
        transformFolder.add(this.threePlane, 'rotateLeft');
        transformFolder.add(this.threePlane, 'flipHorizontal');
        transformFolder.add(this.threePlane, 'flipVertical');

        this.menu.add(this.orbit, 'enableRotate');
        this.menu.add(this.orbit, 'reset');

        _.extend(this, Backbone.Events);
    }

    update() {
        this.stats.update();
        this.orbit.update();
        this.threePlane.update();
    }

    resetShapes() {
        if (this.shapes) {
            this.three_widget.scene.remove(this.shapes.parentGroup);
            this.shapes = null;
        }
        if (this.mouseHandler) {
            // Unbind any attached mouse event handlers.
            this.mouseHandler.unbind();
        }
    }

    setRoutes(routes) {
        this.routes = routes;

        this.resetRoutes();
        this.routes_group = new THREE.Group();
        _.forEach(routes, (v) => this.routes_group.add(v));
        this.routes_group.position.z =
            1.05 * this.shapes.parentGroup.position.z;
        this.three_widget.scene.add(this.routes_group);
    }

    resetRoutes() {
        if (this.routes_group) {
            this.three_widget.scene.remove(this.routes_group);
            this.routes_group = null;
            this.routes = null;
        }
    }

    setCircles(circles) {
        this.circles = circles;

        this.circles_group = new THREE.Group();
        _.forEach(circles, (v) => this.circles_group.add(v));
        this.circles_group.position.z =
            1.1 * this.shapes.parentGroup.position.z;
        this.three_widget.scene.add(this.circles_group);
    }

    resetCircles() {
        if (this.circles_group) {
            this.three_widget.scene.remove(this.circles_group);
            this.circles_group = null;
            this.circles = null;
        }
    }

    resetCircleStyles() {
        ThreeHelpers.f_set_attr_properties(this.circles_group.children,
                                           "material",
                                           {opacity: 0.8, color: ThreeHelpers
                                            .COLORS["light blue"],
                                            visible: false});
        ThreeHelpers.f_set_attr_properties(this.circles_group.children,
                                           "scale", {x: 1, y: 1, z: 1});
    }

    styleRoutes(routes) {
        _fp.forEach((df_i) =>
            _.forEach(_.at(this.circles, df_i.get("electrode_i")),
                    (mesh_i, i) => {
                        var s = (i == df_i.size - 1) ? 1 : 0;
                        mesh_i.material.visible = true;
                        mesh_i.material.color = ThreeHelpers.COLORS["green"];
                        mesh_i.material.opacity = 0.4 + .6 * s;
                        mesh_i.scale.x = .5 + .5 * s;
                        mesh_i.scale.y = .5 + .5 * s;
                    }))(routes);
    }

    setShapes(shapes) {
        this.resetShapes();
        this.shapes = shapes;
        // Compute the center position (`THREE.Vector3`) of each shape.
        this.shapeCenters = _fp.flow(computeMeshBoundingBoxes,
                                     computeCenters)(shapes.shapeMeshes);

        initShapes(this.three_widget.scene, this.orbit, this.shapes);
        // Move the corners of the video plane to match the bounding box of all
        // the shapes.
        centerVideo(this.threePlane, this.shapes.boundingBox);

        var args = {element: this.three_widget.canvas,
                    shapes: this.shapes.shapeMeshes,
                    camera: this.three_widget.camera};
        // Create event manager to translate mouse movement and presses
        // high-level shape events.
        this.mouseHandler = new MouseEventHandler(args);

        // Notify that the shapes have been set.
        this.trigger("shapes-set", shapes);
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

    resetAnchors() {
        if (!this.anchors) return;

        this.threePlane.prev_anchor_array = [];
        this.anchors.positions = this.anchors.default_positions;
        this.threePlane.set_anchors(this.anchors.positions);
        this.threePlane.update_geometry_positions(this.anchors.positions);
        this.threePlane.updateCorners();
        this.threePlane.geometry.attributes.position.needsUpdate = true;
        this.threePlane.set_anchors(this.anchors.positions);
    }

    destroyVideoAnchors() {
        if (!this.display_anchors) return;

        console.log("destroyVideoAnchors");
        // Disable interaction with electrodes while adjusting anchors.
        this.mouseHandler.enable();
        this.anchors_handler.disable();
        this.anchors_handler = null;
        // Add anchor meshes to device view scene.
        this.three_widget.scene.remove(this.anchors.group)
    }

    adjustVideoAnchors() {
        if (this.display_anchors) return;

        // Disable interaction with electrodes while adjusting anchors.
        this.mouseHandler.disable();

        var anchors;

        if (!this.anchors) {
            var bounding_box = this.shapes.boundingBox;
            // Create new anchors (including THREE.Mesh instance for each
            // anchor).
            anchors = new Anchors(bounding_box);
        } else {
            anchors = this.anchors;
        }

        // Position anchor meshes above video and electrodes.
        anchors.group.position.z = 1.15 * this.shapes.parentGroup.position.z;
        // Add anchor meshes to device view scene.
        this.three_widget.scene.add(anchors.group)
        // Style the anchors (e.g., opacity, color).
        _fp.map(_.partialRight(_.set, "material.opacity", .8))(anchors.group.children);
        _fp.map((mesh) => mesh.material.color.setHex("0x00ff00"))(anchors.group.children);
        // Set name attribute of anchor meshes.
        _.forEach(anchors.shapes, (mesh, name) => { mesh.name = name; })

        // Register mouse event handler for anchors.
        this.anchors_handler =
            anchors.mouseEventHandler(this.three_widget.canvas,
                                      this.three_widget.camera);
        // Make anchors more transparent while mouse button is pressed.
        this.anchors_handler.on("mousedown", (x, y, intersect, event) => {
            _fp.map(_.partialRight(_.set, "material.opacity", .4))(anchors.group.children);
        });
        this.anchors_handler.on("mouseup", (x, y, intersect, event) => {
            _fp.map(_.partialRight(_.set, "material.opacity", .8))(anchors.group.children);
        });
        // Stretch video according to click and drag of any anchor.
        this.anchors_handler.on("mousemove", (x, y, intersect, event) => {
            var mesh = intersect.object;
            if (event.buttons == 1) {
                mesh.position.x = intersect.point.x;
                mesh.position.y = intersect.point.y;
                this.threePlane.set_anchors(anchors
                                                                    .positions);
            }
        });

        /* Move anchor position on video by holding shift while clicking and
         * dragging the anchor. */
        $(this.three_widget.canvas).on("keyup", (event) => {
            if (event.key == "Shift") {
                anchors.material.color.setHex("0x00ff00");
                this.threePlane.updatePos = true;
            }
        });
        $(this.three_widget.canvas).on("keydown", (event) => {
            if (event.key == "Shift") {
                anchors.material.color.setHex("0xff0000");
                this.threePlane.updatePos = false;
            }
        });
        this.anchors = anchors;
        return anchors;
    }

    get display_anchors() { return !(!this.anchors_handler); }
    set display_anchors(value) {
        if (value) { this.adjustVideoAnchors(); }
        else { this.destroyVideoAnchors(); }
    }
}


class Anchors {
    constructor(bounding_box) {
        this.bounding_box = bounding_box;
        this.radius = .05 * bounding_box.width;
        this.geometry = new THREE.CircleGeometry(this.radius, 64);
        this.material = new THREE.MeshBasicMaterial({transparent: true,
                                                     opacity: 0.8,
                                                     color: "red"});
        var corners = this.default_positions;
        this.centers = _fp.pipe(_fp.map(_fp.zipObject(["x", "y"])),
                                        _fp.values)(corners);
        // Create a circle `THREE.Mesh` for each control point, each circle
        // centered at the respective position.
        this.shapes = _fp.map(_.partialRight(ThreeHelpers.f_circle_at,
                                             this.radius, this.material,
                                             this.geometry))(this.centers);
        // Add control point meshes (i.e., circles) to Three.js group.
        this.group = new THREE.Group();
        this.group.name = "anchors";
        _fp.forEach((v) => this.group.add(v))(this.shapes);
    }

    get default_positions() {
        // Define center position for control points as the corners of the
        // bounding box.
        var bbox = this.bounding_box;
        return [[bbox.left, bbox.bottom],
                [bbox.left + bbox.width, bbox.bottom],
                [bbox.left, bbox.top],
                [bbox.left + bbox.width, bbox.top]];
    }

    mouseEventHandler(canvas_element, camera) {
        var args = {element: canvas_element,
                    shapes: this.shapes,
                    camera: camera};
        // Create event manager to translate mouse movement and presses
        // high-level shape events.
        return new MouseEventHandler(args);
    }

    get positions() {
        return _fp.map(_fp.pipe(_fp.at(["position.x", "position.y"]),
                                _fp.zipObject(["x", "y"])))(this.shapes);
    }

    set positions(positions) {
        _.forEach(positions, (p, i) => {
            this.shapes[i].position.x = p[0];
            this.shapes[i].position.y = p[1];
        });
    }
}
