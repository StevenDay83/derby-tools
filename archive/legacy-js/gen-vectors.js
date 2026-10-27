// Generates wire-compat vectors from the legacy JS implementation.
const PointerTools = require('./pointer/pointer.js');
const BlobTools = require('./pointer/blob.js');
const Bech32 = require('./pointer/bech32keys.js');
const DataDescriptor = require('./datadescriptor/datadescriptor.js');

const privKey = '0000000000000000000000000000000000000000000000000000000000000003';
const pubKey = PointerTools.getPublicKey(privKey);

// Pointer id + signature vectors
const pointer = {
    pubkey: pubKey,
    timestamp: 1700000000,
    pointerhash: 'a'.repeat(64),
    size: 12345,
    nonce: 42
};
pointer.id = PointerTools.generatePointerId(pointer);
pointer.signature = PointerTools.generateSignature(privKey, pointer);

// data hash + base64
const data = Buffer.from('hello derby', 'utf8');

// merkle roots: use fixed hash list (1,2,3,4,5 entries)
const dd = new DataDescriptor();
const hashes = [
    '11'.repeat(32), '22'.repeat(32), '33'.repeat(32), '44'.repeat(32), '55'.repeat(32)
];
const merkle = {};
for (let n = 1; n <= 5; n++) {
    merkle[n] = dd.getMerkelRoot(hashes.slice(0, n), true);
}

const vectors = {
    privateKey: privKey,
    publicKey: pubKey,
    pointer: pointer,
    verifyValid: PointerTools.verifySignature(pointer),
    dataUtf8: 'hello derby',
    dataSha256: BlobTools.getDataHash(data),
    dataBase64: BlobTools.getBase64(data),
    bech32Public: Bech32.encodeNetworkPublicKey(pubKey),
    bech32Private: Bech32.encodeNetworkPrivateKey(privKey),
    hashes: hashes,
    merkleRoots: merkle
};
console.log(JSON.stringify(vectors, null, 2));
