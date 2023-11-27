// const ws = require('ws');
require('websocket-polyfill');
const ws = WebSocket;
const crypto = require('crypto');
const PROTOCOL_MESSAGE = require('./protocol');
const PROTOCOL_ERROR = require('./error.js');

class RelayClient {
    constructor(url){
        this.relayURL = url;
        this.wsClient;
        this.emptyFunction = ()=>{};

        this.eventListeners = {
            "CONNECT":()=>{},
            "POINTER":(data)=>{},
            "OK":(data)=>{},
            "ERROR":()=>{},
            "DATAOK":(data)=>{},
            "REQEND":(data)=>{},
            "CLOSE":()=>{}
        }
    }

    on(listener, callback){
        let listenerLabels = Object.keys(this.eventListeners);

        if (listenerLabels.find(label => label == listener)){
            this.eventListeners[listener] = callback;
        }
    }

    connect() {
        this.wsClient = new ws(this.relayURL);

        this.wsClient.addEventListener("open", (event) => {
            let onOpenCallback = this.eventListeners["CONNECT"];
            onOpenCallback();
        });

        this.wsClient.addEventListener("error", (event) => { 
            // console.error("Error connecting");

            let onErrorConnectingCallback = this.eventListeners["ERROR"];
        
            onErrorConnectingCallback();
        });

        this.wsClient.addEventListener("message", (event) => {
            this._handleMessages(event.data);
        });
    }

    send(message) {
        let success = false;

        try {
            let jsonString = JSON.stringify(message);

            this.wsClient.send(jsonString);

            success = true;
        } catch (e) {
            console.error(e);
        }

        return success;
    }

    createRequest(requestCriteria) {
        let requestJSON;

        try {
            if (requestCriteria) {
                requestJSON = [
                    "REQUEST",
                    crypto.randomBytes(32).toString('hex'),
                    requestCriteria
                ];
            }
        } catch (e) {
            console.error(e);
        }

        return requestJSON;
    }

    _handleMessages(data){
        try {
            // Expect JSON Data
            let messageJSON = JSON.parse(data);

            if (messageJSON.length > 1) {
                let responsePrefix = messageJSON[0];

                switch(responsePrefix){
                    case PROTOCOL_MESSAGE.Responses.OK: {
                        let OKListener = this.eventListeners["OK"];
                        OKListener(messageJSON);
                        break;
                    }
                    case PROTOCOL_MESSAGE.Responses.DATA_OK: {
                        let DataOKListener = this.eventListeners["DATAOK"];
                        DataOKListener(messageJSON);
                        break;
                    }
                    case PROTOCOL_MESSAGE.Responses.ERROR: {
                        let ErrorListener = this.eventListeners["ERROR"];
                        ErrorListener(messageJSON);
                        break;
                    }
                    case PROTOCOL_MESSAGE.Responses.POINTER_RESPONSE: {
                        let PointerListener = this.eventListeners["POINTER"];
                        PointerListener(messageJSON);
                        break;
                    }
                    case PROTOCOL_MESSAGE.Responses.REQUEST_POINTER_END: {
                        let RequestEndListener = this.eventListeners["REQEND"];
                        RequestEndListener(messageJSON);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error(e);
        }
    }
}

class MessageManager {
    constructor(relayClient) {
        this.relayClient = relayClient;
        this.errorCatchAll = (a, b) => {
            console.error(new Error(a + ": " + b)); }
        this.responseListeners = {
            "OK":{},
            "DATAOK":{},
            "POINTER":{},
            "DATAREQ":{},
            "REQEND":{},
            "ERROR":{}
        };

        this.relayClient.on("OK", (OkMessage) => {
            this._handleMessages("OK", OkMessage);
        });

        this.relayClient.on("ERROR", (ErrorMessage) => {
            this._handleMessages("ERROR", ErrorMessage);
        });

        this.relayClient.on("DATAOK", (DataOKMessage) => {
            this._handleMessages("DATAOK", DataOKMessage);
        });

        this.relayClient.on("POINTER", (PointerMessage) => {
            this._handleMessages("POINTER", PointerMessage);
        });

        this.relayClient.on("REQEND", (ReqEndMessage) => {
            this._handleMessages("REQEND", ReqEndMessage);
        });
    }

    addResponseListener(id, messageType, callback){
        let success = false;

        if (id && messageType && callback){
            let responseTypes = Object.keys(this.responseListeners);
    
            let messageTypeExists = responseTypes.find(responseLabel => responseLabel == messageType);

            if (messageTypeExists){
                this.responseListeners[messageType][id] = callback;
                success = true;
            }
        }

        return success;
    }

    removeResponseListener(id, messageType) {
        if (id && messageType){
            if (this.responseListeners[messageType] && this.responseListeners[messageType][id]){
                delete this.responseListeners[messageType][id];
            }
        }
    }

    addCatchAllErrorListener(callback) {
        let success = false;

        if (callback){
            this.errorCatchAll = callback;
            success = true;
        }
        return success;
    }

    removeCatchAllErrorListener() {
        let success = false;

        this.errorCatchAll = (a, b) => {
            console.error(new Error(a + ": " + b));
        };

        return success;
    }

    requestPointers(pointerQuery, id, callback){
        try {
            let pointerResults = [];
            if (pointerQuery){
                if (id && id.length > 0) {
                    this.addResponseListener(id, "POINTER", (refId, pointerResultsList) => {
                        if (refId == id){
                            this.pointerResults = pointerResultsList;
                            if (pointerResultsList && Array.isArray(pointerResultsList) && pointerResultsList.length > 0){
                                pointerResultsList.forEach(thisPointerResult => {
                                    pointerResults.push(thisPointerResult);
                                });
                            }
                        }
                    });

                    this.addResponseListener(id, "REQEND", (refId) => {
                        if (refId == id){
                            this.removeResponseListener(refId, "POINTER");
                            this.removeResponseListener(refId, "REQEND");
                            this.removeResponseListener(refId, "ERROR");
    
                            callback(undefined, id, pointerResults);
                        }
                    });

                    this.addResponseListener(id, "ERROR", (refId, errorCode, errorMessage) => {
                        if (refId == id){
                            this.removeResponseListener(id, "POINTER");
                            this.removeResponseListener(id, "REQEND");
                            this.removeResponseListener(id, "ERROR");
                            let incomingProtocolError = PROTOCOL_ERROR.getProtocolError(errorCode, refId, errorMessage);
                            
                            callback(incomingProtocolError);
                        }
                    });
                    let pointerRequest = [
                        "REQUEST",
                        id,
                        pointerQuery
                    ];

                    this.relayClient.send(pointerRequest);
                } else {
                    throw new Error("Invalid request ID");
                }
            } else {
                throw new Error("Invalid query object");
            }
        } catch (e) {
            callback(e);
        }
    }

    publishPointer(pointerJSON, base64Data, callback) {
        try {
            if (pointerJSON && pointerJSON.id != undefined) {
                let id = pointerJSON.id;

                this.addResponseListener(id, PROTOCOL_MESSAGE.Responses.OK, (refId, pointerHash) => {
                    if (refId == id){
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.ERROR);
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.OK);
                        callback(undefined, refId, pointerHash);
                    }
                });

                this.addResponseListener(id, PROTOCOL_MESSAGE.Responses.ERROR, (refId, errorCode, errorMessage) => {
                    if (refId == id){
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.ERROR);
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.OK);
                        let incomingProtocolError = PROTOCOL_ERROR.getProtocolError(errorCode, refId, errorMessage);

                        callback(incomingProtocolError);
                    }
                });

                let newPointerMessage = [
                    "POINTER",
                    pointerJSON,
                    "PUBLISH"
                ];

                if (base64Data) {
                    newPointerMessage.push(base64Data);
                }

                this.relayClient.send(newPointerMessage);
            } else {
                throw new Error("Invalid Pointer Object");
            }
        } catch (e) {
            callback(e);
        }
    }

    deletePointer(deletionPointer, callback){
        try {
            if (deletionPointer && deletionPointer.id != undefined){
                let id = deletionPointer.id;

                this.addResponseListener(id, PROTOCOL_MESSAGE.Responses.OK, (refId, deletedPointerId) => {
                    if (refId == id){
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.OK);
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.ERROR);
                        callback(undefined, refId, deletedPointerId);
                    }
                });

                this.addResponseListener(id, PROTOCOL_MESSAGE.Responses.ERROR, (refId, errorCode, errorMessage) => {
                    if (refId == id) {
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.ERROR);
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.OK);
                        let incomingProtocolError = PROTOCOL_ERROR.getProtocolError(errorCode, refId, errorMessage);
    
                        callback(incomingProtocolError);
                    }
                });

                let deletePointerMessage = [
                    "POINTER",
                    deletionPointer,
                    "DELETE"
                ];

                // console.log(JSON.stringify(deletePointerMessage));

                this.relayClient.send(deletePointerMessage);
            } else {
                throw new Error("Invalid Deletion Pointer");
            }

        } catch (e) {
            callback(e);
        }
    }

    requestData(pointerId, callback) {
        try {
            if (pointerId) {
                this.addResponseListener(pointerId, PROTOCOL_MESSAGE.Responses.DATA_OK, (refId, pointerHash, base64Data) => {
                    if (refId == pointerId){
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.DATA_OK);
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.ERROR);
                        callback(undefined, refId, pointerHash, base64Data);
                    }
                });

                this.addResponseListener(pointerId, PROTOCOL_MESSAGE.Responses.ERROR, (refId, errorCode, errorMessage) => {
                    if (refId == pointerId){
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.ERROR);
                        this.removeResponseListener(refId, PROTOCOL_MESSAGE.Responses.DATA_OK);
                        let incomingProtocolError = PROTOCOL_ERROR.getProtocolError(errorCode, refId, errorMessage);
    
                        callback(incomingProtocolError);
                    }
                });

                let dataRequestMessage = [
                    PROTOCOL_MESSAGE.Commands.REQUEST_DATA,
                    pointerId
                ];

                this.relayClient.send(dataRequestMessage);
            } else {
                throw new Error("Invalid Pointer ID");
            }
        } catch (e) {
            callback(e);
        }
    }

    _handleMessages(messageType, message) {
        if (messageType && message){
            switch(messageType) {
                case "OK": {
                    if (message.length == 3){
                        let referenceId = message[1];
                        let pointerHashOrDeletedPointerId = message[2];
                        let OkListenerFunction = this.responseListeners[messageType][referenceId];

                        OkListenerFunction(referenceId, pointerHashOrDeletedPointerId, message);
                    }
                    break;
                }
                case "ERROR": {
                    if (message.length > 3){
                        let errorCode = message[1];
                        let referenceId = message[2];
                        let errorMessage = message[3];
                        let errorListenerFunction;

                        if (referenceId && referenceId.length > 0){
                            errorListenerFunction = this.responseListeners[messageType][referenceId];
                            errorListenerFunction(referenceId, errorCode, errorMessage);
                        } else {
                            errorListenerFunction = this.errorCatchAll;
                            errorListenerFunction(errorCode, errorMessage);
                        }
                    }
                    break;
                }
                case "POINTER": {
                    if (message.length == 3){
                        let referenceId = message[1];
                        let pointerRequestArray = message[2];
                        let pointerResponseListener = this.responseListeners[messageType][referenceId];

                        pointerResponseListener(referenceId, pointerRequestArray, message);
                    }
                    break;
                }
                case "REQEND": {
                    if (message.length == 2){
                        let referenceId = message[1];
                        let reqEndListener = this.responseListeners[messageType][referenceId];

                        reqEndListener(referenceId);
                    }
                    break;
                }
                case "DATAOK": {
                    if (message.length == 4){
                        let referenceId = message[1];
                        let pointerHash = message[2];
                        let base64Data = message[3];

                        let dataOkListener = this.responseListeners[messageType][referenceId];

                        dataOkListener(referenceId, pointerHash, base64Data);
                    }
                    break;
                }
            }
        }
    }
}

exports.RelayClient = RelayClient;
exports.MessageManager = MessageManager;