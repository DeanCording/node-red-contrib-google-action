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

	const {
	 actionssdk,
	 Image,
	 Table,
	 Carousel,
	 BrowseCarousel,
	 BasicCard,
	 Button,
	 SimpleResponse
	}= require('actions-on-google');
    const express = require('express');
    const https = require("https");
    const fs = require('fs');

    const bodyParser = require('body-parser');

    // Map of app handlers
    // ActionsSdkApp can't be cloned so we need to keep a central copy.

    const app = actionssdk();
	
	var conversations=[];
	
    function GoogleActionIn(n) {
        RED.nodes.createNode(this,n);

        var node = this;

        node.url = n.url || '/';
        node.port = n.port || 8081;
        node.key = n.key || '';
        node.cert = n.cert || '';
		node.defaultSimpleResponse = n.defaultSimpleResponse || 'I send you the following information';
		node.noAnswerReceivedMsg = n.noAnswerReceived || 'I have no valid Response for you. Sorry!';
		node.exceptionMsg = n.exceptionMsg || 'I encountered a glitch. Can you say that again?';
		const options = {
            key: fs.readFileSync(node.key),
            cert: fs.readFileSync(node.cert)
        };
   

       // Handler for requests	
		app.fallback((conv, params, option) => {

			var msg = {topic: node.topic,
						conversationId: conv.id,
						surface: conv.surface,
						intent: conv.intent,
						dialogState: conv.data,
						closeConversation: true,
						option:option
					};

			msg.userId = (conv.user ? conv.user.id : 0);
			msg.locale = (conv.user ? conv.user.locale : "");

			switch(msg.intent) {
				case 'actions.intent.OPTION':
					msg.payload = conv.input;
					break;
				default:
					msg.payload = conv.input.raw;
			}

			node.send(msg);
			var flowContext = this.context().flow;
			node.trace("request: " + msg.payload);
			var timer;
			return new Promise(function (resolve, reject) {
				conversations [conv.id]=resolve;
				timer=setTimeout(() => { 
					reject() }, 5000);
                }).then((msg) => {	
					clearTimeout(timer);						
					conversations=conversations.filter(function(ele){return ele != conv.id;});
					conv.data=msg.dialogState;
					try {							

						if (typeof msg.payload === 'object'){
							// Simple Response is mandatory
							if (msg.payload.simpleResponse){
								var simpleResponse;
								node.trace("simple Response: " + JSON.stringify (msg.payload.simpleResponse));
								if (typeof msg.payload.simpleResponse === 'string'){
									simpleResponse=new SimpleResponse(msg.payload.simpleResponse);
								} else {									
									simpleResponse=new SimpleResponse(msg.payload.simpleResponse);
									if (msg.payload.simpleResponse.speech.startsWith("<speak>")){
										simpleResponse.ssml=msg.payload.simpleResponse.speech;
										delete simpleResponse.textToSpeech;
									}
								}
							} else {
								simpleResponse=new SimpleResponse(node.defaultSimpleResponse);
							}
							if (msg.closeConversation &&!(typeof msg.payload.basicCard === 'object' || typeof msg.payload.image === 'object' && typeof msg.payload.browseCarousel === 'object' && typeof msg.payload.carousel === 'object')){
								conv.close(simpleResponse);
							} else {
								conv.ask(simpleResponse);									
							}
							// send only one complex object
							if (typeof msg.payload.basicCard === 'object'){
								node.trace("Prepare basicCard");							
								var basicCard={};						
								if (msg.payload.basicCard.title) basicCard.title=msg.payload.basicCard.title;
								if (msg.payload.basicCard.subtitle) basicCard.title=msg.payload.basicCard.subtitle;
								if (msg.payload.basicCard.formattedText) basicCard.text=msg.payload.basicCard.formattedText;
								if (msg.payload.basicCard.footer) basicCard.text=msg.payload.basicCard.footer;
								if (msg.payload.basicCard.image) basicCard.image=new Image({url: msg.payload.basicCard.image.url,alt:msg.payload.basicCard.image.alt});
								if (msg.payload.basicCard.button){
									if (Array.isArray(msg.payload.basicCard.button)){
										var i;
										var buttons=[];
										for (i=0;i<msg.payload.basicCard.button.length;i++){
											buttons.push(new Button({title:msg.payload.basicCard.button[i].title,url: msg.payload.basicCard.button[i].url}));											
										}
										basicCard.buttons=buttons;
									} else {
										buttons=new Button({title:msg.payload.basicCard.button.title,url: msg.payload.basicCard.button.url});
									}
								}
								if (msg.payload.basicCard.display)basicCard.display=msg.payload.basicCard.display;
								node.trace("Add basicCard" + JSON.stringify (new BasicCard(basicCard)));													
								if (msg.closeConversation){
									conv.close(new BasicCard(basicCard));	
								} else {
									conv.ask(new BasicCard(basicCard));
								}									
							} else if (typeof msg.payload.image === 'object'){
								node.trace("Prepare image");
								if (msg.closeConversation){
									conv.close(new Image({url: msg.payload.image.url,alt:msg.payload.image.alt}));
								} else {
									conv.ask(new Image({url: msg.payload.image.url,alt:msg.payload.image.alt}));
								}
								
							} else if (typeof msg.payload.browseCarousel === 'object'){
								var browseCarousel=new BrowseCarousel();	
								var i;
								browseCarousel.items=[];
								for (i=0;i<msg.payload.browseCarousel.items.length;i++){
									var item=new BrowseCarouselItem();
									if (msg.payload.browseCarousel.items[i].title)item.title=msg.payload.browseCarousel.items[i].title;
									if (msg.payload.browseCarousel.items[i].description)item.description=msg.payload.browseCarousel.items[i].description;
									if (msg.payload.browseCarousel.items[i].footer)item.footer=msg.payload.browseCarousel.items[i].footer;
									if (msg.payload.browseCarousel.items[i].image) item.image=new Image ({url: msg.payload.browseCarousel.items[i].image.url,alt: msg.payload.browseCarousel.items[i].image.alt});
									if (msg.payload.browseCarousel.items[i].openUrlAction) item.setOpenUrlAction=msg.payload.browseCarousel.items[i].openUrlAction;
									browseCarousel.items.push(item);
								}														
								if (msg.payload.browseCarousel.display=='white')browseCarousel.display=msg.payload.browseCarousel.display;
								// Never close conversation when browseCarousel
								conv.ask (new BrowseCarousel(browseCarousel));
							} else if (typeof msg.payload.carousel === 'object'){
								var carousel={items:{}};
								var i;
								for (i=0;i<msg.payload.carousel.items.length;i++){
									var item={};
									if (msg.payload.carousel.items[i].title)item.title=msg.payload.carousel.items[i].title;
									if (msg.payload.carousel.items[i].description)item.description=msg.payload.carousel.items[i].description;
									if (msg.payload.carousel.items[i].image) item.image=new Image({url: msg.payload.carousel.items[i].image.url,alt:msg.payload.carousel.items[i].image.alt});
									
									if (msg.payload.carousel.items[i].synonyms) item.synonyms=msg.payload.carousel.items[i].synonyms;	
									if (msg.payload.carousel.items[i].key) 
										carousel.items[msg.payload.carousel.items[i].key]=item;
									else
										carousel.items['item_'+i]=item;		
								}
								if (msg.payload.carousel.display)carousel.display=msg.payload.carousel.display;									
								node.trace("Add Carousel" + JSON.stringify (new Carousel(carousel)));	
								if (msg.closeConversation){
									conv.close (new Carousel(carousel));
								} else {
									conv.ask (new Carousel(carousel));
								}
							}
							// suggestions are not allowed if collection will be closed
							if (msg.closeConversation && msg.payload.suggestions)	{						
								conv.ask (new Suggestions(msg.payload.suggestions));
							}
						} else {
							if (msg.closeConversation) {
								node.trace("Send Close " + msg.payload.toString());									
								conv.close(msg.payload.toString());
							} else {							
								conv.ask(msg.payload.toString(),);
							}
						}

					} catch (err) {
						node.error("exception occured: " + JSON.stringify(err) + " Msg: " + JSON.stringify(msg));
						conv.ask(node.exceptionMsg);
					}
													
			}).catch((err) => {
				conv.ask(node.noAnswerReceived);
				console.log(err); //undefined
			});
		
		});
		app.catch((conv, error) => {
		  console.error(error);
		  conv.ask(node.exceptionMsg);
		});		
        // Create new http server to listen for requests
        var expressApp = express();
        expressApp.use(bodyParser.json({ type: 'application/json' }));
		expressApp.post(node.url, app);
        				
		node.httpServer = https.createServer(options, expressApp);

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
			//this.context().flow.set ("response",msg);
			conversations[msg.conversationId](msg);
        });
    }
    RED.nodes.registerType("google-action response",GoogleActionOut);
};
