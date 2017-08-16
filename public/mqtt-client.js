class MQTTClient {
  constructor(name="web-ui") {
    _.extend(this, Backbone.Events);
    _.extend(this, crossroads.create());

    this.client = this.Client();
    // XXX: ignoreState variable used internally by crossroads
    this.ignoreState = true;
  }

  addPostRoute(topic, event, retain=false, qos=0, dup=false){
    // TODO: Have different front end clients post to different channels
    // const channel = "microdrop/"+this.name;
    const channel = "microdrop/dmf-device-ui";
    this.on(event, (d) => this.sendMessage(channel+topic, d, retain, qos, dup));
  }

  sendMessage(topic, payload, retain=false, qos=0, dup=false){
    const message = this.Message(topic,payload,retain,qos,dup);
    this.client.send(message);
  }

  // ** Getters and Setters **
  get name() {
    return this.constructor.name;
  }

  // ** Event Handlers **
  onConnect() {
    // MQTT Callback after establishing brocker connection
    this.client.subscribe("microdrop/#");
    console.log("Subscribed to client...");
  }

  onMessageArrived(msg) {
    console.log(this.name + " : " + msg.destinationName);
    this.parse(msg.destinationName, [msg.payloadString]);
  }

  // ** Initializers **
  Client() {
    const client = new Paho.MQTT.Client("localhost", 8083, name);
    client.onMessageArrived = this.onMessageArrived.bind(this);
    client.connect({onSuccess: this.onConnect.bind(this)});
    return client;
  }

  Message(topic, msg, retain=false, qos=0, dup=false){
    const message = new Paho.MQTT.Message(JSON.stringify(msg));
    message.destinationName = topic;
    message.retain = retain;
    message.qos = qos;
    message.duplicate = dup;
    return message;
  }

}
