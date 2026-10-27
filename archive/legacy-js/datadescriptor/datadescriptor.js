const sha256 = require('sha256');

class DataDescriptor {
    constructor(){
        this.metadata = {
            mimetype:"",
            filename:"",
            size:0,
            streamable:false
        };
        this.blobMap = [];
        this.merkelRoot;
    }

    setDataMimeType(mimetype){
        this.metadata["mimetype"] = mimetype;
    }

    setFilename(filename){
        this.metadata["filename"] = filename;
    }

    // setDataSize(size){
    //     this.metadata["size"] = size;
    // }

    setStreamableData(streamable){
        // This setting signals how to download the data
        // Streamable should signal downloading sequentially and handing off the data
        this.metadata["streamable"] = streamable;
    }

    addPointerAsBlobBlock(pointerObject, relayList) {
        let success = false;

        if (pointerObject){
            if (pointerObject.id && pointerObject.pointerhash && pointerObject.size) {
                if (relayList && Array.isArray(relayList) && relayList.length > 0){
                    let blobBlock = [
                        pointerObject.id,
                        pointerObject.pointerhash,
                        relayList,
                        pointerObject.size
                    ];

                    success = this.addBlobBlock(blobBlock);
                }
            }
        }

        return success;
    }

    addBlobBlock(blobBlock){
        let success = false;

        if (blobBlock && Array.isArray(blobBlock) && blobBlock.length > 1){
            // Validate values
            this.blobMap.push(blobBlock);
            this._calculateMerkelRoot();
            this._calculateSize();
            success = true;
        }

        return success;
    }

    updateBlobBlock(index, blobBlock){
        let success = false;

        if (index && blobBlock){
            if (index < this.blobMap.length){
                // Validate values
                this.blobMap[index] = blobBlock;
                this._calculateMerkelRoot();
            }
        }

        return success;
    }

    _calculateMerkelRoot(){
        let pointerHashList = [];

        if (this.blobMap){
            this.blobMap.forEach(dataBlock => {
                if (dataBlock.length > 1){
                    let thisPointerHash = dataBlock[1]
                    pointerHashList.push(thisPointerHash);
                }
            });

            this.merkelRoot = this.getMerkelRoot(pointerHashList, true);
        }
    }

    _calculateSize(){
        let calculatedSize = 0;
        if (this.blobMap){
            this.blobMap.forEach(dataBlock => {
                if (dataBlock.length >= 4){
                    let thisBlockSize = dataBlock[3];
                    calculatedSize += thisBlockSize;
                }
            });
            this.metadata.size = calculatedSize;
        }
    }

    generateDataDescriptorJSON(){
        let dataDescriptorJSON;

        if (this.metadata && this.blobMap && this.blobMap.length > 0){
            if (this.metadata.size && this.merkelRoot) {
                dataDescriptorJSON = {
                    merkelroot:this.merkelRoot,
                    metadata:{
                        size:this.metadata.size,
                        streamable:this.metadata.streamable != undefined ? this.metadata.streamable : false,
                    },
                    datamap:this.blobMap
                };

                if (this.metadata.filename != undefined){
                    dataDescriptorJSON.metadata["filename"] = this.metadata.filename.toString();
                }
                if (this.metadata.mimetype != undefined){
                    dataDescriptorJSON.metadata["mimetype"] = this.metadata.mimetype.toString();
                }
            }
        }

        return dataDescriptorJSON;
    }

    importDescriptor(descriptorJSON) {
        let success = false;

        try {
            if (descriptorJSON){
                if (descriptorJSON.metadata) {
                    if (descriptorJSON.metadata.size){
                        let reportedSize = descriptorJSON.metadata.size;
    
                        if (descriptorJSON.datamap && Array.isArray(descriptorJSON.datamap) && descriptorJSON.datamap.length > 0) {
                            if (descriptorJSON.merkelroot) {
                                let reportedMR = descriptorJSON.merkelroot;

                                this.blobMap = descriptorJSON.datamap;

                                this._calculateMerkelRoot();
                                this._calculateSize();

                                if (this.metadata.size == reportedSize){
                                    if (this.merkelRoot == reportedMR) {
                                        this.setDataMimeType(descriptorJSON.metadata.mimetype != undefined ? descriptorJSON.metadata.mimetype : "");
                                        this.setStreamableData(descriptorJSON.metadata.streamable != undefined ? descriptorJSON.metadata.streamable : false);
                                        this.setFilename(descriptorJSON.metadata.filename != undefined ? descriptorJSON.metadata.filename : "");
                                    } else {
                                        throw new Error("Invalid Merkel Root");
                                    }
                                } else {
                                    throw new Error("Invalid reported size");
                                }
                            } else {
                                throw new Error("No Merkelroot present");
                            }
                        } else {
                            throw new Error("Invalid datamap");
                        }
                    }
                }
            }
        } catch (e) {
            throw e;
        }

        return success;
    }

    getMerkelRoot (hashArray, firstrun = true){
        var merkelRoot;
        var merkelBranch = [];
      
        if ((hashArray != undefined && (hashArray.length > 1 && !firstrun)) || (hashArray.length >= 1 && firstrun)){
          var merkelHashArray = [];
            if ((hashArray.length % 2) == 1) {
              merkelHashArray = hashArray.slice();
              merkelHashArray.push(merkelHashArray[merkelHashArray.length - 1]);
            } else {
              merkelHashArray = hashArray;
            }
      
          for (var i = 0; i < merkelHashArray.length; i+=2){
            merkelBranch.push(sha256(sha256(merkelHashArray[i] + merkelHashArray[i+1])));
          }
          merkelRoot = this.getMerkelRoot(merkelBranch, false);
        } else if (hashArray.length == 1 && !firstrun) {
          merkelRoot = hashArray[0];
        }
      
        return merkelRoot;
      }
}

module.exports = DataDescriptor;