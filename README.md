# node-red-contrib-google-action
Node Red nodes to receive and respond to Google Action requests from Google Assistant.

Google Assistant is Google's personal assistant that provides the voice recognition and natural language processing behind Google's Android and Home devices.  Google Actions allow you to build conversational agents that interact with the user using a query-response conversation style.

This node is a wrapper around Google's [actions-on-google-nodejs](https://github.com/actions-on-google/actions-on-google-nodejs) client library using the [Actions SDK](https://developers.google.com/actions/reference/nodejs/ActionsSdkApp).

The node runs an Express web server to listen for Action request from Google.  By using a separate web server from Node Red, it allows the node to listen on a different port.  This allows the Action listener to be exposed to the Internet without having the rest of Node Red also exposed.  The web server is required to run HTTPS so you will need SSL certificates. Self signed certificates are OK.

Action requests are received by the Google Action input node and converted into a message.  The message contains some metadata about the conversation and the raw text of the user's input.  State data about the conversation can be passed back and forward to track the state of the conversation.

Once the request has been process, the response is passed to the Google Action Response node which returns it to Google Assistant for delivery to the user.  The response message is contained in msg.payload either as plain text or [Speech Synthesis Markup Language (SSML)](https://developers.google.com/actions/reference/ssml).

A response can either complete the processing of the action or can request further information from the user.

To deploy your app, you will need an account on [Google Actions](https://developers.google.com/actions/).

  * Create a new project in the console and make a note of the project id.

  * Do not define any action in the Google Actions Console as we are going to use the [gactions CLI](https://developers.google.com/actions/tools/gactions-cli) utility to configure your app on Google Assistant.

  * Install the [gactions CLI](https://developers.google.com/actions/tools/gactions-cli) utility on your machine.

  * Copy the example [action.json](https://github.com/DeanCording/node-red-contrib-google-action/blob/master/action.json) to your local drive and modify it to suit your application. The main thing you will need to change is the url of your Node Red server. ([Documentation](https://developers.google.com/actions/reference/rest/Shared.Types/ActionPackage) about the structure of the action.json).

  * Now use the [gactions CLI](https://developers.google.com/actions/tools/gactions-cli) utility to publish your app onto Google Assistant.

`gactions test -preview_mins 9999999 -action_package action.json -project your-project-id`

  * You can test you app using the simulator in the Google Actions console or from any device linked to your Google account. To access your app say:

`Hey Google, talk to my test app`

Be aware that Google Assistant isn't really intended to run private apps.  It is possible to have a private app by keeping your app in test mode perpetually.  One of the difficulties though is that Google requires your app to have a unique name from any other app published by anyone else and you can't use any registered brand name.

Also be aware that there is no security mechanism in this implementation yet.  Google uses [OAuth2.0](https://developers.google.com/actions/identity/oauth2-code-flow) to authorise users to access your end point.  It will be added in a future release (or send me a pull request :-).

The following is a sample flow to process action requests.  It will respond to questions involving the words 'number' or 'fancy' like 'pick a number', 'what is your number', 'what number are you', 'say something fancy', 'talk fancy talk', etc.

```
[{"id":"b2b4dadb.71afd8","type":"google-action in","z":"8b42e25d.61776","name":"Action Request","topic":"action","port":"8081","url":"/","key":"/home/sysadmin/.node-red/server.key","cert":"/home/sysadmin/.node-red/server.crt","x":80,"y":820,"wires":[["3f0e417b.e29d6e","1e01ff5f.77f521"]]},
{"id":"3f0e417b.e29d6e","type":"debug","z":"8b42e25d.61776","name":"","active":true,"console":"false","complete":"true","x":1190,"y":820,"wires":[]},
{"id":"c462a768.4c61f","type":"google-action response","z":"8b42e25d.61776","name":"","x":1180,"y":920,"wires":[]},{"id":"db864196.41ad8","type":"change","z":"8b42e25d.61776","name":"Goodbye","rules":[{"t":"set","p":"payload","pt":"msg","to":"See ya later","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":660,"y":1100,"wires":[["3f0e417b.e29d6e","c462a768.4c61f"]]},
{"id":"7b742f05.1d0c4","type":"switch","z":"8b42e25d.61776","name":"Question","property":"payload","propertyType":"msg","rules":[{"t":"cont","v":"number","vt":"str"},{"t":"cont","v":"fancy","vt":"str"},
{"t":"else"}],"checkall":"true","outputs":3,"x":460,"y":940,"wires":[["33f26106.6bc0ae"],["c1d5744e.f73348"],["c8441356.d887e"]],"outputLabels":["number","","don't understand"]},{"id":"94fc2fff.44668","type":"change","z":"8b42e25d.61776","name":"Number","rules":[{"t":"set","p":"closeConversation","pt":"msg","to":"false","tot":"bool"},
{"t":"set","p":"payload","pt":"msg","to":"\"My number is \" & $floor($random() * 10)\t","tot":"jsonata"}],"action":"","property":"","from":"","to":"","reg":false,"x":780,"y":900,"wires":[["3f0e417b.e29d6e","c462a768.4c61f"]]},{"id":"c8441356.d887e","type":"change","z":"8b42e25d.61776","name":"Don't understand","rules":[{"t":"set","p":"closeConversation","pt":"msg","to":"false","tot":"bool"},
{"t":"set","p":"payload","pt":"msg","to":"I'm sorry, I don't understand","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":690,"y":1020,"wires":[["3f0e417b.e29d6e","c462a768.4c61f"]]},{"id":"a9d8b420.a680f8","type":"change","z":"8b42e25d.61776","name":"","rules":[{"t":"set","p":"closeConversation","pt":"msg","to":"false","tot":"bool"},
{"t":"set","p":"payload","pt":"msg","to":"This is Node Red","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":640,"y":860,"wires":[["3f0e417b.e29d6e","c462a768.4c61f"]]},{"id":"1e01ff5f.77f521","type":"switch","z":"8b42e25d.61776","name":"Intent","property":"intent","propertyType":"msg","rules":[{"t":"eq","v":"actions.intent.MAIN","vt":"str"},{"t":"eq","v":"actions.intent.TEXT","vt":"str"},
{"t":"eq","v":"actions.intent.CANCEL","vt":"str"}],"checkall":"true","outputs":3,"x":250,"y":920,"wires":[["a9d8b420.a680f8"],["7b742f05.1d0c4"],["db864196.41ad8"]],"outputLabels":["MAIN","TEXT","CANCEL"]},{"id":"33f26106.6bc0ae","type":"random","z":"8b42e25d.61776","name":"","low":"1","high":"10","inte":"true","x":620,"y":920,"wires":[["94fc2fff.44668"]]},
{"id":"c1d5744e.f73348","type":"change","z":"8b42e25d.61776","name":"Fancy","rules":[{"t":"set","p":"closeConversation","pt":"msg","to":"false","tot":"bool"},
{"t":"set","p":"payload","pt":"msg","to":"<speak>   Here are <say-as interpret-as=\"characters\">SSML</say-as> samples.   I can pause <break time=\"3s\"/>.   I can play a sound   <audio src=\"http://www.sample-videos.com/audio/mp3/crowd-cheering.mp3\">didn't get your MP3 audio file</audio>.   I can speak in cardinals. Your number is <say-as interpret-as=\"cardinal\">10</say-as>.   Or I can speak in ordinals. You are <say-as interpret-as=\"ordinal\">10</say-as> in line.   Or I can even speak in digits. The digits for ten are <say-as interpret-as=\"characters\">10</say-as>.   I can also substitute phrases, like the <sub alias=\"World Wide Web Consortium\">W3C</sub>.   Finally, I can speak a paragraph with two sentences.   <p><s>This is sentence one.</s><s>This is sentence two.</s></p> </speak>","tot":"str"}],"action":"","property":"","from":"","to":"","reg":false,"x":670,"y":960,"wires":[["3f0e417b.e29d6e","c462a768.4c61f"]]}]
```
