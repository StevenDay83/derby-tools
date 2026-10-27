const { bech32, bech32m } = require('bech32');
const PublicKeyPrefix = "derby";
const PrivateKeyPrefix = "dsec";

function encodeNetworkKey(hexKeyString, public) {
    let derby1BechmString;

    let hexBytes = Buffer.from(hexKeyString, "hex");

    if (hexBytes && hexBytes.length > 0){
        let bEncode = bech32m.toWords(hexBytes);
        derby1BechmString = bech32m.encode(public ? PublicKeyPrefix : PrivateKeyPrefix, bEncode);
    }

    return derby1BechmString;
}

function decodeNetworkKey(bechString, public) {
    let hexString;
    let decodePrefix = public ? PublicKeyPrefix : PrivateKeyPrefix;

    if (bechString && bechString.startsWith(decodePrefix)){
        let decodedObj = bech32m.decode(bechString);
        let bDecode = bech32m.fromWords(decodedObj.words);

        hexString = Buffer.from(bDecode).toString("hex");
    }

    return hexString;
}

function encodeNetworkPublicKey(hexKeyString){
    return encodeNetworkKey(hexKeyString, true);
}

function encodeNetworkPrivateKey(hexKeyString){
    return encodeNetworkKey(hexKeyString, false);
}

function decodeNetworkPublicKey(bechString){
    return decodeNetworkKey(bechString, true);
}

function decodeNetworkPrivateKey(bechString){
    return decodeNetworkKey(bechString, false);
}

function isEncodedPublicKey(thisString){
    return thisString && thisString.startsWith(PublicKeyPrefix);
}

function isEncodedPrivateKey(thisString){
    return thisString && thisString.startsWith(PrivateKeyPrefix);
}

module.exports.encodeNetworkPublicKey = encodeNetworkPublicKey;
module.exports.encodeNetworkPrivateKey = encodeNetworkPrivateKey;
module.exports.decodeNetworkPublicKey = decodeNetworkPublicKey;
module.exports.decodeNetworkPrivateKey = decodeNetworkPrivateKey;
module.exports.isEncodedPublicKey = isEncodedPublicKey;
module.exports.isEncodedPrivateKey = isEncodedPrivateKey;