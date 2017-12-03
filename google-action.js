/*****

node-red-contrib-google-action - A Node Red node to handle actions from Google Assistant

MIT License

Copyright (c) 2017 Dean Cording

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/



module.exports = function(RED) {
    "use strict";

    const ActionsSdkApp = require('actions-on-google').ActionsSdkApp;

    const express = require('express');

    const bodyParser = require('body-parser');


    // Map of app handlers
    // ActionsSdkApp can't be cloned so we need to keep a central copy.

    var appMap = new Map();

    function GoogleActionIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        node.url = n.url || '/';
        node.port = n.port || 8081;


        // Create new http server to listen for requests
        node.httpServer = express();
        node.httpServer.use(bodyParser.json({ type: 'application/json' }));

        // Handler for requests
        node.httpServer.all(node.url, (request, response) => {


            var app = new ActionsSdkApp({ request, response });
            app.handleRequest(function() {

                appMap.set(app.getConversationId(), app);

                var msg = {topic: node.topic,
                            conversationId: app.getConversationId(),
                            intent: app.getIntent(),
                            payload: app.getRawInput(),
                            closeConversation: true,
                        };

                node.send(msg);

                node.trace("request: " + msg.payload);

            });
        });

        // Start listening
        node.listener = node.httpServer.listen(node.port);

        // Stop listening
        node.on('close', function(done) {
            node.listener.close(function(){
                done();
            });
        });

    }
    RED.nodes.registerType("google-action in",GoogleActionIn);


    function GoogleActionOut(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        this.on("input",function(msg) {

            var app = appMap.get(msg.conversationId);

            if (app) {
                if (msg.closeConversation) {
                    app.tell(msg.payload);
                } else {
                    app.ask(msg.payload);
                }
            } else {
                node.warn("Invalid conversation id");
            }
        });
    }
    RED.nodes.registerType("google-action response",GoogleActionOut);
}
