
module.exports = function(RED) {
    "use strict";
    import { ActionServer } from '@manekinekko/google-actions-server';

    function GoogleActionIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        node.port = n.port || 1881;

        // create a google action server
        this.agent = new ActionServer(node.port);

        this.agent.welcome((assistant) => {
            this.agent.ask('What is your command');
        });


        this.agent.intent(ActionServer.intent.action.MAIN, (assistant) => {

            // reads the user's request
            var msg = {topic:node.topic, intent:'MAIN', payload:assistant.getRawInput(), _assistant:assistant };
            node.send(msg);

        });


        this.agent.intent(ActionServer.intent.action.TEXT, (assistant) => {

            // reads the user's request
            var msg = {topic:node.topic, intent: 'TEXT', payload:assistant.getRawInput(), _assistant:assistant};
            node.send(msg);

        });

        // start listening for commands
        this.agent.listen();
    }
    RED.nodes.registerType("google-action in",GoogleActionIn);


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
    RED.nodes.registerType("google-action response",GoogleActionOut);
}
