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

    const express = require('express');
    const https = require("https");
    const fs = require('fs');

    const bodyParser = require('body-parser');

    // Map of response handlers
    // Express response objects can't be cloned so we need to keep a central copy.

    var convMap = new Map();
    
    function GoogleActionIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;
        
        node.url = n.url || '/';
        node.port = n.port || 8081;
        node.useSSL = n.useSSL || true;
        node.key = n.key || '';
        node.cert = n.cert || '';


        // Create new http server to listen for requests
        var expressApp = express();
        expressApp.use(bodyParser.json({ type: 'application/json' }));

        if (node.useSSL) {
            const options = {
                key: fs.readFileSync(node.key),
                cert: fs.readFileSync(node.cert)
            };
            node.httpServer = https.createServer(options, expressApp);
        } else {
            node.httpServer = http.createServer(expressApp);
        }
            

        // Handler for requests
        expressApp.all(node.url, (request, responseHandler) => {

            convMap.set(request.body.conversation.conversationId, responseHandler);

            var msg = {topic: request.body.inputs[0].intent,
                       conversationId: request.body.conversation.conversationId,
                       dialogState: request.body.conversation.conversationToken ?       JSON.parse(request.body.conversation.conversationToken) : {},
                       expectUserResponse: false,
                       userId: request.body.user.idToken || request.body.user.userId  || undefined,
                       locale: request.body.user.locale,
                       request: request.body
            };
                
            if (request.body.inputs[0].arguments == undefined) {
                
                msg.payload = request.body.inputs[0].rawInputs[0].query;
                
            } else {
                    
                msg.payload = request.body.inputs[0].arguments[0].intValue ||
                            request.body.inputs[0].arguments[0].floatValue ||
                            request.body.inputs[0].arguments[0].boolValue ||
                            request.body.inputs[0].arguments[0].datetimeValue ||
                            request.body.inputs[0].arguments[0].placeValue ||
                            request.body.inputs[0].arguments[0].extension ||
                            request.body.inputs[0].arguments[0].structuredValue ||
                            request.body.inputs[0].arguments[0].textValue ||
                            "";
            }

            node.send(msg);

            node.trace("request: " + msg.payload);

        });

        // Start listening
        node.httpServer.listen(node.port);

        node.log("Listening on port " + node.port);

        // Stop listening
        node.on('close', function(done) {
            node.httpServer.close(function(){
                done();
            });
        });

    }
    RED.nodes.registerType("google-action in",GoogleActionIn);


    function GoogleActionOut(n) {
        RED.nodes.createNode(this,n);
        var node = this;

        this.on("input",function(msg) {

            var responseHandler = convMap.get(msg.conversationId);

            if (responseHandler) {
                
                
                var response = msg.response || {isInSandbox: msg.request.isInSandbox || {isInSandbox: true}};
                
                response.expectUserResponse = response.expectUserResponse || msg.expectUserResponse || false;
                response.conversationToken = JSON.stringify(msg.dialogState);
                                              
                if (msg.expectUserResponse) {
                    if (Array.isArray(msg.payload)) {
//                        app.ask(app.buildInputPrompt(msg.payload[0].startsWith("<speak>"), msg.payload[0],
//                                             msg.payload.slice(1,4)), msg.dialogState);
                    } else {
                        response.expectedInputs = [{inputPrompt: {richInitialPrompt: {items: [{simpleResponse: {textToSpeech: msg.payload}}],
                          suggestions: [{ title: "Option 1a"}, {title: "Option 2a"} , {title: "Option 3a"}]
                        }},
                           possibleIntents: [{intent: "actions.intent.OPTION",
                               inputValueData: { "@type": "type.googleapis.com/google.actions.v2.OptionValueSpec", simpleSelect: {items: [
                                    {optionInfo: {key: "Option 1"}, title: "Option 1"},
                                    {optionInfo: {key: "Option 2"}, title: "Option 2"},
                                    {optionInfo: {key: "Option 3"}, title: "Option 3"}] }}}]
                          
                        }];
                    }
                } else {
                    response.finalResponse = {richResponse: {items: [{simpleResponse: {textToSpeech: msg.payload}}]}};
                }
                responseHandler.json(response);
                convMap.delete(msg.conversationId);
            } else {
                node.warn("Invalid conversation id");
            }
        });
    }
    RED.nodes.registerType("google-action response",GoogleActionOut);
};
