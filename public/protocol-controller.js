class ProtocolController extends PluginController {
  constructor(elem, focusTracker) {
    super(elem, focusTracker, "ProtocolController");
    this.controls = this.Controls();
    this.data = new Array();
    this.schemas = new Object();
    this.table = null;
    this.listen();
  }

  // ** Listeners **
  listen() {
    // State Routes (Ties to Data Controllers used by plugin):
    this.addRoute("microdrop/put/protocol-controller/state/steps", this.onStepsUpdated.bind(this));
    this.addRoute("microdrop/put/protocol-controller/state/step-number", this.onStepNumberUpdated.bind(this));

    // Getters:
    this.addRoute("{*}/dmf-device-ui-plugin/schema", this.onDmfDeviceUISchemaUpdated.bind(this));
    this.addRoute("{*}/droplet-planning-plugin/schema", this.onDropletPlanningSchemaUpdated.bind(this));
    this.addRoute("{*}/mqtt-plugin/protocol-state", this.onProtocolStateChanged.bind(this));
    this.addRoute("{*}/mqtt-plugin/protocol-repeats-changed", this.onRepeatsChanged.bind(this));

    // Setters:
    this.addPostRoute("/update-step", "update");
    this.addPostRoute("/update-step-number", "update-step-number");
    this.addPostRoute("/delete-step", "delete-step");
    this.addPostRoute("/insert-step", "insert-step");
    this.addPostRoute("/change-protocol-state", "change-protocol-state");
    this.addPostRoute("/change-repeat", "change-repeat");

    // Local Updates
    this.on("mousedown", this.onMousedown.bind(this));
    this.on("prev-step-clicked", this.onPrevStepClicked.bind(this));
    this.on("next-step-clicked", this.onNextStepClicked.bind(this));
    this.on("play-clicked", this.onPlayClicked.bind(this));
    this.on("delete", this.onDelete.bind(this));
    D(this.element).on("mouseout", this.onMouseout.bind(this));
  }

  // ** Event Handlers (Between action and trigger) **
  onChangeStepNumber(number) {
    this.trigger("update-step-number", number);
  }

  onDelete(e) {
    this.trigger("delete-step", this.step);
  }

  onMouseout(e) {
    if (e.target != this.element) return;
  }

  onMousedown(msg) {
    window.msg = msg;
    if (msg.target.nodeName != "TD") return;
    const src     = this.table.column(msg.target).dataSrc();
    const schema  = this.schema[src]

    // If step not selected, change step and exit
    const step = this.table.row(msg.target)[0][0];
    if (step != this.step){
      this.onChangeStepNumber(step);
      return;
    }

    // XXX: Not all columns are part of schema, therefore can be undefined
    if (!schema) return;
    if (schema.type == "boolean") this.activateCheckbox(msg);
    if (schema.type == "number")  this.activateSpinner(msg);
  }

  onNextStepClicked(e) {
    const lastStep = this.data.length - 1;
    if (this.step == lastStep) this.trigger("insert-step", lastStep);
    if (this.step != lastStep) this.trigger("update-step-number", this.step+1);
  }

  onPlayClicked(e) {
    this.trigger("change-protocol-state", this.step);
  }

  onPrevStepClicked(e) {
    let prevStep;
    if (this.step == 0) prevStep = this.data.length -1;
    if (this.step != 0) prevStep = this.step-1;
    this.trigger("update-step-number", prevStep);
  }

  onRepeatChanged(msg) {
    const val = parseInt(msg.target.value);
    this.trigger("change-repeat", val);
  }

  onUpdate(key,val,stepNumber) {
    // const data = _.cloneDeep(this.data);
    // data[step][key] = val;
    this.trigger("update", {stepNumber: stepNumber, key: key, val: val});
  }

  onProtocolChanged(payload) {
    console.log("Protocol Changed!!");
    const protocol = JSON.parse(payload);
    const step_options = protocol.steps;
    this.updateSteps(step_options);
  }

  onStepNumberUpdated(payload) {
    this.step = payload;
  }

  onStepsUpdated(payload) {
    const steps = JSON.parse(payload);
    this.updateSteps(steps);
  }

  onRepeatsChanged(payload) {
    const val = JSON.parse(payload);
    this.repeats = val;
  }

  onProtocolStateChanged(payload){
    const state = JSON.parse(payload);
    if (state == "running") this.controls.playbtn.innerText = "Pause";
    if (state == "paused")  this.controls.playbtn.innerText = "Play";
  }

  onDropletPlanningSchemaUpdated(payload) {
    const schema = JSON.parse(payload);
    this.addSchema("droplet_planning_plugin", schema);
  }

  onDmfDeviceUISchemaUpdated(payload) {
    const schema = JSON.parse(payload);
    this.addSchema("dmf_device_ui_plugin", schema);
  }

  // ** Methods **
  activateCheckbox(msg) {
    const target_d = D(msg.target);
    const input_d  = D('<input type="checkbox">');
    const src      = this.table.column(msg.target).dataSrc();

    // Wrap tabel cell in checkbox:
    const previous_val = JSON.parse(target_d.innerText);
    target_d.empty();
    if (previous_val)  input_d.setAttribute("checked", true);
    if (!previous_val) input_d.removeAttribute("checked");
    target_d.appendChild(input_d.el);

    input_d.on("blur", () => {
      // When out of focus, unwrap cell, and modify data
      const new_val = input_d.el.checked;
      input_d.off();
      target_d.empty();
      this.onUpdate(src, new_val, this.step);
    });

  }

  activateSpinner(msg) {
    const target_d = D(msg.target);
    const input_d  = D('<input type="number">');
    const src      = this.table.column(msg.target).dataSrc();
    const schema   = this.schema[src]

    // Wrap tabel cell in textfield:
    const previous_val = target_d.innerText;
    target_d.empty();
    input_d.value = previous_val;

    if (schema.minimum !== undefined)
      input_d.setAttribute("min", schema.minimum)
    if (schema.maximum !== undefined)
      input_d.setAttribute("max", schema.maximum)

    target_d.appendChild(input_d.el);

    input_d.on("blur", () => {
      // When out of focus, unwrap cell, and modify data
      const new_val = JSON.parse(input_d.value);
      input_d.off();
      target_d.empty();
      this.onUpdate(src, new_val, this.step);
    });

    // XXX: Setting focus immediately doesn't work (wait 100ms)
    setTimeout(() => input_d.focus(), 100);
  }

  addSchema(key,data){
    this.schemas[key] = data;
    this.table = this.Table();
  }

  addStep() {
    const len = this.columns.length;
    const row = _.zipObject(this.columns, new Array(len).join(".").split("."));

    this.table.row.add(row);
    this.table.draw();
  }

  createDatatablesHeader(v,k) {
    // Get DataTables header based on schema entry
    // TODO: add more keys like type, width, etc
    return {title: k, data: k};
  }

  // ** Getters and Setters **
  get styles() {
    const styles = new Object();
    styles.unselected = {background: "white", color: "black", width: "auto"};
    styles.selected   = {background: "#22509b", color: "white", width: "auto"};
    styles.label = {"font-size": "13px", "margin": "0px 5px"};
    return styles;
  }

  get step() {
    const row = D('tr', this.table.table().node()).filter(div => {
      return div.style.color == "white"
    });
    if (row[0])  return this.table.row(row)[0][0];
    if (!row[0]) return null;
  }

  set step(number) {
    const table_d = D(this.table.table().node());
    const rows    = D('tr', table_d);
    // If row undefined then add step
    if (this.table.row(number).node() == null) {
      console.warn("Attempted to set step beyond table size, creating new step");
      this.addStep();
    }
    // Change selected step
    const row_d  = D(this.table.row(number).node());
    rows.forEach((i)=> D(i).setStyles(this.styles.unselected));
    row_d.setStyles(this.styles.selected);
  }

  get columns() {
    const schema = this.schema;
    return _.concat(["step"], _.keys(schema));
  }

  get headers() {
    const schema = this.schema;
    const headers = _.map(schema, this.createDatatablesHeader);
    const stepHeader = this.createDatatablesHeader(null, "step");
    // XXX: Manually placing step column at first index (so that the table
    //      sorts by the this column by default):
    return _.concat([stepHeader], headers);
  }

  get schema() {
    // Get total schema (from all schemas)
    const schema = new Object();
    _.each(_.values(this.schemas), (s) => {_.extend(schema,s)});
    return schema;
  }

  set repeats(val) {
    const field = this.controls.repeatField;
    field.setAttribute("value", val);
  }

  // ** Updaters **
  updateSteps(step_options){
    const step_count = step_options.length;
    const data_count = this.data.length;

    // If rows have been removed, remove them from data:
    if (data_count - step_count > 0){
      this.data = _.slice(this.data, 0,step_count);
      _.each(_.range(step_count,data_count), () => {
        this.table.row().remove();
      });
    }

    // Update data with modified schema values
    _.each(step_options, (step,i) => {
      if (!this.data[i]) this.data[i] = new Object();
      const options = _.assign.apply(_, _.values(step));
      _.each(options, (v,k) => this.data[i][k] = v);
      const data = _.extend({step: i}, this.data[i]);
      this.data[i] = data;
    });

    // Update step with new step options
    this.updateTable();
  }

  updateRow(step_options, step_number){
    const numberOfColumns = this.table.columns().header().length;
    const arr  = _.map(new Array(numberOfColumns), _.constant(""));
    const data = _.zipObject(this.columns, arr);

    if (step_number > this.table.rows().count()){
      console.error("Number of rows less than step number.");
      return;
    } else if (step_number == this.table.rows().count()){
      this.table.row.add(data);
    }
    _.extend(data, step_options);
    this.table.row(step_number).data(data).draw();
  }

  updateTable() {
    _.each(this.data, this.updateRow.bind(this));
  }

  // ** Initializers **
  Controls() {
    const controls = new Object();

    controls.leftbtn  = D("<button type='button'>Prev</button>");
    controls.playbtn  = D("<button type='button'>Play</button>");
    controls.rightbtn = D("<button type='button'>Next</button>");
    controls.repeatLabel = D("<label for='repeatCount'>Number of Repeats:</label>");
    controls.repeatField = D("<input type='number' id='repeatCount' min='1' value='1' />");
    controls.repeatLabel.setStyles(this.styles.label);

    controls.leftbtn.on("click", event => this.trigger("prev-step-clicked",event));
    controls.playbtn.on("click", event => this.trigger("play-clicked",event));
    controls.rightbtn.on("click", event => this.trigger("next-step-clicked",event));
    controls.repeatField.on("blur", event => this.onRepeatChanged(event));

    this.element.appendChild(controls.leftbtn.el);
    this.element.appendChild(controls.playbtn.el);
    this.element.appendChild(controls.rightbtn.el);
    this.element.appendChild(controls.repeatLabel.el);
    this.element.appendChild(controls.repeatField.el);

    return controls;
  }

  Table() {
    let columns;

    // remove, and recreate table
    if (this.table) {
      const node = this.table.table().node();
      this.table.destroy();
      this.element.removeChild(node);
    }

    // Create dom element to house datatable
    const elem = D("<table></table>");
    elem.setStyles({"font-size": "13px"});
    elem.addClasses("cell-border compact hover");
    elem.on("mousedown", event => this.trigger("mousedown", event));

    // Display options for datatable:
    const options = new Object();
    options.columns = this.headers;
    options.info = false;
    options.ordering = false;
    options.searching = false;
    options.paginate = false;

    // Initialize datatable
    const table_jq = $(elem[0]);
    table_jq.appendTo(this.element);

    return table_jq.DataTable(options);
  }

}
