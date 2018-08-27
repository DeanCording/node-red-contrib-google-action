/*****

node-red-contrib-google-action - A Node Red node to handle actions from Google Actions

MIT License

Copyright (c) 2018 Dean Cording <dean@cording.id.au>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without
limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT
LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/



module.exports = function(RED) {
    "use strict";

    const {actionssdk} = require('actions-on-google');

    const express = require('express');
    const https = require("https");
    const http = require("http");
    const fs = require('fs');

    const bodyParser = require('body-parser');
    
    // Map of app handlers
    // ActionsSdkConversation can't be cloned so we need to keep a central copy.

    var convMap = new Map();

    function GoogleActionHandler(n) {
        RED.nodes.createNode(this,n);
        
        var node = this;
        
        node.url = n.url || '/';
        node.port = n.port || 8081;
        node.useSSL = n.useSSL || true;
        node.key = n.key || '';
        node.cert = n.cert || '';

        node.app =  actionssdk({debug: true});
        
        // Create new http server to listen for requests
        var expressApp = express();
        expressApp.use(bodyParser.json({ type: 'application/json' }), node.app);
        
        if (node.useSSL) {
            const options = {
                key: fs.readFileSync(node.key),
                cert: fs.readFileSync(node.cert)
            };
            node.httpServer = https.createServer(options, expressApp);
        } else {
            node.httpServer = http.createServer(expressApp);
        }

        // Start listening
        node.httpServer.listen(node.port);
       
        node.log("Listening on port " + node.port);
        
        this.subscribe = function(intent, handler) {
            node.app.intent(intent, conv => handler(conv));
        };
        

        // Stop listening
        node.on('close', function(done) {
            convMap.clear();
            node.httpServer.close(function(){
                done();
            });
        });

    }
    RED.nodes.registerType("google-handler",GoogleActionHandler);

    function GoogleActionIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;
        
        node.intent = n.intent;
        node.topic = n.topic || n.intent;
        
        node.appServer = RED.nodes.getNode(n.handler);

        if (node.appServer) {
            if (node.intent) {
                node.appServer.subscribe(node.intent, function(conv) {
                    
                    var msg = {topic: node.topic,
                                intent: conv.intent,
                                payload: conv.input.raw,
                                conversationType: conv.input.type,
                                conversationId: conv.id,
                                dialogState: conv.data,
                                _conv: conv
                            };
                        
                    var user = conv.user;
                    msg.userId = (user ? user._id : 0);
                    msg.locale = (user ? user.locale : "");

                    node.send(msg);

                    node.trace("request: " + msg.payload);                   
                });
            }
                
        }
    }
    RED.nodes.registerType("google-action in",GoogleActionIn);
    

    function GoogleActionAsk(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        this.on("input",function(msg) {

            if (msg._conv) {
                msg._conv.ask(msg.payload.toString(), msg.dialogState);
            } else {
                node.warn("Missing conversation");
            }
        });
    }
    RED.nodes.registerType("google-action ask",GoogleActionAsk);
    
    function GoogleActionClose(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        this.on("input",function(msg) {

            if (msg._conv) {
                    msg._conv.close(msg.payload.toString());
            } else {
                node.warn("Missing conversation");
            }
        });
    }
    RED.nodes.registerType("google-action close",GoogleActionClose);
    
}; 
