const IsJsonString = (str) => {
  try { JSON.parse(str);} catch (e) {return false;}
  return true;
}

String.prototype.replaceAll = function(str1, str2, ignore){
  return this.replace(new RegExp(str1.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|\<\>\-\&])/g,"\\$&"),(ignore?"gi":"g")),(typeof(str2)=="string")?str2.replace(/\$/g,"$$$$"):str2);
}

class MQTTClient {
  constructor(name="web-ui") {
    _.extend(this, Backbone.Events);
    _.extend(this, crossroads.create());

    this.client = this.Client();
    this.subscriptions = new Array();

    // XXX: ignoreState variable used internally by crossroads
    this.ignoreState = true;
  }

  addGetRoute(topic, method) {
    this.subscriptions.push(topic.replaceAll("{*}", "#"));
    this.addRoute(topic, method);
  }

  addPostRoute(topic, event, retain=false, qos=0, dup=false){
    // TODO: Have different front end clients post to different channels
    // const channel = "microdrop/"+this.name;
    this.on(event, (d) => this.sendMessage(this.channel+topic, d, retain, qos, dup));
  }

  sendMessage(topic, payload, retain=false, qos=0, dup=false){
    const message = this.Message(topic,payload,retain,qos,dup);
    this.client.send(message);
  }

  // ** Getters and Setters **
  get name() {
    return this.constructor.name;
  }

  get channel() {
    return  "microdrop/dmf-device-ui";
  }

  // ** Event Handlers **
  onConnect() {
    // MQTT Callback after establishing brocker connection
    _.each(this.subscriptions, (str) => {this.client.subscribe(str)});
  }

  onMessageArrived(msg) {
    const receiver = this.name + " : " + msg.destinationName;
    const payloadIsValid = IsJsonString(msg.payloadString);

    // console.log(receiver);
    if (payloadIsValid)  this.parse(msg.destinationName, [msg.payloadString]);
    if (!payloadIsValid) console.error("Could not parse message for " + receiver);
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
