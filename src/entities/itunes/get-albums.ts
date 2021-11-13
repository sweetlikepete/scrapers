

import path from "path";

import cheerio from "cheerio";
import cliProgress from "cli-progress";
import colors from "colors";
import db from "better-sqlite3";
import fs from "fs-extra";

import {
    fetchJSON, downloadImage
} from "../../utils/fetch";


interface ITunesSearchResponse{
    resultCount: number;
    results: {
        wrapperType: "collection";
        collectionType: string | "Album";
        artistId: number;
        collectionId: number;
        artistName: string;
        collectionName: string;
        collectionCensoredName: string;
        artistViewUrl: string;
        collectionViewUrl: string;
        artworkUrl60: string;
        artworkUrl100: string;
        collectionPrice: number;
        collectionExplicitness: string;
        trackCount: number;
        copyright: string;
        country: string;
        currency: string;
        releaseDate: string;
        primaryGenreName: string;
    }[];
}


const limit = 200;
const batchSize = 3;
const batchDelay = 0;
const artistNamesDatabasePath = path.join(process.cwd(), "data/allmusic.com", "artist-names.db");
const artistNamesDatabaseExists = await fs.pathExists(artistNamesDatabasePath);
const outputDirectory = path.join(process.cwd(), "data/itunes");
const outputIndexLength = 3;


if(!artistNamesDatabaseExists){

    console.log(`Could not find artist name database ${ artistNamesDatabasePath }`);

    process.exit();

}


const artistNamesDatabase = db(artistNamesDatabasePath);
const artistNames = artistNamesDatabase.prepare("SELECT * FROM artists").all().map((item: { name: string }) => item.name);

const batches: string[][] = [];
for(let index = 0; index < artistNames.length; index += batchSize){
    batches.push(artistNames.slice(index, index + batchSize));
}

const bar = new cliProgress.SingleBar({
    format: `${ colors.cyan(" {bar}") } {percentage}% | ETA: {eta}s | batch: {value}/{total} | total: {globalTotal}`
}, cliProgress.Presets.shades_classic);
let total = 0;

bar.start(batches.length, 0);


for(const batch of batches){

    const batchResponse = await Promise.all(batch.map(async (artistName): Promise<string[]> => {

        const artist = artistName.replaceAll(/[^0-9a-zA-Z ]/gu, "").replaceAll(" ", "+");
        const albumSearchUrl = `https://itunes.apple.com/search?term=${ artist }&limit=${ limit }&entity=album`;
        const [response, error] = await fetchJSON<ITunesSearchResponse>(albumSearchUrl);
        const completes: string[] = [];

        if(error){

            console.log(error);

            console.log(`Error downloading ${ albumSearchUrl }`);

        }else{

            const albums = response!.results.filter((item) => item.collectionType === "Album");

            if(albums.length > 0){

                const batchCompletes = await Promise.all(albums.map(async (album): Promise<string> => {

                    const id = String(album.artistId);
                    const outputFolder = path.join(outputDirectory, `${ id.slice(0, outputIndexLength) }`);
                    const outputImage = path.join(outputFolder, `${ id }.jpg`);
                    const outputJSON = path.join(outputFolder, `${ id }.jpg.json`);
                    const imageExists = await fs.pathExists(outputImage);

                    if(!imageExists){

                        try{

                            await fs.ensureDir(outputFolder);
                            await fs.writeFile(outputJSON, JSON.stringify(album));
    
                            const imageUrl = album.artworkUrl100.replace("source/100x100", "source/500x500");

                            await downloadImage(imageUrl, outputImage);

                        }catch(error){
                            
                            console.log(`Error writing image: ${ id }`);

                        }

                    }

                    return String(album.artistId);

                }));

                completes.push(...batchCompletes);

            }

        }

        return completes;

    }));

    total += batchResponse.flat().length;

    bar.increment(1, { globalTotal: total });

    await new Promise((resolve) => {

        setTimeout(resolve, batchDelay);

    });

}

bar.stop();
