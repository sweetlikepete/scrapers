

import path from "path";

import cliProgress from "cli-progress";
import colors from "colors";
import db from "better-sqlite3";
import fs from "fs-extra";

import {
    downloadImage,
    fetchJSON
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
const requestDelay = 1000; // Itunes api limits you to 20 calls per minute, which is 3000 ms
const artistNamesDatabasePath = path.join(process.cwd(), "data/allmusic.com", "artist-names.db");
const artistNamesDatabaseExists = await fs.pathExists(artistNamesDatabasePath);
const outputDirectory = path.join(process.cwd(), "data/itunes");
const outputIndexLength = 4;
const completedDatabasePath = path.join(outputDirectory, "completed-artist-names.db");
const lastArtistNameCache = path.join(outputDirectory, "last-artist-name.txt");


const getLastArtistName = async (): Promise<[string, number] | [undefined, undefined]> => {

    const exists = await fs.pathExists(lastArtistNameCache);

    if(exists){

        const cache = await fs.readFile(lastArtistNameCache);

        if(cache.toString() && cache.toString() !== ""){

            return [
                cache.toString().split("|||")[0].trim(),
                Number(cache.toString().split("|||")[1].trim())
            ];

        }

    }

    return [undefined, undefined];

};


await fs.ensureDir(outputDirectory);

const completedArtistNamesDatabase = db(completedDatabasePath);

completedArtistNamesDatabase.exec("CREATE TABLE IF NOT EXISTS artists(name STRING PRIMARY KEY, completes INT);");


if(!artistNamesDatabaseExists){

    console.log(`Could not find artist name database ${ artistNamesDatabasePath }`);

    process.exit();

}

const completedArtists = completedArtistNamesDatabase.prepare("SELECT * FROM artists ORDER BY name").all();

const completedArtistNames = completedArtists
.map((item: { name: string }) => item.name)
.filter(Boolean)
.filter((item) => typeof item === "string");


const artistNamesDatabase = db(artistNamesDatabasePath);
const artistNamesRaw = artistNamesDatabase.prepare("SELECT * FROM artists ORDER BY name").all()
.map((item: { name: string }) => item.name)
.filter(Boolean)
.filter((item) => typeof item === "string");
const [lastArtistName, lastTotal] = await getLastArtistName();
const lastArtistIndex = lastArtistName ? artistNamesRaw.indexOf(lastArtistName) : 0;

const artistNames = artistNamesRaw.filter((item, index) => index >= lastArtistIndex);


const bar = new cliProgress.SingleBar({
    format: `${ colors.cyan(" {bar}") } {percentage}% | ETA: {eta}s | batch: {value}/{total} | errors: {totalErrors} | total: {globalTotal} | name: {letter}`
}, cliProgress.Presets.shades_classic);
let total = lastTotal ?? 0;
let totalErrors = 0;

bar.start(artistNamesRaw.length, artistNamesRaw.length - artistNames.length, {
    globalTotal: total,
    letter: artistNames[0],
    totalErrors
});


for(const artistName of artistNames){

    await fs.writeFile(lastArtistNameCache, `${ artistName }|||${ total }`);

    if(completedArtistNames.includes(artistName)){

        total += completedArtists.find((item) => item.name === artistName).completes;

        bar.increment(1, {
            globalTotal: total,
            letter: artistName,
            totalErrors
        });

    }else{

        const artist = artistName
        .trim()
        .split(" ")
        .map((part) => encodeURIComponent(part.toLowerCase()))
        .join("+");

        // Const artist = artistName.replaceAll(/[^0-9a-zA-Z ]/gu, "").replaceAll(" ", "+").toLowerCase();
        const albumSearchUrl = `https://itunes.apple.com/search?term=${ artist }&limit=${ limit }&entity=album`;
        const [response, error, cached] = await fetchJSON<ITunesSearchResponse>(albumSearchUrl);
        const completes: string[] = [];

        if(error){

            // Console.log(` Error downloading ${ albumSearchUrl }`);
            totalErrors += 1;

        }else{

            const albums = response!.results.filter((item) => item.collectionType === "Album");

            let errors = false;

            if(albums.length > 0){

                const batchCompletes = await Promise.all(albums.map(async (album): Promise<string> => {

                    const id = String(album.collectionId);
                    const outputFolder = path.join(outputDirectory, `${ id.slice(id.length - outputIndexLength) }`);
                    const outputImage = path.join(outputFolder, `${ id }.jpg`);
                    const full = path.join(outputFolder, `${ id }.jpg.full`);
                    const outputJSON = path.join(outputFolder, `${ id }.jpg.json`);
                    const imageExists = await fs.pathExists(outputImage);
                    const jsonExists = await fs.pathExists(outputJSON);
                    const imageUrl = album.artworkUrl100;
                    const fullPath = imageUrl.replace("source/100x100", "source/1000x1000");

                    if(!jsonExists || !imageExists){

                        await fs.ensureDir(outputFolder);

                        if(!jsonExists){

                            try{

                                await fs.writeFile(outputJSON, JSON.stringify(album));

                            }catch{

                                // Console.log(` Error writing json: ${ outputJSON }`);

                                return "";

                            }

                        }

                        if(!imageExists){

                            try{

                                await downloadImage(imageUrl, outputImage);

                            }catch{

                                // Console.log(` Error writing image: ${ imageUrl }`);

                                return "";

                            }

                        }

                        await fs.writeFile(full, fullPath);

                    }

                    return String(album.artistId);

                }));

                const successes = batchCompletes.filter(Boolean);

                errors = successes.length !== batchCompletes.length;

                completes.push(...successes);

                totalErrors += batchCompletes.length - successes.length;

            }

            if(!errors){

                const query = `INSERT or REPLACE INTO artists(name, completes) VALUES ('${ artistName }', ${ completes.length })`;

                completedArtistNamesDatabase.exec(query);

            }

            total += completes.length;

            bar.increment(1, {
                globalTotal: total,
                letter: artistName,
                totalErrors
            });

            if(!cached){

                await new Promise((resolve) => {

                    setTimeout(resolve, requestDelay);

                });

            }

        }

    }

}

bar.stop();
