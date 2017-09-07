class ProtocolExecutionUI extends PluginController {
  constructor(element, focusTracker) {
    super(element, focusTracker, "ProtocolExecutionUI");
    this.executablePlugins = new Backbone.Model();
    this.maxWaitTime = 10000;
    this.running = false;
    this.stepNumber = null;
    this.steps = null;
    this.controls = this.Controls();
    this.listen();
  }
  // ** Event Listeners **
  listen() {
    this.on("change-max-wait-time", this.onChangeMaxWaitTime.bind(this));
    this.on("reached-max-wait-time", this.onReachedMaxWaitTime.bind(this));
    this.on("refresh-executable-plugins", this.onRefreshExecutablePlugins.bind(this));
    this.on("run-experiment", this.onRunExperiment.bind(this));
    this.on("stop-experiment", this.onStopExperiment.bind(this));
    this.executablePlugins.on("all", this.onExecutablePluginsUpdated.bind(this));

    this.addGetRoute("microdrop/put/protocol-controller/state/steps", this.onStepsUpdated.bind(this));
    this.addGetRoute("microdrop/put/protocol-controller/state/step-number", this.onStepNumberUpdated.bind(this));
    this.addGetRoute("microdrop/{pluginName}/executable-plugin-found", this.onExecutablePluginFound.bind(this));
    this.addGetRoute("microdrop/{pluginName}/step-complete", this.onStepComplete.bind(this));

    this.addPostRoute("/find-executable-plugins", "find-executable-plugins");
    this.addPostRoute("/update-step-number", "update-step-number");
    this.addPostRoute("/run-step", "run-step");
  }
  // ** Getters and Setters **
  get channel() {return  "microdrop/protocol-execution-ui"};
  get controls() {return this._controls}
  set controls(controls) {
    if (this.controls) this.element.removeChild(this.controls);
    if (controls) this.element.appendChild(controls);
    this._controls = controls;
  }
  get list() {return this._list}
  set list(list) {
    if (this.list) this.element.removeChild(this.list);
    if (list) this.element.appendChild(list);
    this._list = list;
  }
  // ** Methods **
  changeStep() {
    if (this.stepNumber == this.steps.length-1) {
      this.trigger("refresh-executable-plugins", null);
      return;
    }
    this.trigger("update-step-number", this.stepNumber+1);
  }
  // ** Event Handlers **
  onExecutablePluginFound(payload, pluginName) {
    if (this.executablePlugins.has(pluginName)) return;
    this.executablePlugins.set(pluginName, this.stepNumber || 0);
  }
  onExecutablePluginsUpdated(eventName){
    const plugins = Object.entries(this.executablePlugins.attributes)
    this.list = this.List(plugins);
  }
  onChangeMaxWaitTime(value) {this.maxWaitTime = value}
  onReachedMaxWaitTime(step) {
    if (!this.running) return;
    // Check if any plugins still on this step:
    const plugins = Object.entries(this.executablePlugins.attributes);
    const deadPlugins = plugins.filter(([,s])=>s==step);
    for (const [pluginName,] of deadPlugins){
      console.error(`Max time reached for plugin: ${pluginName}`);
      this.executablePlugins.unset(pluginName);
      this.trigger("update-step-number", step+1);
    }
  }
  onStepComplete(payload, pluginName) {
    this.executablePlugins.set(pluginName, this.stepNumber+1);
    const stepCompleted = !this.executablePlugins.values().includes(this.stepNumber);
    // Ensure that all plugins have completed before progressing:
    if (stepCompleted) this.changeStep();
  }
  onStepsUpdated(payload) {
    this.steps = JSON.parse(payload);
  }
  onStepNumberUpdated(payload) {
    this.stepNumber = JSON.parse(payload);
    this.executablePlugins.trigger("change");
    if (this.running) {
      this.trigger("run-step", this.steps[this.stepNumber]);
      const step = this.stepNumber;
      setTimeout(()=>{this.trigger("reached-max-wait-time", step)}, this.maxWaitTime);
    }
    if (!this.running) this.trigger("refresh-executable-plugins", null);
  }
  onStopExperiment() {
    this.running = false;
    this.executablePlugins.trigger("change");
  }
  onRefreshExecutablePlugins() {
    this.running = false;
    this.executablePlugins.clear();
    this.trigger("find-executable-plugins", null);
  }
  onRunExperiment() {
    this.running = true;
    this.trigger("update-step-number", this.stepNumber || 0);
  }
  // ** Initializers **
  Controls() {
    const btnClasses = 'btn btn-sm';
    const controls = D("<div></div>").el;
    const getExecutablePluginsBtn = D(`
      <button class='${btnClasses} btn-info'>Refresh Executables</button>`);
    const runExperimentBtn  = D(`
      <button class='${btnClasses} btn-primary'>&#9654;</button>`);
    const stopExperimentBtn = D(`
      <button class='${btnClasses} btn-secondary'>&#9724;</button>`);
    const maxWaitTimeField  = D(`
      <input type='number' value='${this.maxWaitTime}' style='width: 100px'/>`);
    console.log(maxWaitTimeField);
    getExecutablePluginsBtn.on("click", () => this.trigger("refresh-executable-plugins"));
    runExperimentBtn.on("click", () => this.trigger("run-experiment"));
    stopExperimentBtn.on("click", () => {this.trigger("stop-experiment")});
    maxWaitTimeField.on("change", () => {this.trigger("change-max-wait-time", maxWaitTimeField.value)});

    controls.appendChild(getExecutablePluginsBtn.el);
    controls.appendChild(runExperimentBtn.el);
    controls.appendChild(stopExperimentBtn.el);
    controls.appendChild(maxWaitTimeField.el);

    return controls;
  }
  List(plugins) {
    const list = D("<ul class='list-group'></ul>");
    for (const [pluginName, step] of plugins) {
      const item = D(`<i class='list-group-item'>${pluginName} ${step}</i>`);
      list.appendChild(item.el);
      if (step == this.stepNumber) item.setStyles({background: "#fff4bc"});
      if (step != this.stepNumber) item.setStyles({background: "#c3f7b2"});

      if (!this.running) item.setStyles({background: "white"});
    }
    return list.el;
  }

  // ** Static Methods **
  static Widget(panel, dock, focusTracker) {
    /* Add plugin to specified dock panel */
    const widget = new PhosphorWidgets.TabPanel();
    const content = D(`
      <div class='content'
        style='display:block;padding:10px;width:100%;height:100%'>
      </div class='card'>
    `).el;
    widget.node.appendChild(content);
    const plugin = new this(content,focusTracker);
    widget.title.label = plugin.name;
    widget.title.closable = true;
    panel.addWidget(widget,  {mode: "tab-before", ref: dock});
    panel.activateWidget(widget);
    return widget;
  }

  static position() {
    /* topLeft, topRight, bottomLeft, or bottomRight */
    return "bottomRight";
  }
}

if (!window.microdropPlugins) window.microdropPlugins = new Map();
window.microdropPlugins.set("ProtocolExecutionUI", ProtocolExecutionUI);
