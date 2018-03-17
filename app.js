/*-----------------------------------------------------------------------------
Mission on Mars - Mission 2
-----------------------------------------------------------------------------*/
const restify = require('restify');
const clients = require('restify-clients');
const builder = require('botbuilder');
const botbuilder_azure = require("botbuilder-azure");

// Setup Restify Server
let server = restify.createServer();
server.listen(process.env.port || process.env.POpRT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
let connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Bot Storage: Azure Table
let tableName = 'botdata';
let azureTableClient = new botbuilder_azure.AzureTableClient(tableName, 
                            process.env['AzureWebJobsStorage']);
let tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, 
                            azureTableClient);

// Create your bot with a function to receive messages from the user
let bot = new builder.UniversalBot(connector, 
    (session, args, next) => {
        session.endDialog(`I'm sorry, I did not understand '${session.message.text}'.\nType 'help' to know more about me :)`);
    });
bot.set('storage', tableStorage);

server.use(restify.plugins.bodyParser());
server.post('/api/tickets', require('./ticketsApi'));

/*----------------------------------------------------------------------------------------
* Mission 2: How to create a Luis Recognizer
* ---------------------------------------------------------------------------------------- */
var luisRecognizer = 
    new builder.LuisRecognizer(process.env.LuisModelUrl).onEnabled(
        (context, callback) => {
            var enabled = context.dialogStack().length === 0;
            callback(null, enabled);
        }
    );
bot.recognizer(luisRecognizer);
//////////////////////////////////////////////////////////////////////////////////////////

bot.dialog('Help',
    (session, args, next) => {
        session.endDialog(`I'm the help desk bot and I can help you create a ticket.\n` +
            `You can tell me things like _I need to reset my password_ or _I cannot print_.`);
        session.send('First, please briefly describe your problem to me.');
    }
).triggerAction({
    matches: 'Help'
});

bot.dialog('SubmitTicket', [
    (session, args, next) => {
        var severity = builder.EntityRecognizer.findEntity(args.intent.entities, 'severity');

        if (severity && severity.resolution.values.length > 0) {
            session.dialogData.severity = severity.resolution.values[0];
        }

        session.dialogData.description = session.message.text;

        if (!session.dialogData.severity) {
            var choices = ['high', 'normal', 'low'];
            builder.Prompts.choice(session, 'Which is the severity of this problem?', 
                choices, { listStyle: builder.ListStyle.button });
        } else {
            next();
        }
    },
    (session, result, next) => {
        if (!session.dialogData.severity) {
            session.dialogData.severity = result.response.entity;
        }

        var message = `Great! I'm going to create a "${session.dialogData.severity}" severity ticket. ` +
                      `The description I will use is "${session.dialogData.description}". Can you please confirm that this information is correct?`;

        builder.Prompts.confirm(session, message, { listStyle: builder.ListStyle.button });
    },
    (session, result, next) => {
        if (result.response) {
            var data = {
                severity: session.dialogData.severity,
                description: session.dialogData.description
            };

            const client = clients.createJsonClient({ url: process.env.TicketSubmissionUrl });
            const cards = require('./cards');
            
            client.post('/api/tickets', data, (err, request, response, ticketId) => {
                if (err || ticketId == -1) {
                    session.send('Ooops! Something went wrong while I was saving your ticket. Please try again later.');
                } else {
                    session.send(new builder.Message(session).addAttachment({
                        contentType: "application/vnd.microsoft.card.adaptive",
                        content: cards.createCard(ticketId, data)
                    }));
                }

                session.endDialog();
            });
        } else {
            session.endDialog('Ok. The ticket was not created. You can start again if you want.');
        }
    }
]).triggerAction({
    matches: 'SubmitTicket'
});
