const nostrtools = require('nostr-tools');
const DataDescriptor = require('./datadescriptor.js');

function createEventFromDataDescriptor(dataDescriptor, secretKey, kind = 37337) {
    let nostrEvent;

    try {
        if (secretKey) {
            if (dataDescriptor && dataDescriptor.metadata && dataDescriptor.metadata.size &&
                dataDescriptor.blobMap && dataDescriptor.blobMap.length > 0 && dataDescriptor.merkelRoot){
                    let totalSize = dataDescriptor.metadata.size;
                    let merkelroot = dataDescriptor.merkelRoot;
                    let mimetype = dataDescriptor.metadata.mimetype;
                    let filelabel = dataDescriptor.metadata.filename;
                    let dataMap = dataDescriptor.blobMap;
                    let streamable = dataDescriptor.metadata.streamable;
                    let tags = [];
                    nostrEvent = {
                        kind:kind,
                        pubkey:nostrtools.getPublicKey(secretKey),
                        created_at:Math.floor(Date.now() / 1000),
                        content:JSON.stringify(dataMap)
                    };

                    tags.push(["d", merkelroot]);
                    tags.push(["m", mimetype]);
                    tags.push(["streamable", streamable ? streamable.toString() : "false"]);
                    tags.push(["l", filelabel ? filelabel : merkelroot + ".file"]);
                    tags.push(["size", totalSize.toString()]);

                    nostrEvent["tags"] = tags;

                    nostrEvent.id = nostrtools.getEventHash(nostrEvent);
                    nostrEvent.sig = nostrtools.getSignature(nostrEvent, secretKey);
            } else {
                throw new Error("Invalid data descriptor");
            }
        } else {
            throw new Error("No secret key found");
        }
    } catch (e) {
        throw e;
    }

    return nostrEvent;
}

function importDescriptorFromEvent(nostrEvent) {
    let dataDescriptor;

    try {
        if (nostrEvent) {
            if (nostrtools.verifySignature(nostrEvent)){
                let totalSize = Number.parseInt(getFirstValueFromTag(nostrEvent.tags, "size"));
                let merkelroot = getMerkelRootTag(nostrEvent.tags);
                let mimetype = getFirstValueFromTag(nostrEvent.tags,'m');
                let filelabel = getFirstValueFromTag(nostrEvent.tags,'l');
                let dataMap = JSON.parse(nostrEvent.content);
                let streamable = getFirstValueFromTag(nostrEvent.tags,'streamable');

                dataDescriptor = new DataDescriptor();

                dataDescriptor.setDataMimeType(mimetype ? mimetype : "");
                dataDescriptor.setFilename(filelabel ? filelabel : "");
                dataDescriptor.setStreamableData(streamable.toLowerCase() == "true"? true : false);

                if (dataMap && Array.isArray(dataMap) && dataMap.length > 0){
                    dataMap.forEach(thisBlock => {
                        if (thisBlock && Array.isArray(thisBlock) && thisBlock.length > 0){
                            dataDescriptor.addBlobBlock(thisBlock);
                        }
                    });

                    if (totalSize != dataDescriptor.metadata.size){
                        throw new Error("Size mismatch");
                    } 
                    if (merkelroot != dataDescriptor.merkelRoot) {
                        throw new Error("Merkel root mismatch");
                    }
                } else {
                    throw new Error("Invalid data map");
                }
            }
        } else {
            throw new Error("Invalid Nostr Event");
        }
    } catch (e) {
        throw e;
    }

    return dataDescriptor;
}

function getNAddrFromEvent(nostrEvent, relayHints) {
    let nAddress;

    try {
        if (nostrEvent && nostrEvent.pubkey && nostrEvent.kind && nostrEvent.tags){
            if (relayHints && Array.isArray(relayHints) && relayHints.length > 0){
                let pubkey = nostrEvent.pubkey;
                let merkelroot = getMerkelRootTag(nostrEvent.tags);
                let kind = nostrEvent.kind;

                nAddress = nostrtools.nip19.naddrEncode({
                    pubkey:pubkey,
                    relays:relayHints,
                    kind:kind,
                    identifier:merkelroot
                });
            } else {
                throw new Error("Relay list empty");
            }
        } else {
            throw new Error("Invalid event");
        }
    } catch(e) {
        throw e;
    }

    return nAddress;
}

function getMerkelRootTag(tags) {
    return getFirstValueFromTag(tags, 'd');
}

function getFirstValueFromTag(tags, key) {
    let tagValue;

    if (tags && Array.isArray(tags) && tags.length > 0){
        tags.every(thisTag => {
            if (thisTag && Array.isArray(thisTag) && thisTag.length >= 2) {
                if (thisTag[0] == key){
                    tagValue = thisTag[1];
                    return false;
                }
            }
            return true;
        });
    }

    return tagValue;
}

module.exports.createEventFromDataDescriptor = createEventFromDataDescriptor;
module.exports.getNAddrFromEvent = getNAddrFromEvent;
module.exports.importDescriptorFromEvent = importDescriptorFromEvent;
module.exports.getMerkelRootTag = getMerkelRootTag;