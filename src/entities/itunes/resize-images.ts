

import path from "path";

import cliProgress from "cli-progress";
import colors from "colors";
import db from "better-sqlite3";
import fs from "fs-extra";
import { globby } from "globby";
import sharp from "sharp";
 
import {
    downloadImage,
    fetchJSON
} from "../../utils/fetch";

const directory = path.join(process.cwd(), "data/itunes");
const batchSize = 100;

const images = await globby(directory, {
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


const resizeImage = async (image: string): Promise<void> => {

    const full = `${ image }.full`;

    const exists = fs.existsSync(full);

    if(!exists){

        const dir = path.dirname(image);
        const json = `${ image }.json`;
        const raw = await fs.readFile(json);
        const data = JSON.parse(raw.toString())

        const fullPath = data.artworkUrl100.replace("source/100x100", "source/1000x1000");

        await fs.writeFile(full, fullPath);

        const sharpBuffer = await sharp(image)
        .resize({ width: 100 })
        .toBuffer();

        await sharp(sharpBuffer).toFile(image);
    
    }

}


const unflat = (array: string[], size: number):  string[][] =>{

    const batches = Math.ceil(array.length / size);
    const temp = []

    for(let i = 0; i <batches; i++){
        temp.push(array.slice(i * size, i * size + size));
    }

    return temp

}

for(const batch of unflat(images, batchSize)){

    try{ 

        await Promise.all(batch.map((item) => resizeImage(item)));

    }catch(error){
        
        console.log(error);
    
    }

    bar.increment(batch.length);

}


bar.stop();
