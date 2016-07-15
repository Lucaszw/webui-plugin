var ThreeHelpers = ThreeHelpers || {};

ThreeHelpers.MouseEventHandler = function (options) {
    var self = this;

    self.options = options;
    self.mouse = new THREE.Vector2();
    self.raycaster = new THREE.Raycaster();
    self.activeShape = null;

    self.onMouseMove = function (event) {
        // Translate event coordinate from DOM space ([0, width], [0, height])
        // to GL space ([-1, 1], [-1, 1]).
        self.mouse.x = ((event.offsetX / self.options.element.width()) * 2
                        - 1);
        self.mouse.y = (-(event.offsetY / self.options.element.height()) *
                        2 + 1);

        // Adjust ray caster vector based on current camera position.
        self.raycaster.setFromCamera(self.mouse, self.options.camera);

        // Find all SVG paths that intersect with ray caster vector.
        var intersects = self.raycaster.intersectObjects(self.options
                                                         .shapes);
        if (intersects.length > 0) {
            var shape_i = intersects[0];
            var activeGeometryId = ((self.activeShape == null) ? null :
                                    self.activeShape.object.geometry.id);
            var shapeGeometryId = shape_i.object.geometry.id;
            if (activeGeometryId != shapeGeometryId) {
                if (self.activeShape) {
                    self.trigger("mouseout", self.mouse.x, self.mouse.y,
                                 self.activeShape);
                }
                self.activeShape = shape_i;
                self.trigger("mouseover", self.mouse.x, self.mouse.y,
                             shape_i);
            }
            self.trigger("mousemove", self.mouse.x, self.mouse.y, shape_i);
        } else if (self.activeShape) {
            var shape_i = self.activeShape;
            self.activeShape = null;
            self.trigger("mouseout", self.mouse.x, self.mouse.y, shape_i);
        }
    }

    self.onMouseDown = function (event) {
        // Translate event coordinate from DOM space ([0, width], [0, height])
        // to GL space ([-1, 1], [-1, 1]).
        self.mouse.x = ((event.offsetX / self.options.element.width()) * 2
                        - 1);
        self.mouse.y = (-(event.offsetY / self.options.element.height()) *
                        2 + 1);

        // Adjust ray caster vector based on current camera position.
        self.raycaster.setFromCamera(self.mouse, self.options.camera);

        // Find all SVG paths that intersect with ray caster vector.
        var intersects = self.raycaster.intersectObjects(self.options
                                                         .shapes);
        if (intersects.length > 0) {
            // SVG path was clicked.
            self.trigger("clicked", self.mouse.x, self.mouse.y, intersects);
        }
    }

    self.options.element.on('click', self.onMouseDown);
    self.options.element.on('mousemove', self.onMouseMove);
    _.extend(self, Backbone.Events);
};
