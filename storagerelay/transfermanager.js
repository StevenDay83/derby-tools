const DataTools = require('../pointer/blob.js');
const PointerTools = require('../pointer/pointer.js');
const sha256 = require('sha256');
const DerbyRelay = require('../storagerelay/relayclient.js');
// const DataDescriptor = require('../datadescriptor/datadescriptor.js');

class UploadTransferManager {
    constructor(messageManagerPool, dataDescriptor, secretKey){
        this.MessageManagerPool = messageManagerPool;
        this.DataDescriptor = dataDescriptor;
        this.SecretKey = secretKey;
        this.DataTable = {};
        this.PointerTable = {};
    }

    importDataChunksList(chunkArray){
        let success = false;

        this.DataTable = {};
        this.PointerTable = {};

        this.DataDescriptor["blobMap"] = [];
        if (chunkArray && Array.isArray(chunkArray) && chunkArray.length > 0){
            if (this.DataDescriptor && this.SecretKey) {
                chunkArray.forEach(thisChunk => {
                    let dataHash = sha256(thisChunk);
                    this.DataTable[dataHash] = thisChunk;
                    let newPointer = {
                        pubkey:PointerTools.getPublicKey(this.SecretKey),
                        timestamp:Math.floor(Date.now() / 1000),
                        nonce:Math.floor((Math.random() * (1000000 - 1)) + 1),
                        size:thisChunk.length,
                        pointerhash:sha256(thisChunk)
                    };

                    newPointer.id = PointerTools.generatePointerId(newPointer);
                    newPointer.signature = PointerTools.generateSignature(this.SecretKey, newPointer);

                    this.DataDescriptor.addPointerAsBlobBlock(newPointer, this.getRelayList());
                    this.PointerTable[newPointer.id] = newPointer;
                });
                success = true;
            }
        }

        return success;
    }

    uploadFileData(callback){
        if (this.DataDescriptor && this.DataDescriptor.blobMap){
            let counter = 0;
            this.DataDescriptor.blobMap.forEach(thisBlock => {
                if (Array.isArray(thisBlock) && thisBlock.length >= 4){
                    let pointerId = thisBlock[0];
                    let pointerHash = thisBlock[1];
                    // let relayList = thisBlock[2];
                    let blockSize = thisBlock[3];

                    let thisPointer = this.PointerTable[pointerId];
                    let rawData = this.DataTable[pointerHash];
                    let base64Data = DataTools.getBase64(rawData);

                    this.MessageManagerPool.forEach(thisMessageManager => {
                        thisMessageManager.publishPointer(thisPointer, base64Data, (err, refId, pHash) => {
                            if (!err){
                                // console.log("Uploading to relay: " + thisMessageManager.relayClient.relayURL);
                                // console.log("Published pointer: " + refId);
                                // console.log("Uploaded data with hash: " + pHash);

                                let lastRelayForBlock = thisMessageManager == this.MessageManagerPool[this.MessageManagerPool.length - 1];
                                let lastRelay = thisBlock == this.DataDescriptor.blobMap[this.DataDescriptor.blobMap.length - 1];

                                callback(undefined, thisMessageManager.relayClient.relayURL, pointerId, pHash, lastRelayForBlock, lastRelay);
                                
                                // if (thisMessageManager == this.MessageManagerPool[this.MessageManagerPool.length - 1]){

                                //     callback(undefined, thisMessageManager.relayClient.relayURL, pointerId, pHash, true);
                                // } else {
                                //     callback(undefined, thisMessageManager.relayClient.relayURL, pointerId, pHash, false);
                                // }
                            } else {
                                // console.error(err);
                                callback(err);
                            }
                        });
                    });
                }
            });
        }
    }

    getRelayList(){
        let thisRelayList = [];

        this.MessageManagerPool.forEach(thisMessageManager => {
            try {
                thisRelayList.push(thisMessageManager.relayClient.relayURL);
            } catch (e) {
                console.error(e);
            }
        });

        return thisRelayList;
    }
}

class DownloadTransferManager{
    constructor(){
        this.DataDescriptor;
        this.RelayPool = {};
        this.BadRelays = [];
    }

    getListOfRelays(){
        // Gets the unique list of relays across all data descriptor blocks
        // This will allow the downlaod manager to connect to the unique set of relays to prepare download

        let listOfRelays = [];

        if (this.DataDescriptor && this.DataDescriptor.blobMap) {
            let dataMapList = this.DataDescriptor.blobMap;

            dataMapList.forEach(dataBlock => {
                if (dataBlock && Array.isArray(dataBlock) && dataBlock.length > 0){
                    let blockRelayList = dataBlock[2];

                    if (blockRelayList && Array.isArray(blockRelayList) && blockRelayList.length > 0){
                        blockRelayList.forEach(relayEntry => {
                            let isExists = false;
                            for (let i = 0; i < listOfRelays.length; i++){
                                let matchRelay = listOfRelays[i];

                                if (relayEntry.toLowerCase() == matchRelay.toLowerCase()){
                                    isExists = true;
                                    break;
                                }
                            }

                            if (!isExists) {
                                listOfRelays.push(relayEntry.toLowerCase());
                            }
                        });
                    }
                }
            });
        }

        return listOfRelays;
    }

    setDataDescriptor(dataDescriptor){
        try {
            if (dataDescriptor) {
                if (dataDescriptor.metadata && dataDescriptor.metadata.size) {
                    if (dataDescriptor.merkelRoot) {
                        if (dataDescriptor.blobMap && Array.isArray(dataDescriptor.blobMap) && dataDescriptor.blobMap.length > 0){
                            this.DataDescriptor = dataDescriptor;
                        } else {
                            throw new Error("Data map empty");
                        }
                    } else {
                        throw new Error("Merkel root missing");
                    }
                } else {
                    throw new Error("Data descriptor metadata missing");
                }
            } else {
                throw new Error("Invalid data descriptor");
            }

        } catch (e) {
            throw e;
        }
    }

    connectToRelays(callback){
        let relayURLList = this.getListOfRelays();
        let counter = 0;
        if (relayURLList && relayURLList.length > 0){
            for (let i = 0; i < relayURLList.length; i++){
                let relayURL = relayURLList[i];
                let newRelayClient = new DerbyRelay.RelayClient(relayURL);

                newRelayClient.on("CONNECT", () => {
                    let newMessageManager = new DerbyRelay.MessageManager(newRelayClient);
                    counter++;
                    this.RelayPool[relayURL] = {
                        relay:newRelayClient,
                        messagemanager:newMessageManager
                    };

                    // let finalRelay = (i == relayURLList.length - 1);
                    let finalRelay = (counter == relayURLList.length);

                    callback(undefined, newRelayClient.relayURL, finalRelay);
                });

                newRelayClient.on("ERROR", () => {
                    counter++;
                    let finalRelay = (counter == relayURLList.length);

                    callback(new Error("Error connecting to relay"), newRelayClient.relayURL, finalRelay);
                });

                newRelayClient.connect();
            }
        }
    }

    downloadFileData(callback, statuscallback){
        // Connect to relays
        // Keep track of relays that could not be connected to so we can ignore for downloading
        // let badRelays = [];
        let binaryDataArray = [];

        this.connectToRelays((err, relayURL, isDone) => {
            if (err){
                console.error("Error connecting to relay: " + relayURL);
                this.BadRelays.push(relayURL);
            }

            if (isDone){
                let dataMap = this.DataDescriptor.blobMap;
                binaryDataArray = new Array(dataMap.length).fill(new Uint8Array());
                let counter = 0;

                for (let i = 0; i < dataMap.length; i++){
                    let thisBlock = dataMap[i];

                    
                    if (thisBlock && Array.isArray(thisBlock) && thisBlock.length >= 4){
                        this.downloadDataFromBlock(thisBlock, 0, (err, base64Data) => {
                            let blockPlace = i;
                            counter++;
                            if (!err) {
                                if (base64Data){
                                    let rawData = DataTools.getBufferData(base64Data);

                                    if (rawData.length == thisBlock[3] && sha256(rawData) == thisBlock[1]){
                                        binaryDataArray[blockPlace] = rawData;
                                        // binaryDataArray.push(rawData);
                                        if (statuscallback){
                                            statuscallback(counter, blockPlace, rawData.length, dataMap.length);
                                        }
                                    } else {
                                        callback(new Error("Size Mismatch"));
                                    }


                                    // console.log("Downloading block: " + blockPlace + " of " + dataMap.length);
                                    // console.log("counter: " + counter);

                                    if (counter == dataMap.length){
                                        callback(undefined, binaryDataArray);
                                    }
                                } else {
                                    console.log("Bad Download: TODO - Put proper error");
                                }
                            } else {
                                callback(new Error("Could not find data for block " + blockPlace));
                                // Could not find any blocks
                            }
                        });
                    }
                }
            }
        });
    }

    downloadDataFromBlock(thisBlock, index, callback) {
        let pointerId = thisBlock[0];
        // let pointerHash = thisBlock[1];
        let localRelayList = thisBlock[2];
        // let localSize = thisBlock[3];

        if (index == localRelayList.length) {
            callback(new Error("Could not retrieve block"));
        } else {
            let listedRelay = this.RelayPool[localRelayList[index]];
            if (listedRelay && listedRelay.messagemanager){
                let isBadRelay = this.BadRelays.find(thisRelayURL => {
                    thisRelayURL == localRelayList[index];
                });

                if (isBadRelay) {
                    this.downloadDataFromBlock(thisBlock, index + 1, (err, base64Data) => {
                        if (!err) {
                            callback(undefined, base64Data);
                        } else {
                            callback(err);
                        }
                    });
                } else {
                    let messageManager = listedRelay.messagemanager;
        
                    messageManager.requestData(pointerId, (err, refId, pointerHash, base64Data) => {
                        if (err) {
                            this.downloadDataFromBlock(thisBlock, index + 1, (err, base64Data) => {
                                if (!err) {
                                    callback(undefined, base64Data);
                                } else {
                                    callback(err);
                                }
                            });
                        } else {
                            callback(undefined, base64Data);
                        }
                    });
                }
            } else {
                this.downloadDataFromBlock(thisBlock, index + 1, (err, base64Data) => {
                    if (!err) {
                        callback(undefined, base64Data);
                    } else {
                        callback(err);
                    }
                });
            }
        }
    }
}

module.exports.UploadTransferManager = UploadTransferManager;
module.exports.DownloadTransferManager = DownloadTransferManager;