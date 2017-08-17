class ExperimentController extends PluginController {
  constructor(elem, focusTracker){
    super(elem, focusTracker, "Experiment Controller");
    this.controls = this.Controls();
    this.listen();
  }

  // ** Event Listeners **
  listen() {
    this.addRoute("microdrop/{*}/protocols", this.onGetProtocols.bind(this));
    this.addRoute("microdrop/{*}/protocol-swapped", this.onProtocolSwapped.bind(this));
    this.addPostRoute("/save-protocol", "save");
    this.addPostRoute("/change-protocol", "change-protocol");
    this.addPostRoute("/delete-protocol", "delete-protocol");
    this.on("item-clicked", this.onItemClicked.bind(this));
    this.on("delete", this.onDelete.bind(this));
  }

  // ** Getters and Setters **
  get protocols() {
    return this._protocols;
  }

  set protocols(protocols) {
    this._protocols = protocols;
    if (!this.protocol)
      this.trigger("change-protocol", _.last(this._protocols));
    this.list = this.List(this._protocols);
  }

  get protocol() {
    return this._protocol;
  }

  set protocol(protocol) {
    this._protocol = protocol;
    this.list = this.List(this.protocols);
  }

  get list() {
    return this._list;
  }

  set list(list) {
    const prevList = this._list;

    // Set
    this._list = list;
    if (list) return;

    // Delete
    const node = prevList.el;
    this.element.removeChild(node);
    this._list = undefined;
    return;
  }

  get style() {
    const style = new Object();
    const border = "1px solid black";
    const highlight = "rgb(34, 80, 155)";
    style.ul = {"list-style": "none", padding: 0};
    style.li_inactive = {border: border};
    style.li_active = {border: border, background: highlight, color: "white"};
    return style;
  }

  get time() {
    return new Date(new Date().getTime()).toLocaleString();
  }

  // ** Event Handlers **
  onDelete(){
    this.trigger("delete-protocol", this.protocol);
    this.protocol = undefined;
  }

  onDuplicate(msg){
    const name = "Protocol: " + this.time;
    this.trigger("save", name);
  }

  onGetProtocols(msg) {
    this.protocols = JSON.parse(msg);
  }

  onItemClicked(protocol) {
    this.trigger("change-protocol", protocol);
  }

  onProtocolSwapped(msg){
    this.protocol = JSON.parse(msg);
  }

  onSave(msg){
    this.trigger("save", this.protocol.name);
  }

  // ** Initializers **
  Controls() {
    const controls   = new Object();
    controls.savebtn = D("<button type='button'>Save</button>");
    controls.dupbtn = D("<button type='button'>Duplicate</button>");

    controls.savebtn.on("click", this.onSave.bind(this));
    controls.dupbtn.on("click", this.onDuplicate.bind(this));

    this.element.appendChild(controls.savebtn.el);
    this.element.appendChild(controls.dupbtn.el);

    return controls;
  }

  Item(protocol, i) {
    const item = D("<li><li>");
    let style;

    item.innerText = protocol.name;
    item.on("click", () => this.trigger("item-clicked", protocol));

    if (!this.protocol) return item;

    if (protocol.name == this.protocol.name) style = this.style.li_active;
    if (protocol.name != this.protocol.name) style = this.style.li_inactive;
    item.setStyles(style);
    return item;
  }

  List(protocols) {
    const style = this.style.ul;
    // Delete previous list
    if (this.list) this.list = undefined;

    // Append items to list
    const list = D("<ul></ul>");
    list.setStyles(style);
    protocols.forEach((protocol,i) => {
      list.appendChild(this.Item(protocol,i).el);
    });

    // Add list to DOM
    this.element.appendChild(list.el);
    return list;
  }

}
