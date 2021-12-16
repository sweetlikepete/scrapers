

import path from "path";

import cliProgress from "cli-progress";
import colors from "colors";
import db from "better-sqlite3";
import fs from "fs-extra";
import { globby } from "globby";

import {
    downloadImage,
    fetchJSON
} from "../../utils/fetch";

const outputIndexLength = 4;

const outputDirectory = path.join(process.cwd(), "data/itunes");
const oldDirectory = path.join(process.cwd(), "data/itunes");

const images = await globby(oldDirectory, {
    expandDirectories: {
        extensions: ["jpg"],
        files: ["*.jpg"]
    }
});

const bar = new cliProgress.SingleBar({
    format: `${ colors.cyan(" {bar}") } {percentage}% | ETA: {eta}s | image: {value}/{total}`
}, cliProgress.Presets.shades_classic);
const total = 0;


bar.start(images.length, 0);


for(const image of images){

    const originalJSON = `${ image }.json`;
    const id = path.basename(image, path.extname(image));
    const outputFolder = path.join(outputDirectory, `${ id.slice(id.length - outputIndexLength) }`);
    const outputImage = path.join(outputFolder, `${ id }.jpg`);
    const outputJSON = path.join(outputFolder, `${ id }.jpg.json`);


    if(image !== outputImage && originalJSON !== outputJSON){

        try{

            await Promise.all([
                fs.move(image, outputImage),
                fs.move(originalJSON, outputJSON)
            ]);

        }catch{

            console.log("error moving files");

        }

    }

    bar.increment(1);

}


bar.stop();
