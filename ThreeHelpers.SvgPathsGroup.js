var ThreeHelpers = ThreeHelpers || {};

var two = two || new Two({type: Two.Types['svg']});


ThreeHelpers.drawShapes = function (jq_selection, fillOptions, lineOptions) {
    /*
     * Create a three.js group object for element in the selection.
     *
     * Args
     * ----
     *
     *     jq_selection (jQuery selection) : Selection specifying which
     *         shapes to process.  Each shape must be compatible with
     *         the `Two.interpret` method.
     *
     * Returns
     * -------
     *
     *     (object) : Array-like object containing three.js shape
     *         objects.
     *
     */
    lineOptions = lineOptions || {color: 0x333333, linewidth: 1};
    fillOptions = fillOptions || {color: 0xffffff, wireframe: false};
    return jq_selection.map(function () {
        var shape2d = two.interpret(this);
        shape2d.visible = false;
        var shape3d = ThreeHelpers.extractShape(shape2d);

        var points = shape3d.createPointsGeometry();
        var material = new THREE.LineBasicMaterial(lineOptions);
        var outline = new THREE.Line(points, material);

        var group = new THREE.Group();
        var meshMaterial = new THREE.MeshBasicMaterial(fillOptions);
        var geometry = new THREE.ShapeGeometry(shape3d);

        var fill = new THREE.Mesh(geometry, meshMaterial);
        shape3d.autoClose = true;
        group.add(fill);
        group.add(outline);
        return group;
    });
}

ThreeHelpers.extractShape = function (twojs_shape) {
  /*
   * Args
   * ----
   *
   *     twojs_shape (two.js shape) : two.js shape.
   *
   * Returns
   * -------
   *
   *     (THREE.Shape) : three.js shape.
   *
   */
  var shape = new THREE.Shape();

  for (var i = 0; i < twojs_shape.vertices.length; i++) {
    var vert = twojs_shape.vertices[i];
    var prev = twojs_shape.vertices[i - 1];

    switch (vert._command) {

      case Two.Commands.move:
        shape.moveTo(vert.x, vert.y);
        break;

      case Two.Commands.line:
        shape.lineTo(vert.x, vert.y);
        break;

      case Two.Commands.curve:
        shape.bezierCurveTo(
          prev.controls.right.x + prev.x,
          prev.controls.right.y + prev.y,
          vert.controls.left.x + vert.x,
          vert.controls.left.y + vert.y, vert.x, vert.y
        );
        break;

      case Two.Commands.close:
        shape.closePath();
        break;
    }

  }

  return shape;
}

ThreeHelpers.SvgPathsGroup = function (jq_selection) {
    /*
     * Args
     * ----
     *
     *     jq_selection (jQuery selection) : Selection specifying which
     *         shapes to process.  Each shape must be compatible with
     *         the `Two.interpret` method.
     *
     * Returns
     * -------
     *
     *     (THREE.Group) : Group containing a sub-group for each SVG path in
     *     `jq_selection`.
     *
     */

    shapes = ThreeHelpers.drawShapes(jq_selection);

    // Create three.js group, add shapes to group.
    shapesGroup = new THREE.Group();
    $.each(shapes, function (i, shape) { shapesGroup.add(shape); })
    return shapesGroup;
}

ThreeHelpers.SvgGroup = function (svgImages) {
    var self = this;
    /*
     * Replace `<img>` tags having `"inject-me"` CSS class with
     * corresponding `<svg>` element.
     */

    // Elements to inject
    self.svgImages = svgImages;
    self.injectedSvgs = [];

    self.load = function () {
        // Options
        var injectorOptions = {
          evalScripts: 'once',
          each: function (svg) {
            // Callback after each SVG is injected
            self.injectedSvgs.push(svg.getAttribute('id'));
            self.shapesGroup = new ThreeHelpers.SvgPathsGroup($(svg).find("g > path"));

            var shape = two.interpret($(svg)[0]);
            self.bounding_box = shape.getBoundingClientRect();
            self.center = new THREE.Vector3(self.bounding_box.left + .5 *
                                            self.bounding_box.width,
                                            self.bounding_box.top + .5 *
                                            self.bounding_box.height, 0);

            self.trigger("loaded", svg, self.shapesGroup, self);
          }
        };

        // Trigger the injection
        SVGInjector(self.svgImages, injectorOptions,
                    function (totalSVGsInjected) {});
    }
    _.extend(self, Backbone.Events);
}


ThreeHelpers.verticesToShape = function (vertices) {
  /*
   * Args
   * ----
   *
   *     vertices (Array) : Array of vertex objects, each with at least the
   *         properties `x` and `y`.
   *
   * Returns
   * -------
   *
   *     (THREE.Shape) : three.js shape.
   *
   */
  var shape = new THREE.Shape();

  var vert = vertices[0];
  shape.moveTo(vert.x, vert.y);

  for (var i = 1; i < vertices.length; i++) {
    vert = vertices[i];

    shape.lineTo(vert.x, vert.y);
  }

  return shape;
}


ThreeHelpers.shapesById = function(df_i) {
    /*
     * Args
     * ----
     *
     *     df_i (DataFrame) : Data frame containing at least the columns `id`,
     *         `vertex_i`, `x`, and `y`, where each row corresponds to a single
     *         vertex for shape identified by `id`.
     *
     * Returns
     * -------
     *
     *     (Object) : Mapping from each shape `id` to a corresponding
     *         `THREE.Shape`.
     */
    return _fp.mapValues(_fp.flow(_fp.sortBy("vertex_i"),
                                  ThreeHelpers
                                  .verticesToShape))(df_i.groupBy("id"));
}


function boundingBox(df_i) {
    var xyStats_i = df_i.pick(["x", "y"]).describe()
    var bbox_i = _.fromPairs(_.zip(["width", "height"], _fp.at(["x", "y"])
                                   (_fp.mapValues(
                                       _fp.flow(_fp.at(["max", "min"]),
                                                _.spread(_.subtract)))
                                    (xyStats_i))));
    bbox_i.top = xyStats_i.y.min;
    bbox_i.left = xyStats_i.x.min;
    bbox_i.bottom = bbox_i.top + bbox_i.height;
    bbox_i.right = bbox_i.left + bbox_i.width;
    return bbox_i;
}


var shapeGroup = function (shape, lineOptions, fillOptions) {
    lineOptions = lineOptions || {color: 0x333333, linewidth: 1};
    fillOptions = fillOptions || {color: 0xffffff, wireframe: false};

    var points = shape.createPointsGeometry();
    var material = new THREE.LineBasicMaterial(lineOptions);
    var outline = new THREE.Line(points, material);

    var group = new THREE.Group();
    var meshMaterial = new THREE.MeshBasicMaterial(fillOptions);
    var geometry = new THREE.ShapeGeometry(shape);

    var fill = new THREE.Mesh(geometry, meshMaterial);
    shape.autoClose = true;
    group.add(fill);
    group.add(outline);
    return group;
}
