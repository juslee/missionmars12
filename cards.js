/* jshint esversion: 6 */
module.exports.createCard = (ticketId, data) => {
    const fs = require('fs');
    let cardTxt = fs.readFileSync('./cards/ticket.json', 'UTF-8');

    cardTxt = cardTxt.replace(/{ticketId}/g, ticketId)
                    .replace(/{severity}/g, data.severity)
                    .replace(/{description}/g, data.description);

    return JSON.parse(cardTxt);
};