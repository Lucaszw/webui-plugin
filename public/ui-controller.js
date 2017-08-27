class UIController extends MQTTClient {
  constructor() {
    super("UIController");
    this.listen();
  }

  listen() {
    this.addRoute("microdrop/device-info-plugin/device-swapped", this.device_swapped.bind(this));
    this.addRoute("microdrop/electrode-controller-plugin/get-channel-states", this.get_channel_states.bind(this));
    this.addRoute("microdrop/put/dmf-device-ui/state/electrodes", this.onElectrodeStatesSet.bind(this));
    this.addRoute("microdrop/put/dmf-device-ui/state/routes", this.onUpdateRoutes.bind(this));
  }

  device_swapped(payload) {
    let data, device, electrode_states;
    data = JSON.parse(payload);
    device = new Device(data);
    device_ui_plugin.setDevice(device);
    window.data = data;
    window.device = device;
  }

  get_channel_states(payload) {
    console.log("GETTING CHANNEL STATES!!!");
    console.log(JSON.parse(payload));
    
    // TODO: implement channel_states, and actuated_area
    let data, electrode_states, channel_states, actuated_area;
    data = JSON.parse(payload);
    electrode_states = extractElectrodeStates(data);
    _.each(this.electrode_states, (v,k) => {this.electrode_states[k] = false});

    this.electrode_states = _.extend(this.electrode_states, electrode_states);
    device_ui_plugin.applyElectrodeStates(this.electrode_states);
  }

  onElectrodeStatesSet(payload) {
    let data, electrode_states;
    data = JSON.parse(payload);
    // XXX: Should be more consistent between having electrode_states key or not
    //      in mqtt messaging
    this.electrode_states = extractElectrodeStates({electrode_states: data});
    device_ui_plugin.applyElectrodeStates(this.electrode_states);
  }

  onUpdateRoutes(payload) {
    let data, df_routes;
    data = JSON.parse(payload);
    df_routes = new DataFrame(data);
    device_ui_plugin.setRoutes(df_routes);
  }

}
