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

    const ActionsSdkApp = require('actions-on-google').ActionsSdkApp;

    const express = require('express');
    const https = require("https");
    const fs = require('fs');

    const bodyParser = require('body-parser');

    // Map of app handlers
    // ActionsSdkApp can't be cloned so we need to keep a central copy.

    var appMap = new Map();
    function GoogleActionIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        node.url = n.url || '/';
        node.port = n.port || 8081;
        node.key = n.key || '';
        node.cert = n.cert || '';

        const options = {
            key: fs.readFileSync(node.key),
            cert: fs.readFileSync(node.cert)
        };

                // Create new http server to listen for requests
        var expressApp = express();
        expressApp.use(bodyParser.json({ type: 'application/json' }));
        node.httpServer = https.createServer(options, expressApp);

        // Handler for requests
        expressApp.all(node.url, (request, response) => {

            var app = new ActionsSdkApp({ request, response });
            app.handleRequest(function() {

                appMap.set(app.getConversationId(), app);
                var msg = {topic: node.topic,
                            conversationId: app.getConversationId(),
                            intent: app.getIntent(),
                            dialogState: app.getDialogState(),
                            closeConversation: true,
                        };
		    
                var user = app.getUser();
                msg.userId = (user ? user.userId : 0);
                msg.locale = (user ? user.locale : "");

                switch(msg.intent) {
                    case 'actions.intent.OPTION':
                        msg.payload = app.getSelectedOption();
                        break;
                    default:
                        msg.payload = app.getRawInput();
                }


                node.send(msg);

                node.trace("request: " + msg.payload);

            });
        });

        // Start listening
        node.httpServer.listen(node.port);

        node.log("Listening on port " + node.port);

        // Stop listening
        node.on('close', function(done) {
            appMap.clear();
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

            var app = appMap.get(msg.conversationId);

            if (app) {
				try {
					if (typeof msg.payload === 'object' && typeof msg.payload.carousel == "undefined" && !Array.isArray(msg.payload)){
						var response=app.buildRichResponse();
						if (typeof msg.payload.basicCard === 'object'){
							var basicCard=app.buildBasicCard();
							if (msg.payload.basicCard.title) basicCard.setTitle(msg.payload.basicCard.title);
							if (msg.payload.basicCard.bodyText) basicCard.setBodyText(msg.payload.basicCard.bodyText);
							if (msg.payload.basicCard.image) basicCard.setImage(msg.payload.basicCard.image.url,msg.payload.basicCard.image.title);
							if (msg.payload.basicCard.button)basicCard.addButton(msg.payload.basicCard.button.title, msg.payload.basicCard.button.url);
							if (msg.payload.basicCard.imageDisplay=='white')
								basicCard.setImageDisplay(app.ImageDisplays.WHITE)
							else if (msg.payload.basicCard.imageDisplay=='default')
								basicCard.setImageDisplay(app.ImageDisplays.DEFAULT);
							response.addBasicCard(basicCard);
						}
						if (typeof msg.payload.browseCarousel === 'object'){
							var browseCarousel=app.buildBrowseCarousel();	
							var i;
							for (i=0;i<msg.payload.browseCarousel.items.length;i++){
								var item=app.buildBrowseItem();
								if (msg.payload.browseCarousel.items[i].title)item.setTitle(msg.payload.browseCarousel.items[i].title);
								if (msg.payload.browseCarousel.items[i].description)item.setDescription(msg.payload.browseCarousel.items[i].description);
								if (msg.payload.browseCarousel.items[i].footerText)item.setFooter(msg.payload.browseCarousel.items[i].footerText);
								if (msg.payload.browseCarousel.items[i].image) item.setImage(msg.payload.browseCarousel.items[i].image.url,msg.payload.browseCarousel.items[i].image.title);
								if (msg.payload.browseCarousel.items[i].openUrlAction) item.setOpenUrlAction(msg.payload.browseCarousel.items[i].openUrlAction.url,msg.payload.browseCarousel.items[i].openUrlAction.urlTypeHint);
								if (msg.payload.browseCarousel.items[i].url) item.setUrl(msg.payload.browseCarousel.items[i].url);
								if (msg.payload.browseCarousel.items[i].urlTypeHint) item.setUrlTypeHint(msg.payload.browseCarousel.items[i].urlTypeHint);								
								browseCarousel.addItems(item);
							}
							if (msg.payload.browseCarousel.imageDisplay=='white')
								browseCarousel.setImageDisplay(app.ImageDisplays.WHITE)
							else if (msg.payload.browseCarousel.imageDisplay=='default')
								browseCarousel.setImageDisplay(app.ImageDisplays.DEFAULT);							
							response.addBrowseCarousel(browseCarousel);
						}
						if (msg.payload.simpleResponse) response.addSimpleResponse(msg.payload.simpleResponse);
						if (msg.payload.suggestion)response.addSuggestions(msg.payload.suggestion);							
						if (msg.closeConversation) {
							app.tell(response);
							appMap.delete(msg.conversationId);
						} else {
							app.ask(response, msg.dialogState)
						}
					} else if (typeof msg.payload === 'object' && typeof msg.payload.carousel != "undefined"){
						var carousel=app.buildCarousel ();
						var i;
						for (i=0;i<msg.payload.carousel.items.length;i++){
							var item=app.buildOptionItem();
							if (msg.payload.carousel.items[i].title)item.setTitle(msg.payload.carousel.items[i].title);
							if (msg.payload.carousel.items[i].description)item.setDescription(msg.payload.carousel.items[i].description);
							if (msg.payload.carousel.items[i].image) item.setImage(msg.payload.carousel.items[i].image.url,msg.payload.carousel.items[i].image.title);
							if (msg.payload.carousel.items[i].key) item.setKey(msg.payload.carousel.items[i].key);
							if (msg.payload.carousel.items[i].synonyms) item.addSynonyms(msg.payload.carousel.items[i].synonyms);								
							carousel.addItems(item);
						}				
						if (msg.payload.carousel.imageDisplay=='white')
							carousel.setImageDisplay(app.ImageDisplays.WHITE)
						else if (msg.payload.carousel.imageDisplay=='default')
							carousel.setImageDisplay(app.ImageDisplays.DEFAULT);							
						
						app.askWithCarousel (msg.payload.simpleResponse, carousel, msg.dialogState)
					} else if (Array.isArray(msg.payload)) {
						if (msg.closeConversation) {
							app.tell(app.buildInputPrompt(msg.payload[0].startsWith("<speak>"), msg.payload[0],msg.payload.slice(1,4)));
							appMap.delete(msg.conversationId);
						} else {														
							app.ask(app.buildInputPrompt(msg.payload[0].startsWith("<speak>"), msg.payload[0],
											 msg.payload.slice(1,4)), msg.dialogState);							
						}
					} else {
						if (msg.closeConversation) {
							app.tell(msg.payload.toString());
							appMap.delete(msg.conversationId);
						} else {							
							app.ask(msg.payload.toString(), msg.dialogState);
						}
					}
				} catch (err) {
					node.warn("exception occured:",err);
				}
					
            } else {
                node.warn("Invalid conversation id");
            }
        });
    }
    RED.nodes.registerType("google-action response",GoogleActionOut);
};
