
module.exports = function(RED) {
    "use strict";
    var _googleActionServer = require("@manekinekko/google-actions-server");


    function GoogleActionIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        node.port = n.port || 1881;

        // create a google action server
        this.agent = new _googleActionsServer.ActionServer(port=node.port);

        this.agent.welcome((assistant) => {
            agent.ask('What is your command');
        });


        agent.intent(ActionServer.intent.action.MAIN, (assistant) => {

            // reads the user's request
            var msg = {topic:node.topic, intent:'MAIN', payload:assistant.getRawInput(), _assistant:assistant };
            node.send(msg);

        });


        agent.intent(ActionServer.intent.action.TEXT, (assistant) => {

            // reads the user's request
            var msg = {topic:node.topic, intent: 'TEXT', payload:assistant.getRawInput(), _assistant:assistant};
            node.send(msg);

        });

        // start listening for commands
        agent.listen();
    }
    RED.nodes.registerType("googleAction in",GoogleActionIn);


    function GoogleActionOut(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        this.on("input",function(msg) {

            if (msg._assistant) {
                msg._assistant.tell(msg.payload);
            } else {
                node.warn(RED._("httpin.errors.no-response"));
            }
        });
    }
    RED.nodes.registerType("googleAction response",GoogleActionOut);
}
