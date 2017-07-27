import AbstractBackend from "AbstractBackend";
import Zipper from "zip/Zipper";
import {File} from "platform/platform";
import {getCodecNameFromContents, getCodecNameFromFileName,
        codecNameToFileType} from "audio/backend/sniffer";

export const ZIPPER_READY_EVENT_NAME = `ZipperReady`;

function audioExtractorMetadataFilter({size}) {
    return (131072 < size && size < 1073741824);
}

// TODO Cancellation
// TODO Import min max sizes
// TODO import block size from sniffer
// TODO Import supported codec
// TODO Handle fileread errors
export default class ZipperBackend extends AbstractBackend {
    constructor(wasm) {
        super(ZIPPER_READY_EVENT_NAME);
        this._wasm = wasm;
        this._zipper = new Zipper(wasm);

        this._fileExtracted = this._fileExtracted.bind(this);
        this._fileExtractionProgress = this._fileExtractionProgress.bind(this);

        this.actions = {
            extractSupportedAudioFilesFromZipFile({zipFile}) {
                this._zipper.readZip(zipFile,
                                     this._fileExtracted,
                                     this._fileExtractionProgress,
                                     audioExtractorMetadataFilter);
            }
        };
    }

    _fileExtracted({lastModified, name, userData}, ptr, length) {
        const file = new File([this._wasm.u8view(ptr, length)], name, {
            type: userData.type,
            lastModified: lastModified * 1000
        });

        debugger;
    }

    _fileExtractionProgress({name, userData}, ptr, length) {
        debugger;
        if (!userData.type) {
            if (length >= 8192) {
                let codecName = getCodecNameFromContents(this._wasm.u8view(ptr, length));
                if (codecName !== `mp3`) {
                    codecName = getCodecNameFromFileName(name);
                    if (codecName !== `mp3`) {
                        return false;
                    }
                }
                userData.type = codecNameToFileType(codecName);
            }
        }
        return true;
    }
}
