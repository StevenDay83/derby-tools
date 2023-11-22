// const { test } = require('nostr-tools/lib/types/nip21.js');
const derbytools = require('./module.js');
const sha256 = require('sha256');
const { isBase64Data } = require('./pointer/blob.js');

let sk = derbytools.PointerTools.generatePrivateKey();
let pubkey = derbytools.PointerTools.getPublicKey(sk);
let sampleData = "Hello World This is my data!";
let dataHash = sha256(sampleData);


console.log(sk);
console.log(pubkey);
console.log(dataHash);

let newPointer = {
    pubkey:pubkey,
    timestamp:Math.floor(Date.now() / 1000),
    size:sampleData.length,
    pointerhash:dataHash,
    nonce:100
};

newPointer.id = derbytools.PointerTools.generatePointerId(newPointer);
newPointer.signature = derbytools.PointerTools.generateSignature(sk, newPointer);

console.log(JSON.stringify(newPointer,undefined,4));

console.log(derbytools.PointerTools.verifySignature(newPointer));

var relayClient = new derbytools.RelayTools.RelayClient("ws://localhost:8080");

relayClient.on("CONNECT", () => {
    console.log("test");

    var MessageManager = new derbytools.RelayTools.MessageManager(relayClient);

    // var newQuery = {"sizelargerthan":600};

    // var newRequest = relayClient.createRequest(newQuery);

    // messageListener.addResponseListener(newRequest[1], "POINTER", (id, pointers, rawMsg) => {
    //     // console.log(JSON.stringify(pointers, undefined, 4));
    //     console.log(JSON.stringify(rawMsg, undefined, 4));
    // });

    // var pointerAddr = "8948d27dc825eb943e6dad98d581be4e1870f16697b5f252b18b2262ebec737d";
    // var dataReqJSON = [
    //     "REQDATA",
    //     pointerAddr
    // ];

    // MessageManager.addResponseListener(pointerAddr, "DATAOK", (pointerId, pointerHash, base64Data) => {
    //     console.log("Pointer ID: " + pointerId);
    //     console.log("Pointer Hash: " + pointerHash);
    //     console.log("Data: " + base64Data);
    // });

    // MessageManager.addResponseListener(pointerAddr, "ERROR", (id, errorCode, errorMessage) => {
    //     console.log("Error: " + errorMessage);
    // });

    // MessageManager.addCatchAllErrorListener((errorCode, errorMessage) => {
    //     console.log("Catchall Error!");
    // });

    // relayClient.send(dataReqJSON);

    // Query Test
    // let pointerRequestJSON = {"sizelargerthan":40000};

    // MessageManager.requestPointers(pointerRequestJSON, sha256(JSON.stringify(pointerRequestJSON)), (err, refId, pointerList) => {
    //     if (!err){
    //         console.log("Reference Id: " + refId);
    //         console.log(JSON.stringify(pointerList, undefined, 4));
    //     } else {
    //         console.error(err);
    //     }
    // });

    const testCase = 1;

    if (testCase == 0){
        // Add new pointer
        const crypto = require('crypto');
        // let mySK = derbytools.PointerTools.generatePrivateKey();
        let mySK = '6323a3644b43a5d26002e1254c6fef77b36030817c8a0e19da7cbdd2799c8f93';
        console.log("Secret Key: " + mySK);
        let myPK = derbytools.PointerTools.getPublicKey(mySK);
        let myRawData = crypto.randomBytes(512000);
        let myBase64Data = myRawData.toString('base64');
        let addingPointer = {
            pubkey:myPK,
            nonce:Math.floor(Math.random() * 10000),
            size:myRawData.length,
            pointerhash:sha256(myRawData),
            timestamp:Math.floor(Date.now() / 1000)
        };
    
        addingPointer.id = derbytools.PointerTools.generatePointerId(addingPointer);
        addingPointer.signature = derbytools.PointerTools.generateSignature(mySK, addingPointer);
    
        console.log("Real World Random Pointer");
        console.log(JSON.stringify(addingPointer, undefined, 2));
    
        MessageManager.publishPointer(addingPointer, myBase64Data, (err, refId, pointerHash) => {
            if (!err) {
                console.log("Saved pointer with ID: " + refId);
                console.log("Pointer Hash to Data: " + pointerHash);
            } else {
                console.error(err);
            }
        });

    } else if (testCase == 1) {
        // Delete pointer
    
        let mySK = '6323a3644b43a5d26002e1254c6fef77b36030817c8a0e19da7cbdd2799c8f93'
        let myPK = derbytools.PointerTools.getPublicKey(mySK);
        let deletionPointer = {
            pubkey:myPK,
            nonce:Math.floor(Math.random() * 10000),
            size:10000,
            pointerhash:'eab09009a08dc10a69b96ab23d249c4dbd3531cfa70f9838d42de3f9db65eee9',
            timestamp:Math.floor(Date.now() / 1000)
        };

        deletionPointer.id = derbytools.PointerTools.generatePointerId(deletionPointer);
        deletionPointer.signature = derbytools.PointerTools.generateSignature(mySK, deletionPointer);
    
        MessageManager.deletePointer(deletionPointer, (err, refId, deletionPointerId) => {
            if (!err){
                console.log("Deleted pointer: " + deletionPointerId + " with pointer " + refId);
            } else {

                console.error(err);
            }
        });
    } else if (testCase == 2) {
        let pointerId = '7b411c13f8b93b431501bb7656068abc540a9dedcf801f9ff79b6dad4118aec1';
        // let pointerId = '79aceadd48c1f1a38f82c8d5f513a61eee9792a8060255c33b5e99e443d87217';

        MessageManager.requestData(pointerId, (err, refId, pointerHash, base64Data) => {
            if (!err) {
                console.log("Pointer ID: " + refId);
                console.log("Pointer Hash: " + pointerHash);

                if (base64Data && base64Data.length > 0){
                    let rawData = derbytools.BlobTools.getBufferData(base64Data);

                    console.log("Raw Data Size: " + rawData.length);
                    // console.log(base64Data);
                }
            } else {
                console.error(err);
            }
        });
    } else if (testCase == 3) {
        const crypto = require('crypto');
        const iterations = 5;
        const storageRelays = ['ws://localhost8080', 'wss://somestorage.io', 'wss://storage.messagepush.io'];
        
        let mySK = derbytools.PointerTools.generatePrivateKey();
        console.log("Secret Key: " + mySK);
        let myPK = derbytools.PointerTools.getPublicKey(mySK);
        let thisDataDescriptor = new derbytools.DataDescriptor();
        thisDataDescriptor.setDataMimeType('image/jpeg');
        thisDataDescriptor.setFilename('cat.jpg');
        thisDataDescriptor.setStreamableData(false);

        // let myBase64Data = myRawData.toString('base64');
        for (let i = 0; i < iterations; i++){
            let myRawData = crypto.randomBytes(10000);

            let newPointer = {
                pubkey:myPK,
                nonce:Math.floor(Math.random() * 10000),
                size:myRawData.length,
                pointerhash:sha256(myRawData),
                timestamp:Math.floor(Date.now() / 1000)
            };

            newPointer.id = derbytools.PointerTools.generatePointerId(newPointer);
            newPointer.signature = derbytools.PointerTools.generateSignature(mySK, newPointer);

            thisDataDescriptor.addPointerAsBlobBlock(newPointer, storageRelays);
        }

        console.log(JSON.stringify(thisDataDescriptor.generateDataDescriptorJSON(), undefined, 4));
    } else if (testCase == 4) {
    }

});

relayClient.connect();


// process.exit(0);

// let transferTest = 4;

// if (transferTest == 0){

//     // Upload test
//     const fs = require('fs');
//     var relayClient1 = new derbytools.RelayTools.RelayClient("ws://nostr.messagepush.io:8081");
//     // var relayClient1 = new derbytools.RelayTools.RelayClient("ws://localhost:8080");
//     // var relayClient2 = new derbytools.RelayTools.RelayClient("ws://localhost:8080");
//     var messageManager1 = new derbytools.RelayTools.MessageManager(relayClient1);
//     // var messageManager2 = new derbytools.RelayTools.MessageManager(relayClient2);
    
//     // var myMessagePool = [messageManager1, messageManager2];
//     var myMessagePool = [messageManager1];
    
//     const fileToUpload = "/Users/stevenday/Downloads/bach.mp3";
//     const dataMapOutput = "bach.json";
    
//     var myDataDescriptor = new derbytools.DataDescriptor();
//     myDataDescriptor.setFilename("bach.mp3");
//     myDataDescriptor.setDataMimeType("audio/mpeg");
    
    
//     var rawFileData = fs.readFileSync(fileToUpload);
//     var dataFileChunks;
    
//     if (rawFileData){
//         dataFileChunks = derbytools.BlobTools.chunkData(rawFileData, 512000);
    
//         // console.log(dataFileChunks)
    
//         relayClient1.on("CONNECT", () => {
//             // relayClient2.on("CONNECT", () => {
//                 var TransferManager = new derbytools.TransferManager.UploadTransferManager(myMessagePool, myDataDescriptor, "8948d27dc825eb943e6dad98d581be4e1870f16697b5f252b18b2262ebec737d");
//                 TransferManager.importDataChunksList(dataFileChunks);
            
            
//                 TransferManager.uploadFileData((err, relayUrl, pointerId, pointerHash, lastBlock, lastRelay) => {
//                     if (!err){
//                         console.log("Published pointer " + pointerId + " and data with hash " + pointerHash + " to relay " + relayUrl);
        
//                         if (lastBlock){
//                             console.log("Finished uploading " + pointerHash);
//                             if (lastRelay){
//                                 console.log("File Upload completed");
//                                 // console.log(JSON.stringify(TransferManager.DataDescriptor.generateDataDescriptorJSON(), undefined, 4));
//                                 fs.writeFileSync(dataMapOutput, JSON.stringify(TransferManager.DataDescriptor.generateDataDescriptorJSON(), undefined, 4));
//                             }
//                         }
//                     }
//                 });
    
//             // });
    
//             // relayClient2.connect();
    
//         });
    
//         relayClient1.connect();
//     }
    
//     // console.log(rawFileData);
    
//     // Upload test end
// } else if (transferTest == 1) {
//     // Download test
//     const fs = require('fs');
//     let dataDescriptorFileData = fs.readFileSync("bach.json");
//     const outputDirectory = "/Users/stevenday/incoming";
    
//     try {
//         let descriptorJSON = JSON.parse(dataDescriptorFileData);
    
//         let loadedDataDescriptor = new derbytools.DataDescriptor();
//         loadedDataDescriptor.importDescriptor(descriptorJSON);
    
//         console.log(JSON.stringify(loadedDataDescriptor.generateDataDescriptorJSON(), undefined, 4));
    
//         let downloadManager = new derbytools.TransferManager.DownloadTransferManager();
//         downloadManager.setDataDescriptor(loadedDataDescriptor);
    
//         console.log(downloadManager.getListOfRelays());
    
//         downloadManager.downloadFileData((err, binaryArray) => {
//             if (err){
//                 console.error(err);
//             } else {
//                 let newFileName = loadedDataDescriptor.metadata.filename ? loadedDataDescriptor.metadata.filename : loadedDataDescriptor.merkelRoot + ".file";
//                 let rawData = derbytools.BlobTools.combineData(binaryArray, loadedDataDescriptor.metadata.size);
    
//                 fs.writeFileSync(outputDirectory + '/' + newFileName, rawData);
//                 // console.log(binaryArray.length);
//             }
//         }, (numOfBlocksDownloaded, blockDownloaded, size, total) => {
//             let percentageComplete = Math.ceil((numOfBlocksDownloaded / total) * 100);
//             console.log(percentageComplete + '% Complete' + ' - Block ' + blockDownloaded + ' (' + size + ' bytes) downloaded');
//         });
//     } catch (e) {
//         console.error(e);
//     }
    
    
    
    
//     // Download test end
// } else if (transferTest == 3) {
//     // Nostr test
//     const fs = require('fs');
//     let dataDescriptorFileData = fs.readFileSync("bach.json");
//     let loadedDataDescriptor = new derbytools.DataDescriptor();
//     let secretKey = '8948d27dc825eb943e6dad98d581be4e1870f16697b5f252b18b2262ebec737d';
    
//     let descriptorJSON = JSON.parse(dataDescriptorFileData);
//     loadedDataDescriptor.importDescriptor(descriptorJSON);

//     let nostrEventDescriptor = derbytools.NostrDescriptor.createEventFromDataDescriptor(loadedDataDescriptor, secretKey);

//     console.log(JSON.stringify(nostrEventDescriptor, undefined, 4));
//     console.log(derbytools.NostrDescriptor.getNAddrFromEvent(nostrEventDescriptor, ["wss://relay.damus.io", "wss://nostr.mom"]));
// } else if (transferTest == 4) {
//     const fs = require('fs');
//     let nostrEventRaw = fs.readFileSync("nostrevent.json");
//     let nostrEventJSON = JSON.parse(nostrEventRaw);

//     let eventDescriptor = derbytools.NostrDescriptor.importDescriptorFromEvent(nostrEventJSON);
//     console.log(JSON.stringify(eventDescriptor.generateDataDescriptorJSON(), undefined, 4));
// }
