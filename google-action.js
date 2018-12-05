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
    const http = require('http');
    const fs = require('fs');

    const bodyParser = require('body-parser');

    const util = require('util');
    
    // Map of conversations
    // Express response objects can't be cloned so we need to keep a central copy.
    // Also keeps track of which node to resume to for a continuing conversation  
    
    // convMap = conversationId -> {responseHandler | node}
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
            
            var msg = {topic: request.body.inputs[0].intent,
                       conversationId: request.body.conversation.conversationId,
                       dialogState: request.body.conversation.conversationToken ?       JSON.parse(request.body.conversation.conversationToken) : {},
                       userId: request.body.user.idToken || request.body.user.userId  || undefined,
                       locale: request.body.user.locale,
                       request: request.body
            };
                
            switch (request.body.inputs[0].intent) {
                case 'actions.intent.CANCEL':
                case 'actions.intent.NO_INPUT':
                    msg.payload = '';
                    break;
                    
                case 'actions.intent.MAIN':
                    if (request.body.inputs[0].arguments != undefined) {
                        msg.payload = request.body.inputs[0].arguments[0].textValue;
                    } else {
                        msg.payload = '';
                    }
                    break;
                
                case 'actions.intent.DATETIME':
                    msg.payload = request.body.inputs[0].arguments[0].datetimeValue;
                    break;
                    
                case 'actions.intent.TEXT':
                    if (request.body.inputs[0].arguments != undefined) {
                        msg.payload = request.body.inputs[0].arguments[0].textValue;
                    } else {
                        msg.payload = request.body.inputs[0].rawInputs[0].query;
                    }
                    break;
                    
                case 'actions.intent.CONFIRMATION':
                    msg.payload = request.body.inputs[0].arguments[0].boolValue;
                    break;
                    
                case 'actions.intent.OPTION':
                    msg.payload = request.body.inputs[0].arguments[0].textValue;
                    break;
                    
                case 'actions.intent.PERMISSION':
                    msg.payload = request.body.device.location;
                    msg.payload.profile = request.body.user.profile;
                    break;
                    
                case 'actions.intent.PLACE':
                    msg.payload = request.body.inputs[0].arguments[0].placeValue;
                    break;
                    
                default:
                   if (request.body.inputs[0].arguments != undefined) {
                        msg.payload = request.body.inputs[0].arguments[0].textValue;
                    } else {
                        msg.payload = request.body.inputs[0].rawInputs[0].query;
                    }                       
            }
                
            node.trace("request: " + msg.topic + ": " + msg.payload);

            responseHandler.on('close', () => {node.warn("Converstation closed prematurely");               
                                convMap.delete(request.body.conversation.conversationId);});

            if (request.body.conversation.type == "NEW") {
                //  New conversation
                convMap.set(request.body.conversation.conversationId, responseHandler);
                node.send(msg);
            } else {
                // Continuing conversation
                var continueNode = convMap.get(request.body.conversation.conversationId);
                
                if (continueNode != undefined) {

                    convMap.set(request.body.conversation.conversationId, responseHandler);
                    
                    if (request.body.inputs[0].intent == 'actions.intent.CANCEL') {
                        continueNode.send([null, msg]);
                    } else if (request.body.inputs[0].intent == 'actions.intent.NO_INPUT') {
                        continueNode.receive(msg);
                    } else {
                        continueNode.send([msg, null]);
                    }
                } else {
                    responseHandler.status(404).end();
                    node.warn("Unknown conversation id");
                }
            }
        });

        // Start listening
        node.httpServer.listen(node.port);

        node.log("Listening on port " + node.port);

        // Stop listening
        node.on('close', function(done) {
            convMap.clear();
            node.httpServer.close(function(){
                done();
            });
        });

    }
    RED.nodes.registerType("action start",GoogleActionIn);

    function formatPrompt(prompt) {
        
        if (prompt.startsWith("<speak>")) {

            return {richInitialPrompt: {
                            items: [
                                {simpleResponse: {
                                    ssml: prompt
                                    }
                                }
                            ]
                        }
                    };
        } else {
        
            return {richInitialPrompt: {
                            items: [
                                {simpleResponse: {
                                    textToSpeech: prompt
                                    }
                                }
                            ]
                        }
                    };
        }
    }
    

    function GoogleActionAsk(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        
        node.answerType = n.answerType || "simple";
        
        node.prompt1 = n.prompt1 || 'payload';
        node.prompt1Type = n.prompt1Type || 'msg';
        
        node.prompt2 = n.prompt2 || '';
        node.prompt2Type = n.prompt2Type || 'str';

        node.prompt3 = n.prompt3 || '';
        node.prompt3Type = n.prompt3Type || 'str';
        
        node.suggestions =  n.suggestions || "";
        node.suggestionsType = "str";
        
        node.noInputPrompts = n.noInputPrompts || [];
        
        node.property = n.property || 'payload';
        node.propertyType = n.propertyType || 'msg';
        
        node.optionsSource = n.optionsSource || 'static';
        node.options = n.options || [];
        
        node.optionsProperty = n.optionsProperty || 'options';
        node.options.PropertyType = n.optionsPropertyType || 'msg';
        


        this.on("input",function(msg) {

            var responseHandler = convMap.get(msg.conversationId);

            if (responseHandler instanceof http.ServerResponse) {
                
                var response;
                
                if ((msg.topic == "actions.intent.NO_INPUT") && (
                    (node.answerType != 'simple') || (msg.request.inputs[0].arguments[1].boolValue))) {
                    node.send([null, msg]);
                    return;
                }
                
                if (node.answerType == 'property') {
                    
                    response = RED.util.evaluateNodeProperty(node.property,node.propertyType,node,msg);
                    
                } else {
                
                
                    response = {expectUserResponse: true};
                    response.isInSandbox = msg.request.isInSandbox || true;
                
                    if (msg.dialogState) {
                        response.conversationToken = JSON.stringify(msg.dialogState);
                    }
                    
                    var expectedInput = {inputPrompt: {}, possibleIntents: []};
                    
                    
                    switch (node.answerType) {
                            
                        case 'simple':
  
                            var prompt;
                            
                            if (msg.topic == "actions.intent.NO_INPUT") {
                                prompt = node.noInputPrompts[msg.request.inputs[0].arguments[0].intValue] ||
                                    node.noInputPrompts[0] ||RED.util.evaluateNodeProperty(node.prompt1,node.prompt1Type,node,msg).toString(); 
                                
                            } else {
                                prompt = RED.util.evaluateNodeProperty(node.prompt1,node.prompt1Type,node,msg).toString();
                            }

                            expectedInput.possibleIntents.push({intent: "actions.intent.TEXT"});
    
                            expectedInput.inputPrompt = formatPrompt(prompt);
                            
                            if (node.suggestions.length >0) {
                                if (Array.isArray(node.suggestions)) {
                                    expectedInput.inputPrompt.richInitialPrompt.suggestions = [];
                                    node.suggestions.forEach(suggestion => {
                                        expectedInput.inputPrompt.richInitialPrompt.suggestions.push({title: suggestion});
                                    });
                                } else {
                                    expectedInput.inputPrompt.richInitialPrompt.suggestions = [];
                                    node.suggestions.split(/,\n?|\n/).forEach(suggestion => {
                                        expectedInput.inputPrompt.richInitialPrompt.suggestions.push({title: suggestion});
                                    });
                                }
                            }
                                
                            break;
                            
                        case 'simple-select':
                            var prompt;
                            prompt = RED.util.evaluateNodeProperty(node.prompt1,node.prompt1Type,node,msg).toString();
                            expectedInput.inputPrompt = formatPrompt(prompt);
                            
                            /* {
                            "items": [
                                {
                                    "optionInfo": {
                                        "key": string,
                                        "synonyms": [
                                            string
                                        ]
                                    },
                                    "title": string (optional)
                                }
                            ]
                            } */                          
                            
                            
                            
                            expectedInput.possibleIntents.push({intent: "actions.intent.OPTION",
                                inputValueData: { 
                                "@type": "type.googleapis.com/google.actions.v2.OptionValueSpec", 
                                listSelect: {
                                    title: "Test List",
                                    items: [
                                    {optionInfo: {key: "Option 1b", synonyms: ['Option 1', '1']}, title: "Option 1c", description: "This is the first option"},
                                    {optionInfo: {key: "Option 2b", synonyms: ['Option 2', '2']}, title: "Option 2c", description: "This is the second option"},
                                    {optionInfo: {key: "Option 3b", synonyms: ['Option 3', '3']}, title: "Option 3c", description: "This is the third option"}] }}});
                            
                            break;
                        case 'list-select':
                        case 'carousel-select':                           
                                            
                        case 'datetime':
                            
                            expectedInput.possibleIntents[0] =  {intent: "actions.intent.DATETIME",
                                inputValueData: {
                                    "@type": "type.googleapis.com/google.actions.v2.DateTimeValueSpec",
                                    dialogSpec: {
                                        requestDatetimeText: RED.util.evaluateNodeProperty(node.prompt1,node.prompt1Type,node,msg).toString().replace(/<[^>]*>/g, ""),
                                        requestDateText: RED.util.evaluateNodeProperty(node.prompt2,node.prompt2Type,node,msg).toString().replace(/<[^>]*>/g, ""),
                                        requestTimeText: RED.util.evaluateNodeProperty(node.prompt3,node.prompt3Type,node,msg).toString().replace(/<[^>]*>/g, "")
                                    }
                                }
                            };
                            
                            break;
                            
                        case 'boolean':
                            
                            expectedInput.possibleIntents[0] = {intent: "actions.intent.CONFIRMATION",
                                inputValueData: {
                                    "@type": "type.googleapis.com/google.actions.v2.ConfirmationValueSpec",
                                    dialogSpec: {
                                        requestConfirmationText: RED.util.evaluateNodeProperty(node.prompt1,node.prompt1Type,node,msg).toString().replace(/<[^>]*>/g, "")
                                    }
                                }
                            };
                            
                            break;
                            
                        case 'place':
                            expectedInput.possibleIntents[0] = {intent: "actions.intent.PLACE",
                                inputValueData: {
                                    "@type": "type.googleapis.com/google.actions.v2.PlaceValueSpec",
                                    dialog_spec: {
                                        extension: {
                                            "@type": "type.googleapis.com/google.actions.v2.PlaceValueSpec.PlaceDialogSpec",
                                            requestPrompt: RED.util.evaluateNodeProperty(node.prompt1,node.prompt1Type,node,msg).toString().replace(/<[^>]*>/g, ""),
                                            permissionContext: RED.util.evaluateNodeProperty(node.prompt2,node.prompt2Type,node,msg).toString()
                                        }
                                    }
                                }
                            };
                            
                            break;
                            
                        case 'nameLocation':
                            
                            expectedInput.possibleIntents[0] = {intent: "actions.intent.PERMISSION",
                                inputValueData: {
                                    "@type": "type.googleapis.com/google.actions.v2.PermissionValueSpec",
                                    optContext: RED.util.evaluateNodeProperty(node.prompt1,node.prompt1Type,node,msg).toString().replace(/<[^>]*>/g, ""),
                                    permissions: [
                                        "NAME",
                                        "DEVICE_PRECISE_LOCATION"
                                    ]
                                }
                            };
                            
                            break;
                    }

                
                    response.expectedInputs = [expectedInput];
                }
                
                try {
                    responseHandler.json(response);
                    convMap.set(msg.conversationId, node);
                } catch (e) {
                    node.warn("Invalid conversation id");
                }
                
            } else {
                node.warn("Invalid conversation id");
            }
        });
    }
    RED.nodes.registerType("action ask",GoogleActionAsk);
    
    
    function GoogleActionTell(n) {
        RED.nodes.createNode(this,n);
        var node = this;
        
        node.tell = n.tell || 'payload';
        node.tellType = n.tellType || 'msg';

        this.on("input",function(msg) {

            var responseHandler = convMap.get(msg.conversationId);

            if (responseHandler) {
                
                var response = {expectUserResponse: false};
                response.isInSandbox = msg.request.isInSandbox || true;
               
                if (msg.dialogState) {
                    response.conversationToken = JSON.stringify(msg.dialogState);
                }
 
                var prompt = RED.util.evaluateNodeProperty(node.tell,node.tellType,node,msg).toString();
 
                if (prompt.startsWith("<speak>")) {

                    response.finalResponse = {richResponse: {
                                                items: [
                                                    {simpleResponse: {
                                                        ssml: prompt
                                                        }
                                                    }]
                                            }};
                } else {
                    response.finalResponse = {richResponse: {
                        items: [
                            {simpleResponse: {
                                textToSpeech:prompt
                                }
                            }]
                    }};
                }

                try {
                    responseHandler.json(response);
                    convMap.delete(msg.conversationId);
                } catch (e) {
                    node.warn("Invalid conversation id");
                }
            } else {
                node.warn("Invalid conversation id");
            }
        });
    }
    RED.nodes.registerType("action tell",GoogleActionTell);
};
